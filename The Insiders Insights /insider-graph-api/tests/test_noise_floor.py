"""Experiment #1: brusgolv-harness (services/noise_floor.py) — inga nätverksanrop.

Verifierar den rena statistiken (SE, Jaccard), aggregeringen (instabil-andel,
varumärkesstabilitet, temp-jämförelse) och run_experiment-plumbingen med stubbar.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from services import noise_floor


class StatsTest(unittest.TestCase):
    def test_binom_se(self):
        self.assertIsNone(noise_floor._binom_se(0, 0))
        self.assertEqual(noise_floor._binom_se(0, 10), 0.0)   # p=0 → SE=0
        self.assertEqual(noise_floor._binom_se(10, 10), 0.0)  # p=1 → SE=0
        # p=0.5, n=10 → sqrt(0.25/10) ≈ 0.158
        self.assertAlmostEqual(noise_floor._binom_se(5, 10), 0.1581, places=3)

    def test_jaccard(self):
        self.assertEqual(noise_floor._jaccard(set(), set()), 1.0)         # bägge tomma = identiska
        self.assertEqual(noise_floor._jaccard({"a"}, set()), 0.0)         # en tom = ingen överlapp
        self.assertEqual(noise_floor._jaccard({"a", "b"}, {"a", "b"}), 1.0)
        self.assertEqual(noise_floor._jaccard({"a", "b"}, {"b", "c"}), 1 / 3)

    def test_mean_pairwise_jaccard(self):
        self.assertIsNone(noise_floor._mean_pairwise_jaccard([{"a"}]))    # <2 → None
        self.assertEqual(noise_floor._mean_pairwise_jaccard([{"a"}, {"a"}, {"a"}]), 1.0)
        # par: (ab,ab)=1, (ab,bc)=1/3, (ab,bc)=1/3 → medel ≈ 0.556
        out = noise_floor._mean_pairwise_jaccard([{"a", "b"}, {"a", "b"}, {"b", "c"}])
        self.assertAlmostEqual(out, 0.556, places=2)


class AggregateTest(unittest.TestCase):
    def test_unstable_fraction_and_rate(self):
        # En motor, en temp, två frågor × 4 körningar. q1 enhälligt nämnt (4/4),
        # q2 splittat (2/4) → instabil-andel 0.5, poolad SoV 6/8 = 0.75.
        rows = []
        for i in range(4):
            rows.append({"engine": "gpt", "temp": 0.0, "prompt": "q1", "run_idx": i,
                         "mentioned": True, "brands": []})
        for i in range(4):
            rows.append({"engine": "gpt", "temp": 0.0, "prompt": "q2", "run_idx": i,
                         "mentioned": i < 2, "brands": []})
        out = noise_floor.aggregate(rows, runs=4)
        cell = out["by_cell"]["gpt|0.0"]
        self.assertEqual(cell["mention_rate"], 0.75)
        self.assertEqual(cell["unstable_prompt_fraction"], 0.5)
        self.assertEqual(cell["n_prompts"], 2)
        self.assertEqual(cell["n_asks"], 8)

    def test_brand_jaccard_and_temp_comparison(self):
        # Samma motor vid två temperaturer. temp=0: identisk varumärkeslista varje
        # körning (Jaccard 1.0). temp=0.7: listan kastas om (lägre Jaccard).
        rows = []
        for i in range(3):
            rows.append({"engine": "gpt", "temp": 0.0, "prompt": "q1", "run_idx": i,
                         "mentioned": True, "brands": ["Foo AB", "Bar AB"]})
        churn = [["Foo AB", "Bar AB"], ["Bar AB", "Baz AB"], ["Qux AB"]]
        for i in range(3):
            rows.append({"engine": "gpt", "temp": 0.7, "prompt": "q1", "run_idx": i,
                         "mentioned": True, "brands": churn[i]})
        out = noise_floor.aggregate(rows, runs=3)
        self.assertEqual(out["by_cell"]["gpt|0.0"]["mean_brand_jaccard"], 1.0)
        self.assertLess(out["by_cell"]["gpt|0.7"]["mean_brand_jaccard"], 1.0)
        comp = out["temp_comparison"]["gpt"]
        self.assertEqual(comp["temp_low"], 0.0)
        self.assertEqual(comp["temp_high"], 0.7)
        # Jaccard sjunker när temperaturen höjs → positivt drop.
        self.assertGreater(comp["jaccard_drop"], 0)


class RunExperimentTest(unittest.TestCase):
    def test_run_with_stub_models(self):
        fakefs.reset(client={"company_name": "Acme AB", "industry": "fordon"})

        class StubLLM:
            """Domar-stub: _extract_orgs anropar .invoke och läser .content (JSON)."""
            def invoke(self, _prompt):
                class R:
                    content = '{"orgs": ["Foo AB"]}'
                return R()

        stub = StubLLM()
        out = noise_floor.run_experiment(
            "acme", runs=3, prompts=1, temps=(0.0, 0.7),
            extract_brands=True,
            models_for_temp=lambda t: {"gpt": stub},
            ask=lambda q, llm: "Acme AB är ledande inom fordon.",
            judge=stub,
        )
        # Två celler (en per temp), bägge med full omnämnandegrad och stabil varumärkeslista.
        self.assertIn("gpt|0.0", out["by_cell"])
        self.assertIn("gpt|0.7", out["by_cell"])
        self.assertEqual(out["by_cell"]["gpt|0.0"]["mention_rate"], 1.0)
        self.assertEqual(out["by_cell"]["gpt|0.0"]["mean_brand_jaccard"], 1.0)

    def test_no_brands_skips_jaccard(self):
        # --no-brands: ingen judge-extraktion → mean_brand_jaccard ska vara None,
        # men omnämnandegraden mäts ändå (gratis mention-detektering).
        fakefs.reset(client={"company_name": "Acme AB", "industry": "fordon"})
        out = noise_floor.run_experiment(
            "acme", runs=2, prompts=1, temps=(0.0,),
            extract_brands=False, models_for_temp=lambda t: {"gpt": object()},
            ask=lambda q, llm: "Acme AB nämns här.",
        )
        cell = out["by_cell"]["gpt|0.0"]
        self.assertEqual(cell["mention_rate"], 1.0)
        self.assertIsNone(cell["mean_brand_jaccard"])


if __name__ == "__main__":
    unittest.main()
