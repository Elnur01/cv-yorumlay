import json
import re

ALLOWED_FORMATS = {
    "early_career": {"functional", "combination", "chronological"},
    "experienced": {"chronological", "combination", "functional"},
    "executive": {"combination", "chronological"},
    "academic": {"academic"},
}

def validate_score_response(response_json: dict, persona: str) -> dict:
    """
    Validates the Phase 1 score response.
    """
    # 2. Weights sum to 1.0 (±0.001)
    dimensions = response_json.get("dimensions", [])
    if not dimensions:
        raise ValueError("Validation failed: 'dimensions' list is empty or missing.")

    total_weight = sum(float(d.get("weight", 0.0)) for d in dimensions)
    if not (1.0 - 0.001 <= total_weight <= 1.0 + 0.001):
        raise ValueError(f"Validation failed: Dimension weights sum to {total_weight}, which is outside 1.0 ± 0.001.")

    # 3. overall_score == round(Σ weight * score)
    recomputed_score = round(sum(float(d.get("weight", 0.0)) * float(d.get("score", 0.0)) for d in dimensions))
    overall_score = response_json.get("overall_score", 0)
    if overall_score != recomputed_score:
        print(f"Scoring drift detected: Model reported {overall_score}, recomputed is {recomputed_score}. Trusting recomputed.")
        response_json["overall_score"] = recomputed_score

    # 4. format_recommendation is in the persona's allowed set
    format_rec = response_json.get("format_recommendation")
    allowed = ALLOWED_FORMATS.get(persona, set())
    if format_rec not in allowed:
        raise ValueError(f"Validation failed: format_recommendation '{format_rec}' is not allowed for persona '{persona}'. Allowed: {allowed}")

    return response_json

def validate_rebuild_response(response_json: dict, raw_cv_text: str, localization: str) -> dict:
    """
    Validates the Phase 2 rebuild response.
    """
    sections = response_json.get("sections", [])
    
    # 5. Rebuild only: every block.source_ref traces to real CV input.
    # We will look up if the content associated with source_ref exists in the raw CV text.
    # Note: If no source_ref or it doesn't match, we strip it and log.
    for sec in sections:
        valid_blocks = []
        for block in sec.get("blocks", []):
            source_ref = block.get("source_ref", "")
            if not source_ref or not source_ref.strip():
                print(f"Stripping fabricated block (no source_ref): {block}")
                continue
            
            # Simple check: source_ref must be a substring of the raw CV text (case-insensitive or normalized)
            # We can normalize spaces to be robust
            norm_source = re.sub(r"\s+", " ", source_ref.strip().lower())
            norm_raw = re.sub(r"\s+", " ", raw_cv_text.lower())
            
            if norm_source not in norm_raw:
                print(f"Stripping fabricated block (source_ref not in raw CV): {block}")
                continue
            
            valid_blocks.append(block)
        sec["blocks"] = valid_blocks

    # 6. KVKK check: under intl_multinational, scrub photo/DOB/marital status/national ID.
    if localization == "intl_multinational":
        # Search for typical KVKK sensitive patterns in all blocks' contents
        kvkk_sensitive = [
            r"\b(t\.?c\.?\s*\d{11})\b",  # National ID
            r"\b(marital|single|married|bekar|evli)\b",  # Marital Status
            r"\b(birth|dob|born|doğum tarihi|d\.tarihi|doğum)\b",  # Date/place of birth
            r"\[image:\s*profile\s*photo\]|\[photo\]",  # Photo markdown placeholders
            r"\b\d{2}[./-]\d{2}[./-]\d{4}\b",  # Exact birth date format
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
