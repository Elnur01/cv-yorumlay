import os
import re
import sys
import json
import time
import base64
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

import fitz  # PyMuPDF
from openai import OpenAI

# Fix import path for Appwrite Open Runtimes
sys.path.insert(0, os.path.dirname(__file__))

from assembler import build_score_call, build_rebuild_call
from validation import validate_score_response, validate_rebuild_response

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
}

# Hard ceiling for the LLM round-trip. Must stay a few seconds BELOW the
# function timeout configured in appwrite.json / the Appwrite console, so that
# we return our own error (with CORS headers) instead of being killed by the
# gateway — a gateway kill produces a header-less response that the browser
# reports as a bogus "No 'Access-Control-Allow-Origin'" CORS failure.
LLM_DEADLINE_SECONDS = int(os.environ.get("LLM_DEADLINE_SECONDS", "25"))

# Appwrite kills a *synchronous HTTP* execution at roughly 35s no matter what
# the function's own timeout is set to — a 300s function timeout does not raise
# this ceiling (measured: execution_timeout at 35.2s with timeout=300). That
# kill is the one response we cannot attach CORS headers to, so for HTTP
# triggers the budget is clamped below it regardless of how
# LLM_DEADLINE_SECONDS is configured. Other triggers keep the full budget.
HTTP_SYNC_CEILING_SECONDS = 28

# Cloudflare fronts Appwrite and replaces any 5xx coming from the origin with
# its own plain-text error page — which drops both our JSON body and our CORS
# headers, recreating the phantom CORS error we are trying to eliminate
# (verified in production: a 504 came back as text/plain "error code: 504",
# no deployment-id header, no Access-Control-*). 4xx passes through untouched,
# so every handled failure is reported in the 4xx range and distinguished by
# the "code" field in the body rather than by HTTP status.
ERROR_STATUS = 422

MAX_TOKENS_SCORE = 3000
MAX_TOKENS_REBUILD = 4000

# Only retry a failed upstream call while at least this much budget remains.
RETRY_MIN_BUDGET_SECONDS = 15

# provider -> (base_url, env var holding the key)
PROVIDERS = {
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
    "deepseek": ("https://api.deepseek.com", "DEEPSEEK_API_KEY"),
}

# Public model id -> (provider, upstream model name)
# The same DeepSeek model is offered through both providers on purpose, so the
# UI can compare provider latency independently of model quality.
MODEL_REGISTRY = {
    "deepseek-v4-flash":             ("deepseek", "deepseek-chat"),
    "deepseek-reasoner":             ("deepseek", "deepseek-reasoner"),
    "deepseek-v4-flash-nim":         ("nvidia",   "deepseek-ai/deepseek-v4-flash"),
    "deepseek-v4-pro-nim":           ("nvidia",   "deepseek-ai/deepseek-v4-pro"),
    "llama-3.3-70b-instruct":        ("nvidia",   "meta/llama-3.3-70b-instruct"),
    "llama-3.2-90b-vision-instruct": ("nvidia",   "meta/llama-3.2-90b-vision-instruct"),
    "nemotron-nano-12b-v2-vl":       ("nvidia",   "nvidia/nemotron-nano-12b-v2-vl"),
}

# Ids used by older frontend builds, kept so cached bundles keep working.
LEGACY_MODEL_ALIASES = {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-v4-pro": "deepseek-v4-pro-nim",
}

DEFAULT_MODEL_ID = "deepseek-v4-flash"


class ConfigError(Exception):
    """Raised when a provider is selected but its API key is not configured."""


class UpstreamError(Exception):
    """Raised when the model provider fails or returns unusable output."""


def effective_deadline_seconds(context) -> int:
    """Budget for this execution, clamped for synchronous HTTP requests."""
    try:
        headers = getattr(context.req, "headers", None) or {}
        trigger = str(headers.get("x-appwrite-trigger", "http")).lower()
    except Exception:
        trigger = "http"
    if trigger == "http":
        return min(LLM_DEADLINE_SECONDS, HTTP_SYNC_CEILING_SECONDS)
    return LLM_DEADLINE_SECONDS


