"""Enhetstester för sunset-jobbet (jobs/sunset_skills.py).

Verifierar att stängda annons-noder hard-deletas först efter 24 mån, och att
aktiva annonser samt nyligen stängda lämnas orörda.
"""
import unittest
from datetime import datetime, timedelta, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from jobs import sunset_skills

NOW = datetime(2026, 5, 26, tzinfo=timezone.utc)


def _months_ago(months: float) -> datetime:
    return NOW - timedelta(days=months * 30.4375)


class SunsetSkillsTest(unittest.TestCase):
    def test_deletes_only_expired_closed_jobs(self):
        fakefs.reset(
            company_items={
                "expired": {"schema_type": "JobPosting", "closed_at": _months_ago(30), "extra": {"skills": ["AWS"]}},
                "recent_closed": {"schema_type": "JobPosting", "closed_at": _months_ago(10), "extra": {"skills": ["Go"]}},
                "active": {"schema_type": "JobPosting", "included_in_output": True, "extra": {"skills": ["React"]}},
                "org": {"schema_type": "Organization", "closed_at": _months_ago(40)},  # fel typ — rörs ej
            }
        )
        deleted = sunset_skills.run_for_client("acme", NOW)
        self.assertEqual(deleted, 1)
        remaining = set(fakefs.STATE["company_items"].keys())
        self.assertEqual(remaining, {"recent_closed", "active", "org"})

    def test_nothing_to_delete(self):
        fakefs.reset(
            company_items={
                "active": {"schema_type": "JobPosting", "included_in_output": True, "extra": {"skills": ["React"]}},
            }
        )
        self.assertEqual(sunset_skills.run_for_client("acme", NOW), 0)


if __name__ == "__main__":
    unittest.main()
