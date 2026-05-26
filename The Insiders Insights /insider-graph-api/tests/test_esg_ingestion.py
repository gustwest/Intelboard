"""Enhetstester för ESG-ingestion (skiva 2) och AI ESG Risk Score (skiva 3).

Verifierar phase_reached, att inmatning blir källförsedda claims + actioned-märkt finding,
samt att risk-scoren räknas severity-vägt per pelare med korrekt denominator.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from schemas import (
    ESGCoreMetrics,
    ESGCsrdBasicMetrics,
    ESGEnterpriseAdvancedMetrics,
    ESGMetricsSubmission,
)
from services import esg_ingestion as ing
from services import esg_report as rep


def _core(**over):
    base = dict(
        scope_1_co2e=10, scope_2_co2e=5, scope_3_co2e=90, net_zero_target_year=2045,
        management_female_pct=40, board_female_pct=45,
        iso_27001_certified=True, iso_14001_certified=False,
    )
    base.update(over)
    return ESGCoreMetrics(**base)


class PhaseReachedTest(unittest.TestCase):
    def test_phases(self):
        self.assertEqual(ing.phase_reached(ESGMetricsSubmission(core=_core())), 1)
        self.assertEqual(
            ing.phase_reached(ESGMetricsSubmission(core=_core(), csrd_basic=ESGCsrdBasicMetrics(
                unadjusted_gender_pay_gap_pct=-2, employee_turnover_rate=8,
                anti_corruption_policy_active=True, ecovadis_medal="Silver"))),
            2,
        )
        full = ESGMetricsSubmission(
            core=_core(),
            csrd_basic=ESGCsrdBasicMetrics(unadjusted_gender_pay_gap_pct=0, employee_turnover_rate=5,
                                           anti_corruption_policy_active=True, ecovadis_medal="Gold"),
            enterprise_advanced=ESGEnterpriseAdvancedMetrics(
                renewable_energy_share_pct=80, waste_recycling_rate_pct=60,
                supplier_code_of_conduct_signed_pct=95, eu_taxonomy_alignment_turnover_pct=40),
        )
        self.assertEqual(ing.phase_reached(full), 3)


class BuildStatementsTest(unittest.TestCase):
    def test_core_only_statements(self):
        stmts = ing.build_statements("Acme AB", ESGMetricsSubmission(core=_core()))
        joined = " ".join(stmts)
        self.assertIn("Scope 1", joined)
        self.assertIn("netto-noll-mål till år 2045", joined)
        self.assertIn("ISO 27001", joined)
        self.assertNotIn("ISO 14001", joined)  # False → utelämnas

    def test_ecovadis_none_omitted(self):
        sub = ESGMetricsSubmission(core=_core(), csrd_basic=ESGCsrdBasicMetrics(
            unadjusted_gender_pay_gap_pct=0, employee_turnover_rate=5,
            anti_corruption_policy_active=False, ecovadis_medal="None"))
        joined = " ".join(ing.build_statements("Acme AB", sub))
        self.assertNotIn("EcoVadis", joined)
        self.assertNotIn("antikorruptionspolicy", joined)


class IngestSubmissionTest(unittest.TestCase):
    def test_writes_claims_and_actions_finding(self):
        fid = "fid123"
        fakefs.reset(
            client={"company_name": "Acme AB"},
            esg_findings={fid: {"review_status": "open", "pillar": "E"}},
        )
        sub = ESGMetricsSubmission(core=_core(), finding_id=fid)
        result = ing.ingest_submission("acme", sub)

        self.assertEqual(result["phase_reached"], 1)
        self.assertTrue(result["ammo_claim_ids"])
        # Claims skrivs som källförsedda korrigeringar (fakefs claim_doc.set → writes()).
        written = fakefs.writes()
        self.assertEqual(len(written), len(result["ammo_claim_ids"]))
        any_claim = next(iter(written.values()))
        self.assertEqual(any_claim["claim_kind"], "narrative")
        self.assertEqual(any_claim["source"][0]["kind"], "manual")
        self.assertTrue(any_claim["included_in_output"])
        # Findingen begravs inte — den markeras actioned och länkas till ammunitionen.
        finding = fakefs.STATE["esg_findings"][fid]
        self.assertEqual(finding["review_status"], "actioned")
        self.assertFalse(finding["needs_review"])
        self.assertEqual(finding["ammo_claim_ids"], result["ammo_claim_ids"])
        # Submission persisteras.
        self.assertEqual(len(fakefs.STATE["esg_submissions"]), 1)

    def test_missing_finding_is_skipped(self):
        fakefs.reset(client={"company_name": "Acme AB"}, esg_findings={})
        result = ing.ingest_submission("acme", ESGMetricsSubmission(core=_core(), finding_id="ghost"))
        # Inmatning + claims sker ändå; bara finding-uppdateringen hoppas över.
        self.assertTrue(result["ammo_claim_ids"])
        self.assertEqual(fakefs.STATE["esg_findings"], {})


class RiskScoreTest(unittest.TestCase):
    def test_severity_weighted_per_pillar(self):
        # E: 2 svar, en high-omission (vikt 3) → 3/(2*3)=50%. S: 2 svar, inga findings → 0%.
        # G: 0 svar → ej mätt (None).
        open_findings = [
            {"pillar": "E", "severity": "high", "status": "CRITICAL_OMISSION_RISK"},
        ]
        answers = {"E": 2, "S": 2, "G": 0}
        score = rep.compute_risk_score(open_findings, answers)
        self.assertEqual(score["per_pillar"]["E"]["score"], 50.0)
        self.assertEqual(score["per_pillar"]["E"]["critical_omission"], 1)
        self.assertEqual(score["per_pillar"]["S"]["score"], 0.0)
        self.assertIsNone(score["per_pillar"]["G"]["score"])
        # Overall = medel av mätta pelare (E=50, S=0) = 25.
        self.assertEqual(score["overall"], 25.0)

    def test_no_measurement_overall_none(self):
        score = rep.compute_risk_score([], {"E": 0, "S": 0, "G": 0})
        self.assertIsNone(score["overall"])

    def test_build_report_model_uses_runs(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            esg_findings={"f1": {"pillar": "E", "severity": "high", "status": "CRITICAL_OMISSION_RISK",
                                 "review_status": "open", "question": "Scope?", "engine": "gpt-4o"}},
            esg_run_summary={"answers_by_pillar": {"E": 2, "S": 2, "G": 2}},
        )
        model = rep.build_report_model("acme", "2026-05")
        self.assertEqual(model["company_name"], "Acme AB")
        self.assertTrue(model["is_draft"])
        self.assertEqual(model["risk_score"]["per_pillar"]["E"]["score"], 50.0)
        self.assertTrue(model["improvement_opportunities"])  # invariant icke-tom
        # HTML renderas utan att krascha.
        self.assertIn("AI ESG Risk Score", rep.render_report_html(model))


if __name__ == "__main__":
    unittest.main()
