"""Enhetstester för output-quality-logg-endpoints (routers/output_quality.py).

Per-kund-lista + per-logg-detaljer driver kundkort-panelen + detaljsidan."""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import BackgroundTasks, HTTPException

from routers import output_quality as oq_router


def _log(*, log_id, source="compile_schema", score=3.0, verdict="pass", claims=10,
         aud=1, flags=0, scope=None, connector=None):
    return log_id, {
        "logged_at": f"2026-05-29T08:{log_id[-2:]}:00",
        "source": source,
        "scope": scope,
        "connector": connector,
        "bundle_score": score,
        "verdict": verdict,
        "claim_count": claims,
        "audience_count": aud,
        "metadata": {"claim_count": claims, "llm_unavailable": False},
        "bundle_flags": [{"type": "x"}] * flags,
        "per_claim": [{"claim_id": f"c{i}", "score": 4.0, "action": "publish"} for i in range(claims)],
    }


class ListLogsTest(unittest.TestCase):
    def test_404_when_client_missing(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            oq_router.list_logs("ghost")
        self.assertEqual(cm.exception.status_code, 404)

    def test_returns_summary_fields_only(self):
        log_id, doc = _log(log_id="20260529T080100000000-test-01", claims=50, flags=3)
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs={log_id: doc})
        result = oq_router.list_logs("acme", limit=20, source=None)
        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        # Summary-fält finns
        self.assertEqual(item["log_id"], log_id)
        self.assertEqual(item["bundle_score"], 3.0)
        self.assertEqual(item["verdict"], "pass")
        self.assertEqual(item["claim_count"], 50)
        self.assertEqual(item["flag_count"], 3)
        # Per-claim är INTE inkluderat (det blir för stort för en lista)
        self.assertNotIn("per_claim", item)

    def test_sorted_newest_first(self):
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs=dict([
            _log(log_id="20260529T080100000000-a-01"),
            _log(log_id="20260529T090100000000-b-02"),
            _log(log_id="20260528T080100000000-c-03"),
        ]))
        result = oq_router.list_logs("acme", limit=20, source=None)
        ids = [i["log_id"] for i in result["items"]]
        self.assertEqual(ids, [
            "20260529T090100000000-b-02",
            "20260529T080100000000-a-01",
            "20260528T080100000000-c-03",
        ])

    def test_limit_caps_result(self):
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs=dict([
            _log(log_id=f"20260529T080100000000-x-{i:02d}") for i in range(5)
        ]))
        result = oq_router.list_logs("acme", limit=2, source=None)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["total"], 5)  # total räknas på FULLA setet, före limit

    def test_filter_by_source(self):
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs=dict([
            _log(log_id="20260529T080100000000-a-01", source="compile_schema"),
            _log(log_id="20260529T080200000000-a-02", source="gate", scope="demographics",
                 connector="linkedin_capacity"),
        ]))
        gate_only = oq_router.list_logs("acme", limit=20, source="gate")
        self.assertEqual(len(gate_only["items"]), 1)
        self.assertEqual(gate_only["items"][0]["source"], "gate")
        self.assertEqual(gate_only["items"][0]["scope"], "demographics")
        self.assertEqual(gate_only["items"][0]["connector"], "linkedin_capacity")


class GetLogTest(unittest.TestCase):
    def test_404_when_client_missing(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            oq_router.get_log("ghost", "any")
        self.assertEqual(cm.exception.status_code, 404)

    def test_404_when_log_missing(self):
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs={})
        with self.assertRaises(HTTPException) as cm:
            oq_router.get_log("acme", "missing")
        self.assertEqual(cm.exception.status_code, 404)

    def test_returns_full_doc(self):
        log_id, doc = _log(log_id="20260529T080100000000-x-01", claims=3)
        fakefs.reset(client={"company_name": "Acme"}, output_quality_logs={log_id: doc})
        result = oq_router.get_log("acme", log_id)
        # Hela doc:et + log_id som top-level
        self.assertEqual(result["log_id"], log_id)
        self.assertEqual(result["bundle_score"], 3.0)
        self.assertEqual(len(result["per_claim"]), 3)
        self.assertIn("metadata", result)


