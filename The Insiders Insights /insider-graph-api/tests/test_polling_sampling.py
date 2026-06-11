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


class RunToRunSETest(unittest.TestCase):
    """P1-förfining: prompt-klustrat brusband (run-to-run inom (fråga×motor))."""

    def _ans(self, question, model, mentioned):
        return QuestionAnswer(category="c", question=question, model=model,
                              answer="", mentioned=mentioned)

    def test_deterministic_cells_have_zero_noise(self):
        # En fråga alltid nämnd, en aldrig — ingen flippar → noll run-to-run-brus,
        # även om poolad rate är 0.5 (där naiv binomial skulle ge ett brett band).
        rows = ([self._ans("q1", "m", True) for _ in range(3)]
                + [self._ans("q2", "m", False) for _ in range(3)])
        self.assertEqual(polling._runtorun_se(rows), 0.0)
        self.assertGreater(polling._proportion_se(3, 6), 0.0)  # naiv ≠ 0

    def test_single_cell_matches_binomial(self):
        # Med en enda cell ska klustrad SE = naiv binomial (ingen heterogenitet).
        rows = [self._ans("q1", "m", True), self._ans("q1", "m", False)]
        self.assertAlmostEqual(polling._runtorun_se(rows), polling._proportion_se(1, 2), places=6)

    def test_clustered_is_tighter_than_naive_when_heterogeneous(self):
        # Cell A alltid (p=1, bidrar 0), cell B flippar (p=0.5). Klustrad < naiv.
        rows = ([self._ans("qA", "m", True) for _ in range(2)]
                + [self._ans("qB", "m", True), self._ans("qB", "m", False)])
        clustered = polling._runtorun_se(rows)
        naive = polling._proportion_se(3, 4)
        self.assertAlmostEqual(clustered, 0.1768, places=3)
        self.assertLess(clustered, naive)


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


class ControlQuestionInflationTest(unittest.TestCase):
    """F2: kontrollfrågorna mäts men poolas aldrig in i rubrik-SoV; inflationen rapporteras."""

    def _ans(self, category, mentioned, model="gpt-4o", run_idx=0):
        return QuestionAnswer(category=category, question="Q?", model=model,
                              answer="svar" if run_idx == 0 else "",
                              mentioned=mentioned, run_idx=run_idx)

    def test_control_excluded_from_headline_sov(self):
        # Batteriet: 2/2 nämnda (SoV 1.0). Kontroll: 0/2 nämnda. Rubrik-SoV ska vara 1.0,
        # inte utspätt till 0.5 av kontrollfrågorna.
        answers = [
            self._ans("affar", True), self._ans("finans", True),
            self._ans(polling.CONTROL_CATEGORY, False), self._ans(polling.CONTROL_CATEGORY, False),
        ]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=1)
        self.assertAlmostEqual(res.share_of_voice, 1.0)
        self.assertEqual(res.total_answers, 2)          # bara batteriet
        self.assertEqual(res.answers_with_mention, 2)

    def test_framing_inflation_components(self):
        answers = [
            self._ans("affar", True), self._ans("finans", True),  # framed 2/2 = 1.0
            self._ans(polling.CONTROL_CATEGORY, True), self._ans(polling.CONTROL_CATEGORY, False),  # control 1/2 = 0.5
        ]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=1)
        fi = res.framing_inflation
        self.assertAlmostEqual(fi["framed_sov"], 1.0)
        self.assertAlmostEqual(fi["control_sov"], 0.5)
        self.assertAlmostEqual(fi["delta"], 0.5)
        self.assertEqual(fi["framed_n"], 2)
        self.assertEqual(fi["control_n"], 2)

    def test_control_still_visible_as_category(self):
        answers = [self._ans("affar", True), self._ans(polling.CONTROL_CATEGORY, False)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=1)
        self.assertIn(polling.CONTROL_CATEGORY, res.category_results)

    def test_no_control_questions_yields_zero_denominator(self):
        # Veckor utan kontrollfrågor (t.ex. custom innan omläggning): control_n = 0,
        # inget delta som låtsas vara signal.
        answers = [self._ans("affar", True), self._ans("affar", False)]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=1)
        self.assertEqual(res.framing_inflation["control_n"], 0)

    def test_build_questions_appends_control(self):
        qs = polling._build_questions({"industry": "X", "topic": "Y", "service_area": "Z"})
        cats = {c for c, _ in qs}
        self.assertIn(polling.CONTROL_CATEGORY, cats)
        controls = [q for c, q in qs if c == polling.CONTROL_CATEGORY]
        self.assertEqual(len(controls), len(polling.CONTROL_QUESTIONS))

    def test_build_questions_appends_control_for_custom(self):
        client = {"polling_questions": {"affar": ["Egen fråga om {industry}?"]},
                  "company_name": "Acme", "industry": "fintech"}
        qs = polling._build_questions(client)
        cats = {c for c, _ in qs}
        self.assertIn(polling.CONTROL_CATEGORY, cats)


