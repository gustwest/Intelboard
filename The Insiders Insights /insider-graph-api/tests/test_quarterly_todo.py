"""Enhetstester för kvartals-triggern (jobs/quarterly_todo.py)."""
import unittest
from datetime import datetime, timedelta, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from jobs import quarterly_todo as qt

NOW = datetime(2026, 5, 26, tzinfo=timezone.utc)


# Kund med LinkedIn-kapacitet-connectorn påslagen (annars hoppas påminnelsen över).
ENROLLED = {"active_connectors": ["linkedin_capacity"]}


class QuarterlyTodoTest(unittest.TestCase):
    def test_due_when_no_snapshot_ever(self):
        fakefs.reset(client={})
        self.assertTrue(qt.run_for_client("acme", ENROLLED, NOW))
        todo = list(fakefs.STATE["todos"].values())[0]
        self.assertEqual(todo["type"], "linkedin_quarterly")
        self.assertEqual(todo["status"], "open")

    def test_skipped_when_connector_not_active(self):
        fakefs.reset(client={})
        self.assertFalse(qt.run_for_client("acme", {"active_connectors": ["jobfeed"]}, NOW))
        self.assertEqual(fakefs.STATE["todos"], {})

    def test_not_due_when_recent_upload(self):
        fakefs.reset(
            client={},
            linkedin_snapshots={"s1": {"uploaded_at": NOW - timedelta(days=30)}},
        )
        self.assertFalse(qt.run_for_client("acme", ENROLLED, NOW))
        self.assertEqual(fakefs.STATE["todos"], {})

    def test_due_when_upload_older_than_90_days(self):
        fakefs.reset(
            client={},
            linkedin_snapshots={"s1": {"uploaded_at": NOW - timedelta(days=120)}},
        )
        self.assertTrue(qt.run_for_client("acme", ENROLLED, NOW))

    def test_no_duplicate_open_todo(self):
        fakefs.reset(
            client={},
            todos={"t1": {"type": "linkedin_quarterly", "status": "open"}},
        )
        self.assertFalse(qt.run_for_client("acme", ENROLLED, NOW))
        self.assertEqual(len(fakefs.STATE["todos"]), 1)


if __name__ == "__main__":
    unittest.main()
