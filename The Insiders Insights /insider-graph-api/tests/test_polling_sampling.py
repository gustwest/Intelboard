"""P0-tester: upprepad sampling + standardfel i polling-aggregatet (services/polling).

Verifierar att Share of Voice blir en mention-RATE över N körningar med ett binomialt
standardfel, att dyra steg (sentiment/org) bara räknas på det representativa svaret
(run_idx 0), och att icke-representativa körningar lagras kompakt (svarstext strippad)."""
import os
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client innan service-import
from services import polling
from services.polling import QuestionAnswer


class ProportionSETest(unittest.TestCase):
    def test_zero_n(self):
        self.assertEqual(polling._proportion_se(0, 0), 0.0)

    def test_half(self):
        # p=0.5, n=4 → sqrt(0.25/4) = 0.25
        self.assertAlmostEqual(polling._proportion_se(2, 4), 0.25)

    def test_certain_has_no_error(self):
        self.assertEqual(polling._proportion_se(4, 4), 0.0)


class RunsEnvTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("POLLING_RUNS_PER_QUERY", None)

    def test_clamp_and_default(self):
        for val, exp in [("1", 1), ("7", 7), ("9", 7), ("0", 1), ("bad", 7)]:
            os.environ["POLLING_RUNS_PER_QUERY"] = val
            self.assertEqual(polling._runs_per_query(), exp)
        os.environ.pop("POLLING_RUNS_PER_QUERY", None)
        self.assertEqual(polling._runs_per_query(), 7)  # default = rekommenderad nivå


class AggregateSamplingTest(unittest.TestCase):
    def _ans(self, model, run_idx, mentioned, sentiment=None, orgs=None):
        return QuestionAnswer(
            category="affar", question="Q?", model=model,
            answer="ett svar" if run_idx == 0 else "",
            mentioned=mentioned, sentiment=sentiment,
            orgs_mentioned=orgs or [], run_idx=run_idx,
        )

    def test_sov_is_rate_with_se_over_runs(self):
        # 1 motor × 1 fråga × 4 körningar, mention i 2 → SoV 0.5, SE 0.25.
        answers = [self._ans("gpt-4o", i, mentioned=(i < 2), sentiment=(0.4 if i == 0 else None))
                   for i in range(4)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=4)
        self.assertAlmostEqual(res.share_of_voice, 0.5)
        self.assertAlmostEqual(res.sov_se, 0.25)
        self.assertAlmostEqual(res.sov_ci95, round(1.96 * 0.25, 4))
        self.assertEqual(res.runs_per_query, 4)
        self.assertEqual(res.total_answers, 4)
        self.assertEqual(res.answers_with_mention, 2)

    def test_sentiment_from_representative_only(self):
        # Alla körningar nämner bolaget men bara run_idx 0 har sentiment satt →
        # snittet ska vara just det värdet, inte utspätt av None-körningar.
        answers = [self._ans("gpt-4o", i, mentioned=True, sentiment=(0.4 if i == 0 else None))
                   for i in range(3)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=3)
        self.assertAlmostEqual(res.sentiment_score, 0.4)

    def test_raw_strips_nonrepresentative_text(self):
        answers = [self._ans("gpt-4o", i, mentioned=True, sentiment=(0.4 if i == 0 else None))
                   for i in range(3)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=3)
        self.assertEqual(len(res.raw_responses), 3)  # alla körningar bevaras för per-motor-SoV
        reps = [r for r in res.raw_responses if r["run_idx"] == 0]
        nonreps = [r for r in res.raw_responses if r["run_idx"] != 0]
        self.assertEqual(len(reps), 1)
        self.assertTrue(reps[0]["answer"])                         # full text behålls
        self.assertTrue(all(r["answer"] == "" for r in nonreps))   # text strippad
        self.assertTrue(all(r["sentiment"] is None for r in nonreps))

    def test_competitor_share_denominator_is_pairs_not_runs(self):
        # Org-NER körs bara på representanten; share ska räknas mot antal (fråga×motor)-par,
        # inte mot alla körningar (annars deflateras andelen med sampling-faktorn).
        answers = [self._ans("gpt-4o", i, mentioned=False, orgs=(["Beta"] if i == 0 else []))
                   for i in range(5)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=5)
        comp = res.category_competitors["affar"]
        self.assertEqual(comp[0]["name"], "Beta")
        self.assertEqual(comp[0]["share"], 1.0)  # 1 par, Beta i det → 1/1, ej 1/5


if __name__ == "__main__":
    unittest.main()
