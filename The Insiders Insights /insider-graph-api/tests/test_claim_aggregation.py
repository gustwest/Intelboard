"""Enhetstester för claim-aggregation (services/claim_aggregation.py + endpoint)."""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import BackgroundTasks, HTTPException

from routers import output_quality as oq_router
from services import claim_aggregation as ca


def _llm_returns(narratives):
    return lambda _llm, _system, _user: {"narratives": narratives}


def _claim_state(cid: str) -> dict:
    """Fakefs:s claim_doc.set() skriver nya claims till STATE['writes'], inte STATE['claims'].
    Den här helpern hittar claim:et oavsett om det är ett nytt eller uppdaterat."""
    return fakefs.STATE.get("claims", {}).get(cid) or fakefs.STATE.get("writes", {}).get(cid) or {}


def _claim(*, statement, attested_at=None, kind="attested", included=True, status=None):
    source: dict = {"kind": kind}
    if kind == "attested":
        source.update({"label": "LinkedIn-data, verifierad av Geogiraph",
                       "attested_at": attested_at or "2026-05-01T00:00:00Z"})
    raw: dict = {
        "claim_kind": "narrative",
        "subject_ref": "org",
        "statement": statement,
        "source": [source],
        "included_in_output": included,
        "facet": "operational",
        "origin": "attested:linkedin_follower_demographics",
    }
    if status:
        raw["review_status"] = status
    return raw


class AggregationTest(unittest.TestCase):
    def setUp(self):
        self._orig = (ca.make_validator, ca.invoke_json)
        ca.make_validator = lambda: object()
        # Mocka compile_schema-triggeren
        import jobs.compile_schema as cs
        self._orig_run = cs.run
        cs.run = lambda _cid: None
        # Mocka log_event
        import jobs._run_tracker as rt
        self._orig_log = rt.log_event
        rt.log_event = lambda *_a, **_k: None

    def tearDown(self):
        ca.make_validator, ca.invoke_json = self._orig
        import jobs.compile_schema as cs
        cs.run = self._orig_run
        import jobs._run_tracker as rt
        rt.log_event = self._orig_log

    def test_preview_returns_narratives_without_mutation(self):
        fakefs.reset(
            client={"company_name": "TheInsidersHub AB"},
            claims={
                "c1": _claim(statement="30 av följarna inom Information Services"),
                "c2": _claim(statement="30 av följarna inom IT Services"),
                "c3": _claim(statement="41 av följarna inom Software Development"),
            },
        )
        ca.invoke_json = _llm_returns([
            "Vårt nätverk består primärt av experter inom IT/Software och kringliggande tech-sektorer."
        ])
        r = ca.aggregate_claims("acme", ["c1", "c2", "c3"], "industry", apply=False)
        self.assertFalse(r.applied)
        self.assertEqual(len(r.narratives), 1)
        self.assertIn("IT/Software", r.narratives[0])
        # Inga claims förändrade
        self.assertTrue(fakefs.STATE["claims"]["c1"]["included_in_output"])
        self.assertNotIn("review_status", fakefs.STATE["claims"]["c1"])

    def test_apply_creates_new_claims_and_deactivates_originals(self):
        fakefs.reset(
            client={"company_name": "Acme"},
            claims={
                "c1": _claim(statement="30 i bransch A"),
                "c2": _claim(statement="30 i bransch B"),
            },
        )
        ca.invoke_json = _llm_returns(["Syntetiserad text om branscher."])
        r = ca.aggregate_claims("acme", ["c1", "c2"], "industry", apply=True)
        self.assertTrue(r.applied)
        self.assertEqual(len(r.new_claim_ids), 1)

        new_id = r.new_claim_ids[0]
        new_doc = _claim_state(new_id)
        self.assertEqual(new_doc["statement"], "Syntetiserad text om branscher.")
        self.assertEqual(new_doc["claim_kind"], "narrative")
        self.assertTrue(new_doc["included_in_output"])
        self.assertEqual(new_doc["review_status"], "approved")
        self.assertEqual(new_doc["origin"], "aggregated:industry")
        self.assertEqual(set(new_doc["aggregated_from"]), {"c1", "c2"})

        # Originalen är deaktiverade
        for cid in ("c1", "c2"):
            o = fakefs.STATE["claims"][cid]
            self.assertFalse(o["included_in_output"])
            self.assertEqual(o["review_status"], "aggregated")
            self.assertEqual(set(o["aggregated_into"]), {new_id})
            self.assertIn("aggregated_at", o)

    def test_aggregated_source_uses_freshest_attested(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A", attested_at="2026-04-01T00:00:00Z"),
            "c2": _claim(statement="B", attested_at="2026-05-15T00:00:00Z"),  # färskast
        })
        ca.invoke_json = _llm_returns(["Syntes."])
        r = ca.aggregate_claims("acme", ["c1", "c2"], None, apply=True)
        src = _claim_state(r.new_claim_ids[0])["source"][0]
        self.assertEqual(src["kind"], "attested")
        self.assertEqual(src["attested_at"], "2026-05-15T00:00:00Z")
        self.assertIn("Sammanfattning av 2 datapunkter", src["label"])

    def test_filters_rejected_claims(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"),
            "rej": _claim(statement="B", status="rejected"),
            "c2": _claim(statement="C"),
        })
        ca.invoke_json = _llm_returns(["Syntes."])
        r = ca.aggregate_claims("acme", ["c1", "rej", "c2"], "industry", apply=True)
        # Bara c1 + c2 räknas
        self.assertEqual(set(r.aggregated_claim_ids), {"c1", "c2"})
        self.assertEqual(fakefs.STATE["claims"]["rej"]["review_status"], "rejected")  # orörd

    def test_too_few_claims_returns_empty(self):
        fakefs.reset(client={"company_name": "X"}, claims={"c1": _claim(statement="A")})
        # Mindre än MIN_CLAIMS_TO_AGGREGATE=2
        r = ca.aggregate_claims("acme", ["c1"], "industry", apply=False)
        self.assertEqual(r.narratives, [])
        self.assertFalse(r.applied)

    def test_max_two_narratives_kept(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"), "c2": _claim(statement="B"),
        })
        # LLM ger 4, vi behåller bara MAX_NARRATIVES=2
        ca.invoke_json = _llm_returns(["en", "två", "tre", "fyra"])
        r = ca.aggregate_claims("acme", ["c1", "c2"], "industry", apply=False)
        self.assertEqual(len(r.narratives), ca.MAX_NARRATIVES)

    def test_llm_unavailable(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"), "c2": _claim(statement="B"),
        })
        ca.make_validator = lambda: None
        r = ca.aggregate_claims("acme", ["c1", "c2"], "industry", apply=False)
        self.assertTrue(r.llm_unavailable)
        self.assertEqual(r.narratives, [])

    def test_stable_id_makes_apply_idempotent(self):
        """Om vi kör apply två gånger med samma originals + samma syntes →
        samma agg-id används (vi skriver över, inte duplicerar)."""
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"), "c2": _claim(statement="B"),
        })
        ca.invoke_json = _llm_returns(["Samma syntes"])

        r1 = ca.aggregate_claims("acme", ["c1", "c2"], "industry", apply=True)
        first_id = r1.new_claim_ids[0]

        # Återställ originalens included_in_output så de kan re-aggregeras
        fakefs.STATE["claims"]["c1"]["included_in_output"] = True
        fakefs.STATE["claims"]["c1"].pop("review_status", None)
        fakefs.STATE["claims"]["c2"]["included_in_output"] = True
        fakefs.STATE["claims"]["c2"].pop("review_status", None)

        r2 = ca.aggregate_claims("acme", ["c1", "c2"], "industry", apply=True)
        self.assertEqual(r2.new_claim_ids[0], first_id)


