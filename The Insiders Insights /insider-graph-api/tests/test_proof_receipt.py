"""Enhetstester för kvitto på sanning (Spår D2).

Verifierar månads-scoping, ärlig tyst-månad-rad, ord-disciplinen (upptäckt/
rekommenderad/stängd) och guardrail 1: inga perceptionstal läcker in.
"""
import json
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client före routers/services
from services import proof_receipt as pr


def _finding(**kw):
    base = {
        "question": "Är X pålitliga?", "engine": "gpt-4o", "harm": "#5",
        "severity": "high", "persona": "customer", "status": "open",
        "detected_at": "2026-06-10T08:00:00", "resolved_at": None, "clean_streak": 0,
    }
    base.update(kw)
    return base


def _recipe(**kw):
    base = {
        "status": "pending", "created_at": "2026-06-12T08:00:00",
        "skeleton": {"dimension": "transparency"}, "details": {"prioritized_channel": "website"},
    }
    base.update(kw)
    return base


def _claim_entry(as_of):
    return {"claim_id": "c", "as_of": as_of, "proof_tier": "assured"}


class BuildReceiptScopingTest(unittest.TestCase):
    def test_detected_scoped_to_month(self):
        findings = [
            ("a", _finding(detected_at="2026-06-10T08:00:00")),
            ("b", _finding(detected_at="2026-05-30T08:00:00")),  # förra månaden
            ("c", _finding(harm="ok", detected_at="2026-06-11T08:00:00")),  # ok → ej fynd
        ]
        out = pr.build_receipt("2026-06", "Acme", findings=findings, recipes=[], archive_entries=[])
        self.assertEqual(out["detected"]["count"], 1)
        self.assertEqual(out["detected"]["by_engine"], {"gpt-4o": 1})
        self.assertEqual(out["detected"]["by_harm"], {"#5": 1})

    def test_resolved_scoped_to_month_and_status(self):
        findings = [
            ("a", _finding(status="resolved", resolved_at="2026-06-20T08:00:00", clean_streak=2)),
            ("b", _finding(status="resolved", resolved_at="2026-04-01T08:00:00")),  # annan månad
            ("c", _finding(status="open")),  # ej resolved
        ]
        out = pr.build_receipt("2026-06", "Acme", findings=findings, recipes=[], archive_entries=[])
        self.assertEqual(out["resolved"]["count"], 1)
        self.assertEqual(out["resolved"]["items"][0]["clean_streak"], 2)

    def test_recommended_excludes_dismissed_and_other_months(self):
        recipes = [
            ("a", _recipe(created_at="2026-06-05T00:00:00")),
            ("b", _recipe(status="dismissed", created_at="2026-06-06T00:00:00")),
            ("c", _recipe(created_at="2026-03-06T00:00:00")),
        ]
        out = pr.build_receipt("2026-06", "Acme", findings=[], recipes=recipes, archive_entries=[])
        self.assertEqual(out["recommended"]["count"], 1)
        self.assertEqual(out["recommended"]["by_channel"], {"website": 1})
        self.assertEqual(out["recommended"]["items"][0]["dimension"], "transparency")

    def test_archive_growth_counts_month_only(self):
        entries = [_claim_entry("2026-06-01"), _claim_entry("2026-06-30T10:00:00"), _claim_entry("2026-05-01")]
        out = pr.build_receipt("2026-06", "Acme", findings=[], recipes=[], archive_entries=entries)
        self.assertEqual(out["archive_growth"]["new_this_month"], 2)
        self.assertEqual(out["archive_growth"]["total"], 3)


class BuildReceiptNarrativeTest(unittest.TestCase):
    def test_quiet_month_is_honest_and_positive(self):
        out = pr.build_receipt("2026-06", "Acme", findings=[], recipes=[], archive_entries=[])
        self.assertTrue(out["quiet_month"])
        self.assertIn("stabil", out["headline"])
        self.assertNotIn("0 upptäckta", out["headline"])  # ingen påhittad/negativ siffra

    def test_active_month_headline_uses_disciplined_words(self):
        out = pr.build_receipt(
            "2026-06", "Acme",
            findings=[("a", _finding())],
            recipes=[("r", _recipe())],
            archive_entries=[_claim_entry("2026-06-02")],
        )
        self.assertFalse(out["quiet_month"])
        for word in ("upptäckta", "stängda", "rekommenderade", "verifierade"):
            self.assertIn(word, out["headline"])
        for forbidden in ("fixad", "korrigerad", "fixat"):
            self.assertNotIn(forbidden, out["headline"])

    def test_no_perception_numbers_leak(self):
        # Recept bär valens i skeleton/details i prod — kvittot får ALDRIG exponera det.
        recipe = _recipe()
        recipe["skeleton"].update({"perceived_valence": 0.2, "perceived_salience": 0.9})
        recipe["details"].update({"valence": 0.2})
        out = pr.build_receipt("2026-06", "Acme", findings=[], recipes=[("r", recipe)], archive_entries=[])
        blob = json.dumps(out)
        for leak in ("valence", "salience", "perceived"):
            self.assertNotIn(leak, blob, f"perceptionsfält '{leak}' läckte in i kvittot")


class RouterTest(unittest.TestCase):
    def test_load_raises_404_when_client_missing(self):
        from fastapi import HTTPException
        from routers import proof_receipt as router

        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            router._load("nope", "2026-06")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_load_assembles_from_firestore(self):
        from routers import proof_receipt as router

        fakefs.reset(
            client={"company_name": "Acme"},
            risk_findings={"a": _finding()},
            recipes={"r": _recipe()},
            claims={},
            verifications={},
        )
        out = router._load("acme", "2026-06")
        self.assertEqual(out["company_name"], "Acme")
        self.assertEqual(out["detected"]["count"], 1)
        self.assertEqual(out["recommended"]["count"], 1)


if __name__ == "__main__":
    unittest.main()
