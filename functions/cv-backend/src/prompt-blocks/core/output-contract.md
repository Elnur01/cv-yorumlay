# OUTPUT CONTRACT — always included, defines the JSON shape

The output schema is IDENTICAL for every persona, sector, and localization. Only the
VALUES change (weights, findings, scores) — never the SHAPE. This lets the frontend
render one way regardless of who the candidate is.

## Mode: "score" — emit exactly this object

```json
{
  "mode": "score",
  "persona": "early_career | experienced | executive | academic",
  "target": {
    "role": "string (echoed from input)",
    "sector": "string",
    "region": "string",
    "company_type": "domestic | multinational"
  },
  "overall_score": 0,
  "verdict": "strong | competitive | needs_work | not_ready",
  "dimensions": [
    {
      "key": "string (stable dimension id, e.g. 'impact_quantification')",
      "label": "string (human label in output_language)",
      "weight": 0.0,
      "score": 0,
      "rationale": "string, 1-2 sentences, in output_language, cite CV evidence",
      "severity": "ok | minor | major | blocker"
    }
  ],
  "findings": [
    {
      "type": "strength | weakness | data_gap | kvkk_flag | format_flag",
      "dimension_key": "string (which dimension this maps to, or 'global')",
      "message": "string in output_language",
      "fix_hint": "string in output_language — what the rebuild phase should do"
    }
  ],
  "ats": {
    "score": 0,
    "missing_keywords": ["string"],
    "parse_risks": ["string (e.g. 'photo on left column breaks column parsing')"]
  },
  "format_recommendation": "chronological | functional | combination | academic",
  "rebuild_ready": true
}
```

## Mode: "rebuild" — emit exactly this object

```json
{
  "mode": "rebuild",
  "persona": "early_career | experienced | executive | academic",
  "format_used": "chronological | functional | combination | academic",
  "output_language": "tr | en",
  "sections": [
    {
      "key": "string (e.g. 'summary', 'experience', 'education', 'skills')",
      "title": "string in output_language",
      "blocks": [
        {
          "type": "paragraph | bullet_list | entry",
          "content": "string OR array depending on type",
          "source_ref": "string — which CV input this came from (traceability)"
        }
      ]
    }
  ],
  "applied_fixes": [
    { "finding_ref": "string", "what_changed": "string in output_language" }
  ],
  "still_missing": [
    { "field": "string", "why_it_matters": "string in output_language" }
  ]
}
```

## Rules for the contract
- `weight` values across all dimensions MUST sum to 1.0 (within 0.001 tolerance).
- `overall_score` MUST equal round(Σ weight_i × score_i).
- `format_recommendation` in score mode MUST match the persona's allowed formats.
- In rebuild mode, every `block.source_ref` MUST trace to real input. No source_ref
  means the block is fabricated — forbidden.
- `still_missing` carries forward the `data_gap` findings the candidate never resolved.
  Never silently fill them.
