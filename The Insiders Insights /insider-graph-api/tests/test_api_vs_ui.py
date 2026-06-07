"""Experiment #2: parad API-vs-UI-harness (services/api_vs_ui.py) — inga nätverksanrop.

Verifierar jämförelse-aggregeringen (omnämnande-överensstämmelse, ui_only/api_only,
varumärkes-Jaccard API vs UI) och run_experiment-plumbingen med injicerad ui_fetch.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from services import api_vs_ui


def _row(engine, prompt, channel, mentioned, brands=None):
    return {"engine": engine, "prompt": prompt, "channel": channel,
            "mentioned": mentioned, "brands": brands or []}


class AggregateTest(unittest.TestCase):
    def test_incomplete_pairs_are_skipped(self):
        # Bara API-svar (ingen UI) → inget par att jämföra → tom rapport.
        rows = [_row("gpt", "q1", api_vs_ui.API, True)]
        out = api_vs_ui.aggregate(rows)
        self.assertEqual(out["by_engine"], {})
        self.assertEqual(out["summary"]["engines"], 0)

    def test_mention_agreement_and_directions(self):
        rows = [
            # q1: bägge nämner → both
            _row("gpt", "q1", api_vs_ui.API, True), _row("gpt", "q1", api_vs_ui.UI, True),
            # q2: bara UI nämner → ui_only (farliga riktningen)
            _row("gpt", "q2", api_vs_ui.API, False), _row("gpt", "q2", api_vs_ui.UI, True),
            # q3: ingen nämner → neither
            _row("gpt", "q3", api_vs_ui.API, False), _row("gpt", "q3", api_vs_ui.UI, False),
        ]
        cell = api_vs_ui.aggregate(rows)["by_engine"]["gpt"]
        self.assertEqual(cell["n_pairs"], 3)
        self.assertEqual(cell["both"], 1)
        self.assertEqual(cell["neither"], 1)
        self.assertEqual(cell["ui_only"], 1)
        self.assertEqual(cell["api_only"], 0)
        # överens = (both+neither)/n = 2/3
        self.assertAlmostEqual(cell["mention_agreement"], 0.667, places=2)
        self.assertAlmostEqual(cell["ui_only_rate"], 0.333, places=2)

    def test_brand_jaccard_api_vs_ui(self):
        # API hittar {Foo, Bar}, UI hittar {Bar, Baz} → Jaccard = 1/3 (grounding-gap).
        rows = [
            _row("gpt", "q1", api_vs_ui.API, True, ["Foo AB", "Bar AB"]),
            _row("gpt", "q1", api_vs_ui.UI, True, ["Bar AB", "Baz AB"]),
        ]
        cell = api_vs_ui.aggregate(rows)["by_engine"]["gpt"]
        self.assertAlmostEqual(cell["mean_brand_jaccard"], 1 / 3, places=2)

    def test_vacuous_jaccard_excluded(self):
        # Inga varumärken i någon kanal → Jaccard ska INTE bli en falsk 1.0.
        rows = [
            _row("gpt", "q1", api_vs_ui.API, True, []),
            _row("gpt", "q1", api_vs_ui.UI, True, []),
        ]
        cell = api_vs_ui.aggregate(rows)["by_engine"]["gpt"]
        self.assertIsNone(cell["mean_brand_jaccard"])

    def test_summary_means_across_engines(self):
        rows = [
            _row("gpt", "q1", api_vs_ui.API, True, ["Foo"]), _row("gpt", "q1", api_vs_ui.UI, True, ["Foo"]),
            _row("gem", "q1", api_vs_ui.API, True, ["Foo"]), _row("gem", "q1", api_vs_ui.UI, False, ["Bar"]),
        ]
        s = api_vs_ui.aggregate(rows)["summary"]
        self.assertEqual(s["engines"], 2)
        # gpt: jaccard 1.0; gem: jaccard 0.0 → medel 0.5
        self.assertAlmostEqual(s["mean_brand_jaccard"], 0.5, places=2)


class RunExperimentTest(unittest.TestCase):
    def test_run_with_injected_arms(self):
        fakefs.reset(client={"company_name": "Acme AB", "industry": "fordon"})

        class Judge:
            def invoke(self, _prompt):
                class R:
                    content = '{"orgs": ["Foo AB"]}'
                return R()

        out = api_vs_ui.run_experiment(
            "acme", prompts=1,
            api_models={"gpt": object()},
            ask=lambda q, llm: "Acme AB nämns i API-svaret.",
            ui_fetch=lambda engine, q: "Acme AB nämns i UI-svaret.",
            judge=Judge(),
        )
        cell = out["by_engine"]["gpt"]
        self.assertEqual(cell["n_pairs"], 1)
        self.assertEqual(cell["both"], 1)             # bägge kanaler nämner kunden
        self.assertEqual(cell["mean_brand_jaccard"], 1.0)  # samma judge → samma varumärken

    def test_default_ui_fetch_raises(self):
        # Utan injicerad ui_fetch ska experimentet kasta, inte tyst mäta tomt UI.
        fakefs.reset(client={"company_name": "Acme AB", "industry": "fordon"})
        with self.assertRaises(NotImplementedError):
            api_vs_ui.run_experiment(
                "acme", prompts=1, api_models={"gpt": object()},
                ask=lambda q, llm: "Acme AB.", judge=None,
            )


if __name__ == "__main__":
    unittest.main()
