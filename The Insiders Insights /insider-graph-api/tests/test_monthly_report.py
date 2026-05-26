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
        "f2": {"persona": "buyer", "track": "A", "question": "Stabilt bolag?",
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
        risk_run_summary={"answers_by_persona": {"investor": 10, "buyer": 5}, "total_answers": 15},
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
        # buyer: open #5 medium (vikt 2) / 5 = 0.4
        self.assertEqual(exp["per_persona"]["buyer"]["score"], 0.4)
        # candidate: inga svar → score None
        self.assertIsNone(exp["per_persona"]["candidate"]["score"])
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

    def test_trend_from_previous_report(self):
        _setup(monthly_reports={"2026-04": {"risk_exposure": {"total": {"score": 0.5}}}})
        m = mr.build_report_model("acme", "2026-05")
        self.assertEqual(m["trend"]["previous_month"], "2026-04")
        self.assertEqual(m["trend"]["delta"], round(0.333 - 0.5, 3))  # förbättring (negativ)

    def test_no_trend_first_report(self):
        _setup()
        self.assertIsNone(mr.build_report_model("acme", "2026-05")["trend"])

    def test_decision_confidence_and_verdict(self):
        _setup()
        m = mr.build_report_model("acme", "2026-05")
        conf = m["decision_confidence"]
        # Bara 2 av 3 personas mätta (investor+buyer) → täckningstak 74, kan ej nå toppen.
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
            "answers_by_persona": {"buyer": 4, "candidate": 4, "investor": 4}, "total_answers": 12})
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
            "answers_by_persona": {"buyer": 4, "candidate": 4, "investor": 4}, "total_answers": 12})
        m = mr.build_report_model("acme", "2026-05")
        self.assertTrue(m["improvement_opportunities"])  # invariant: aldrig tom
        self.assertTrue(any("bevakning" in i for i in m["improvement_opportunities"]))


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

    def test_html_renders_narrative_when_present(self):
        _setup()
        model = mr.build_report_model("acme", "2026-05")
        model["draft_narrative"] = "## Övergripande\nMotorerna blandar ihop er med Acme Corp."
        html_out = mr.render_report_html(model)
        self.assertIn("Motorerna blandar ihop er med Acme Corp.", html_out)
        self.assertIn("AI-genererat", html_out)


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
