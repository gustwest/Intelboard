"""Enhetstester för GEO-riskloopens skiva 1 (services/risk_detector.py).

LLM (generering + klassning) och motoranrop mockas — vi verifierar frågeparsning,
skadeklassning och att run_for_client persisterar endast risk-findings (harm != ok).
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from services import risk_detector as rd
from services.risk_detector import Context, Question, RiskFinding


class ParseQuestionsTest(unittest.TestCase):
    def test_parse_and_defaults(self):
        data = {
            "questions": [
                {"text": "Q1?", "track": "B", "language": "en",
                 "harm_modes": ["#4", "bogus"], "type": "comparative", "decision_criterion": "fit"},
                {"text": "   ", "track": "A"},          # tom text → skippas
                {"text": "Q3?", "track": "X", "language": "de"},  # ogiltiga → defaults
            ]
        }
        qs = rd._parse_questions(data, "buyer")
        self.assertEqual(len(qs), 2)
        self.assertEqual(qs[0].track, "B")
        self.assertEqual(qs[0].language, "en")
        self.assertEqual(qs[0].harm_modes, ["#4"])      # ogiltig harm-mode filtrerad
        self.assertEqual(qs[0].type, "comparative")
        self.assertEqual(qs[0].persona, "buyer")
        self.assertEqual(qs[1].track, "A")              # ogiltig → default
        self.assertEqual(qs[1].language, "sv")
        self.assertEqual(qs[1].type, "open")


class ClassifyTest(unittest.TestCase):
    def setUp(self):
        self._orig = rd.llm_factory.invoke_json

    def tearDown(self):
        rd.llm_factory.invoke_json = self._orig

    def _q(self):
        return Question(persona="investor", track="A", text="Vem äger X?", language="sv")

    def _ctx(self):
        return Context("Acme AB", "profil", "facit")

    def test_harm_mapped(self):
        rd.llm_factory.invoke_json = lambda *a: {
            "harm": "#2", "severity": "high", "sourcing": "web", "evidence": "varsel 2021"}
        f = rd.classify(object(), self._q(), "svar", self._ctx())
        self.assertEqual((f.harm, f.severity, f.sourcing, f.engine_excerpt),
                         ("#2", "high", "web", "varsel 2021"))

    def test_ok_passes_through(self):
        rd.llm_factory.invoke_json = lambda *a: {"harm": "ok"}
        self.assertEqual(rd.classify(object(), self._q(), "svar", self._ctx()).harm, "ok")

    def test_invalid_harm_none(self):
        rd.llm_factory.invoke_json = lambda *a: {"harm": "#9"}
        self.assertIsNone(rd.classify(object(), self._q(), "svar", self._ctx()))

    def test_no_data_none(self):
        rd.llm_factory.invoke_json = lambda *a: None
        self.assertIsNone(rd.classify(object(), self._q(), "svar", self._ctx()))


class RunForClientTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            rd.llm_factory.make_validator, rd._build_engines, rd._ask,
            rd.generate_questions, rd.classify, rd._find_homonyms,
        )

    def tearDown(self):
        (rd.llm_factory.make_validator, rd._build_engines, rd._ask,
         rd.generate_questions, rd.classify, rd._find_homonyms) = self._orig

    def test_missing_client(self):
        fakefs.reset(client=None)
        self.assertIsNone(rd.run_for_client("ghost"))

    def test_no_llm_configured(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        rd.llm_factory.make_validator = lambda: None
        rd._build_engines = lambda: {}
        self.assertIsNone(rd.run_for_client("acme"))

    def test_persists_risky_findings_only(self):
        fakefs.reset(client={"company_name": "Acme AB", "competitors": ["Beta"]})
        rd.llm_factory.make_validator = lambda: object()
        rd._build_engines = lambda: {"gpt-4o": object()}
        rd._ask = lambda q, llm: "svar"
        rd._find_homonyms = lambda name, lei: []

        q_harm = Question("buyer", "A", "Har Acme tvister?", "sv")
        q_ok = Question("buyer", "B", "Vilka leverantörer finns?", "sv")
        rd.generate_questions = lambda *a: [q_harm, q_ok] if a[1] == "buyer" else []

        def fake_classify(llm, q, ans, ctx):
            if q is q_harm:
                return RiskFinding("buyer", "A", q.text, "", "#3", "high", "none", "påhittat")
            return RiskFinding("buyer", "B", q.text, "", "ok", "", "", "")

        rd.classify = fake_classify
        result = rd.run_for_client("acme")

        self.assertEqual(result.questions_asked, 2)       # bara buyer gav frågor
        self.assertEqual(len(result.findings), 1)         # "ok" persisteras inte
        stored = fakefs.STATE["risk_findings"]
        self.assertEqual(len(stored), 1)
        doc = next(iter(stored.values()))
        self.assertEqual(doc["harm"], "#3")
        self.assertEqual(doc["engine"], "gpt-4o")         # sätts av run_for_client
        self.assertTrue(doc["needs_review"])
        self.assertEqual(doc["status"], "open")


if __name__ == "__main__":
    unittest.main()
