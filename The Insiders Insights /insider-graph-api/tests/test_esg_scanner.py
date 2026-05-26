"""Enhetstester för riskloopens ESG-spår, skiva 1 (services/esg_scanner.py).

LLM (generering + klassning) och motoranrop mockas — vi verifierar frågeparsning,
ESG-skadeklassning, att exempelfrågorna (golvet) alltid seedas, och att run_esg_scan
persisterar endast findings med status != ok.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from services import esg_scanner as es
from services.esg_scanner import ESGFinding, ESGQuestion
from services.risk_detector import Context


class ParseQuestionsTest(unittest.TestCase):
    def test_parse_and_defaults(self):
        data = {"questions": [
            {"text": "Q1?", "language": "en"},
            {"text": "   "},                  # tom → skippas
            {"text": "Q3?", "language": "de"},  # ogiltigt språk → default sv
        ]}
        qs = es._parse_questions(data, "E")
        self.assertEqual(len(qs), 2)
        self.assertEqual(qs[0].language, "en")
        self.assertEqual(qs[0].pillar, "E")
        self.assertEqual(qs[0].kind, "expansion")
        self.assertEqual(qs[1].language, "sv")


class ClassifyTest(unittest.TestCase):
    def setUp(self):
        self._orig = es.llm_factory.invoke_json

    def tearDown(self):
        es.llm_factory.invoke_json = self._orig

    def _q(self):
        return ESGQuestion(pillar="E", kind="example", text="Scope 1-3?", language="sv")

    def _ctx(self):
        return Context("Acme AB", "profil", "facit")

    def test_omission_mapped(self):
        es.llm_factory.invoke_json = lambda *a: {
            "status": "CRITICAL_OMISSION_RISK", "severity": "high",
            "sentiment": "neutral", "evidence": "inga specifika siffror anges"}
        f = es.classify_esg(object(), self._q(), "svar", self._ctx())
        self.assertEqual((f.status, f.severity, f.engine_excerpt),
                         ("CRITICAL_OMISSION_RISK", "high", "inga specifika siffror anges"))

    def test_reputation_mapped(self):
        es.llm_factory.invoke_json = lambda *a: {
            "status": "HIGH_REPUTATION_RISK", "severity": "medium", "sentiment": "negative"}
        f = es.classify_esg(object(), self._q(), "svar", self._ctx())
        self.assertEqual((f.status, f.sentiment), ("HIGH_REPUTATION_RISK", "negative"))

    def test_ok_passes_through(self):
        es.llm_factory.invoke_json = lambda *a: {"status": "ok", "sentiment": "positive"}
        self.assertEqual(es.classify_esg(object(), self._q(), "svar", self._ctx()).status, "ok")

    def test_invalid_status_none(self):
        es.llm_factory.invoke_json = lambda *a: {"status": "WAT"}
        self.assertIsNone(es.classify_esg(object(), self._q(), "svar", self._ctx()))

    def test_no_data_none(self):
        es.llm_factory.invoke_json = lambda *a: None
        self.assertIsNone(es.classify_esg(object(), self._q(), "svar", self._ctx()))


def _approved_q(pillar, kind, text, **over):
    base = {"pillar": pillar, "kind": kind, "text": text, "language": "sv", "status": "approved"}
    base.update(over)
    return base


class GenerateAndStoreTest(unittest.TestCase):
    def setUp(self):
        self._orig = (es.llm_factory.make_validator, es.generate_expansions)

    def tearDown(self):
        (es.llm_factory.make_validator, es.generate_expansions) = self._orig

    def test_no_validator_is_noop(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        es.llm_factory.make_validator = lambda: None
        self.assertIsNone(es.generate_and_store_esg_questions("acme"))

    def test_seeds_examples_floor_and_expansions(self):
        fakefs.reset(client={"company_name": "Acme AB", "industry": "SaaS"})
        es.llm_factory.make_validator = lambda: object()
        # En expansion per pelare; exempelfrågorna (golvet) ska alltid med.
        es.generate_expansions = lambda llm, pillar, ctx, ind: [
            ESGQuestion(pillar, "expansion", f"Djup {pillar}?", "sv")
        ]
        out = es.generate_and_store_esg_questions("acme")
        # 3 exempelfrågor * 3 pelare + 1 expansion * 3 pelare = 12
        self.assertEqual(out["generated"], 12)
        stored = fakefs.STATE["esg_questions"]
        self.assertEqual(len(stored), 12)
        kinds = [d["kind"] for d in stored.values()]
        self.assertEqual(kinds.count("example"), 9)
        self.assertEqual(kinds.count("expansion"), 3)
        self.assertTrue(all(d["needs_review"] for d in stored.values()))
        self.assertTrue(all(d["context_hash"] for d in stored.values()))

    def test_cache_hit_skips_regeneration(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        es.llm_factory.make_validator = lambda: object()
        ctx = es.build_context("acme", {"company_name": "Acme AB"})
        h = es._context_hash(ctx)
        fakefs.STATE["esg_questions"] = {"q1": {"text": "x", "status": "approved", "context_hash": h}}
        called = []
        es.generate_expansions = lambda *a: called.append(1) or []
        out = es.generate_and_store_esg_questions("acme")
        self.assertEqual(out["cached"], 1)
        self.assertEqual(out["generated"], 0)
        self.assertEqual(called, [])


class RunScanTest(unittest.TestCase):
    def setUp(self):
        self._orig = (es.llm_factory.make_validator, es._build_engines, es._ask, es.classify_esg)

    def tearDown(self):
        (es.llm_factory.make_validator, es._build_engines, es._ask, es.classify_esg) = self._orig

    def test_missing_client(self):
        fakefs.reset(client=None)
        self.assertIsNone(es.run_esg_scan("ghost"))

    def test_no_llm_configured(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        es.llm_factory.make_validator = lambda: None
        es._build_engines = lambda: {}
        self.assertIsNone(es.run_esg_scan("acme"))

    def test_no_approved_questions_is_noop(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            esg_questions={"q1": _approved_q("E", "example", "Scope?", status="open")},
        )
        es.llm_factory.make_validator = lambda: object()
        es._build_engines = lambda: {"gpt-4o": object()}
        result = es.run_esg_scan("acme")
        self.assertEqual(result.questions_asked, 0)
        self.assertEqual(result.findings, [])

    def test_persists_risky_findings_only(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            esg_questions={
                "qg": _approved_q("E", "example", "Scope 1-3 för Acme?"),
                "qo": _approved_q("S", "example", "Kultur på Acme?"),
                "qp": _approved_q("G", "example", "Ej godkänd", status="open"),  # skippas
            },
        )
        es.llm_factory.make_validator = lambda: object()
        es._build_engines = lambda: {"gpt-4o": object()}
        es._ask = lambda q, llm: "blint svar om Acme"

        def fake_classify(llm, q, ans, ctx):
            if "Scope" in q.text:
                return ESGFinding("E", q.text, "", "CRITICAL_OMISSION_RISK", "high", "neutral", "saknas data")
            return ESGFinding("S", q.text, "", "ok", "", "positive", "")

        es.classify_esg = fake_classify
        result = es.run_esg_scan("acme")

        self.assertEqual(result.questions_asked, 2)   # bara godkända
        self.assertEqual(len(result.findings), 1)     # "ok" persisteras inte
        stored = fakefs.STATE["esg_findings"]
        self.assertEqual(len(stored), 1)
        doc = next(iter(stored.values()))
        self.assertEqual(doc["status"], "CRITICAL_OMISSION_RISK")
        self.assertEqual(doc["engine"], "gpt-4o")      # sätts av run_esg_scan
        self.assertEqual(doc["answer_excerpt"], "blint svar om Acme")  # blinda svaret bevaras
        self.assertTrue(doc["needs_review"])
        # Run summary: denominator per pelare för risk score.
        summ = fakefs.STATE["esg_run_summary"]
        self.assertEqual(summ["answers_by_pillar"]["E"], 1)
        self.assertEqual(summ["answers_by_pillar"]["S"], 1)
        self.assertEqual(summ["findings_count"], 1)


if __name__ == "__main__":
    unittest.main()