class MeasurementLanguageTest(unittest.TestCase):
    """F4: sv/en-frågespår per kund; resultat taggas och medeltalas aldrig över språk."""

    def test_default_language_is_sv(self):
        self.assertEqual(polling._measurement_language({}), "sv")
        self.assertEqual(polling._measurement_language({"measurement_language": "de"}), "sv")
        self.assertEqual(polling._measurement_language({"measurement_language": "en"}), "en")

    def test_english_uses_english_templates(self):
        sv = polling._build_questions({"industry": "fintech"})
        en = polling._build_questions({"industry": "fintech", "measurement_language": "en"})
        sv_text = " ".join(t for _, t in sv)
        en_text = " ".join(t for _, t in en)
        self.assertIn("Vilka", sv_text)
        self.assertIn("Which", en_text)
        self.assertNotIn("Vilka", en_text)
        # Samma struktur (kategorier + kontroll), bara annat språk.
        self.assertEqual({c for c, _ in sv}, {c for c, _ in en})

    def test_english_control_questions_neutral(self):
        en = polling._control_questions({"industry": "fintech", "measurement_language": "en"})
        self.assertTrue(all(c == polling.CONTROL_CATEGORY for c, _ in en))
        self.assertTrue(any("Which companies operate" in t for _, t in en))

    def test_fingerprint_differs_by_language(self):
        qs_sv = polling._build_questions({"industry": "x"})
        qs_en = polling._build_questions({"industry": "x", "measurement_language": "en"})
        fp_sv = polling._questions_fingerprint(qs_sv, "sv")
        fp_en = polling._questions_fingerprint(qs_en, "en")
        self.assertNotEqual(fp_sv, fp_en)

    def test_resolve_reports_language(self):
        resolved = polling.resolve_polling_questions({"industry": "x", "measurement_language": "en"})
        self.assertEqual(resolved["language"], "en")


class SourceSplitTest(unittest.TestCase):
    """P2: SoV separeras per knowledge_source (training vs web_rag), aldrig poolat till ETT tal."""

    def _ans(self, model, run_idx, mentioned):
        return QuestionAnswer(category="affar", question="Q?", model=model,
                              answer="x" if run_idx == 0 else "", mentioned=mentioned, run_idx=run_idx)

    def test_training_and_web_rag_kept_separate(self):
        answers = [
            self._ans("gpt-4o", 0, True), self._ans("gpt-4o", 1, False),   # training: 1/2
            self._ans("sonar", 0, True), self._ans("sonar", 1, True),       # web_rag: 2/2
        ]
        res = polling._aggregate("acme", "Acme", answers, {}, runs=2)
        self.assertAlmostEqual(res.sov_by_source["training"]["share_of_voice"], 0.5)
        self.assertAlmostEqual(res.sov_by_source["web_rag"]["share_of_voice"], 1.0)
        self.assertEqual(res.sov_by_source["web_rag"]["engines"], ["sonar"])
        # Det poolade talet finns kvar för trend-kontinuitet (3/4), men ska inte vara headline.
        self.assertAlmostEqual(res.share_of_voice, 0.75)


class TrendSignificanceTest(unittest.TestCase):
    """P1: SoV-förändring grindas mot run-to-run-brus (difference-of-proportions)."""

    def test_large_delta_is_significant(self):
        r = polling.sov_change_significance(0.8, 0.05, 0.2, 0.05)
        self.assertTrue(r["significant"])
        self.assertAlmostEqual(r["delta"], 0.6)

    def test_small_delta_within_noise_is_not(self):
        r = polling.sov_change_significance(0.52, 0.2, 0.48, 0.2)
        self.assertFalse(r["significant"])

    def test_missing_previous_week(self):
        r = polling.sov_change_significance(0.5, 0.1, None, None)
        self.assertFalse(r["significant"])
        self.assertIsNone(r["delta"])

    def test_pre_p0_history_without_se_is_not_significant(self):
        # Historik utan uppmätt SE → kan inte skiljas från brus, ingen falsk pil.
        r = polling.sov_change_significance(0.9, 0.0, 0.1, 0.0)
        self.assertFalse(r["significant"])
        self.assertIsNone(r["z"])


if __name__ == "__main__":
    unittest.main()
