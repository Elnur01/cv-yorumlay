import os
import io
import json
import re
from pathlib import Path

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
):
    try:
        pdf_bytes = await pdf.read()
        cv_text = _extract_pdf_text(pdf_bytes)

        if not cv_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the uploaded PDF. Please ensure it is not a scanned image-only PDF.",
            )

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
- Target Position: {targetJob}
- Sector: {sector}
- Target Region: {country}

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
- Current Job: {currentJob}
- Target Job: {targetJob}
- Country: {country}

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

        if not report.get("executiveSummary"):
            raise HTTPException(
                status_code=500, detail="AI response missing required 'executiveSummary'."
            )

        return report

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
