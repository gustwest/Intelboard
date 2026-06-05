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
        qs = rd._parse_questions(data, "customer")
        self.assertEqual(len(qs), 2)
        self.assertEqual(qs[0].track, "B")
        self.assertEqual(qs[0].language, "en")
        self.assertEqual(qs[0].harm_modes, ["#4"])      # ogiltig harm-mode filtrerad
        self.assertEqual(qs[0].type, "comparative")
        self.assertEqual(qs[0].persona, "customer")
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


def _approved_q(persona, track, text, **over):
    base = {"persona": persona, "track": track, "text": text, "language": "sv", "status": "approved"}
    base.update(over)
    return base


class RunForClientTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            rd.llm_factory.make_validator, rd._build_engines, rd._ask,
            rd.classify, rd._should_follow_up,
        )

    def tearDown(self):
        (rd.llm_factory.make_validator, rd._build_engines, rd._ask,
         rd.classify, rd._should_follow_up) = self._orig

    def test_missing_client(self):
        fakefs.reset(client=None)
        self.assertIsNone(rd.run_for_client("ghost"))

    def test_no_llm_configured(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        rd.llm_factory.make_validator = lambda: None
        rd._build_engines = lambda: {}
        self.assertIsNone(rd.run_for_client("acme"))

    def test_no_approved_questions_is_noop(self):
        # Frågor finns men väntar på review → körs aldrig skarpt (§5.1).
        fakefs.reset(
            client={"company_name": "Acme AB"},
            risk_questions={"q1": _approved_q("customer", "A", "Har Acme tvister?", status="open")},
        )
        rd.llm_factory.make_validator = lambda: object()
        rd._build_engines = lambda: {"gpt-4o": object()}
        result = rd.run_for_client("acme")
        self.assertEqual(result.questions_asked, 0)
        self.assertEqual(result.findings, [])

    def test_persists_risky_findings_only(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "competitors": ["Beta"]},
            risk_questions={
                "qh": _approved_q("customer", "A", "Har Acme tvister?"),
                "qo": _approved_q("customer", "B", "Vilka leverantörer finns?"),
                "qp": _approved_q("customer", "A", "Ej godkänd", status="open"),  # skippas
            },
        )
        rd.llm_factory.make_validator = lambda: object()
        rd._build_engines = lambda: {"gpt-4o": object()}
        rd._ask = lambda q, llm: "svar"
        rd._should_follow_up = lambda cls: False

        def fake_classify(llm, q, ans, ctx):
            if "tvister" in q.text:
                return RiskFinding("customer", "A", q.text, "", "#3", "high", "none", "påhittat")
            return RiskFinding("customer", "B", q.text, "", "ok", "", "", "")

        rd.classify = fake_classify
        result = rd.run_for_client("acme")

        self.assertEqual(result.questions_asked, 2)       # bara godkända frågor
        self.assertEqual(len(result.findings), 1)         # "ok" persisteras inte
        stored = fakefs.STATE["risk_findings"]
        self.assertEqual(len(stored), 1)
        doc = next(iter(stored.values()))
        self.assertEqual(doc["harm"], "#3")
        self.assertEqual(doc["engine"], "gpt-4o")         # sätts av run_for_client
        self.assertTrue(doc["needs_review"])
        self.assertEqual(doc["status"], "open")

    def test_run_marks_clean_on_safe_answer(self):
        # En godkänd fråga som tidigare gav ett fynd svarar nu "ok" → ren-streak byggs.
        fid = rd._finding_id("customer", "Har Acme tvister?", "gpt-4o")
        fakefs.reset(
            client={"company_name": "Acme AB"},
            risk_questions={"qh": _approved_q("customer", "A", "Har Acme tvister?")},
            risk_findings={fid: {"status": "open", "clean_streak": 0, "persona": "customer"}},
        )
        rd.llm_factory.make_validator = lambda: object()
        rd._build_engines = lambda: {"gpt-4o": object()}
        rd._ask = lambda q, llm: "svar"
        rd._should_follow_up = lambda cls: False
        rd.classify = lambda *a: RiskFinding("customer", "A", "Har Acme tvister?", "", "ok", "", "", "")
        rd.run_for_client("acme")
        self.assertEqual(fakefs.STATE["risk_findings"][fid]["clean_streak"], 1)
        self.assertEqual(fakefs.STATE["risk_findings"][fid]["status"], "open")  # 1 < tröskel


class ResolvedDetectionTest(unittest.TestCase):
    def _fid(self):
        return rd._finding_id("investor", "Vem äger Acme?", "gpt-4o")

    def test_mark_clean_builds_streak_then_resolves(self):
        fid = self._fid()
        fakefs.reset(client={"company_name": "Acme AB"},
                     risk_findings={fid: {"status": "open", "clean_streak": 0}})
        rd._mark_clean("acme", "investor", "Vem äger Acme?", "gpt-4o")
        self.assertEqual(fakefs.STATE["risk_findings"][fid]["clean_streak"], 1)
        self.assertEqual(fakefs.STATE["risk_findings"][fid]["status"], "open")
        rd._mark_clean("acme", "investor", "Vem äger Acme?", "gpt-4o")  # når tröskel (2)
        self.assertEqual(fakefs.STATE["risk_findings"][fid]["status"], "resolved")
        self.assertFalse(fakefs.STATE["risk_findings"][fid]["needs_review"])

    def test_mark_clean_noop_without_finding(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={})
        rd._mark_clean("acme", "investor", "Vem äger Acme?", "gpt-4o")
        self.assertEqual(fakefs.STATE["risk_findings"], {})  # skapar inget

    def test_persist_preserves_actioned_and_resets_streak(self):
        fid = self._fid()
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={
            fid: {"status": "actioned", "action_taken": "reinforced_claim",
                  "ammo_claim_ids": ["corr-x"], "clean_streak": 1}})
        rd._persist("acme", RiskFinding("investor", "A", "Vem äger Acme?", "gpt-4o", "#1", "high", "none", "x"))
        doc = fakefs.STATE["risk_findings"][fid]
        self.assertEqual(doc["status"], "actioned")            # ej nedgraderad
        self.assertEqual(doc["action_taken"], "reinforced_claim")  # action-fält bevarat
        self.assertEqual(doc["clean_streak"], 0)               # nollställd

    def test_persist_reopens_resolved_regression(self):
        fid = self._fid()
        fakefs.reset(client={"company_name": "Acme AB"}, risk_findings={
            fid: {"status": "resolved", "clean_streak": 2}})
        rd._persist("acme", RiskFinding("investor", "A", "Vem äger Acme?", "gpt-4o", "#3", "high", "none", "x"))
        doc = fakefs.STATE["risk_findings"][fid]
        self.assertEqual(doc["status"], "open")                # regression → återöppnad
        self.assertTrue(doc["needs_review"])


