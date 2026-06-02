"""Tester för jobs/model_drift_scan — registret-checks och grep-passet.

Vi vill INTE skriva mot Firestore i testet — _persist patchas till en in-memory
stub. Repo-greppen körs mot tempfiler så testet är hermetiskt.
"""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from jobs import model_drift_scan
from services import model_registry


class HardcodeDetectionTest(unittest.TestCase):
    """_grep_repo + _check_hardcodes hittar okända model-ID:n."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        # Bygg en mini-mock-katalogstruktur som _SCAN_PATHS pekar på.
        (self.root / "insider-graph-api" / "services").mkdir(parents=True)
        (self.root / "frontend" / "src").mkdir(parents=True)
        self._orig_root = model_drift_scan._REPO_ROOT
        model_drift_scan._REPO_ROOT = self.root

    def tearDown(self):
        model_drift_scan._REPO_ROOT = self._orig_root
        self.tmp.cleanup()

    def _write(self, rel: str, body: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")

    def test_authorized_model_id_is_not_flagged(self):
        authorized = next(iter(model_registry.authorized_model_ids()))
        self._write("insider-graph-api/services/foo.py", f'model = "{authorized}"')
        findings = list(model_drift_scan._check_hardcodes())
        self.assertEqual(findings, [])

    def test_unknown_model_id_is_flagged(self):
        # gpt-99-imaginary finns inte i registret → ska bli en finding.
        self._write("insider-graph-api/services/foo.py", 'model = "gpt-99-imaginary"')
        findings = list(model_drift_scan._check_hardcodes())
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["kind"], "unauthorized_hardcode")
        self.assertEqual(findings[0]["model_id"], "gpt-99-imaginary")
        self.assertEqual(findings[0]["severity"], "warning")

    def test_skip_patterns_are_honoured(self):
        # Tester, docs och själva registret skall hoppas över.
        self._write("insider-graph-api/tests/test_x.py", 'x = "gpt-99-imaginary"')
        self._write("insider-graph-api/docs/spec.md", "Use gpt-99-imaginary")
        self._write("insider-graph-api/services/model_registry.py", '"gpt-99-imaginary"')
        findings = list(model_drift_scan._check_hardcodes())
        self.assertEqual(findings, [])


class RegistryDriftTest(unittest.TestCase):
    """_check_registry flaggar varje model_id != latest_known som `behind_latest`."""

    def test_outdated_entry_flagged_as_behind_latest(self):
        original = model_registry._REGISTRY
        try:
            model_registry._REGISTRY = (
                model_registry.ModelEntry(
                    role="test_role", model_id="x-old", provider="p",
                    purpose="p", latest_known="x-new", checked_at="2026-06-02",
                    effective_since="2026-06-02",
                ),
            )
            findings = list(model_drift_scan._check_registry("2026-06-02"))
            self.assertEqual(len(findings), 1)
            self.assertEqual(findings[0]["kind"], "behind_latest")
            self.assertEqual(findings[0]["severity"], "warning")
        finally:
            model_registry._REGISTRY = original

    def test_in_sync_registry_yields_no_findings(self):
        """Det faktiska registret (efter att policy 'alltid senaste' har applicerats)
        ska inte producera några registry-drift-findings — bara stale-checked kan
        eventuellt slå till över tid, men inte direkt efter en verifiering."""
        findings = list(model_drift_scan._check_registry("2026-06-02"))
        self.assertEqual(
            findings, [],
            msg=f"Registret är inte i sync med 'alltid senaste'-policyn: {findings}",
        )


class PersistencePathTest(unittest.TestCase):
    """run() ska kalla _persist EN gång och returnera summering."""

    def test_run_persists_and_summarises(self):
        from contextlib import contextmanager
        from jobs._run_tracker import RunHandle

        @contextmanager
        def _fake_record_run(*_a, **_kw):
            yield RunHandle()

        with mock.patch.object(model_drift_scan, "_persist") as persist, \
             mock.patch.object(model_drift_scan, "_detect_and_record_changes", return_value=0), \
             mock.patch.object(model_drift_scan, "record_run", _fake_record_run):
            summary = model_drift_scan.run()
        self.assertEqual(persist.call_count, 1)
        for key in ("total", "behind_latest", "stale_checked", "unauthorized_hardcode", "model_changes"):
            self.assertIn(key, summary)


class ChangeDetectionTest(unittest.TestCase):
    """_detect_and_record_changes ska bara emittera event vid en ÄKTA diff (inte
    vid första observationen) och uppdatera snapshot-collection idempotent."""

    def _stub_col(self, existing: dict[str, dict]):
        """Bygg en snapshot-collection-stub som beter sig som Firestore."""

        class _Snap:
            def __init__(self, role, data):
                self.id = role
                self.exists = data is not None
                self._data = data
            def to_dict(self):
                return self._data

        class _Doc:
            def __init__(self, role):
                self.role = role
            def get(self):
                return _Snap(self.role, existing.get(self.role))
            def set(self, payload, merge=False):
                existing[self.role] = {**(existing.get(self.role) or {}), **payload}
            def delete(self):
                existing.pop(self.role, None)

        class _Col:
            def document(self, role):
                return _Doc(role)
            def stream(self):
                for role in list(existing):
                    yield _Snap(role, dict(existing[role]))

        return _Col()

    def test_first_observation_writes_baseline_no_event(self):
        col = self._stub_col(existing={})
        emitted: list[dict] = []
        with mock.patch("jobs.model_drift_scan.fs.model_registry_snapshots_col", return_value=col), \
             mock.patch("jobs.model_drift_scan.log_event",
                        side_effect=lambda kind, client_id=None, summary=None: emitted.append({"kind": kind, "summary": summary})):
            n = model_drift_scan._detect_and_record_changes()
        self.assertEqual(n, 0)
        self.assertEqual(emitted, [])

    def test_changed_model_id_emits_event(self):
        entry = model_registry.all_entries()[0]
        existing = {entry.role: {
            "role": entry.role,
            "model_id": "ZZZ-old",
            "provider": entry.provider,
            "effective_since": "2020-01-01",
        }}
        col = self._stub_col(existing)
        emitted: list[dict] = []
        with mock.patch("jobs.model_drift_scan.fs.model_registry_snapshots_col", return_value=col), \
             mock.patch("jobs.model_drift_scan.log_event",
                        side_effect=lambda kind, client_id=None, summary=None: emitted.append({"kind": kind, "summary": summary})):
            n = model_drift_scan._detect_and_record_changes()
        self.assertEqual(n, 1)
        self.assertEqual(emitted[0]["kind"], "model_changed")
        self.assertEqual(emitted[0]["summary"]["role"], entry.role)
        self.assertEqual(emitted[0]["summary"]["old_model_id"], "ZZZ-old")
        self.assertEqual(emitted[0]["summary"]["new_model_id"], entry.model_id)

    def test_unchanged_registry_emits_nothing(self):
        existing = {
            e.role: {"role": e.role, "model_id": e.model_id, "provider": e.provider,
                     "effective_since": e.effective_since}
            for e in model_registry.all_entries()
        }
        col = self._stub_col(existing)
        emitted: list[dict] = []
        with mock.patch("jobs.model_drift_scan.fs.model_registry_snapshots_col", return_value=col), \
             mock.patch("jobs.model_drift_scan.log_event",
                        side_effect=lambda *a, **kw: emitted.append(kw)):
            n = model_drift_scan._detect_and_record_changes()
        self.assertEqual(n, 0)
        self.assertEqual(emitted, [])


if __name__ == "__main__":
    unittest.main()