class AggregateEndpointTest(unittest.TestCase):
    def setUp(self):
        self._orig = (ca.make_validator, ca.invoke_json)
        ca.make_validator = lambda: object()
        import jobs.compile_schema as cs
        self._orig_run = cs.run
        cs.run = lambda _cid: None
        import jobs._run_tracker as rt
        self._orig_log = rt.log_event
        rt.log_event = lambda *_a, **_k: None

    def tearDown(self):
        ca.make_validator, ca.invoke_json = self._orig
        import jobs.compile_schema as cs
        cs.run = self._orig_run
        import jobs._run_tracker as rt
        rt.log_event = self._orig_log

    def test_404_for_missing_client(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            oq_router.aggregate_dimension(
                "ghost",
                oq_router.AggregateRequest(claim_ids=["c1", "c2"], dimension_hint="x", apply=False),
                BackgroundTasks(),
            )
        self.assertEqual(cm.exception.status_code, 404)

    def test_503_when_llm_unavailable(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"), "c2": _claim(statement="B"),
        })
        ca.make_validator = lambda: None
        with self.assertRaises(HTTPException) as cm:
            oq_router.aggregate_dimension(
                "acme",
                oq_router.AggregateRequest(claim_ids=["c1", "c2"], dimension_hint="x", apply=False),
                BackgroundTasks(),
            )
        self.assertEqual(cm.exception.status_code, 503)

    def test_422_when_no_narratives_possible(self):
        fakefs.reset(client={"company_name": "X"}, claims={
            # Bara en av två claim_ids existerar
            "c1": _claim(statement="A"),
        })
        with self.assertRaises(HTTPException) as cm:
            oq_router.aggregate_dimension(
                "acme",
                oq_router.AggregateRequest(claim_ids=["c1", "missing"], dimension_hint="x", apply=False),
                BackgroundTasks(),
            )
        self.assertEqual(cm.exception.status_code, 422)

    def test_apply_triggers_recompile(self):
        recompiled = []
        import jobs.compile_schema as cs
        cs.run = lambda cid: recompiled.append(cid)

        fakefs.reset(client={"company_name": "X"}, claims={
            "c1": _claim(statement="A"), "c2": _claim(statement="B"),
        })
        ca.invoke_json = _llm_returns(["Syntes"])
        bg = BackgroundTasks()
        oq_router.aggregate_dimension(
            "acme",
            oq_router.AggregateRequest(claim_ids=["c1", "c2"], dimension_hint="x", apply=True),
            bg,
        )
        import asyncio
        asyncio.run(bg())
        self.assertEqual(recompiled, ["acme"])


if __name__ == "__main__":
    unittest.main()
