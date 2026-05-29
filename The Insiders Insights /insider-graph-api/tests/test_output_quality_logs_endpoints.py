"""Enhetstester för output-quality-logg-endpoints (routers/output_quality.py).

Per-kund-lista + per-logg-detaljer driver kundkort-panelen + detaljsidan."""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import HTTPException

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


if __name__ == "__main__":
    unittest.main()