def parse_model_json(raw: str, model_name: str) -> dict:
    """Parse a completion into JSON, tolerating per-model output quirks.

    Even with response_format=json_object, NIM deployments are not clean:
    deepseek-v4-flash prefixes stray tokens before the opening brace, and
    nemotron wraps the object in a ```json fence. Rather than declare those
    models unusable, recover the object.
    """
    text = (raw or "").strip()
    if not text:
        raise UpstreamError(f"{model_name} returned an empty response.")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise UpstreamError(
        f"{model_name} returned output that is not valid JSON "
        f"(first 120 chars: {text[:120]!r})."
    )


def extract_pdf_text(pdf_bytes: bytes) -> tuple[str, bool, int]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    has_photo = False
    page_count = len(doc)
    for page in doc:
        pages.append(page.get_text())
        if page.get_images():
            has_photo = True
    doc.close()
    return "\n\n".join(pages), has_photo, page_count


def resolve_model(selected_model: str) -> tuple[str, str, str]:
    """Return (model_id, provider, upstream_model_name) for a requested model id."""
    model_id = LEGACY_MODEL_ALIASES.get(selected_model, selected_model)
    if model_id not in MODEL_REGISTRY:
        model_id = DEFAULT_MODEL_ID
    provider, upstream_name = MODEL_REGISTRY[model_id]
    return model_id, provider, upstream_name


def build_client(provider: str, budget_seconds: int) -> OpenAI:
    base_url, key_env = PROVIDERS[provider]
    api_key = os.environ.get(key_env, "").strip()
    if not api_key:
        raise ConfigError(
            f"{key_env} is not set. Add it in Appwrite Console -> Functions -> "
            f"cv-backend -> Settings -> Environment Variables."
        )
    # max_retries=0: a hidden SDK retry silently doubles latency and is the
    # difference between answering in time and being killed by the gateway.
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=budget_seconds,
        max_retries=0,
    )


def call_llm(client: OpenAI, model_name: str, system_prompt: str, user_message: str,
             max_tokens: int, deadline: float) -> dict:
    """Run the completion under a hard wall-clock deadline and parse its JSON.

    Returning our own 504 before the runtime is killed is what keeps the CORS
    headers attached to the error response.
    """
    remaining = deadline - time.monotonic()
    if remaining <= 1:
        raise FutureTimeout("No time budget left before contacting the model.")

    extra_kwargs = {}
    # DeepSeek reasoning models emit a long chain-of-thought that we neither
    # show nor need; disabling it keeps us inside the time budget.
    if "deepseek-v4-pro" in model_name or model_name == "deepseek-reasoner":
        extra_kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": False}}

    def _run() -> dict:
        resp = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            **extra_kwargs,
        )
        # Parsed inside the retried block on purpose: a truncated or non-JSON
        # completion is an upstream failure worth one more shot, not a client
        # error.
        return parse_model_json(resp.choices[0].message.content, model_name)

    # The SDK's own retries are disabled because they silently double latency.
    # Retry once by hand instead, and only while enough budget is left to have
    # a realistic chance of finishing — NVIDIA NIM returns transient 503
    # "ResourceExhausted" errors under load that clear immediately.
    last_error: Exception | None = None
    for attempt in range(2):
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            break
        if attempt > 0 and remaining < RETRY_MIN_BUDGET_SECONDS:
            break
        # Deliberately not a `with` block: ThreadPoolExecutor.__exit__ calls
        # shutdown(wait=True), which blocks until the hung request finishes and
        # would push us past the deadline we are trying to enforce.
        pool = ThreadPoolExecutor(max_workers=1)
        try:
            return pool.submit(_run).result(timeout=remaining)
        except FutureTimeout:
            raise
        except Exception as e:  # transient upstream failure
            last_error = e
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    if last_error is not None:
        raise last_error
    raise FutureTimeout("No time budget left before contacting the model.")


def read_cv(payload: dict) -> tuple[str, bool, int]:
    pdf_base64 = payload.get("pdf_base64", "")
    raw_text = payload.get("cv_text", "")
    if pdf_base64:
        return extract_pdf_text(base64.b64decode(pdf_base64))
    if raw_text:
        return raw_text, False, 1
    raise ValueError("Missing CV content (pdf_base64 or cv_text).")


