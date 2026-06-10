"""Parity Index v2 i polling-aggregatet (Fas 1+2, docs/parity-index-spec.md).

Verifierar: sannolikhetsvägd porträtterad paritet ur AI-nämnda namn (riktig
SCB-data), Wilson-grindning, baseline→gap, alias-kontinuitet för parity_index,
öppen person-NER-parsning, och DPA-regressionsskyddet att personnamn aldrig
följer med i det som persisteras.
"""
import unittest

from services import polling
from services.polling import QuestionAnswer


def _qa(persons=None, run_idx=0, mentioned=True, answer="Ett tillräckligt långt svar."):
    return QuestionAnswer(
        category="affar", question="Q?", model="m1", answer=answer,
        mentioned=mentioned, persons_mentioned=persons or [], run_idx=run_idx,
    )


class AggregateParityTest(unittest.TestCase):
    def test_portrayed_parity_probability_weighted(self):
        answers = [_qa(persons=["Anna Svensson", "Erik Berg", "Karl Holm", "Lars Ek"])]
        res = polling._aggregate("acme", "Acme", answers, None, runs=1)
        # 1 nästan-säker kvinna av 4 → ~0.25, sannolikhetsvägt
        self.assertAlmostEqual(res.parity_portrayed, 0.25, delta=0.01)
        self.assertEqual(res.parity_n, 4)
        self.assertEqual(res.parity_unknown_share, 0.0)
        # Alias: parity_index = parity_portrayed (trend-kontinuitet)
        self.assertEqual(res.parity_index, res.parity_portrayed)

    def test_no_persons_gives_none_not_zero(self):
        res = polling._aggregate("acme", "Acme", [_qa(persons=[])], None, runs=1)
        self.assertIsNone(res.parity_portrayed)
        self.assertIsNone(res.parity_ci95)
        self.assertIsNone(res.parity_gap)

    def test_unknown_names_tracked_not_guessed(self):
        answers = [_qa(persons=["Anna Svensson", "Xqzylophant Q"])]
        res = polling._aggregate("acme", "Acme", answers, None, runs=1)
        self.assertEqual(res.parity_n, 1)
        self.assertAlmostEqual(res.parity_unknown_share, 0.5)

    def test_wilson_ci_wide_for_small_n(self):
        answers = [_qa(persons=["Anna Svensson", "Erik Berg"])]
        res = polling._aggregate("acme", "Acme", answers, None, runs=1)
        lo, hi = res.parity_ci95
        # n=2 → intervallet ska vara MYCKET brett (grindar trendpilar i UI)
        self.assertGreater(hi - lo, 0.5)

    def test_baseline_snapshot_and_gap(self):
        baseline = {"value": 0.45, "source": "Årsredovisning 2025", "as_of": "2026-01-01"}
        answers = [_qa(persons=["Anna Svensson", "Erik Berg", "Karl Holm", "Lars Ek"])]
        res = polling._aggregate("acme", "Acme", answers, baseline, runs=1)
        self.assertEqual(res.parity_baseline, baseline)
        # gap = portrayed (≈0.25) − baseline (0.45) ≈ −0.20: AI underrepresenterar kvinnor
        self.assertAlmostEqual(res.parity_gap, -0.20, delta=0.01)

    def test_invalid_baseline_ignored(self):
        for bad in (None, {}, {"value": "hälften"}, {"value": 1.7}, "0.4"):
            res = polling._aggregate("acme", "Acme", [_qa(persons=["Anna B"])], bad, runs=1)
            self.assertIsNone(res.parity_gap, f"baseline {bad!r} skulle ignorerats")

    def test_only_rep_answers_counted(self):
        answers = [
            _qa(persons=["Anna Svensson"], run_idx=0),
            _qa(persons=["Erik Berg"], run_idx=1),  # extra sampling-körning — ingår ej
        ]
        res = polling._aggregate("acme", "Acme", answers, None, runs=2)
        self.assertEqual(res.parity_n, 1)
        self.assertGreater(res.parity_portrayed, 0.99)

    def test_raw_responses_never_carry_person_names(self):
        # DPA-regressionsskydd (§6.2/§7.2): det persisterade dokumentets struktur
        # får inte bära extraherade personnamn.
        answers = [_qa(persons=["Gunborg Testperson"])]
        res = polling._aggregate("acme", "Acme", answers, None, runs=1)
        for row in res.raw_responses:
            self.assertNotIn("persons_mentioned", row)
        self.assertNotIn("Gunborg", repr(res.raw_responses))


class ExtractPersonsTest(unittest.TestCase):
    class _FakeLLM:
        def __init__(self, content):
            self._content = content

        def invoke(self, prompt):
            class R:  # minimal respons med .content
                pass
            r = R()
            r.content = self._content
            return r

    def test_parses_persons_json(self):
        llm = self._FakeLLM('{"persons": ["Anna Svensson", " Erik Berg "]}')
        out = polling._extract_persons(llm, "Ett svar som nämner Anna Svensson och Erik Berg.")
        self.assertEqual(out, ["Anna Svensson", "Erik Berg"])

    def test_short_text_skipped_without_llm_call(self):
        class Boom:
            def invoke(self, prompt):
                raise AssertionError("ska inte anropas för kort text")
        self.assertEqual(polling._extract_persons(Boom(), "kort"), [])

    def test_garbage_output_gives_empty(self):
        llm = self._FakeLLM("inget json här alls, bara prosa")
        self.assertEqual(polling._extract_persons(llm, "Ett tillräckligt långt svar att tolka."), [])

    def test_capped_at_25(self):
        many = ", ".join(f'"Person {i}"' for i in range(40))
        llm = self._FakeLLM(f'{{"persons": [{many}]}}')
        out = polling._extract_persons(llm, "Ett tillräckligt långt svar att tolka.")
        self.assertEqual(len(out), 25)


class WilsonTest(unittest.TestCase):
    def test_none_for_missing(self):
        self.assertIsNone(polling._wilson_ci95(None, 5))
        self.assertIsNone(polling._wilson_ci95(0.5, 0))

    def test_bounded_and_narrowing(self):
        lo_s, hi_s = polling._wilson_ci95(0.5, 4)
        lo_l, hi_l = polling._wilson_ci95(0.5, 400)
        self.assertGreaterEqual(lo_s, 0.0)
        self.assertLessEqual(hi_s, 1.0)
        self.assertLess(hi_l - lo_l, hi_s - lo_s)  # mer data → smalare intervall

    def test_extreme_p_stays_in_bounds(self):
        lo, hi = polling._wilson_ci95(1.0, 3)
        self.assertLessEqual(hi, 1.0)
        self.assertGreater(lo, 0.3)  # Wilson drar bort från 1.0 vid litet n


if __name__ == "__main__":
    unittest.main()
