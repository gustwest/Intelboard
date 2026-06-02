"""Enhetstester för services.ops_alerts dedup/re-open/auto-resolve.

Använder INTE fakefs.py — istället ersätts `firestore_client.ops_alert_doc` med en
in-process fake som loggar set/update-anrop, så vi kan verifiera *vad* som skrevs
oberoende av Firestore-mocken som andra tester delar.
"""
from __future__ import annotations

import sys
import unittest
from unittest.mock import MagicMock

# Importera ops_alerts EFTER att fakefs eventuellt installerats av andra tester —
# annars binder ops_alerts till fakefs och vår monkey-patch når inte fram.
from services import ops_alerts


class _FakeDoc:
    """In-memory ersättning för Firestore-doc. Snap.exists och .to_dict() speglar
    state; set() byter, update() merge:ar. SERVER_TIMESTAMP-sentinel ersätts med
    en sträng så vi kan jämföra utan att försöka serialisera google-protobufs."""

    def __init__(self) -> None:
        self.state: dict | None = None
        self.set_calls: list[dict] = []
        self.update_calls: list[dict] = []

    def get(self) -> MagicMock:
        snap = MagicMock()
        snap.exists = self.state is not None
        snap.to_dict.return_value = self.state
        return snap

    def set(self, payload: dict) -> None:
        self.state = {**_strip_sentinels(payload)}
        self.set_calls.append(payload)

    def update(self, payload: dict) -> None:
        self.state = {**(self.state or {}), **_strip_sentinels(payload)}
        self.update_calls.append(payload)


def _strip_sentinels(payload: dict) -> dict:
    """Ersätt firestore.SERVER_TIMESTAMP-sentinel med en sträng för enkel jämförelse."""
    out = {}
    for k, v in payload.items():
        out[k] = "<server_ts>" if "SERVER_TIMESTAMP" in repr(type(v)) or repr(v) == "SERVER_TIMESTAMP" else v
    return out


class OpsAlertsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.docs: dict[str, _FakeDoc] = {}
        import firestore_client as fs
        # När fakefs har ersatt firestore_client i sys.modules saknas ops_alert_doc;
        # vi behåller default som None och poppar attributet i tearDown.
        self._orig = getattr(fs, "ops_alert_doc", None)
        fs.ops_alert_doc = lambda aid: self.docs.setdefault(aid, _FakeDoc())
        # Säkerställ att ops_alerts modulen pekar på samma fs (den importerar fs
        # vid load — vi monkey-patchar den globala referensen).
        ops_alerts.fs = fs

    def tearDown(self) -> None:
        import firestore_client as fs
        if self._orig is None:
            try:
                delattr(fs, "ops_alert_doc")
            except AttributeError:
                pass
        else:
            fs.ops_alert_doc = self._orig

    def test_first_raise_creates_alert(self):
        aid = ops_alerts.raise_alert(
            kind="job_failed", source="risk_detect:acme",
            title="risk_detect failed", detail="timeout",
        )
        self.assertIsNotNone(aid)
        doc = self.docs[aid]
        self.assertEqual(doc.state["status"], "open")
        self.assertEqual(doc.state["occurrence_count"], 1)
        self.assertEqual(doc.state["reopen_count"], 0)
        self.assertEqual(doc.state["kind"], "job_failed")
        self.assertEqual(doc.state["source"], "risk_detect:acme")

    def test_second_raise_increments_occurrence(self):
        ops_alerts.raise_alert(kind="job_failed", source="x", title="t1")
        aid = ops_alerts.raise_alert(kind="job_failed", source="x", title="t2", last_message="newest")
        self.assertEqual(self.docs[aid].state["occurrence_count"], 2)
        self.assertEqual(self.docs[aid].state["title"], "t2")  # senaste titel vinner
        self.assertEqual(self.docs[aid].state["last_message"], "newest")
        self.assertEqual(self.docs[aid].state["status"], "open")
        # Bara EN set + en update i andra anropet
        self.assertEqual(len(self.docs[aid].set_calls), 1)
        self.assertEqual(len(self.docs[aid].update_calls), 1)

    def test_dedup_key_per_kind_source(self):
        a1 = ops_alerts.raise_alert(kind="job_failed", source="a", title="t")
        a2 = ops_alerts.raise_alert(kind="job_failed", source="b", title="t")
        a3 = ops_alerts.raise_alert(kind="budget_threshold", source="a", title="t")
        # Olika source eller kind → olika doc-id
        self.assertNotEqual(a1, a2)
        self.assertNotEqual(a1, a3)

    def test_maybe_resolve_closes_open_alert(self):
        ops_alerts.raise_alert(kind="job_failed", source="x", title="t")
        resolved = ops_alerts.maybe_resolve(kind="job_failed", source="x", resolved_by="auto:success")
        self.assertTrue(resolved)
        aid = ops_alerts.alert_id("job_failed", "x")
        self.assertEqual(self.docs[aid].state["status"], "resolved")
        self.assertEqual(self.docs[aid].state["resolved_by"], "auto:success")

    def test_maybe_resolve_noop_when_no_alert(self):
        resolved = ops_alerts.maybe_resolve(kind="job_failed", source="no-such")
        self.assertFalse(resolved)

    def test_reopen_after_resolve_increments_reopen_count(self):
        ops_alerts.raise_alert(kind="job_failed", source="x", title="t")
        ops_alerts.maybe_resolve(kind="job_failed", source="x")
        ops_alerts.raise_alert(kind="job_failed", source="x", title="återkomst")
        aid = ops_alerts.alert_id("job_failed", "x")
        state = self.docs[aid].state
        self.assertEqual(state["status"], "open")
        self.assertEqual(state["reopen_count"], 1)
        self.assertEqual(state["occurrence_count"], 1)  # nollställs vid re-open
        self.assertIsNone(state["resolved_at"])

    def test_severity_never_lowered_automatically(self):
        ops_alerts.raise_alert(
            kind="job_failed", source="x", title="t",
            severity=ops_alerts.SEVERITY_CRITICAL,
        )
        # Nästa anrop med lägre severity → critical behålls (eskalering vinner alltid)
        ops_alerts.raise_alert(
            kind="job_failed", source="x", title="t",
            severity=ops_alerts.SEVERITY_INFO,
        )
        aid = ops_alerts.alert_id("job_failed", "x")
        self.assertEqual(self.docs[aid].state["severity"], ops_alerts.SEVERITY_CRITICAL)

    def test_invalid_severity_falls_back_to_warning(self):
        aid = ops_alerts.raise_alert(
            kind="job_failed", source="x", title="t", severity="catastrophic",
        )
        self.assertEqual(self.docs[aid].state["severity"], ops_alerts.SEVERITY_WARNING)


if __name__ == "__main__":
    unittest.main()