def main(context):
    req_method = str(getattr(context.req, "method", "POST")).upper()
    if req_method == "OPTIONS":
        return context.res.text("", 204, CORS_HEADERS)

    path = getattr(context.req, "path", "") or ""
    if req_method == "GET" and path in ("", "/", "/health"):
        return context.res.json(
            {
                "status": "ok",
                "service": "cv-backend-appwrite",
                "models": list(MODEL_REGISTRY.keys()),
                "deadline_seconds": LLM_DEADLINE_SECONDS,
                "effective_deadline_seconds": effective_deadline_seconds(context),
                "http_sync_ceiling_seconds": HTTP_SYNC_CEILING_SECONDS,
            },
            200,
            CORS_HEADERS,
        )

    budget = effective_deadline_seconds(context)
    started = time.monotonic()
    deadline = started + budget

    try:
        payload = context.req.body
        if isinstance(payload, str):
            payload = json.loads(payload)

        action = payload.get("action") or path.strip("/")
        model_id, provider, upstream_model = resolve_model(
            payload.get("selected_model", DEFAULT_MODEL_ID)
        )
        client = build_client(provider, budget)

        if action == "evaluate":
            cv_text, has_photo, page_count = read_cv(payload)

            router_answers = {
                "current_title": payload.get("currentJob", ""),
                "target_role": payload.get("targetJob", ""),
                "target_sector": payload.get("sector", ""),
                "target_region": payload.get("country", ""),
                "seniority": payload.get("seniority", "mid"),
                "company_type_hint": payload.get("companyTypeHint", "unknown"),
            }
            profile, system_prompt = build_score_call(router_answers)

            user_message = (
                f"Here is the candidate CV to score. "
                f"Target role: {router_answers['target_role']}.\n"
                f"<<<CV\n{cv_text}\nCV>>>\n"
                f"has_photo: {has_photo}   page_count: {page_count}"
            )

            raw = call_llm(client, upstream_model, system_prompt, user_message,
                           MAX_TOKENS_SCORE, deadline)
            report = validate_score_response(raw, profile["persona"])
            report["model_used"] = model_id
            report["provider"] = provider
            report["upstream_model"] = upstream_model
            report["elapsed_seconds"] = round(time.monotonic() - started, 2)

            return context.res.json({"profile": profile, "report": report}, 200, CORS_HEADERS)

        if action == "rebuild":
            cv_text, has_photo, page_count = read_cv(payload)

            persona_profile = payload.get("persona_profile")
            if isinstance(persona_profile, str):
                persona_profile = json.loads(persona_profile)
            if not persona_profile:
                return context.res.json(
                    {"error": "Missing persona_profile for rebuild."}, 400, CORS_HEADERS
                )

            system_prompt = build_rebuild_call(persona_profile)
            user_message = (
                f"Here is the candidate CV to rebuild. "
                f"Target role: {payload.get('target_role', '')}.\n"
                f"<<<CV\n{cv_text}\nCV>>>\n"
                f"has_photo: {has_photo}   page_count: {page_count}"
            )

            raw = call_llm(client, upstream_model, system_prompt, user_message,
                           MAX_TOKENS_REBUILD, deadline)
            report = validate_rebuild_response(
                raw, cv_text, persona_profile["localization"]
            )
            report["model_used"] = model_id
            report["provider"] = provider
            report["upstream_model"] = upstream_model
            report["elapsed_seconds"] = round(time.monotonic() - started, 2)

            return context.res.json(report, 200, CORS_HEADERS)

        return context.res.json({"error": f"Unknown action: {action}"}, 400, CORS_HEADERS)

    except FutureTimeout:
        elapsed = round(time.monotonic() - started, 2)
        context.error(f"LLM deadline exceeded after {elapsed}s")
        return context.res.json(
            {
                "error": (
                    f"The selected model did not answer within {budget}s. "
                    f"Pick a faster model — DeepSeek V4 Flash answers in about 8s."
                ),
                "code": "llm_timeout",
                "elapsed_seconds": elapsed,
            },
            ERROR_STATUS,
            CORS_HEADERS,
        )
    except ConfigError as e:
        context.error(str(e))
        return context.res.json({"error": str(e), "code": "config_error"}, ERROR_STATUS, CORS_HEADERS)
    except UpstreamError as e:
        context.error(str(e))
        return context.res.json({"error": str(e), "code": "upstream_error"}, ERROR_STATUS, CORS_HEADERS)
    except ValueError as e:
        context.error(str(e))
        return context.res.json({"error": str(e), "code": "bad_request"}, 400, CORS_HEADERS)
    except Exception as e:
        context.error(f"{type(e).__name__}: {e}")
        return context.res.json(
            {"error": f"{type(e).__name__}: {e}", "code": "upstream_error"}, ERROR_STATUS, CORS_HEADERS
        )
