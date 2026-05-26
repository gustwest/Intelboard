"""Enhetstester för ESG-routern (routers/esg.py) — per-kund-tillägget.

Verifierar att tillägget kan slås på/av per kund och att körningar (generate/scan/
report/submit) kräver att det är påslaget (409 annars). Router-funktioner anropas
direkt med fakefs, som i test_review.py."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import BackgroundTasks, HTTPException

from routers import esg
from schemas import ESGCoreMetrics, ESGMetricsSubmission


def _core():
    return ESGCoreMetrics(
        scope_1_co2e=1, scope_2_co2e=1, scope_3_co2e=1, net_zero_target_year=2045,
        management_female_pct=40, board_female_pct=40,
        iso_27001_certified=True, iso_14001_certified=True,
    )


class ConfigTest(unittest.TestCase):
    def test_get_config_defaults_false(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        out = esg.get_config("acme")
        self.assertFalse(out["esg_audit_enabled"])

    def test_get_config_missing_client_404(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            esg.get_config("ghost")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_put_config_enables(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        out = esg.update_config("acme", esg.ESGConfig(esg_audit_enabled=True))
        self.assertTrue(out["esg_audit_enabled"])
        self.assertTrue(fakefs.STATE["client"]["esg_audit_enabled"])
        # GET speglar nu på-läget.
        self.assertTrue(esg.get_config("acme")["esg_audit_enabled"])

    def test_put_config_disables_again(self):
        fakefs.reset(client={"company_name": "Acme AB", "esg_audit_enabled": True})
        esg.update_config("acme", esg.ESGConfig(esg_audit_enabled=False))
        self.assertFalse(fakefs.STATE["client"]["esg_audit_enabled"])


class StatusTest(unittest.TestCase):
    def test_status_aggregates(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "esg_audit_enabled": True},
            esg_questions={
                "q1": {"status": "open", "lint_status": "rewritten", "lint_issues": ["presupposition"]},
                "q2": {"status": "approved", "lint_status": "clean"},
                "q3": {"status": "approved", "lint_status": "floor"},
            },
            esg_findings={
                "f1": {"pillar": "E", "severity": "high", "status": "CRITICAL_OMISSION_RISK", "review_status": "open"},
                "f2": {"pillar": "G", "severity": "low", "status": "HIGH_REPUTATION_RISK", "review_status": "actioned"},
            },
            esg_run_summary={"answers_by_pillar": {"E": 2, "S": 0, "G": 1}, "total_answers": 3, "findings_count": 1},
            esg_reports={"2026-05": {"month": "2026-05"}, "2026-04": {"month": "2026-04"}},
        )
        out = esg.get_status("acme")
        self.assertTrue(out["esg_audit_enabled"])
        self.assertEqual(out["questions"], {"pending": 1, "approved": 2, "lint_flagged": 1})
        self.assertEqual(out["findings"]["open"], 1)
        self.assertEqual(out["findings"]["actioned"], 1)
        self.assertEqual(out["last_scan"]["total_answers"], 3)
        self.assertEqual(out["report_months"], ["2026-05", "2026-04"])  # nyast först
        self.assertEqual(out["risk_score"]["per_pillar"]["E"]["score"], 50.0)  # high/(2*3)

    def test_status_missing_client_404(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            esg.get_status("ghost")
        self.assertEqual(ctx.exception.status_code, 404)


class EnablementGateTest(unittest.TestCase):
    def test_generate_blocked_when_disabled(self):
        fakefs.reset(client={"company_name": "Acme AB"})  # tillägg av
        with self.assertRaises(HTTPException) as ctx:
            esg.trigger_generate("acme", BackgroundTasks())
        self.assertEqual(ctx.exception.status_code, 409)

    def test_scan_blocked_when_disabled(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            esg.trigger_scan("acme", BackgroundTasks())
        self.assertEqual(ctx.exception.status_code, 409)

    def test_submit_blocked_when_disabled(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            esg.submit_metrics("acme", ESGMetricsSubmission(core=_core()))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_generate_allowed_when_enabled(self):
        fakefs.reset(client={"company_name": "Acme AB", "esg_audit_enabled": True})
        out = esg.trigger_generate("acme", BackgroundTasks())
        self.assertEqual(out["status"], "queued")
        self.assertEqual(out["job"], "esg_generate")


class MonthlyJobTest(unittest.TestCase):
    """Fan-out-jobbet kör bara kunder med ESG-tillägget påslaget."""

    def setUp(self):
        from services import esg_report
        from services import esg_scanner
        self._mods = (esg_scanner, esg_report)
        self._orig = (esg_scanner.run_esg_scan, esg_report.run)

    def tearDown(self):
        esg_scanner, esg_report = self._mods
        esg_scanner.run_esg_scan, esg_report.run = self._orig

    def test_runs_only_enabled_clients(self):
        from routers import jobs
        from services import esg_report, esg_scanner

        scanned: list[str] = []
        reported: list[str] = []
        esg_scanner.run_esg_scan = lambda cid: scanned.append(cid)
        esg_report.run = lambda cid: reported.append(cid)

        fakefs.reset(clients={
            "acme": {"company_name": "Acme", "esg_audit_enabled": True},
            "beta": {"company_name": "Beta", "esg_audit_enabled": False},
            "gamma": {"company_name": "Gamma", "esg_audit_enabled": True},
        })
        jobs._run_esg_monthly()
        self.assertEqual(sorted(scanned), ["acme", "gamma"])
        self.assertEqual(sorted(reported), ["acme", "gamma"])

    def test_one_client_failure_does_not_abort(self):
        from routers import jobs
        from services import esg_report, esg_scanner

        reported: list[str] = []

        def boom(cid):
            if cid == "acme":
                raise RuntimeError("nätverksfel")

        esg_scanner.run_esg_scan = boom
        esg_report.run = lambda cid: reported.append(cid)
        fakefs.reset(clients={
            "acme": {"esg_audit_enabled": True},
            "gamma": {"esg_audit_enabled": True},
        })
        jobs._run_esg_monthly()  # ska inte kasta
        self.assertEqual(reported, ["gamma"])  # acme föll, gamma kördes ändå


if __name__ == "__main__":
    unittest.main()
