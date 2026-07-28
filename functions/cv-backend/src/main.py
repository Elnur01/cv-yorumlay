import os
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

MAX_TOKENS_SCORE = 3000
MAX_TOKENS_REBUILD = 4000

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


def build_client(provider: str) -> OpenAI:
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
        timeout=LLM_DEADLINE_SECONDS,
        max_retries=0,
    )


def call_llm(client: OpenAI, model_name: str, system_prompt: str, user_message: str,
             max_tokens: int, deadline: float) -> str:
    """Run the completion under a hard wall-clock deadline.

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

    def _run() -> str:
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
        return resp.choices[0].message.content

    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_run).result(timeout=remaining)


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
            },
            200,
            CORS_HEADERS,
        )

    started = time.monotonic()
    deadline = started + LLM_DEADLINE_SECONDS

    try:
        payload = context.req.body
        if isinstance(payload, str):
            payload = json.loads(payload)

        action = payload.get("action") or path.strip("/")
        model_id, provider, upstream_model = resolve_model(
            payload.get("selected_model", DEFAULT_MODEL_ID)
        )
        client = build_client(provider)

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
            report = validate_score_response(json.loads(raw), profile["persona"])
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
                json.loads(raw), cv_text, persona_profile["localization"]
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
                    f"The selected model did not answer within {LLM_DEADLINE_SECONDS}s. "
                    f"Try a faster model (DeepSeek V4 Flash) or raise the function timeout."
                ),
                "code": "llm_timeout",
                "elapsed_seconds": elapsed,
            },
            504,
            CORS_HEADERS,
        )
    except ConfigError as e:
        context.error(str(e))
        return context.res.json({"error": str(e), "code": "config_error"}, 500, CORS_HEADERS)
    except ValueError as e:
        context.error(str(e))
        return context.res.json({"error": str(e), "code": "bad_request"}, 400, CORS_HEADERS)
    except Exception as e:
        context.error(f"{type(e).__name__}: {e}")
        return context.res.json(
            {"error": f"{type(e).__name__}: {e}", "code": "upstream_error"}, 502, CORS_HEADERS
        )
