"""Enhetstester för GEO-riskloopens skiva 2 — korrigering (services/risk_corrector.py
+ routers/review.decide_risk).

Verifierar att en åtgärdad finding ger ett källförsett, publicerbart korrigerande
claim som kompilatorn projicerar, att dismiss stänger findingen utan claim, och att
ett claim aldrig skapas utan innehåll (spec §2.1).
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import BackgroundTasks, HTTPException

from routers import review
from schema_org.compiler import compile_client
from services import risk_corrector as rc


def _finding(**over):
    base = {
        "persona": "investor",
        "track": "A",
        "question": "Finns det tvister kopplade till Acme?",
        "engine": "gpt-4o",
        "harm": "#3",
        "severity": "high",
        "sourcing": "none",
        "engine_excerpt": "Acme lär ha haft en dataläcka",
        "status": "open",
        "needs_review": True,
    }
    base.update(over)
    return base


class BuildCorrectiveClaimTest(unittest.TestCase):
    def test_shape_and_defaults(self):
        claim = rc.build_corrective_claim("Acme har aldrig haft någon dataläcka.", None, None)
        self.assertEqual(claim.claim_kind, "narrative")
        self.assertEqual(claim.subject_ref, "org")
        self.assertTrue(claim.included_in_output)
        self.assertFalse(claim.needs_review)
        self.assertEqual(claim.review_status, "approved")
        self.assertEqual(claim.source[0].kind, "manual")
        self.assertEqual(claim.source[0].label, rc.DEFAULT_SOURCE_LABEL)

    def test_custom_source_and_url(self):
        claim = rc.build_corrective_claim("X.", "GLEIF", "https://acme.se/om")
        self.assertEqual(claim.source[0].label, "GLEIF")
        self.assertEqual(claim.source[0].url, "https://acme.se/om")

    def test_id_is_deterministic(self):
        a = rc._claim_id("samma påstående")
        b = rc._claim_id("  samma påstående  ")  # trimmas före hash → idempotent
        self.assertEqual(a, b)
        self.assertTrue(a.startswith("corr-"))


class DecideRiskTest(unittest.TestCase):
    def test_404_missing_finding(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            review.decide_risk("acme", "ghost", review.RiskAction(decision="dismiss"), BackgroundTasks())
        self.assertEqual(ctx.exception.status_code, 404)

    def test_dismiss_closes_without_claim(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={"f1": _finding()})
        out = review.decide_risk(
            "acme", "f1", review.RiskAction(decision="dismiss", note="sant negativ"), BackgroundTasks()
        )
        self.assertEqual(out["decision"], "dismiss")
        stored = fakefs.STATE["risk_findings"]["f1"]
        self.assertEqual(stored["status"], "dismissed")
        self.assertFalse(stored["needs_review"])
        self.assertEqual(fakefs.writes(), {})  # inget claim skapat

    def test_action_requires_statement(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={"f1": _finding()})
        with self.assertRaises(HTTPException) as ctx:
            review.decide_risk("acme", "f1", review.RiskAction(decision="action", statement="  "), BackgroundTasks())
        self.assertEqual(ctx.exception.status_code, 422)

    def test_action_reinforces_and_links(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={"f1": _finding()})
        bg = BackgroundTasks()
        out = review.decide_risk(
            "acme",
            "f1",
            review.RiskAction(decision="action", statement="Acme har aldrig haft någon dataläcka."),
            bg,
        )
        self.assertEqual(out["decision"], "action")
        claim_id = out["claim_id"]
        self.assertTrue(claim_id.startswith("corr-"))

        finding = fakefs.STATE["risk_findings"]["f1"]
        self.assertEqual(finding["status"], "actioned")
        self.assertFalse(finding["needs_review"])
        self.assertEqual(finding["action_taken"], "reinforced_claim")
        self.assertEqual(finding["ammo_claim_ids"], [claim_id])

        claim = fakefs.writes()[claim_id]  # korrigerande claim persisterades
        self.assertEqual(claim["statement"], "Acme har aldrig haft någon dataläcka.")
        self.assertTrue(claim["included_in_output"])

        # recompile schemalagd så korrigeringen publiceras
        self.assertEqual(len(bg.tasks), 1)


class CompilerProjectionTest(unittest.TestCase):
    def test_corrective_claim_renders_in_graph(self):
        statement = "Acme har aldrig drabbats av en publik dataläcka."
        claim = rc.build_corrective_claim(statement, None, None)
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            claims={rc._claim_id(statement): claim.model_dump()},
        )
        graph = compile_client("acme")
        org = next(n for n in graph["@graph"] if n["@type"] == "Organization")
        self.assertIn("aldrig drabbats av en publik dataläcka", org.get("description", ""))


if __name__ == "__main__":
    unittest.main()
