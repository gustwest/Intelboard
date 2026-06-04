"""Tester för warmth-probes-jobbets CLI: single-client targeting + reaper (e2e-stöd)."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import fakefs  # installerar fake firestore_client — först!
from jobs import warmth_probes as job


class ReapStaleRunsTest(unittest.TestCase):
    def _now(self):
        return datetime.now(timezone.utc)

    def test_reaps_old_running_record(self):
        old = (self._now() - timedelta(hours=48)).isoformat()
        fakefs.reset(job_runs={
            "r1": {"status": "running", "started_at": old, "job_type": "warmth_probes"},
        })
        n = job.reap_stale_runs(older_than_hours=6)
        self.assertEqual(n, 1)
        self.assertEqual(fakefs.STATE["job_runs"]["r1"]["status"], "failed")
        self.assertIn("reaped", fakefs.STATE["job_runs"]["r1"]["error_message"])

    def test_leaves_recent_running_record(self):
        recent = (self._now() - timedelta(minutes=10)).isoformat()
        fakefs.reset(job_runs={
            "r1": {"status": "running", "started_at": recent, "job_type": "warmth_probes"},
        })
        n = job.reap_stale_runs(older_than_hours=6)
        self.assertEqual(n, 0)
        self.assertEqual(fakefs.STATE["job_runs"]["r1"]["status"], "running")

    def test_ignores_non_running(self):
        old = (self._now() - timedelta(hours=48)).isoformat()
        fakefs.reset(job_runs={
            "r1": {"status": "success", "started_at": old},
            "r2": {"status": "failed", "started_at": old},
        })
        self.assertEqual(job.reap_stale_runs(), 0)

    def test_handles_datetime_started_at(self):
        # Firestore ger datetime, inte ISO-sträng — ska hanteras
        old_dt = self._now() - timedelta(hours=48)
        fakefs.reset(job_runs={"r1": {"status": "running", "started_at": old_dt}})
        self.assertEqual(job.reap_stale_runs(), 1)

    def test_reaps_record_with_unparseable_timestamp(self):
        # Saknad/trasig started_at → reapa (säkrast: en running-post utan tidsstämpel
        # är med största sannolikhet föräldralös)
        fakefs.reset(job_runs={"r1": {"status": "running", "started_at": None}})
        self.assertEqual(job.reap_stale_runs(), 1)


class RunOneTest(unittest.TestCase):
    def test_run_one_targets_single_client(self):
        fakefs.reset(client={"company_name": "Acme AB"}, job_runs={})
        with mock.patch.object(job, "run_for_client", return_value={"ok": True}) as rfc, \
             mock.patch("jobs.warmth_probes.record_run") as rr:
            # record_run är en context manager — mocka den
            rr.return_value.__enter__ = lambda s: mock.MagicMock()
            rr.return_value.__exit__ = lambda s, *a: False
            job.run_one("acme")
        rfc.assert_called_once_with("acme")


if __name__ == "__main__":
    unittest.main()