class GenerateAndStoreTest(unittest.TestCase):
    def setUp(self):
        self._orig = (rd.llm_factory.make_validator, rd.generate_questions, rd._find_homonyms)

    def tearDown(self):
        (rd.llm_factory.make_validator, rd.generate_questions, rd._find_homonyms) = self._orig

    def test_no_validator_is_noop(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        rd.llm_factory.make_validator = lambda: None
        self.assertIsNone(rd.generate_and_store_questions("acme"))

    def test_generates_and_persists_needs_review(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        rd.llm_factory.make_validator = lambda: object()
        rd._find_homonyms = lambda name, lei: []
        rd.generate_questions = lambda llm, persona, *a: (
            [Question(persona, "A", f"Fråga för {persona}?", "sv")] if persona == "customer" else []
        )
        out = rd.generate_and_store_questions("acme")
        self.assertEqual(out["generated"], 1)
        stored = fakefs.STATE["risk_questions"]
        self.assertEqual(len(stored), 1)
        doc = next(iter(stored.values()))
        self.assertEqual(doc["status"], "open")
        self.assertTrue(doc["needs_review"])
        self.assertTrue(doc["context_hash"])

    def test_cache_hit_skips_regeneration(self):
        # Ett befintligt batteri med samma kontext-hash → ingen regenerering.
        fakefs.reset(client={"company_name": "Acme AB"})
        rd.llm_factory.make_validator = lambda: object()
        rd._find_homonyms = lambda name, lei: []
        ctx = rd.build_context("acme", {"company_name": "Acme AB"})
        h = rd._context_hash(ctx)
        fakefs.STATE["risk_questions"] = {"q1": {"text": "x", "status": "approved", "context_hash": h}}

        called = []
        rd.generate_questions = lambda *a: called.append(1) or []
        out = rd.generate_and_store_questions("acme")
        self.assertEqual(out["cached"], 1)
        self.assertEqual(out["generated"], 0)
        self.assertEqual(called, [])  # generering aldrig anropad


class FollowUpTest(unittest.TestCase):
    def setUp(self):
        self._orig = (rd._generate_follow_up, rd._ask_with_history, rd.classify)

    def tearDown(self):
        (rd._generate_follow_up, rd._ask_with_history, rd.classify) = self._orig

    def _q(self):
        return Question("investor", "A", "Vem äger Acme?", "sv")

    def test_should_follow_up_triggers(self):
        self.assertTrue(rd._should_follow_up(RiskFinding("i", "A", "q", "", "ok", "", "", "", uncertain=True)))
        self.assertTrue(rd._should_follow_up(RiskFinding("i", "A", "q", "", "#1", "low", "none", "")))
        self.assertTrue(rd._should_follow_up(RiskFinding("i", "A", "q", "", "#5", "medium", "none", "")))

    def test_should_not_follow_up(self):
        self.assertFalse(rd._should_follow_up(RiskFinding("i", "A", "q", "", "ok", "", "", "")))
        self.assertFalse(rd._should_follow_up(RiskFinding("i", "A", "q", "", "#1", "high", "none", "")))
        self.assertFalse(rd._should_follow_up(RiskFinding("i", "A", "q", "", "#3", "low", "none", "")))
        self.assertFalse(rd._should_follow_up(None))

    def test_follow_up_escalates_and_annotates(self):
        first = RiskFinding("investor", "A", "Vem äger Acme?", "", "#1", "low", "none", "", uncertain=True)
        rd._generate_follow_up = lambda *a: "Menar du Acme i Sverige eller Acme Corp i USA?"
        rd._ask_with_history = lambda *a: "Förlåt, jag blandade ihop dem — Acme Corp är ett annat bolag."
        rd.classify = lambda llm, q, ans, ctx: RiskFinding("investor", "A", q.text, "", "#1", "high", "none", "förväxling")

        out = rd.follow_up(object(), object(), self._q(), "tunt svar", first, Context("Acme AB", "p", "f"))
        self.assertEqual(out.severity, "high")        # det allvarligare utfallet behölls
        self.assertTrue(out.via_follow_up)
        self.assertIn("Menar du", out.follow_up_question)

    def test_follow_up_no_question_returns_none(self):
        rd._generate_follow_up = lambda *a: ""
        self.assertIsNone(
            rd.follow_up(object(), object(), self._q(), "svar",
                         RiskFinding("investor", "A", "q", "", "#5", "low", "none", ""), Context("Acme AB", "p", "f"))
        )


if __name__ == "__main__":
    unittest.main()
