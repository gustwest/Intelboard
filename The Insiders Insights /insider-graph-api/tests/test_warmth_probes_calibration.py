"""Tester för probe-kalibrering — N-körningar + variansmått (Fas 2.2a).

Verifierar att:
  * _judge_verdict_calibrated kör domaren N gånger och returnerar median + varians
  * Stabil domare → låg valence_variance; spretig domare → hög
  * valence_variance propageras upp till dimensionsnivå i aggregatet
  * PROBE_RUNS_PER_QUERY-env styr antal körningar (clampas till [1,7])
  * Probe-FRÅGORNA ställs en gång även om domaren körs N gånger (cost-disciplin)
"""
import json
import os
import unittest
from types import SimpleNamespace
from unittest import mock

import fakefs  # installerar fake firestore_client — först!
from schema_org import humanization_config as hc
from services import warmth_probes as wp


class _SequenceJudge:
    """Domar-stub som returnerar en sekvens av valens-värden (en per anrop).
    Låter oss simulera stabil vs spretig domare."""
    def __init__(self, valences):
        self.valences = list(valences)
        self.idx = 0

    def invoke(self, _msgs):
        v = self.valences[self.idx % len(self.valences)]
        self.idx += 1
        return SimpleNamespace(content=json.dumps(
            {"salience": 0.7, "valence": v, "confidence": 0.7}
        ))


class JudgeVerdictCalibratedTest(unittest.TestCase):

    def test_stable_judge_low_variance(self):
        # Domaren ger samma valens varje gång → varians 0
        judge = _SequenceJudge([0.6, 0.6, 0.6])
        v = wp._judge_verdict_calibrated(judge, "Acme", "ethics", ["svar1", "svar2"], runs=3)
        self.assertIsNotNone(v)
        self.assertEqual(v["valence"], 0.6)
        self.assertEqual(v["valence_variance"], 0.0)
        self.assertEqual(v["n_runs"], 3)

    def test_noisy_judge_high_variance(self):
        # Domaren spretar 0.2 / 0.5 / 0.8 → median 0.5, men hög varians
        judge = _SequenceJudge([0.2, 0.5, 0.8])
        v = wp._judge_verdict_calibrated(judge, "Acme", "ethics", ["x"], runs=3)
        self.assertEqual(v["valence"], 0.5)  # median
        self.assertGreater(v["valence_variance"], 0.2)

    def test_median_robust_to_outlier(self):
        # En utliggare bland fyra → median påverkas inte lika mycket som snitt skulle
        judge = _SequenceJudge([0.6, 0.6, 0.6, 0.05])
        v = wp._judge_verdict_calibrated(judge, "Acme", "ethics", ["x"], runs=4)
        # Median av [0.05, 0.6, 0.6, 0.6] = 0.6 (snitt vore ~0.46)
        self.assertEqual(v["valence"], 0.6)

    def test_runs_one_gives_zero_variance(self):
        judge = _SequenceJudge([0.7])
        v = wp._judge_verdict_calibrated(judge, "Acme", "ethics", ["x"], runs=1)
        self.assertEqual(v["valence_variance"], 0.0)
        self.assertEqual(v["n_runs"], 1)

    def test_all_runs_fail_returns_none(self):
        class _DeadJudge:
            def invoke(self, _msgs):
                return SimpleNamespace(content="ingen json här")
        v = wp._judge_verdict_calibrated(_DeadJudge(), "Acme", "ethics", ["x"], runs=3)
        self.assertIsNone(v)


class RunsConfigTest(unittest.TestCase):
    def test_default_is_three(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PROBE_RUNS_PER_QUERY", None)
            self.assertEqual(wp._probe_runs_per_query(), 3)

    def test_env_override(self):
        with mock.patch.dict(os.environ, {"PROBE_RUNS_PER_QUERY": "5"}):
            self.assertEqual(wp._probe_runs_per_query(), 5)

    def test_clamped_to_max(self):
        with mock.patch.dict(os.environ, {"PROBE_RUNS_PER_QUERY": "99"}):
            self.assertEqual(wp._probe_runs_per_query(), 7)

    def test_clamped_to_min(self):
        with mock.patch.dict(os.environ, {"PROBE_RUNS_PER_QUERY": "0"}):
            self.assertEqual(wp._probe_runs_per_query(), 1)

    def test_invalid_falls_back_to_default(self):
        with mock.patch.dict(os.environ, {"PROBE_RUNS_PER_QUERY": "abc"}):
            self.assertEqual(wp._probe_runs_per_query(), 3)


class VariancePropagationTest(unittest.TestCase):
    """valence_variance ska nå dimensionsnivå i aggregatet så 2.2c kan grinda flaggor."""

    def test_dimension_aggregate_carries_variance(self):
        # En motor med run-varians 0.3 → dimensionsnivåns valence_variance ≥ 0.3
        by_engine = {
            "gemini": {"salience": 0.7, "valence": 0.5, "confidence": 0.7, "valence_variance": 0.3},
        }
        agg = wp._aggregate_by_engine(by_engine)
        self.assertIn("valence_variance", agg)
        self.assertGreaterEqual(agg["valence_variance"], 0.3)

    def test_between_engine_spread_counts_as_variance(self):
        # Två motorer som är stabila var för sig (var=0) men oense med varandra
        # → mellan-motor-spread blir mätosäkerheten.
        by_engine = {
            "gemini": {"salience": 0.7, "valence": 0.2, "confidence": 0.7, "valence_variance": 0.0},
            "chatgpt": {"salience": 0.7, "valence": 0.8, "confidence": 0.7, "valence_variance": 0.0},
        }
        agg = wp._aggregate_by_engine(by_engine)
        # pstdev([0.2, 0.8]) = 0.3
        self.assertAlmostEqual(agg["valence_variance"], 0.3, places=2)

    def test_takes_max_of_noise_sources(self):
        # Inom-motor-varians 0.4, mellan-motor-spread liten → max ger 0.4
        by_engine = {
            "gemini": {"salience": 0.7, "valence": 0.5, "confidence": 0.7, "valence_variance": 0.4},
            "chatgpt": {"salience": 0.7, "valence": 0.52, "confidence": 0.7, "valence_variance": 0.0},
        }
        agg = wp._aggregate_by_engine(by_engine)
        self.assertAlmostEqual(agg["valence_variance"], 0.4, places=2)


class CostDisciplineTest(unittest.TestCase):
    """Probe-frågorna ställs EN gång även om domaren körs N gånger (cost-tak)."""

    def test_probe_asked_once_judge_n_times(self):
        class _CountingEngine:
            def __init__(self):
                self.ask_count = 0
            def invoke(self, msgs):
                self.ask_count += 1
                return SimpleNamespace(content="ett svar")

        engine = _CountingEngine()
        judge = _SequenceJudge([0.5, 0.6, 0.5])

        fakefs.reset(
            client={"company_name": "Acme AB", "personas": {"active": ["customer"]}},
            polling_results={},
        )
        with mock.patch.dict(os.environ, {"PROBE_RUNS_PER_QUERY": "3"}):
            wp.run_for_client("acme", engines={"e": engine}, judge=judge)

        # 1 persona × 6 dim × 2 frågor = 12 probe-anrop + canary-suite (3) = 15.
        # INTE 12 × 3 = 36 (domar-körningarna multiplicerar inte probe-anropen).
        self.assertEqual(engine.ask_count, len(hc.DIMENSIONS) * 2 + len(wp.CANARY_QUESTIONS))


if __name__ == "__main__":
    unittest.main()
