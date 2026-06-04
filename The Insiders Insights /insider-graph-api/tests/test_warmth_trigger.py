"""Tester för per-kund warmth-probe-triggern (Fas #2 — Cloud Run Job-väg + fallback)."""
import unittest
from unittest import mock

import fakefs  # installerar fake firestore_client — först!
from fastapi import HTTPException
from routers import jobs as jobs_router


class TriggerWarmthProbesTest(unittest.TestCase):
    def setUp(self):
        fakefs.reset(client={"company_name": "Acme AB"}, job_runs={})

    class _BG:
        """Minimal BackgroundTasks-stub som fångar tillagda tasks."""
        def __init__(self):
            self.tasks = []
        def add_task(self, fn, *a, **kw):
            self.tasks.append((fn, a, kw))

    def test_uses_cloud_run_job_when_available(self):
        bg = self._BG()
        with mock.patch("jobs.warmth_probes.reap_stale_runs", return_value=3), \
             mock.patch("services.cloud_run_jobs.run_job", return_value="op-123") as rj:
            out = jobs_router.trigger_warmth_probes("acme", bg)
        # Cloud Run-vägen användes → ingen BackgroundTask
        self.assertEqual(out["via"], "cloud_run_job")
        self.assertEqual(out["execution"], "op-123")
        self.assertEqual(out["reaped_stale"], 3)
        self.assertEqual(bg.tasks, [])
        # run_job anropades med tasks=1 + full args (args ERSÄTTER → måste ha -m modul)
        _, kwargs = rj.call_args
        self.assertEqual(kwargs["task_count"], 1)
        self.assertEqual(kwargs["args"], ["-m", "jobs.warmth_probes", "--client-id", "acme"])

    def test_falls_back_to_background_task(self):
        bg = self._BG()
        with mock.patch("jobs.warmth_probes.reap_stale_runs", return_value=0), \
             mock.patch("services.cloud_run_jobs.run_job", return_value=None):
            out = jobs_router.trigger_warmth_probes("acme", bg)
        # Admin API otillgängligt (None) → fallback till BackgroundTask
        self.assertEqual(out["via"], "background_task")
        self.assertEqual(len(bg.tasks), 1)  # run_for_client köades

    def test_unknown_client_404(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            jobs_router.trigger_warmth_probes("nope", self._BG())
        self.assertEqual(cm.exception.status_code, 404)


class CloudRunJobsTest(unittest.TestCase):
    def test_no_project_returns_none(self):
        from services import cloud_run_jobs
        with mock.patch.object(cloud_run_jobs.settings, "gcp_project", ""):
            self.assertIsNone(cloud_run_jobs.run_job("warmth-probes", args=["x"]))

    def test_build_and_post_success(self):
        from services import cloud_run_jobs
        captured = {}

        class _Resp:
            def raise_for_status(self): pass
            def json(self): return {"name": "projects/p/locations/l/operations/op-xyz"}

        def _fake_post(url, json, headers, timeout):
            captured["url"] = url
            captured["body"] = json
            return _Resp()

        with mock.patch.object(cloud_run_jobs.settings, "gcp_project", "round-plating"), \
             mock.patch("google.auth.default", return_value=(mock.MagicMock(token="tok"), "proj")), \
             mock.patch("google.auth.transport.requests.Request"), \
             mock.patch("httpx.post", side_effect=_fake_post):
            name = cloud_run_jobs.run_job(
                "warmth-probes", args=["-m", "jobs.warmth_probes", "--client-id", "acme"], task_count=1,
            )
        self.assertEqual(name, "projects/p/locations/l/operations/op-xyz")
        # Payload-struktur: overrides.containerOverrides[0].args + taskCount
        ov = captured["body"]["overrides"]
        self.assertEqual(ov["taskCount"], 1)
        self.assertEqual(ov["containerOverrides"][0]["args"], ["-m", "jobs.warmth_probes", "--client-id", "acme"])
        self.assertIn("warmth-probes:run", captured["url"])
        self.assertIn("europe-north1", captured["url"])

    def test_post_failure_returns_none(self):
        from services import cloud_run_jobs
        with mock.patch.object(cloud_run_jobs.settings, "gcp_project", "round-plating"), \
             mock.patch("google.auth.default", side_effect=RuntimeError("no creds")):
            self.assertIsNone(cloud_run_jobs.run_job("warmth-probes", args=["x"]))


if __name__ == "__main__":
    unittest.main()
