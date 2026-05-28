"""Enhetstester för active gate på LinkedIn-demografi (services/output_quality_gate.py)."""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först

from services import output_quality, output_quality_gate as gate


def _demo_claim(*, statement="X följare i Y", origin="attested:linkedin_follower_demographics", included=True):
    raw: dict = {
        "claim_kind": "narrative",
        "subject_ref": "org",
        "statement": statement,
        "source": [{"kind": "attested", "label": "LinkedIn", "attested_at": "2026-05-01"}],
        "included_in_output": included,
        "facet": "operational",
        "origin": origin,
    }
    return raw


def _audience():
    return [{
        "audience_type": "customer",
        "weight": 1.0,
        "personas": [{"role": "CXO", "industry": "SaaS"}],
        "narrative_axes": ["praktisk AI"],
    }]


def _llm_items(scores: list[tuple[str, float, str | None]]):
    """Bygg fake LLM-svar: scores = [(action, snitt, dimension_hint)]."""
    out = []
    for i, (action, score, hint) in enumerate(scores):
        per_dim = {d: score for d in output_quality.SCORE_DIMENSIONS}
        out.append({
            "index": i,
            "dimension_hint": hint,
            "best_audience": "customer",
            "dimensions": per_dim,
            "action": action,
            "reasons": [],
        })
    return out