class ApplySuggestionTest(unittest.TestCase):
    """POST /apply-suggestion/{client_id}/{claim_id} — kärnflödet för att stänga loopen."""

    def setUp(self):
        # Mocka compile_schema så vi inte triggar riktig pipeline i test
        import jobs.compile_schema as cs
        self._orig_run = cs.run
        cs.run = lambda _cid: None
        # Mocka log_event så vi inte beror på job_runs-skrivning
        import jobs._run_tracker as rt
        self._orig_log = rt.log_event
        self._events = []
        rt.log_event = lambda kind, cid, summary: self._events.append((kind, cid, summary))

    def tearDown(self):
        import jobs.compile_schema as cs
        cs.run = self._orig_run
        import jobs._run_tracker as rt
        rt.log_event = self._orig_log

    def _payload(self, suggestion="Vårt nätverk inkluderar experter inom IT-sektorn", source_log_id="log-123"):
        return oq_router.ApplySuggestionRequest(suggestion=suggestion, source_log_id=source_log_id)

    def test_404_when_client_missing(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            oq_router.apply_suggestion("ghost", "c1", self._payload(), BackgroundTasks())
        self.assertEqual(cm.exception.status_code, 404)

    def test_404_when_claim_missing(self):
        fakefs.reset(client={"company_name": "Acme"}, claims={})
        with self.assertRaises(HTTPException) as cm:
            oq_router.apply_suggestion("acme", "missing", self._payload(), BackgroundTasks())
        self.assertEqual(cm.exception.status_code, 404)

    def test_replaces_statement_and_preserves_original(self):
        original_text = "30 av följarna jobbar inom Information Services"
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {
                "claim_kind": "narrative",
                "statement": original_text,
                "included_in_output": True,
                "needs_review": True,
            }
        })
        result = oq_router.apply_suggestion("acme", "c1", self._payload(), BackgroundTasks())
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["original_statement"], original_text)

        stored = fakefs.STATE["claims"]["c1"]
        self.assertEqual(stored["statement"], "Vårt nätverk inkluderar experter inom IT-sektorn")
        self.assertEqual(stored["original_statement"], original_text)
        self.assertEqual(stored["review_status"], "approved")
        self.assertFalse(stored["needs_review"])
        self.assertTrue(stored["included_in_output"])
        self.assertIn("suggestion_applied_at", stored)
        self.assertEqual(stored["suggestion_applied_from_log"], "log-123")
        self.assertEqual(stored["validated_by"], "granskare (applicerat förslag)")

    def test_does_not_overwrite_original_on_repeated_apply(self):
        """Om någon klickar Applicera två gånger ska originalet bevaras från första klicket."""
        first_original = "FÖRSTA ORIGINALET"
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": first_original, "needs_review": True},
        })
        oq_router.apply_suggestion("acme", "c1", self._payload(suggestion="Steg 1"), BackgroundTasks())
        # Nu är statement="Steg 1" och original_statement=first_original
        stored = fakefs.STATE["claims"]["c1"]
        self.assertEqual(stored["statement"], "Steg 1")
        self.assertEqual(stored["original_statement"], first_original)

        # Applicera ett ANNAT förslag — original ska INTE skrivas över till "Steg 1"
        oq_router.apply_suggestion("acme", "c1", self._payload(suggestion="Steg 2"), BackgroundTasks())
        stored = fakefs.STATE["claims"]["c1"]
        self.assertEqual(stored["statement"], "Steg 2")
        self.assertEqual(stored["original_statement"], first_original)

    def test_noop_when_suggestion_equals_current_statement(self):
        same = "Samma text"
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": same, "needs_review": True},
        })
        result = oq_router.apply_suggestion("acme", "c1", self._payload(suggestion=same), BackgroundTasks())
        self.assertEqual(result["status"], "noop")
        # Inga mutationer
        self.assertEqual(fakefs.STATE["claims"]["c1"].get("review_status"), None)

    def test_empty_suggestion_422(self):
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": "x", "needs_review": True},
        })
        # Pydantic-validering: min_length=1 → ValidationError vid model-bygge
        with self.assertRaises(Exception):
            oq_router.ApplySuggestionRequest(suggestion="", source_log_id=None)
        # Whitespace-only → vår egen 422 i endpointen
        with self.assertRaises(HTTPException) as cm:
            oq_router.apply_suggestion("acme", "c1",
                oq_router.ApplySuggestionRequest(suggestion="   "), BackgroundTasks())
        self.assertEqual(cm.exception.status_code, 422)

    def test_logs_business_event(self):
        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": "gammal", "needs_review": True},
        })
        oq_router.apply_suggestion("acme", "c1", self._payload(suggestion="ny"), BackgroundTasks())
        self.assertEqual(len(self._events), 1)
        kind, cid, summary = self._events[0]
        self.assertEqual(kind, "suggestion_applied")
        self.assertEqual(cid, "acme")
        self.assertEqual(summary["claim_id"], "c1")
        self.assertEqual(summary["source_log_id"], "log-123")

    def test_recompile_triggered_in_background(self):
        triggered = []
        import jobs.compile_schema as cs
        cs.run = lambda cid: triggered.append(cid)

        fakefs.reset(client={"company_name": "Acme"}, claims={
            "c1": {"claim_kind": "narrative", "statement": "x", "needs_review": True},
        })
        bg = BackgroundTasks()
        oq_router.apply_suggestion("acme", "c1", self._payload(), bg)
        # BackgroundTasks kör efter request — simulera det
        import asyncio
        asyncio.run(bg())
        self.assertEqual(triggered, ["acme"])


if __name__ == "__main__":
    unittest.main()
