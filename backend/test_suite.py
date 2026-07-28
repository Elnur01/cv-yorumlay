import unittest
import json
import re
from pathlib import Path

# Add backend folder path to allow imports
import sys
REPO_ROOT = Path(__file__).parent.parent
sys.path.append(str(REPO_ROOT / "backend"))

from assembler import select_persona_profile, assemble_prompt
from validation import validate_score_response, validate_rebuild_response

class TestCVAISelector(unittest.TestCase):
    def test_table_driven_selector(self):
        cases = [
            # (seniority, sector, region, hint) -> (persona, sector, localization, language)
            ("entry", "software developer", "Istanbul, Turkey", "unknown",
             ("early_career", "tech", "intl_multinational", "en")),
            ("mid", "investment banking", "London, UK", "unknown",
             ("experienced", "finance", "intl_multinational", "en")),
            ("senior", "muhasebe ve denetim", "Ankara", "domestic",
             ("experienced", "finance", "tr_domestic", "tr")),
            ("executive", "creative designer", "Izmir", "multinational",
             ("executive", "creative", "intl_multinational", "en")),
            ("academic", "construction site manager", "Bursa, TR", "unknown",
             ("academic", "operational", "tr_domestic", "tr")),
            # Fallbacks and corner cases
            ("senior", "unknown sector", "Berlin", "unknown",
             ("experienced", "general", "intl_multinational", "en")),
            ("mid", "yazılım mühendisliği", "Istanbul", "unknown", # tech in TR -> multinational
             ("experienced", "tech", "intl_multinational", "en")),
            ("entry", "pazarlama", "Ankara", "unknown", # creative in TR -> domestic
             ("early_career", "creative", "tr_domestic", "tr")),
        ]

        for i, (sen, sec, reg, hint, expected) in enumerate(cases):
            with self.subTest(i=i):
                profile = select_persona_profile(
                    current_title="Test Title",
                    target_role="Test Role",
                    target_sector=sec,
                    target_region=reg,
                    seniority=sen,
                    company_type_hint=hint
                )
                self.assertEqual(profile["persona"], expected[0])
                self.assertEqual(profile["sector_overlay"], expected[1])
                self.assertEqual(profile["localization"], expected[2])
                self.assertEqual(profile["output_language"], expected[3])


class TestCVAISmokeAssembly(unittest.TestCase):
    def test_40_combinations_smoke(self):
        output_personas = ["early_career", "experienced", "executive", "academic"]
        sectors = ["tech", "finance", "creative", "operational", "general"]
        localizations = ["tr_domestic", "intl_multinational"]

        count = 0
        for p in output_personas:
            for s in sectors:
                for loc in localizations:
                    profile = {
                        "persona": p,
                        "sector_overlay": s,
                        "localization": loc,
                        "example": p,
                        "output_language": "tr" if loc == "tr_domestic" else "en"
                    }
                    try:
                        prompt = assemble_prompt(profile, "score")
                        self.assertIsNotNone(prompt)
                        # Assert no missing placeholders and files exist
                        self.assertTrue(len(prompt) > 1000)
                        count += 1
                    except Exception as e:
                        self.fail(f"Prompt assembly failed for {profile}: {e}")
        self.assertEqual(count, 40)


class TestCVAIValidationGates(unittest.TestCase):
    def test_validation_score_math(self):
        # Correct weights sum to 1.0
        good_report = {
            "overall_score": 85,
            "format_recommendation": "chronological",
            "dimensions": [
                {"key": "dim1", "label": "Dim 1", "weight": 0.4, "score": 80, "severity": "ok"},
                {"key": "dim2", "label": "Dim 2", "weight": 0.6, "score": 88, "severity": "ok"},
            ]
        }
        validated = validate_score_response(good_report, "experienced")
        self.assertEqual(validated["overall_score"], 85) # 0.4*80 + 0.6*88 = 32 + 52.8 = 84.8 -> round(84.8) = 85

        # Wrong overall score: should be corrected
        drift_report = {
            "overall_score": 90, # wrong
            "format_recommendation": "chronological",
            "dimensions": [
                {"key": "dim1", "label": "Dim 1", "weight": 0.4, "score": 80, "severity": "ok"},
                {"key": "dim2", "label": "Dim 2", "weight": 0.6, "score": 88, "severity": "ok"},
            ]
        }
        validated = validate_score_response(drift_report, "experienced")
        self.assertEqual(validated["overall_score"], 85) # recomputed and corrected

        # Wrong format for persona
        bad_format_report = {
            "overall_score": 85,
            "format_recommendation": "academic", # experienced persona cannot recommend academic
            "dimensions": [
                {"key": "dim1", "label": "Dim 1", "weight": 1.0, "score": 85, "severity": "ok"},
            ]
        }
        with self.assertRaises(ValueError):
            validate_score_response(bad_format_report, "experienced")

    def test_validation_rebuild_source_refs(self):
        raw_cv = "Omar Al-Farsi is a Data Scientist. Built churn prediction model in Python."
        rebuild_report = {
            "sections": [
                {
                    "title": "Experience",
                    "blocks": [
                        {"type": "paragraph", "content": "Built churn model", "source_ref": "churn prediction model"}, # Valid
                        {"type": "paragraph", "content": "Invented new algorithm", "source_ref": "deep learning researcher"}, # Fabricated
                        {"type": "paragraph", "content": "No ref block", "source_ref": ""} # Fabricated
                    ]
                }
            ]
        }
        validated = validate_rebuild_response(rebuild_report, raw_cv, "tr_domestic")
        blocks = validated["sections"][0]["blocks"]
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["source_ref"], "churn prediction model")

    def test_validation_rebuild_kvkk_gate(self):
        # Should raise error if multinational rebuild contains DOB or National ID
        raw_cv = "Omar Al-Farsi is a Data Scientist. Birth Date: 12/12/1990."
        rebuild_report_with_dob = {
            "sections": [
                {
                    "title": "Summary",
                    "blocks": [
                        {"type": "paragraph", "content": "Data Scientist born in 12/12/1990", "source_ref": "Birth Date: 12/12/1990"}
                    ]
                }
            ]
        }
        with self.assertRaises(ValueError):
            validate_rebuild_response(rebuild_report_with_dob, raw_cv, "intl_multinational")

        # Under domestic localization, should be allowed
        validated = validate_rebuild_response(rebuild_report_with_dob, raw_cv, "tr_domestic")
        self.assertEqual(len(validated["sections"][0]["blocks"]), 1)


if __name__ == "__main__":
    unittest.main()
