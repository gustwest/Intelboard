"""C2: sv-vs-en probe-experiment (services/lang_probe.py) — inga nätverksanrop."""
import unittest

import fakefs  # installerar fake firestore_client — först
from services import lang_probe


class QuestionPairsTest(unittest.TestCase):
    def test_name_pair_always_present(self):
        pairs = lang_probe.question_pairs({"company_name": "Acme AB"})
        # Minst {name}-paret ska finnas även utan industry/topic.
        self.assertTrue(any("Acme AB" in sv and "Acme AB" in en for sv, en in pairs))

    def test_industry_pairs_skipped_when_missing(self):
        no_industry = lang_probe.question_pairs({"company_name": "Acme AB"})
        with_industry = lang_probe.question_pairs({"company_name": "Acme AB", "industry": "fordon"})
        self.assertGreater(len(with_industry), len(no_industry))
        self.assertTrue(any("fordon" in sv for sv, _ in with_industry))

    def test_pairs_are_parallel_languages(self):
        pairs = lang_probe.question_pairs({"company_name": "Acme AB", "industry": "fordon"})
        for sv, en in pairs:
            self.assertNotEqual(sv, en)  # faktiskt översatta, inte samma sträng


class AggregateTest(unittest.TestCase):
    def test_rates_and_winner(self):
        rows = [
            {"engine": "gpt-4o", "lang": "sv", "question": "q1", "mentioned": True},
            {"engine": "gpt-4o", "lang": "sv", "question": "q2", "mentioned": False},
            {"engine": "gpt-4o", "lang": "en", "question": "q1", "mentioned": True},
            {"engine": "gpt-4o", "lang": "en", "question": "q2", "mentioned": True},
        ]
        out = lang_probe.aggregate(rows, "Acme AB")
        eng = out["per_engine"]["gpt-4o"]
        self.assertEqual(eng["sv"]["rate"], 0.5)
        self.assertEqual(eng["en"]["rate"], 1.0)
        self.assertEqual(eng["winner"], "en")
        self.assertEqual(out["pairs"], 2)


class RunExperimentTest(unittest.TestCase):
    def test_run_with_stub_models(self):
        fakefs.reset(client={"company_name": "Acme AB", "industry": "fordon"})

        # Stub-motor: nämner bolaget bara på engelska → en ska vinna.
        class Stub:
            def __init__(self, mentions_lang):
                self.mentions_lang = mentions_lang

        def ask(question, llm, lang):
            return "Acme AB är ledande." if lang == llm.mentions_lang else "Inga relevanta bolag."

        models = {"gpt-4o": Stub("en"), "gemini": Stub("sv")}
        out = lang_probe.run_experiment("acme", models=models, ask=ask)
        self.assertEqual(out["per_engine"]["gpt-4o"]["winner"], "en")
        self.assertEqual(out["per_engine"]["gemini"]["winner"], "sv")

    def test_no_pairs_returns_empty(self):
        fakefs.reset(client={})  # inget company_name → namn-paret blir tomt
        out = lang_probe.run_experiment("acme", models={}, ask=lambda q, l, lang: "")
        self.assertEqual(out["pairs"], 0)
        self.assertEqual(out["per_engine"], {})


if __name__ == "__main__":
    unittest.main()
