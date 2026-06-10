"""Enhetstester för GEO-riskloopens skiva 3 — månadsrapporten (services/monthly_report.py
+ routers/reports.py).

Verifierar Risk Exposure-beräkningen (severity-vägd andel per persona + totalt),
att rapporten landar fysiskt i monthly_reports, att HTML-vyn renderar, och
läs-endpointernas beteende.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import HTTPException

from routers import reports
from services import monthly_report as mr


def _findings():
    return {
        "f1": {"persona": "investor", "track": "A", "question": "Tvister kring Acme?",
               "engine": "gpt-4o", "harm": "#3", "severity": "high",
               "engine_excerpt": "påhittat", "status": "open"},
        "f2": {"persona": "customer", "track": "A", "question": "Stabilt bolag?",
               "engine": "gemini", "harm": "#5", "severity": "medium",
               "engine_excerpt": "vet ej", "status": "open", "via_follow_up": True},
        "f3": {"persona": "investor", "track": "A", "question": "Gammalt varsel?",
               "engine": "gpt-4o", "harm": "#2", "severity": "low", "status": "actioned",
               "action_taken": "reinforced_claim", "ammo_claim_ids": ["corr-abc"]},
    }


def _setup(**over):
    base = dict(
        client={"company_name": "Acme AB"},
        risk_findings=_findings(),
        risk_run_summary={"answers_by_persona": {"investor": 10, "customer": 5}, "total_answers": 15},
        polling_results={"2026-W20": {"parity_index": 0.8}, "2026-W21": {"parity_index": 0.9}},
    )
    base.update(over)
    fakefs.reset(**base)


class BuildModelTest(unittest.TestCase):
    def test_missing_client(self):
        fakefs.reset(client=None)
        self.assertIsNone(mr.build_report_model("ghost", "2026-05"))

    def test_exposure_per_persona_and_total(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        exp = m["risk_exposure"]
        # investor: open #3 high (vikt 3) / 10 svar = 0.3 (actioned räknas ej i exposure)
        self.assertEqual(exp["per_persona"]["investor"]["weighted"], 3)
        self.assertEqual(exp["per_persona"]["investor"]["score"], 0.3)
        # customer: open #5 medium (vikt 2) / 5 = 0.4
        self.assertEqual(exp["per_persona"]["customer"]["score"], 0.4)
        # employee: inga svar → score None
        self.assertIsNone(exp["per_persona"]["talent"]["score"])
        # totalt: vikt 5 / 15 svar
        self.assertEqual(exp["total"]["weighted"], 5)
        self.assertEqual(exp["total"]["score"], 0.333)

    def test_detected_and_actions(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        self.assertEqual(len(m["detected"]), 3)             # open + actioned visas
        self.assertEqual(m["detected"][0]["severity"], "high")  # sorterat efter allvar
        self.assertEqual(len(m["actions"]), 1)              # bara actioned
        self.assertEqual(m["actions"][0]["ammo_claim_ids"], ["corr-abc"])

    def test_parity_from_latest_week(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        self.assertEqual(m["parity_index"], 0.9)            # senaste veckan vinner
        # Legacy-veckor (bara parity_index, inga v2-fält) → n=0 → ogrindad: talet
        # visas men får inte generera narrativa slutsatser.
        self.assertFalse(m["parity"]["reliable"])
        self.assertFalse(any("speglar er formella ledning" in s for s in m["strengths"]))

    def test_parity_v2_small_gap_is_strength(self):
        _setup(polling_results={"2026-W21": {
            "parity_index": 0.42, "parity_portrayed": 0.42, "parity_n": 8,
            "parity_unknown_share": 0.1, "parity_ci95": [0.2, 0.7],
            "parity_baseline": {"value": 0.45, "source": "Årsredovisning 2025"},
            "parity_gap": -0.03,
        }})
        m = mr.build_report_model("acme", "2026-05")
        self.assertTrue(m["parity"]["reliable"])
        self.assertTrue(any("speglar er formella ledning väl" in s for s in m["strengths"]))

    def test_parity_v2_large_gap_is_improvement(self):
        _setup(polling_results={"2026-W21": {
            "parity_portrayed": 0.20, "parity_n": 10, "parity_unknown_share": 0.0,
            "parity_baseline": {"value": 0.45, "source": "Årsredovisning 2025"},
            "parity_gap": -0.25,
        }})
        m = mr.build_report_model("acme", "2026-05")
        hits = [s for s in m["improvement_opportunities"] if "underrepresenterar kvinnor" in s]
        self.assertEqual(len(hits), 1)
        self.assertIn("inte samma kohort", hits[0])  # kohort-brasklappen följer alltid med
        self.assertFalse(any("speglar er formella ledning" in s for s in m["strengths"]))

    def test_parity_v2_thin_data_gated(self):
        # n < PARITY_MIN_N → varken styrka eller gap-slutsats, bara tunt-underlag-notis.
        _setup(polling_results={"2026-W21": {
            "parity_portrayed": 1.0, "parity_n": 1, "parity_unknown_share": 0.0,
            "parity_baseline": {"value": 0.45, "source": "ÅR"}, "parity_gap": 0.55,
        }})
        m = mr.build_report_model("acme", "2026-05")
        self.assertFalse(m["parity"]["reliable"])
        self.assertFalse(any("överrepresenterar" in s for s in m["improvement_opportunities"]))
        self.assertTrue(any("för tunt" in s for s in m["improvement_opportunities"]))

    def test_parity_v2_missing_baseline_prompts_setup(self):
        _setup(polling_results={"2026-W21": {
            "parity_portrayed": 0.4, "parity_n": 6, "parity_unknown_share": 0.0,
        }})
        m = mr.build_report_model("acme", "2026-05")
        self.assertTrue(any("Paritets-baseline saknas" in s for s in m["improvement_opportunities"]))

    def test_parity_none_when_no_polling(self):
        _setup(polling_results={})
        m = mr.build_report_model("acme", "2026-05")
        self.assertIsNone(m["parity"])
        self.assertIsNone(m["parity_index"])

    def test_trend_from_previous_report(self):
        # Trenden följer beslutssäkerheten (högre=bättre) månad-för-månad.
        _setup(monthly_reports={"2026-04": {"decision_confidence": {"score": 60}}})
        m = mr.build_report_model("acme", "2026-05")
        t = m["trend"]
        self.assertEqual(t["previous_month"], "2026-04")
        self.assertEqual(t["previous_score"], 60)
        self.assertEqual(t["delta"], 74 - 60)              # förbättring (positiv)
        self.assertEqual([s["month"] for s in t["series"]], ["2026-04", "2026-05"])

    def test_first_report_has_no_previous(self):
        _setup()
        t = mr.build_report_model("acme", "2026-05")["trend"]
        self.assertIsNone(t["previous_month"])
        self.assertEqual([s["month"] for s in t["series"]], ["2026-05"])

    def test_resolved_counted_and_listed(self):
        findings = _findings()
        findings["f4"] = {"persona": "customer", "track": "A", "question": "Löst fråga?",
                          "engine": "gpt-4o", "harm": "#3", "severity": "high", "status": "resolved"}
        _setup(risk_findings=findings)
        m = mr.build_report_model("acme", "2026-05")
        self.assertEqual(m["resolved"]["count"], 1)
        self.assertEqual(m["trend"]["resolved_count"], 1)
        self.assertEqual(len(m["detected"]), 3)            # resolved syns ej bland öppna risker
        self.assertTrue(any("lösta" in s for s in m["strengths"]))

    def test_decision_confidence_and_verdict(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        conf = m["decision_confidence"]
        # Bara 2 av 3 personas mätta (investor+customer) → täckningstak 74, kan ej nå toppen.
        self.assertEqual(conf["score"], 74)
        self.assertEqual(conf["stage"], "God grund")
        self.assertIn("13 av 15", m["verdict"])
        self.assertIn("investerare", m["verdict"])  # största kvarvarande risk
        self.assertIn("Bredda mätningen", conf["next_step"])  # täckning blockerar nästa nivå

    def test_strengths_present(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        self.assertTrue(any("13 av 15" in s for s in m["strengths"]))

    def test_ceiling_never_reaches_100(self):
        # Perfekt utfall, alla personas täckta, noll fynd → ändå inte 100 (toppen öppen).
        _setup(risk_findings={}, risk_run_summary={
            "answers_by_persona": {"customer": 4, "talent": 4, "investor": 4}, "total_answers": 12})
        conf = mr.build_report_model("acme", "2026-05")["decision_confidence"]
        self.assertEqual(conf["score"], 95)            # CONFIDENCE_CEILING, ej 100
        self.assertEqual(conf["stage"], "Mycket stark")
        self.assertIn("bevaka", conf["next_step"])     # framåtblick även i toppen

    def test_thin_coverage_capped_at_god_grund(self):
        # Bara en persona mätt, inga fynd → kan inte nå över God grund (74).
        _setup(risk_findings={}, risk_run_summary={
            "answers_by_persona": {"investor": 8}, "total_answers": 8})
        conf = mr.build_report_model("acme", "2026-05")["decision_confidence"]
        self.assertEqual(conf["score"], 74)
        self.assertEqual(conf["stage"], "God grund")

    def test_stage_ladder(self):
        self.assertEqual(mr._stage(10), "Tidigt läge")
        self.assertEqual(mr._stage(45), "På väg")
        self.assertEqual(mr._stage(65), "God grund")
        self.assertEqual(mr._stage(80), "Stark")
        self.assertEqual(mr._stage(95), "Mycket stark")

    def test_improvements_never_empty_even_when_clean(self):
        _setup(risk_findings={}, risk_run_summary={
            "answers_by_persona": {"customer": 4, "talent": 4, "investor": 4}, "total_answers": 12})
        m = mr.build_report_model("acme", "2026-05")
        self.assertTrue(m["improvement_opportunities"])  # invariant: aldrig tom
        self.assertTrue(any("bevakning" in i for i in m["improvement_opportunities"]))


class ConfidenceScoreSETest(unittest.TestCase):
    """P1-förfining: brusband på beslutssäkerhets-poängen ur findings detection_rate."""

    def test_robust_findings_zero_se(self):
        # Alla fynd syns varje körning (dr=1) → poängen deterministisk → SE 0.
        self.assertEqual(mr._confidence_score_se([{"detection_rate": 1.0}, {"detection_rate": 1.0}], 20), 0.0)

    def test_missing_detection_rate_treated_robust(self):
        # Historik före P6 saknar detection_rate → antas robust (0 bidrag).
        self.assertEqual(mr._confidence_score_se([{}, {}], 20), 0.0)

    def test_wobbly_findings_have_se(self):
        # Två vingliga fynd (dr=0.5) → var = 2·0.25 = 0.5; SE = (100/20)·√0.5.
        self.assertAlmostEqual(
            mr._confidence_score_se([{"detection_rate": 0.5}, {"detection_rate": 0.5}], 20),
            5 * (0.5 ** 0.5), places=2)

    def test_zero_total_is_none(self):
        self.assertIsNone(mr._confidence_score_se([{"detection_rate": 0.5}], 0))


class TrendSignificanceTest(unittest.TestCase):
    """P1-förfining: månadens rörelse grindas mot poängens brusband (z-test)."""

    def _prev(self, score, se):
        fakefs.reset(client={"company_name": "Acme AB"},
                     monthly_reports={"2026-04": {"decision_confidence": {"score": score, "score_se": se}}})

    def test_small_move_within_band_not_significant(self):
        self._prev(70, 3.0)  # Δ=3, SE_diff=√(9+9)=4.24, 1.96·≈8.3 → 3 < 8.3
        t = mr._trend("acme", "2026-05", 73, 0, current_score_se=3.0)
        self.assertEqual(t["delta"], 3)
        self.assertFalse(t["significant"])

    def test_large_move_is_significant(self):
        self._prev(50, 2.0)
        t = mr._trend("acme", "2026-05", 80, 0, current_score_se=2.0)  # Δ=30 ≫ band
        self.assertTrue(t["significant"])

    def test_deterministic_move_is_significant(self):
        # SE=0 båda (robusta fynd) → poängen deterministisk → Δ≥golv ÄR verklig, ej brus.
        self._prev(70, 0.0)
        t = mr._trend("acme", "2026-05", 72, 0, current_score_se=0.0)
        self.assertTrue(t["significant"])

    def test_no_previous_not_significant(self):
        fakefs.reset(client={"company_name": "Acme AB"}, monthly_reports={})
        t = mr._trend("acme", "2026-05", 72, 0, current_score_se=0.0)
        self.assertFalse(t["significant"])
        self.assertIsNone(t["previous_score"])


class EmailTrendGateTest(unittest.TestCase):
    """P1-förfining: kundmejlets trend-ord grindas på significant (default True = legacy)."""

    def _model(self, trend):
        return {"company_name": "Acme AB", "month": "2026-05",
                "decision_confidence": {"score": 72, "stage": "Stark", "next_step": "—"},
                "verdict": "", "trend": trend}

    def test_insignificant_reads_unchanged(self):
        _s, html, _t = mr.render_customer_email(
            self._model({"previous_score": 65, "significant": False}))
        self.assertIn("65 → 72", html)        # talet visas fortfarande
        self.assertIn("oförändrad", html)
        self.assertNotIn("förbättrad", html)

    def test_significant_reads_improved(self):
        _s, html, _t = mr.render_customer_email(
            self._model({"previous_score": 65, "significant": True}))
        self.assertIn("förbättrad", html)

    def test_missing_flag_defaults_to_shown(self):
        # Bakåtkompatibelt: modell utan significant-fält → gammalt beteende (visar ordet).
        _s, html, _t = mr.render_customer_email(self._model({"previous_score": 65}))
        self.assertIn("förbättrad", html)


class NarrativeTest(unittest.TestCase):
    def setUp(self):
        self._orig = mr.llm_factory.invoke_json

    def tearDown(self):
        mr.llm_factory.invoke_json = self._orig

    def test_no_llm_returns_none(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        self.assertIsNone(mr.generate_narrative_draft(m, llm=None))

    def test_generates_from_invoke_json(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        mr.llm_factory.invoke_json = lambda *a: {"narrative": "## Utkast\nMotorerna blandar ihop er…"}
        out = mr.generate_narrative_draft(m, llm=object())
        self.assertIn("Motorerna blandar ihop", out)


class RunPersistTest(unittest.TestCase):
    def setUp(self):
        self._orig = mr.generate_narrative_draft

    def tearDown(self):
        mr.generate_narrative_draft = self._orig

    def test_run_persists_report(self):
        _setup()
        mr.generate_narrative_draft = lambda model, **kw: None
        mr.run("acme", "2026-05")
        stored = fakefs.STATE["monthly_reports"]
        self.assertIn("2026-05", stored)
        self.assertEqual(stored["2026-05"]["company_name"], "Acme AB")
        self.assertIn("generated_at", stored["2026-05"])

    def test_run_attaches_narrative(self):
        _setup()
        mr.generate_narrative_draft = lambda model, **kw: "## Utkast\nText…"
        out = mr.run("acme", "2026-05")
        self.assertEqual(out["draft_narrative"], "## Utkast\nText…")
        self.assertEqual(fakefs.STATE["monthly_reports"]["2026-05"]["draft_narrative"], "## Utkast\nText…")


class RenderHtmlTest(unittest.TestCase):
    def test_html_contains_key_sections(self):
        _setup()
        html_out = mr.render_report_html(mr.build_report_model("acme", "2026-05"))
        self.assertIn("Acme AB", html_out)
        self.assertIn("Internt utkast", html_out)             # banner
        self.assertIn("74/100", html_out)                     # beslutssäkerhet (täckningstak)
        self.assertIn("God grund", html_out)                  # graderad nivå, ej binärt
        self.assertIn("Nästa steg", html_out)                 # alltid framåtblick
        self.assertIn("Tvister kring Acme?", html_out)        # detekterad risk
        self.assertIn("reinforced_claim", html_out)           # åtgärd
        self.assertIn("Förbättringsmöjligheter", html_out)    # alltid med

    def test_html_shows_resolved_and_series(self):
        findings = _findings()
        findings["f4"] = {"persona": "customer", "track": "A", "question": "Löst fråga?",
                          "engine": "gpt-4o", "harm": "#3", "severity": "high", "status": "resolved"}
        _setup(risk_findings=findings, monthly_reports={"2026-04": {"decision_confidence": {"score": 60}}})
        html_out = mr.render_report_html(mr.build_report_model("acme", "2026-05"))
        self.assertIn("risk(er) lösta", html_out)
        self.assertIn("Serie:", html_out)

    def test_html_renders_narrative_when_present(self):
        _setup()
        model = mr.build_report_model("acme", "2026-05")
        model["draft_narrative"] = "## Övergripande\nMotorerna blandar ihop er med Acme Corp."
        html_out = mr.render_report_html(model)
        self.assertIn("Motorerna blandar ihop er med Acme Corp.", html_out)
        self.assertIn("AI-genererat", html_out)

    def test_humanization_section_present(self):
        # trust_gap beräknad → Humaniseringstäckning ingår som SEKTION i samma rapport (§10)
        _setup(trust_gap={
            "overall_score": 0.3, "coverage": {"declared": 1, "demonstrated": 0, "of": 6},
            "dimensions": {"ethics": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3}},
            "flags": [],
        })
        html_out = mr.render_report_html(mr.build_report_model("acme", "2026-05"))
        self.assertIn("Humaniseringstäckning", html_out)
        self.assertIn("säger ni om er själva", html_out)  # översatt klartext, inga råa tal

    def test_humanization_section_graceful_without_trust_gap(self):
        # ingen trust_gap → sektionen visar upplysning, ej krasch/tomhet
        _setup()  # ingen trust_gap
        html_out = mr.render_report_html(mr.build_report_model("acme", "2026-05"))
        self.assertIn("Humaniseringstäckning", html_out)
        self.assertIn("beräknas när trust_gap", html_out)


class ReportEndpointsTest(unittest.TestCase):
    def test_list_404_missing_client(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException):
            reports.list_reports("ghost")

    def test_list_and_get(self):
        _setup()
        mr.run("acme", "2026-05")
        self.assertEqual(reports.list_reports("acme")["months"], ["2026-05"])
        got = reports.get_report("acme", "2026-05")
        self.assertEqual(got["month"], "2026-05")

    def test_get_404_missing_report(self):
        _setup()
        with self.assertRaises(HTTPException):
            reports.get_report("acme", "1999-01")

    def test_html_endpoint(self):
        _setup()
        mr.run("acme", "2026-05")
        resp = reports.get_report_html("acme", "2026-05")
        self.assertIn(b"Acme AB", resp.body)


if __name__ == "__main__":
    unittest.main()
