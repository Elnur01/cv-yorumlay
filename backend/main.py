import os
import io
import json
import re
from pathlib import Path
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).parent.parent
load_dotenv(dotenv_path=REPO_ROOT / ".env")

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI

app = FastAPI(title="CV Yorumlayıcısı API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Ensure CORS headers are present even on unhandled 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
    base_url="https://api.deepseek.com",
)

REPO_ROOT = Path(__file__).parent.parent

# Add path of backend folder to allow import
import sys
sys.path.append(str(REPO_ROOT / "backend"))

from assembler import build_score_call, build_rebuild_call, select_persona_profile
from validation import validate_score_response, validate_rebuild_response


def _load(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract all text from a PDF using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def _run_monolith_evaluation(cv_text: str, target_role: str, sector: str, region: str, current_title: str) -> dict:
    role_search = _load("Logics/role_search.md")
    visual_arch = _load("Logics/logic_visual_architecture.md")
    perf_metrics = _load("Logics/logic_performance_metrics.md")
    strategic = _load("Logics/logic_strategic_alignment.md")
    career = _load("Logics/logic_career_continuity.md")
    behavioral = _load("Logics/logic_behavioral_competencies.md")
    main_instr = _load("main_instruction.md")

    # ── Phase 0: Regional Market Benchmark ──────────────────────────────
    phase0_prompt = f"""
{role_search}

INSTRUCTIONS:
Perform the market intelligence search for the following criteria:
- Target Position: {target_role}
- Sector: {sector}
- Target Region: {region}

Output the top 5 tools, required certifications, trending keywords, local salary benchmark,
and alignment verdict format as specified.
"""
    phase0_resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": phase0_prompt}],
        temperature=0.7,
    )
    regional_benchmark = phase0_resp.choices[0].message.content

    if not regional_benchmark or not regional_benchmark.strip():
        raise HTTPException(
            status_code=500,
            detail="Phase 1 Hard Gate Failed: Could not establish regional benchmark.",
        )

    # ── Phase 2 & 3: Modular Analysis ───────────────────────────────────
    system_instructions = f"""
{main_instr}

--- MODULAR EVALUATION RULES ---
1. VISUAL ARCHITECTURE:
{visual_arch}

2. PERFORMANCE METRICS:
{perf_metrics}

3. STRATEGIC ALIGNMENT:
{strategic}

4. CAREER CONTINUITY:
{career}

5. BEHAVIORAL COMPETENCIES:
{behavioral}
"""

    phase2_prompt = f"""
Here is the Phase 0 Regional Market Benchmark you MUST use for the Strategic Alignment section:

<benchmark>
{regional_benchmark}
</benchmark>

Candidate Intake Data:
- Current Job: {current_title}
- Target Job: {target_role}
- Country: {region}

Here is the full CV text extracted from the uploaded PDF:

<cv>
{cv_text}
</cv>

Evaluate the CV against these benchmarks using the System Instructions.
Calculate the arithmetic mean of all five sections for the final score.
If the score is 85+, set verdict to "Interview-Ready", otherwise "Needs Optimization".

DEDUCTION TRANSPARENCY: For every point lost in a section, list the specific reason in "deductionLog".

JSON INTEGRITY GUARDRAIL: Return ONLY a valid, complete JSON object — no markdown, no truncation.

Required schema (camelCase, integer scores):
{{
  "executiveSummary": {{
    "candidateName": "string",
    "targetRegion": "string",
    "finalScore": 0,
    "verdict": "string"
  }},
  "sections": [
    {{
      "category": "string",
      "score": 0,
      "primaryObservation": "string",
      "deductionLog": ["string"]
    }}
  ],
  "regionalMarketGapAnalysis": {{
    "missingCriticalTools": ["string"],
    "missingCertifications": ["string"]
  }},
  "top3ActionableImprovements": ["string"]
}}
"""

    final_resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": phase2_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    raw = final_resp.choices[0].message.content
    raw = re.sub(r"```json\n?|```", "", raw).strip()

    try:
        report = json.loads(raw)
    except json.JSONDecodeError:
        first, last = raw.find("{"), raw.rfind("}")
        if first != -1 and last != -1:
            report = json.loads(raw[first: last + 1])
        else:
            raise HTTPException(
                status_code=500, detail="AI response did not contain valid JSON."
            )

    if "CVReport" in report:
        report = report["CVReport"]
    elif "report" in report:
        report = report["report"]

    return report


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate")
async def evaluate_cv(
    pdf: UploadFile = File(...),
    currentJob: str = Form(...),
    targetJob: str = Form(...),
    country: str = Form(...),
    sector: str = Form(...),
    seniority: str = Form("mid"),
    companyTypeHint: str = Form("unknown"),
    useMonolith: bool = Form(False),
    compareMonolith: bool = Form(False),
):
    try:
        pdf_bytes = await pdf.read()
        cv_text = _extract_pdf_text(pdf_bytes)

        if not cv_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the uploaded PDF. Please ensure it is not a scanned image-only PDF.",
            )

        # Compute page count and photo presence for user info
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        has_photo = False
        for page in doc:
            if page.get_images():
                has_photo = True
                break
        doc.close()

        # If explicit request for monolith only, execute old path
        if useMonolith:
            report = _run_monolith_evaluation(cv_text, targetJob, sector, country, currentJob)
            return {"profile": None, "report": report}

        # Otherwise, run the new assembled pipeline (Phase 1)
        router_answers = {
            "current_title": currentJob,
            "target_role": targetJob,
            "target_sector": sector,
            "target_region": country,
            "seniority": seniority,
            "company_type_hint": companyTypeHint,
        }

        profile, systemPrompt = build_score_call(router_answers)

        user_message = f"""Here is the candidate CV to score. Target role: {targetJob}.
<<<CV
{cv_text}
CV>>>
has_photo: {has_photo}   page_count: {page_count}"""

        final_resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": systemPrompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        raw = final_resp.choices[0].message.content

        try:
            report = json.loads(raw)
        except json.JSONDecodeError:
            # One retry with nudge
            retry_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": systemPrompt},
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": "Your response was not valid JSON. Please repeat the output returning ONLY a valid, complete JSON object matching the requested output contract — no markdown wrappers, no truncation."},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw = retry_resp.choices[0].message.content
            report = json.loads(raw)

        # Validation gate
        report = validate_score_response(report, profile["persona"])

        response_payload = {
            "profile": profile,
            "report": report
        }

        # If A/B comparison requested, run monolith in parallel
        if compareMonolith:
            try:
                monolith_report = _run_monolith_evaluation(cv_text, targetJob, sector, country, currentJob)
                response_payload["monolith_report"] = monolith_report
                print(f"A/B Test Comparison - Monolith Score: {monolith_report.get('executiveSummary', {}).get('finalScore')}, Assembled Score: {report.get('overall_score')}")
            except Exception as e:
                print(f"Monolith comparison failed: {e}")

        return response_payload

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/rebuild")
async def rebuild_cv(
    pdf: UploadFile = File(None),
    raw_text: str = Form(None),
    persona_profile: str = Form(...),
    target_role: str = Form(None),
):
    try:
        profile = json.loads(persona_profile)
        
        cv_text = ""
        has_photo = False
        page_count = 1
        
        if pdf:
            pdf_bytes = await pdf.read()
            cv_text = _extract_pdf_text(pdf_bytes)
            
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
            for page in doc:
                if page.get_images():
                    has_photo = True
                    break
            doc.close()
        elif raw_text:
            cv_text = raw_text
        else:
            raise HTTPException(status_code=400, detail="Missing CV input (pdf or raw_text).")

        if not cv_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the uploaded CV.",
            )

        systemPrompt = build_rebuild_call(profile)

        user_message = f"""Here is the candidate CV to rebuild. Target role: {target_role or ''}.
<<<CV
{cv_text}
CV>>>
has_photo: {has_photo}   page_count: {page_count}"""

        final_resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": systemPrompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        raw = final_resp.choices[0].message.content

        try:
            report = json.loads(raw)
        except json.JSONDecodeError:
            # One retry with nudge
            retry_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": systemPrompt},
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": "Your response was not valid JSON. Please repeat the output returning ONLY a valid, complete JSON object matching the requested output contract — no markdown wrappers, no truncation."},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw = retry_resp.choices[0].message.content
            report = json.loads(raw)

        # Validation gate
        try:
            report = validate_rebuild_response(report, cv_text, profile["localization"])
        except ValueError as val_err:
            # Re-run once if KVKK check fails
            print(f"KVKK violation detected: {val_err}. Re-running model call...")
            retry_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": systemPrompt},
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": f"CRITICAL KVKK VIOLATION: Your previous rebuild output contained unauthorized personal info (photo, birth date, marital status, or national ID) under the international/multinational localization. You MUST regenerate the rebuild output and completely remove any birth dates, marital status, national IDs, or photo placeholders. Return ONLY valid JSON."},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw = retry_resp.choices[0].message.content
            report = json.loads(raw)
            report = validate_rebuild_response(report, cv_text, profile["localization"])

        return report

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

