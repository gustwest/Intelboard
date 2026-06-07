"""Tester för lang-probe-jobbet (C2): riktad körning + persistering till
polling_results/lang-probe-latest. Inga nätverksanrop — run_experiment mockas."""
import unittest
from unittest import mock

import fakefs  # installerar fake firestore_client — först!
from jobs import lang_probe as job


_FAKE_RESULT = {
    "company": "Acme AB",
    "pairs": 2,
    "per_engine": {
        "gpt-4o": {"sv": {"rate": 0.8}, "en": {"rate": 0.4}, "winner": "sv", "significant": True},
        "gemini": {"sv": {"rate": 0.5}, "en": {"rate": 0.5}, "winner": "inconclusive", "significant": False},
    },
    "rows": [{"engine": "gpt-4o", "lang": "sv", "question": "q", "mentioned": True}],
}


class RunOneTest(unittest.TestCase):
    def test_persists_aggregate_and_sets_summary(self):
        fakefs.reset(client={"company_name": "Acme AB"}, polling_results={}, job_runs={})
        with mock.patch.object(job, "run_experiment", return_value=_FAKE_RESULT) as rx:
            result = job.run_one("acme", runs=5)

        rx.assert_called_once_with("acme", runs=5)
        # Aggregatet persisterat under stabil doc-id (overskrivs per körning).
        doc = fakefs.STATE["polling_results"][job.RESULT_DOC]
        self.assertEqual(doc["kind"], "lang_probe")
        self.assertEqual(doc["pairs"], 2)
        self.assertEqual(doc["runs"], 5)
        self.assertEqual(doc["per_engine"]["gpt-4o"]["winner"], "sv")
        self.assertIn("computed_at", doc)
        # Rå rows ska INTE läcka in i det persisterade aggregatet.
        self.assertNotIn("rows", doc)
        self.assertEqual(result, _FAKE_RESULT)

    def test_run_summary_carries_winners(self):
        fakefs.reset(client={"company_name": "Acme AB"}, polling_results={}, job_runs={})
        captured = {}

        class _Handle:
            summary = {}

        def _fake_record_run(job_type, client_id=None):
            from contextlib import contextmanager

            @contextmanager
            def _cm():
                h = _Handle()
                yield h
                captured["summary"] = h.summary
                captured["job_type"] = job_type

            return _cm()

        with mock.patch.object(job, "run_experiment", return_value=_FAKE_RESULT), \
             mock.patch.object(job, "record_run", _fake_record_run):
            job.run_one("acme", runs=3)

        self.assertEqual(captured["job_type"], "lang_probe")
        self.assertEqual(captured["summary"]["pairs"], 2)
        self.assertEqual(captured["summary"]["runs"], 3)
        self.assertEqual(captured["summary"]["winners"]["gpt-4o"], "sv")
        self.assertEqual(captured["summary"]["winners"]["gemini"], "inconclusive")

    def test_persist_is_best_effort(self):
        # Persistering får aldrig fälla jobbet — om Firestore-skrivningen kastar,
        # ska run_one ändå returnera resultatet.
        fakefs.reset(client={"company_name": "Acme AB"}, polling_results={}, job_runs={})
        with mock.patch.object(job, "run_experiment", return_value=_FAKE_RESULT), \
             mock.patch.object(job.fs, "polling_results_col", side_effect=RuntimeError("boom")):
            result = job.run_one("acme")
        self.assertEqual(result, _FAKE_RESULT)


if __name__ == "__main__":
    unittest.main()
