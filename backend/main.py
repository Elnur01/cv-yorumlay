import os
import base64
import json
import re
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

app = FastAPI(title="CV Yorumlayıcısı API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))

REPO_ROOT = Path(__file__).parent.parent


def _load(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


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
    pdf_bytes = await pdf.read()
    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    model = genai.GenerativeModel("gemini-2.0-flash")

    role_search = _load("Logics/role_search.md")
    visual_arch = _load("Logics/logic_visual_architecture.md")
    perf_metrics = _load("Logics/logic_performance_metrics.md")
    strategic = _load("Logics/logic_strategic_alignment.md")
    career = _load("Logics/logic_career_continuity.md")
    behavioral = _load("Logics/logic_behavioral_competencies.md")
    main_instr = _load("main_instruction.md")

    # ── Phase 0: Regional Market Benchmark ──────────────────────────────────
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
    phase0_resp = model.generate_content(phase0_prompt)
    regional_benchmark = phase0_resp.text

    if not regional_benchmark or not regional_benchmark.strip():
        raise HTTPException(
            status_code=500,
            detail="Phase 1 Hard Gate Failed: Could not establish regional benchmark.",
        )

    # ── Phase 2 & 3: Modular Analysis ───────────────────────────────────────
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

Evaluate the attached CV (PDF) against these benchmarks using the System Instructions.
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

    cv_part = {
        "inline_data": {
            "mime_type": "application/pdf",
            "data": pdf_b64,
        }
    }

    final_resp = model.generate_content(
        contents=[
            {"role": "user", "parts": [system_instructions + "\n\n" + phase2_prompt, cv_part]}
        ],
        generation_config={"response_mime_type": "application/json"},
    )

    raw = final_resp.text
    raw = re.sub(r"```json\n?|```", "", raw).strip()

    try:
        report = json.loads(raw)
    except json.JSONDecodeError:
        first, last = raw.find("{"), raw.rfind("}")
        if first != -1 and last != -1:
            try:
                report = json.loads(raw[first : last + 1])
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=500, detail="Failed to parse AI response as JSON."
                )
        else:
            raise HTTPException(
                status_code=500, detail="AI response did not contain valid JSON."
            )

    # Unwrap optional wrapper keys
    if "CVReport" in report:
        report = report["CVReport"]
    elif "report" in report:
        report = report["report"]

    if not report.get("executiveSummary"):
        raise HTTPException(
            status_code=500, detail="AI response missing required 'executiveSummary'."
        )

    return report