class GateOnLinkedinDemographicsTest(unittest.TestCase):
    def setUp(self):
        self._orig = (output_quality.make_validator, output_quality.invoke_json)
        output_quality.make_validator = lambda: object()

    def tearDown(self):
        output_quality.make_validator, output_quality.invoke_json = self._orig

    def test_no_op_when_no_demographic_claims(self):
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": "x", "source": [{"kind": "manual"}],
                   "included_in_output": True, "origin": "extraction"},
        })
        self.assertIsNone(gate.apply_gate("acme"))

    def test_drop_action_excludes_claim_and_flags_review(self):
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": _demo_claim()},
        )
        # Score 1.0 → drop
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("drop", 1.0, "geography")])}
        summary = gate.apply_gate("acme")
        self.assertEqual(summary["actions"]["drop"], 1)

        stored = fakefs.STATE["claims"]["d1"]
        self.assertFalse(stored["included_in_output"])
        self.assertTrue(stored["needs_review"])
        self.assertIsNone(stored.get("review_status"))
        self.assertIn("gate_decision", stored)

    def test_transform_action_keeps_claim_but_flags_review(self):
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": _demo_claim()},
        )
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("transform", 2.0, "geography")])}
        summary = gate.apply_gate("acme")
        self.assertEqual(summary["actions"]["transform"], 1)

        stored = fakefs.STATE["claims"]["d1"]
        self.assertTrue(stored["included_in_output"])  # ligger kvar
        self.assertTrue(stored["needs_review"])
        self.assertIn("gate_decision", stored)

    def test_publish_action_unchanged(self):
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": _demo_claim()},
        )
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("publish", 4.0, "seniority")])}
        gate.apply_gate("acme")

        stored = fakefs.STATE["claims"]["d1"]
        self.assertTrue(stored["included_in_output"])
        self.assertFalse(stored.get("needs_review", False))
        # gate_decision sätts ändå (passive trace)
        self.assertIn("gate_decision", stored)

    def test_high_redundancy_flags_review_on_publish_claims(self):
        """Många claims i samma dimension → även de som annars skulle publicerats
        flaggas för granskning (kollapsen behöver mänsklig hand)."""
        n = 5  # över MAX_PER_DIMENSION_HINT=3
        claims = {
            f"d{i}": _demo_claim(statement=f"X följare i ort {i}")
            for i in range(n)
        }
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims=claims,
        )
        # Alla får hög poäng + samma dimension_hint → publish men redundant
        output_quality.invoke_json = lambda *_a: {
            "items": _llm_items([("publish", 4.0, "geography")] * n)
        }
        summary = gate.apply_gate("acme")
        self.assertGreater(summary["actions"]["redundant"], 0)

        # Alla 5 ska ha needs_review = True trots publish-action
        for i in range(n):
            stored = fakefs.STATE["claims"][f"d{i}"]
            self.assertTrue(stored["needs_review"], f"claim d{i} should be flagged for review")

    def test_only_linkedin_demographic_origins_targeted(self):
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={
                "demo": _demo_claim(origin="attested:linkedin_follower_demographics"),
                "vis": _demo_claim(origin="attested:linkedin_visitor_demographics"),
                "post": _demo_claim(origin="attested:linkedin_posts"),  # andra LinkedIn-typer = shadow only
                "web": {"claim_kind": "narrative", "statement": "x", "source": [{"kind": "manual"}],
                        "included_in_output": True},  # ingen origin → extraction
            },
        )
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("drop", 1.0, "geography"), ("drop", 1.0, "geography")])}
        summary = gate.apply_gate("acme")
        # Bara följare + besökare räknas (2 st)
        self.assertEqual(summary["claim_count"], 2)
        # post + web är orörda
        self.assertNotIn("gate_decision", fakefs.STATE["claims"]["post"])
        self.assertNotIn("gate_decision", fakefs.STATE["claims"]["web"])

    def test_rejected_claims_respected(self):
        """Människa har redan avvisat → gaten rör inte."""
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={
                "rej": {**_demo_claim(), "review_status": "rejected"},
                "ok": _demo_claim(),
            },
        )
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("drop", 1.0, "geography")])}
        summary = gate.apply_gate("acme")
        self.assertEqual(summary["claim_count"], 1)
        # Den avvisade rörs inte
        stored = fakefs.STATE["claims"]["rej"]
        self.assertEqual(stored.get("review_status"), "rejected")
        self.assertNotIn("gate_decision", stored)

    def test_llm_unavailable_skips_mutations(self):
        """Vid LLM-fel ska vi INTE drop:a allt (rubric:en ger score=0 då)."""
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": _demo_claim()},
        )
        output_quality.make_validator = lambda: None
        summary = gate.apply_gate("acme")
        self.assertEqual(summary.get("skipped"), "llm_unavailable")

        # Claim:et är orörd
        stored = fakefs.STATE["claims"]["d1"]
        self.assertTrue(stored["included_in_output"])
        self.assertNotIn("gate_decision", stored)

    def test_writes_gate_log(self):
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": _demo_claim()},
        )
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("drop", 1.0, "geography")])}
        gate.apply_gate("acme")

        logs = dict(fakefs.iter_output_quality_logs("acme"))
        self.assertEqual(len(logs), 1)
        log_doc = next(iter(logs.values()))
        self.assertEqual(log_doc["source"], "gate")
        self.assertEqual(log_doc["connector"], "linkedin_capacity")
        self.assertEqual(log_doc["scope"], "demographics")
        self.assertEqual(len(log_doc["actions"]), 1)
        self.assertEqual(log_doc["actions"][0]["action"], "drop")

    def test_revaluates_already_dropped_claim(self):
        """Om gaten kalibreras kan en tidigare droppad claim åter-publiceras."""
        already_dropped = _demo_claim(included=False)
        already_dropped["needs_review"] = True
        fakefs.reset(
            client={"company_name": "Acme", "audience_priorities": _audience()},
            claims={"d1": already_dropped},
        )
        # Nu får claimet hög poäng → action=publish, ska åter-inkluderas? Nej —
        # mutation-logiken sätter bara needs_review-flaggor + drop. Återinkludering
        # överlåts åt granskningskön (mänsklig). Men gate_decision uppdateras alltid.
        output_quality.invoke_json = lambda *_a: {"items": _llm_items([("publish", 4.5, "seniority")])}
        gate.apply_gate("acme")
        stored = fakefs.STATE["claims"]["d1"]
        # Fortfarande ut ur output (gate sätter inte tillbaka included_in_output)
        self.assertFalse(stored["included_in_output"])
        # gate_decision är uppdaterat med nya scoren
        self.assertEqual(stored["gate_decision"]["action"], "publish")
        self.assertAlmostEqual(stored["gate_decision"]["score"], 4.5)


if __name__ == "__main__":
    unittest.main()
