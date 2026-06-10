"""R1 — person-expertis: CV/bio → smal extraktion → person-claims med samtyckesgrind.

Kärnkraven: (1) inget intag utan samtyckes-intyg, (2) opt-out blockerar helt,
(3) claims hamnar i granskningskön (needs_review, ej i output), (4) omkörning
ersätter gamla claims, (5) status-räkningen driver Medarbetare-boxens UI.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from services import person_expertise as pe

# Sentinel-LLM (hoppar över make_validator) + patchad invoke_json i testerna.
_LLM = object()
_EXTRACTED = {
    "expertise_areas": ["inbyggda system", "fordonsindustri"],
    "statements": ["Anna Svensson har lett utvecklingsteam inom fordonsindustrin i 12 år."],
}


def _reset(**emp_overrides):
    fakefs.reset(
        client={"company_name": "Acme AB"},
        employees={"emp_1": {"name": "Anna Svensson", "title": "VD", **emp_overrides}},
    )


class IngestTest(unittest.TestCase):
    def setUp(self):
        self._orig = pe.llm_factory.invoke_json
        pe.llm_factory.invoke_json = lambda llm, system, payload: dict(_EXTRACTED)

    def tearDown(self):
        pe.llm_factory.invoke_json = self._orig

    def _ingest(self, **kw):
        kw.setdefault("consent_attested", True)
        return pe.ingest_person_expertise("acme", "emp_1", "cv.txt", b"CV-text...", llm=_LLM, **kw)

    def test_consent_required(self):
        _reset()
        with self.assertRaises(ValueError) as ctx:
            self._ingest(consent_attested=False)
        self.assertIn("amtycke", str(ctx.exception))

    def test_opted_out_blocked(self):
        _reset(opted_out=True)
        with self.assertRaises(ValueError) as ctx:
            self._ingest()
        self.assertIn("opt", str(ctx.exception))

    def test_unknown_employee_404(self):
        _reset()
        with self.assertRaises(ValueError) as ctx:
            pe.ingest_person_expertise("acme", "emp_X", "cv.txt", b"x",
                                       consent_attested=True, llm=_LLM)
        self.assertIn("not found", str(ctx.exception))

    def test_creates_claims_in_review_queue(self):
        _reset()
        result = self._ingest()
        self.assertEqual(result["claims_created"], 3)  # 2 områden + 1 merit
        self.assertTrue(result["needs_review"])
        written = fakefs.STATE["writes"]
        self.assertEqual(len(written), 3)
        for cid, claim in written.items():
            self.assertTrue(cid.startswith("pex-emp_1-"))
            self.assertEqual(claim["subject_ref"], "emp_1")     # matchar GDPR-purgens nyckel
            self.assertTrue(claim["needs_review"])               # → Granska-kön
            self.assertFalse(claim["included_in_output"])        # aldrig direkt till leverans
            self.assertEqual(claim["source"][0]["kind"], "attested")
            self.assertEqual(claim["source"][0]["employee_id"], "emp_1")
        kinds = sorted(c["claim_kind"] for c in written.values())
        self.assertEqual(kinds, ["narrative", "property", "property"])
        # Samtyckes-intyget dokumenteras på medarbetaren.
        emp = fakefs.STATE["employees"]["emp_1"]
        self.assertIsNotNone(emp.get("consent_attested_at"))

    def test_reupload_replaces_old_claims(self):
        _reset()
        fakefs.STATE["claims"]["pex-emp_1-old-a0"] = {"subject_ref": "emp_1", "claim_kind": "property"}
        fakefs.STATE["claims"]["other-claim"] = {"subject_ref": "org"}
        result = self._ingest()
        self.assertEqual(result["replaced"], 1)
        self.assertNotIn("pex-emp_1-old-a0", fakefs.STATE["claims"])  # gamla bort
        self.assertIn("other-claim", fakefs.STATE["claims"])          # org-claims orörda

    def test_extraction_failure_raises(self):
        _reset()
        pe.llm_factory.invoke_json = lambda llm, system, payload: None
        with self.assertRaises(ValueError):
            self._ingest()


class StatusTest(unittest.TestCase):
    def test_status_counts_by_state(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            employees={"emp_1": {"name": "Anna"}},
            claims={
                "pex-emp_1-x-a0": {"subject_ref": "emp_1", "needs_review": True,
                                   "included_in_output": False},
                "pex-emp_1-x-s0": {"subject_ref": "emp_1", "included_in_output": True,
                                   "review_status": "approved"},
                "pex-emp_1-x-s1": {"subject_ref": "emp_1", "review_status": "rejected",
                                   "included_in_output": False},
                "org-claim": {"subject_ref": "org", "included_in_output": True},
            },
        )
        status = pe.expertise_status_by_employee("acme")
        self.assertEqual(status["emp_1"], {"in_review": 1, "included": 1, "rejected": 1})
        self.assertNotIn("org", status)  # org-claims räknas aldrig

    def test_clear_removes_only_own_pex_claims(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            employees={"emp_1": {"name": "Anna"}},
            claims={
                "pex-emp_1-x-a0": {"subject_ref": "emp_1"},
                "pex-emp_2-x-a0": {"subject_ref": "emp_2"},
                "org-claim": {"subject_ref": "org"},
            },
        )
        removed = pe.clear_person_expertise("acme", "emp_1")
        self.assertEqual(removed, 1)
        self.assertNotIn("pex-emp_1-x-a0", fakefs.STATE["claims"])
        self.assertIn("pex-emp_2-x-a0", fakefs.STATE["claims"])  # annan persons kvar
        self.assertIn("org-claim", fakefs.STATE["claims"])


if __name__ == "__main__":
    unittest.main()
