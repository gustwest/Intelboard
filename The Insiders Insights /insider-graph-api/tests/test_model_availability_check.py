"""Tester för jobs/model_availability_check.

Fokus: error-klassificering, persist-grenen och dry-run-grindens semantik.
Vi mockar bort `_build_client` så inget nätverk anropas.
"""
import unittest
from unittest import mock

from jobs import model_availability_check as mac
from services import model_registry


class ErrorClassificationTest(unittest.TestCase):
    def test_permission_denied_mappas(self):
        self.assertEqual(mac._classify_error(Exception("403 Permission denied")), "permission_denied")
        self.assertEqual(mac._classify_error(Exception("ToS not accepted")), "permission_denied")

    def test_not_found_mappas(self):
        self.assertEqual(mac._classify_error(Exception("Model not found")), "model_not_found")
        self.assertEqual(mac._classify_error(Exception("404 Not Found")), "model_not_found")

    def test_quota_mappas(self):
        self.assertEqual(mac._classify_error(Exception("429 RESOURCE_EXHAUSTED")), "quota_exceeded")
        self.assertEqual(mac._classify_error(Exception("Quota exceeded")), "quota_exceeded")

    def test_unauthenticated_mappas(self):
        self.assertEqual(mac._classify_error(Exception("UNAUTHENTICATED")), "unauthenticated")

    def test_default_fallback(self):
        self.assertEqual(mac._classify_error(Exception("something weird")), "invoke_failed")


class ProbeAllTest(unittest.TestCase):
    def test_unsupported_providers_skipped(self):
        # claude_code_cli kan vi inte testa här (admin-agenten lever i annan tjänst).
        results = list(mac._probe_all())
        skipped_providers = {r["provider"] for r in results if r.get("skipped")}
        self.assertIn("claude_code_cli", skipped_providers)

    def test_none_client_yields_skipped(self):
        with mock.patch.object(mac, "_build_client", return_value=None):
            results = list(mac._probe_all())
        # Alla testbara entries → skipped=True med "ingen klient"-orsak. Ingen unavailable.
        unavailable = [r for r in results if not r["available"]]
        self.assertEqual(unavailable, [])

    def test_invoke_failure_yields_unavailable(self):
        class _BadClient:
            def invoke(self, _msgs):
                raise RuntimeError("404 model not found")

        with mock.patch.object(mac, "_build_client", return_value=_BadClient()):
            results = list(mac._probe_all())
        unavailable = [r for r in results if not r["available"]]
        self.assertGreaterEqual(len(unavailable), 1)
        # Felklassificeringen ska följa med
        self.assertTrue(all(u["error_kind"] == "model_not_found" for u in unavailable))


class RunDryRunSemanticsTest(unittest.TestCase):
    def test_dry_run_exit_nonzero_when_unavailable(self):
        from contextlib import contextmanager
        from jobs._run_tracker import RunHandle

        @contextmanager
        def _fake_record(*_a, **_kw):
            yield RunHandle()

        class _BadClient:
            def invoke(self, _msgs):
                raise RuntimeError("404 not found")

        with mock.patch.object(mac, "_build_client", return_value=_BadClient()), \
             mock.patch.object(mac, "record_run", _fake_record), \
             mock.patch.object(mac, "_persist") as persist:
            n = mac.run(dry_run=True)
        self.assertGreater(n, 0)
        # dry_run → persist ska INTE kallas
        persist.assert_not_called()

    def test_default_mode_persists_findings(self):
        from contextlib import contextmanager
        from jobs._run_tracker import RunHandle

        @contextmanager
        def _fake_record(*_a, **_kw):
            yield RunHandle()

        class _BadClient:
            def invoke(self, _msgs):
                raise RuntimeError("PermissionDenied")

        with mock.patch.object(mac, "_build_client", return_value=_BadClient()), \
             mock.patch.object(mac, "record_run", _fake_record), \
             mock.patch.object(mac, "_persist") as persist:
            n = mac.run(dry_run=False)
        self.assertGreater(n, 0)
        persist.assert_called_once()


class FindingIdTest(unittest.TestCase):
    def test_idempotent_id(self):
        u = {"role": "probe_claude", "model_id": "claude-sonnet-4-5", "error_kind": "model_not_found"}
        self.assertEqual(mac._finding_id(u), mac._finding_id(u))

    def test_different_error_kind_different_id(self):
        u1 = {"role": "probe_claude", "model_id": "x", "error_kind": "model_not_found"}
        u2 = {"role": "probe_claude", "model_id": "x", "error_kind": "permission_denied"}
        self.assertNotEqual(mac._finding_id(u1), mac._finding_id(u2))


if __name__ == "__main__":
    unittest.main()
