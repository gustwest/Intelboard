"""Tester för per-engine-baselines (Fas 2.2): EWMA-modulen + kalibreringen i
compute_trust_gap (contradiction-spread + credibility_gap centreras mot panel)."""
import unittest

import fakefs  # installerar fake firestore_client — först
from jobs import compute_trust_gap as ctg
from schema_org import humanization_config as hc
from services import engine_baselines as eb


def _dims(by_engine_per_dim):
    """Bygg en dimensions-map: {dim: {"by_engine": {engine: {valence, salience}}}}."""
    return {d: {"by_engine": be} for d, be in by_engine_per_dim.items()}


class BaselineModuleTest(unittest.TestCase):
    def test_load_empty_when_unset(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        self.assertEqual(eb.load("acme"), {})
        self.assertEqual(eb.biases({}), {})

    def test_first_observation_seeds_mean(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        dims = _dims({
            "ethics": {"gpt": {"valence": 0.8, "salience": 0.7}, "gemini": {"valence": 0.5, "salience": 0.7}},
            "inclusion": {"gpt": {"valence": 0.7, "salience": 0.7}, "gemini": {"valence": 0.4, "salience": 0.7}},
        })
        doc = eb.update_from_dimensions("acme", dims)
        # gpt-snitt = 0.75, gemini-snitt = 0.45, panel = 0.6
        self.assertAlmostEqual(doc["engines"]["gpt"]["valence_mean"], 0.75, places=3)
        self.assertAlmostEqual(doc["engines"]["gemini"]["valence_mean"], 0.45, places=3)
        self.assertAlmostEqual(doc["panel_valence_mean"], 0.6, places=3)
        self.assertEqual(doc["engines"]["gpt"]["n_updates"], 1)

    def test_ewma_blends_subsequent_runs(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        d1 = _dims({"a": {"gpt": {"valence": 0.8, "salience": 0.7}},
                    "b": {"gpt": {"valence": 0.8, "salience": 0.7}}})
        eb.update_from_dimensions("acme", d1)  # mean = 0.8
        d2 = _dims({"a": {"gpt": {"valence": 0.4, "salience": 0.7}},
                    "b": {"gpt": {"valence": 0.4, "salience": 0.7}}})
        doc = eb.update_from_dimensions("acme", d2)  # EWMA: 0.35*0.4 + 0.65*0.8 = 0.66
        self.assertAlmostEqual(doc["engines"]["gpt"]["valence_mean"], 0.66, places=3)
        self.assertEqual(doc["engines"]["gpt"]["n_updates"], 2)

    def test_below_min_dims_is_not_observed(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        # Bara EN kvalificerad dimension för gpt → ingen observation (MIN_DIMS_FOR_OBS=2).
        dims = _dims({"a": {"gpt": {"valence": 0.8, "salience": 0.7}}})
        doc = eb.update_from_dimensions("acme", dims)
        self.assertEqual(doc.get("engines", {}), {})

    def test_low_salience_excluded_from_observation(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        floor = hc.SALIENCE_FLOOR
        dims = _dims({
            "a": {"gpt": {"valence": 0.9, "salience": floor - 0.01}},
            "b": {"gpt": {"valence": 0.9, "salience": floor - 0.01}},
        })
        doc = eb.update_from_dimensions("acme", dims)
        self.assertEqual(doc.get("engines", {}), {})

    def test_biases_gated_until_min_updates(self):
        # 1 uppdatering → ingen bias emitteras (MIN_UPDATES_FOR_BIAS=2).
        baselines_1 = {"engines": {"gpt": {"valence_mean": 0.75, "n_updates": 1}}, "panel_valence_mean": 0.6}
        self.assertEqual(eb.biases(baselines_1), {})
        # 2 uppdateringar → bias = mean - panel.
        baselines_2 = {
            "engines": {"gpt": {"valence_mean": 0.75, "n_updates": 2},
                        "gemini": {"valence_mean": 0.45, "n_updates": 2}},
            "panel_valence_mean": 0.6,
        }
        b = eb.biases(baselines_2)
        self.assertAlmostEqual(b["gpt"], 0.15, places=3)
        self.assertAlmostEqual(b["gemini"], -0.15, places=3)


def _seed(claims, perceived, baseline):
    """fakefs med både warmth-latest (perceived) och engine-baselines-doc."""
    polling = {hc.WARMTH_PROBE_DOC: {"dimensions": perceived}}
    if baseline is not None:
        polling[eb.ENGINE_BASELINE_DOC] = baseline
    fakefs.reset(client={"company_name": "Acme AB"}, claims=claims, polling_results=polling)


_BASELINE = {
    "engines": {"gpt": {"valence_mean": 0.75, "n_updates": 3},
                "gemini": {"valence_mean": 0.45, "n_updates": 3}},
    "panel_valence_mean": 0.6,
}


class ContradictionCalibrationTest(unittest.TestCase):
    def _perceived(self):
        # Rå spread 0.8 − 0.5 = 0.3 ≥ CONTRADICTION_SPREAD_MIN → skulle larma rått.
        return {"ethics": {
            "salience": 0.8, "valence": 0.65, "confidence": 0.8,
            "by_engine": {
                "gpt": {"valence": 0.8, "salience": 0.8},
                "gemini": {"valence": 0.5, "salience": 0.8},
            },
        }}

    def test_raw_spread_flags_contradiction_without_baseline(self):
        _seed({}, self._perceived(), baseline=None)
        flags = ctg.compute("acme")["flags"]
        self.assertTrue(any(f["kind"] == "contradiction" for f in flags))

    def test_baseline_centering_removes_false_contradiction(self):
        # bias gpt=+0.15, gemini=−0.15 → kalibrerat 0.65 vs 0.65 → spread 0 → inget larm.
        _seed({}, self._perceived(), baseline=_BASELINE)
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "contradiction" for f in flags))


class CredibilityGapCalibrationTest(unittest.TestCase):
    def test_single_lenient_engine_is_centered(self):
        # Bara gpt (rosig, bias +0.15) ser bolaget. Rå valens 0.8 → kalibrerad 0.65.
        perceived = {"ethics": {
            "salience": 0.8, "valence": 0.8, "confidence": 0.8,
            "by_engine": {"gpt": {"valence": 0.8, "salience": 0.8}},
        }}
        _seed({}, perceived, baseline=_BASELINE)
        dim = ctg.compute("acme")["dimensions"]["ethics"]
        self.assertEqual(dim["perceived"]["valence_calibrated"], 0.65)
        # credibility_gap = kalibrerad valens − evidens (evidens = 0 utan claims).
        self.assertEqual(dim["credibility_gap"], 0.65)

    def test_no_calibration_field_when_unchanged(self):
        perceived = {"ethics": {
            "salience": 0.8, "valence": 0.8, "confidence": 0.8,
            "by_engine": {"gpt": {"valence": 0.8, "salience": 0.8}},
        }}
        _seed({}, perceived, baseline=None)
        dim = ctg.compute("acme")["dimensions"]["ethics"]
        self.assertNotIn("valence_calibrated", dim["perceived"])
        self.assertEqual(dim["credibility_gap"], 0.8)


class BaselineLanguageIsolationTest(unittest.TestCase):
    """F4b: sv och en baselines lagras i skilda dokument och blandas aldrig."""

    def test_sv_and_en_baselines_independent(self):
        fakefs.reset(client={"company_name": "Acme AB"}, polling_results={})
        # MIN_DIMS_FOR_OBS=2 → ge gpt valens på två dimensioner i varje körning.
        sv = _dims({"ethics": {"gpt": {"valence": 0.9, "salience": 0.7}},
                    "inclusion": {"gpt": {"valence": 0.9, "salience": 0.7}}})
        en = _dims({"ethics": {"gpt": {"valence": 0.2, "salience": 0.7}},
                    "inclusion": {"gpt": {"valence": 0.2, "salience": 0.7}}})
        eb.update_from_dimensions("acme", sv, "sv")
        eb.update_from_dimensions("acme", en, "en")
        self.assertAlmostEqual(eb.load("acme", "sv")["engines"]["gpt"]["valence_mean"], 0.9, places=3)
        self.assertAlmostEqual(eb.load("acme", "en")["engines"]["gpt"]["valence_mean"], 0.2, places=3)
        # Default-load (sv) ser inte den engelska baslinjen.
        self.assertAlmostEqual(eb.load("acme")["engines"]["gpt"]["valence_mean"], 0.9, places=3)

    def test_english_client_reads_english_warmth_and_baseline(self):
        # compute() för en en-kund läser det engelska warmth- + baseline-dokumentet.
        fakefs.reset(
            client={"company_name": "Acme AB", "measurement_language": "en"},
            claims={},
            polling_results={
                f"{hc.WARMTH_PROBE_DOC}-en": {"dimensions": {"ethics": {
                    "salience": 0.8, "valence": 0.8, "confidence": 0.8,
                    "by_engine": {"gpt": {"valence": 0.8, "salience": 0.8}},
                }}},
                f"{eb.ENGINE_BASELINE_DOC}-en": _BASELINE,
            },
        )
        dim = ctg.compute("acme")["dimensions"]["ethics"]
        # Engelsk baseline (gpt bias +0.15) appliceras → kalibrerad 0.65.
        self.assertEqual(dim["perceived"]["valence_calibrated"], 0.65)


if __name__ == "__main__":
    unittest.main()
