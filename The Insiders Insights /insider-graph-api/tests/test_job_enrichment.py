"""Enhetstester för semantisk annons-berikning (services/job_enrichment.py).

LLM:en mockas; vi verifierar berikningens regler och writeback, inte modellens kvalitet.
"""
import json
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.job_enrichment as je


class _Resp:
    def __init__(self, content: str):
        self.content = content


class _FakeLLM:
    def __init__(self, payload: dict):
        self._payload = payload

    def invoke(self, messages):
        return _Resp(json.dumps(self._payload))


class JobEnrichmentTest(unittest.TestCase):
    def _setup(self, items):
        fakefs.reset(client={"company_name": "Acme AB"}, company_items=items)

    def test_writes_global_title_skills_and_strategic(self):
        self._setup(
            {
                "jp1": {
                    "schema_type": "JobPosting",
                    "content": "Vi söker en uppdragsledare inom digitalisering.",
                    "extra": {"name": "Uppdragsledare inom digitalisering", "skills": ["AWS"]},
                }
            }
        )
        llm = _FakeLLM(
            {"global_title": "Digital Transformation Manager", "skills": ["Digital Transformation", "AWS"], "strategic": True}
        )
        result = je.enrich_jobs_for_client("acme", llm)
        self.assertEqual(result["enriched"], 1)
        doc = fakefs.STATE["company_items"]["jp1"]
        self.assertEqual(doc["global_title"], "Digital Transformation Manager")
        self.assertEqual(doc["skills_enriched"], ["Digital Transformation", "AWS"])
        self.assertTrue(doc["strategic"])
        self.assertTrue(doc["enriched_at"])
        # baslinje-extra rörs inte
        self.assertEqual(doc["extra"]["skills"], ["AWS"])

    def test_generic_role_marked_non_strategic(self):
        self._setup({"jp2": {"schema_type": "JobPosting", "content": "Receptionist sökes.", "extra": {"name": "Receptionist"}}})
        je.enrich_jobs_for_client("acme", _FakeLLM({"global_title": "Receptionist", "skills": [], "strategic": False}))
        self.assertFalse(fakefs.STATE["company_items"]["jp2"]["strategic"])

    def test_ambiguous_strategic_defaults_true(self):
        # saknas "strategic" i svaret → default True (hellre ta med än tappa)
        self._setup({"jp3": {"schema_type": "JobPosting", "content": "x", "extra": {"name": "Arkitekt"}}})
        je.enrich_jobs_for_client("acme", _FakeLLM({"global_title": "Architect", "skills": ["X"]}))
        self.assertTrue(fakefs.STATE["company_items"]["jp3"]["strategic"])

    def test_already_enriched_is_skipped(self):
        self._setup(
            {"jp4": {"schema_type": "JobPosting", "enriched_at": "2026-01-01T00:00:00+00:00", "extra": {"name": "X"}}}
        )
        result = je.enrich_jobs_for_client("acme", _FakeLLM({"global_title": "Y", "skills": [], "strategic": True}))
        self.assertEqual(result["enriched"], 0)

    def test_no_llm_is_noop(self):
        self._setup({"jp5": {"schema_type": "JobPosting", "content": "x", "extra": {"name": "X"}}})
        je._pick_validator = lambda: None
        try:
            result = je.enrich_jobs_for_client("acme")
        finally:
            je._pick_validator = je.llm_factory.make_validator
        self.assertEqual(result["enriched"], 0)
        self.assertEqual(result["reason"], "no_llm")
        self.assertNotIn("enriched_at", fakefs.STATE["company_items"]["jp5"])

    def test_non_jobposting_ignored(self):
        self._setup({"org": {"schema_type": "Organization", "extra": {"name": "Acme"}}})
        result = je.enrich_jobs_for_client("acme", _FakeLLM({"global_title": "X", "skills": [], "strategic": True}))
        self.assertEqual(result["enriched"], 0)


if __name__ == "__main__":
    unittest.main()
