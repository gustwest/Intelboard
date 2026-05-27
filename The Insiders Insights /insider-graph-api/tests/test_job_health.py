"""Kund-aktivitet: tvärgående hälso-aggregering (routers/jobs.build_health) + händelselogg.

build_health är ren → testas med literala körningar/kunder. Verifierar att senaste lyckade
körning per nyckeljobb plockas, att stale/never_processed-flaggorna stämmer, och att
sorteringen sätter sämst hälsa först.
"""
import unittest
from datetime import datetime, timedelta, timezone

import fakefs  # noqa: F401  (installerar fake firestore_client innan routers importeras)
from routers.jobs import build_health, HEALTH_JOBS, STALE_DAYS

NOW = datetime(2026, 5, 27, 12, 0, tzinfo=timezone.utc)


def _run(cid, jt, days_ago, status="success"):
    return {"client_id": cid, "job_type": jt, "status": status,
            "started_at": (NOW - timedelta(days=days_ago)).isoformat()}


class BuildHealthTest(unittest.TestCase):
    def test_fresh_client_not_stale(self):
        runs = [_run("acme", jt, 1) for jt in HEALTH_JOBS]
        out = build_health(runs, [("acme", {"company_name": "Acme AB"})], NOW)
        row = out["clients"][0]
        self.assertFalse(row["stale"])
        self.assertFalse(row["never_processed"])
        self.assertEqual(row["company_name"], "Acme AB")

    def test_never_processed_flagged(self):
        out = build_health([], [("ghost", {"company_name": "Ghost"})], NOW)
        row = out["clients"][0]
        self.assertTrue(row["never_processed"])
        self.assertTrue(row["stale"])
        self.assertEqual(set(row["missing"]), set(HEALTH_JOBS))

    def test_stale_when_one_job_too_old(self):
        runs = [_run("acme", jt, 1) for jt in HEALTH_JOBS if jt != "compile_schema"]
        runs.append(_run("acme", "compile_schema", STALE_DAYS + 3))
        row = build_health(runs, [("acme", {})], NOW)["clients"][0]
        self.assertTrue(row["stale"])
        self.assertFalse(row["never_processed"])
        self.assertGreater(row["worst_age_days"], STALE_DAYS)

    def test_latest_success_wins_over_older_and_failures(self):
        # senaste (desc-ordning) lyckade träffen ska väljas; failures ignoreras
        runs = [
            _run("acme", "scrape_active", 1, status="failed"),  # senast men misslyckad
            _run("acme", "scrape_active", 2),                    # senaste LYCKADE
            _run("acme", "scrape_active", 9),
        ]
        row = build_health(runs, [("acme", {})], NOW)["clients"][0]
        self.assertAlmostEqual(row["jobs"]["scrape_active"]["age_days"], 2, places=0)

    def test_sorting_worst_health_first(self):
        runs = [_run("healthy", jt, 1) for jt in HEALTH_JOBS]
        out = build_health(
            runs,
            [("healthy", {}), ("ghost", {}), ("stale", {})]  # ghost never, stale has nothing too
            ,
            NOW,
        )
        # ghost & stale (never_processed) först, healthy sist
        self.assertEqual(out["clients"][-1]["client_id"], "healthy")
        self.assertTrue(out["clients"][0]["never_processed"])


class LogEventTest(unittest.TestCase):
    def test_log_event_is_best_effort_noop_without_backend(self):
        # fakefs saknar job_run_doc → log_event ska svälja felet, inte krascha anroparen
        from jobs._run_tracker import log_event
        try:
            log_event("report_generated", "acme", {"month": "2026-05"})
        except Exception as exc:  # pragma: no cover
            self.fail(f"log_event ska aldrig propagera fel: {exc}")


if __name__ == "__main__":
    unittest.main()
