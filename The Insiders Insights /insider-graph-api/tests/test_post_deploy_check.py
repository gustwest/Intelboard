"""Enhetstester för post_deploy_check.evaluate_* — ren logik, ingen httpx-mock.

Vi gör scripts/ importerbar via sys.path så testet inte kräver pakethierarki.
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import post_deploy_check as pdc  # noqa: E402

NOW = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class ApiHealthTests(unittest.TestCase):
    def test_ok_when_sha_matches(self) -> None:
        r = pdc.evaluate_api_health({"status": "ok", "commit_sha": "abc"}, 200, "abc")
        self.assertEqual(r.status, "ok")

    def test_fail_when_sha_mismatch(self) -> None:
        r = pdc.evaluate_api_health({"status": "ok", "commit_sha": "old"}, 200, "new")
        self.assertEqual(r.status, "fail")
        self.assertIn("old", r.detail)

    def test_warn_when_expected_but_missing(self) -> None:
        r = pdc.evaluate_api_health({"status": "ok"}, 200, "abc")
        self.assertEqual(r.status, "warn")

    def test_fail_on_non_200(self) -> None:
        r = pdc.evaluate_api_health(None, 500, "abc")
        self.assertEqual(r.status, "fail")

    def test_ok_when_no_expected_sha(self) -> None:
        r = pdc.evaluate_api_health({"status": "ok", "commit_sha": "abc"}, 200, None)
        self.assertEqual(r.status, "ok")


class FrontendHealthTests(unittest.TestCase):
    def test_warn_when_url_missing(self) -> None:
        self.assertEqual(pdc.evaluate_frontend_health(0, None).status, "warn")

    def test_ok_on_200(self) -> None:
        self.assertEqual(pdc.evaluate_frontend_health(200, "https://x").status, "ok")

    def test_fail_on_503(self) -> None:
        self.assertEqual(pdc.evaluate_frontend_health(503, "https://x").status, "fail")


class JobRunsTests(unittest.TestCase):
    def _run(self, **overrides):
        base = {"job_type": "polling_weekly", "client_id": "acme", "status": "success",
                "started_at": _iso(NOW - timedelta(hours=1))}
        base.update(overrides)
        return base

    def test_ok_when_only_success(self) -> None:
        r = pdc.evaluate_job_runs([self._run()], NOW, 24)
        self.assertEqual(r.status, "ok")

    def test_fail_on_recent_failure(self) -> None:
        runs = [self._run(status="failed", started_at=_iso(NOW - timedelta(hours=2)))]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "fail")
        self.assertIn("polling_weekly", r.detail)

    def test_ignores_failures_outside_window(self) -> None:
        runs = [self._run(status="failed", started_at=_iso(NOW - timedelta(hours=48)))]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "ok")

    def test_ignore_jobs_filter(self) -> None:
        runs = [self._run(status="failed", job_type="flaky_job", started_at=_iso(NOW))]
        r = pdc.evaluate_job_runs(runs, NOW, 24, ignore_jobs=("flaky_job",))
        self.assertEqual(r.status, "ok")

    def test_ignores_runs_without_timestamp(self) -> None:
        runs = [self._run(status="failed", started_at=None)]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "ok")

    def test_recovered_failure_does_not_block(self) -> None:
        """Failure följd av senare lyckad körning (samma jobb+kund) = åtgärdad."""
        runs = [
            self._run(status="failed", started_at=_iso(NOW - timedelta(hours=3))),
            self._run(status="success", started_at=_iso(NOW - timedelta(hours=1))),
        ]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "ok")

    def test_failure_after_last_success_still_blocks(self) -> None:
        """En lyckad körning FÖRE failuren återhämtar den inte."""
        runs = [
            self._run(status="success", started_at=_iso(NOW - timedelta(hours=3))),
            self._run(status="failed", started_at=_iso(NOW - timedelta(hours=1))),
        ]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "fail")

    def test_recovery_is_per_client(self) -> None:
        """En annan kunds success återhämtar inte denna kunds failure."""
        runs = [
            self._run(status="failed", client_id="acme", started_at=_iso(NOW - timedelta(hours=3))),
            self._run(status="success", client_id="other", started_at=_iso(NOW - timedelta(hours=1))),
        ]
        r = pdc.evaluate_job_runs(runs, NOW, 24)
        self.assertEqual(r.status, "fail")


class ScheduleTests(unittest.TestCase):
    def test_warn_when_unavailable(self) -> None:
        r = pdc.evaluate_schedules({"available": False, "reason": "no creds", "schedules": []})
        self.assertEqual(r.status, "warn")

    def test_ok_when_all_enabled(self) -> None:
        payload = {"available": True, "schedules": [
            {"name": "polling-weekly-tue", "exists": True, "state": "ENABLED"},
            {"name": "risk-detect-weekly-tue", "exists": True, "state": "ENABLED"},
        ]}
        self.assertEqual(pdc.evaluate_schedules(payload).status, "ok")

    def test_warn_on_paused(self) -> None:
        # Pausning sker via schema-paus-UI:t i AI-synlighet — ett medvetet ops-val,
        # inte en konfigurationsdrift. Ska inte blockera deploys (warn, inte fail).
        payload = {"available": True, "schedules": [
            {"name": "polling-weekly-tue", "exists": True, "state": "PAUSED"},
        ]}
        r = pdc.evaluate_schedules(payload)
        self.assertEqual(r.status, "warn")
        self.assertIn("PAUSED", r.detail)
        self.assertIn("polling-weekly-tue", r.detail)

    def test_fail_on_missing(self) -> None:
        payload = {"available": True, "schedules": [
            {"name": "polling-weekly-tue", "exists": False, "state": "MISSING"},
        ]}
        self.assertEqual(pdc.evaluate_schedules(payload).status, "fail")

    def test_fail_on_other_non_enabled_states(self) -> None:
        # DISABLED / FAILED / okänt = fortfarande fail. Det är bara PAUSED som är
        # första-klass-handling — andra icke-ENABLED-tillstånd indikerar drift.
        payload = {"available": True, "schedules": [
            {"name": "x", "exists": True, "state": "DISABLED"},
        ]}
        r = pdc.evaluate_schedules(payload)
        self.assertEqual(r.status, "fail")
        self.assertIn("DISABLED", r.detail)

    def test_missing_trumps_paused(self) -> None:
        # Om EN är saknad och EN är pausad → fail (saknad är värre).
        payload = {"available": True, "schedules": [
            {"name": "a", "exists": True, "state": "PAUSED"},
            {"name": "b", "exists": False, "state": "MISSING"},
        ]}
        r = pdc.evaluate_schedules(payload)
        self.assertEqual(r.status, "fail")
        self.assertIn("b=MISSING", r.detail)


class ModelRegistryTests(unittest.TestCase):
    def test_ok_with_roles_dict(self) -> None:
        payload = {"roles": {f"r{i}": {} for i in range(10)}}
        self.assertEqual(pdc.evaluate_model_registry(payload, 200).status, "ok")

    def test_ok_with_roles_list(self) -> None:
        payload = {"roles": [{"role": f"r{i}"} for i in range(5)]}
        self.assertEqual(pdc.evaluate_model_registry(payload, 200).status, "ok")

    def test_fail_on_empty(self) -> None:
        self.assertEqual(pdc.evaluate_model_registry({"roles": {}}, 200).status, "fail")

    def test_fail_on_http_error(self) -> None:
        self.assertEqual(pdc.evaluate_model_registry(None, 503).status, "fail")


class OpsAlertsTests(unittest.TestCase):
    def test_ok_when_empty(self) -> None:
        self.assertEqual(pdc.evaluate_ops_alerts([], NOW).status, "ok")

    def test_fail_on_recent_critical(self) -> None:
        alerts = [{"severity": "critical", "status": "open",
                   "first_seen": _iso(NOW - timedelta(minutes=30)),
                   "kind": "deploy_failed"}]
        r = pdc.evaluate_ops_alerts(alerts, NOW)
        self.assertEqual(r.status, "fail")
        self.assertIn("deploy_failed", r.detail)

    def test_warn_on_older_critical(self) -> None:
        alerts = [{"severity": "critical", "status": "open",
                   "first_seen": _iso(NOW - timedelta(hours=12))}]
        self.assertEqual(pdc.evaluate_ops_alerts(alerts, NOW).status, "warn")

    def test_ignores_warning_severity(self) -> None:
        alerts = [{"severity": "warning", "status": "open",
                   "first_seen": _iso(NOW - timedelta(minutes=5))}]
        self.assertEqual(pdc.evaluate_ops_alerts(alerts, NOW).status, "ok")

    def test_ignores_resolved(self) -> None:
        alerts = [{"severity": "critical", "status": "resolved",
                   "first_seen": _iso(NOW - timedelta(minutes=5))}]
        self.assertEqual(pdc.evaluate_ops_alerts(alerts, NOW).status, "ok")


class AggregateTests(unittest.TestCase):
    def test_zero_when_all_ok_or_warn(self) -> None:
        results = [pdc.CheckResult("a", "ok", ""), pdc.CheckResult("b", "warn", "")]
        self.assertEqual(pdc.aggregate(results), 0)

    def test_one_when_any_fail(self) -> None:
        results = [pdc.CheckResult("a", "ok", ""), pdc.CheckResult("b", "fail", "")]
        self.assertEqual(pdc.aggregate(results), 1)


if __name__ == "__main__":
    unittest.main()
