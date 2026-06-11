"""Tester för connector_status — kortets tri-state (live/staged/idle) per connector."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import routers.connectors_router as cr


class ConnectorStatusTest(unittest.TestCase):
    def test_linkedin_live_when_attested_data_included(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "c1": {
                    "origin": "attested:linkedin_follower_demographics",
                    "included_in_output": True,
                    "statement": "Acme följare är till stor del chefer.",
                    "source": [{"attested_at": "2026-05-01"}],
                }
            },
        )
        st = cr._connector_status("acme", ["linkedin"])["linkedin"]
        self.assertEqual(st["state"], "live")
        self.assertEqual(st["last_at"], "2026-05-01")

    def test_linkedin_staged_when_uploaded_but_not_included(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "c1": {
                    "origin": "attested:linkedin_visitor_demographics",
                    "included_in_output": False,
                    "statement": "Besökarna är till stor del rekryterare.",
                    "source": [{"attested_at": "2026-05-02"}],
                }
            },
        )
        st = cr._connector_status("acme", ["linkedin"])["linkedin"]
        self.assertEqual(st["state"], "staged")
        self.assertEqual(st["last_at"], "2026-05-02")

    def test_automatic_connector_live_from_successful_run(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            job_runs={
                "r1": {"job_type": "scrape_website", "client_id": "acme",
                       "started_at": "2026-06-01T10:00:00", "status": "success"},
                "r2": {"job_type": "scrape_website", "client_id": "other",
                       "started_at": "2026-06-09T10:00:00", "status": "success"},
            },
        )
        st = cr._connector_status("acme", ["website"])["website"]
        self.assertEqual(st["state"], "live")
        self.assertEqual(st["last_at"], "2026-06-01T10:00:00")  # annan kunds körning räknas inte

    def test_failed_run_is_idle_with_flag(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            job_runs={"r1": {"job_type": "xml_sync", "client_id": "acme",
                             "started_at": "2026-06-01T10:00:00", "status": "failed"}},
        )
        st = cr._connector_status("acme", ["jobfeed"])["jobfeed"]
        self.assertEqual(st["state"], "idle")
        self.assertFalse(st["ok"])

    def test_idle_when_no_data_and_no_runs(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        st = cr._connector_status("acme", ["gleif"])["gleif"]
        self.assertEqual(st["state"], "idle")
        self.assertIsNone(st["last_at"])


if __name__ == "__main__":
    unittest.main()
