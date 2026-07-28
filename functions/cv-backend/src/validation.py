import json
import re

ALLOWED_FORMATS = {
    "early_career": {"functional", "combination", "chronological"},
    "experienced": {"chronological", "combination", "functional"},
    "executive": {"combination", "chronological"},
    "academic": {"academic"},
}

def validate_score_response(response_json: dict, persona: str) -> dict:
    dimensions = response_json.get("dimensions", [])
    if not dimensions:
        raise ValueError("Validation failed: 'dimensions' list is empty or missing.")

    total_weight = sum(float(d.get("weight", 0.0)) for d in dimensions)
    if not (1.0 - 0.001 <= total_weight <= 1.0 + 0.001):
        raise ValueError(f"Validation failed: Dimension weights sum to {total_weight}, which is outside 1.0 ± 0.001.")

    recomputed_score = round(sum(float(d.get("weight", 0.0)) * float(d.get("score", 0.0)) for d in dimensions))
    overall_score = response_json.get("overall_score", 0)
    if overall_score != recomputed_score:
        response_json["overall_score"] = recomputed_score

    format_rec = response_json.get("format_recommendation")
    allowed = ALLOWED_FORMATS.get(persona, set())
    if format_rec not in allowed:
        raise ValueError(f"Validation failed: format_recommendation '{format_rec}' is not allowed for persona '{persona}'. Allowed: {allowed}")

    return response_json

def validate_rebuild_response(response_json: dict, raw_cv_text: str, localization: str) -> dict:
    sections = response_json.get("sections", [])
    for sec in sections:
        valid_blocks = []
        for block in sec.get("blocks", []):
            source_ref = block.get("source_ref", "")
            if not source_ref or not source_ref.strip():
                continue
            
            norm_source = re.sub(r"\s+", " ", source_ref.strip().lower())
            norm_raw = re.sub(r"\s+", " ", raw_cv_text.lower())
            
            if norm_source not in norm_raw:
                continue
            
            valid_blocks.append(block)
        sec["blocks"] = valid_blocks

    if localization == "intl_multinational":
        kvkk_sensitive = [
            r"\b(t\.?c\.?\s*\d{11})\b",
            r"\b(marital|single|married|bekar|evli)\b",
            r"\b(birth|dob|born|doğum tarihi|d\.tarihi|doğum)\b",
            r"\[image:\s*profile\s*photo\]|\[photo\]",
            r"\b\d{2}[./-]\d{2}[./-]\d{4}\b",
        ]
        
        for sec in sections:
            for block in sec.get("blocks", []):
                content = block.get("content", "")
                if isinstance(content, list):
                    content = " ".join(content)
                elif not isinstance(content, str):
                    content = str(content)
                
                for pattern in kvkk_sensitive:
                    if re.search(pattern, content, re.IGNORECASE):
                        raise ValueError(f"Validation failed: KVKK violation found under intl_multinational localization. Pattern: {pattern}")
                        
    return response_json
