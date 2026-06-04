"""Tester för canary-suite + drift-detection (Fas 2.2b)."""
import json
import unittest
from types import SimpleNamespace

import fakefs  # installerar fake firestore_client — först!
from schema_org import humanization_config as hc
from services import warmth_probes as wp


class TokenOverlapTest(unittest.TestCase):
    def test_identical_strings_full_overlap(self):
        self.assertEqual(wp._token_overlap("Sverige Stockholm", "Sverige Stockholm"), 1.0)

    def test_both_empty_full_overlap(self):
        self.assertEqual(wp._token_overlap("", ""), 1.0)

    def test_one_empty_zero_overlap(self):
        self.assertEqual(wp._token_overlap("Sverige", ""), 0.0)

    def test_disjoint_zero_overlap(self):
        self.assertEqual(wp._token_overlap("Sverige Stockholm", "Norge Oslo"), 0.0)

    def test_partial_overlap(self):
        # {sverige, stockholm} vs {sverige, göteborg} → 1 gemensam / 3 unika = 0.33
        ov = wp._token_overlap("Sverige Stockholm", "Sverige Göteborg")
        self.assertAlmostEqual(ov, 1 / 3, places=2)

    def test_ignores_short_words_and_case(self):
        # "är" och "i" (≤2 tecken) ignoreras; case spelar ingen roll
        ov = wp._token_overlap("Bolaget är i Sverige", "bolaget SVERIGE")
        self.assertEqual(ov, 1.0)  # {bolaget, sverige} == {bolaget, sverige}


class DetectCanaryDriftTest(unittest.TestCase):
    def test_no_prior_no_drift(self):
        # Första körningen — ingen baslinje, ingen motor flaggas
        current = {"gemini": ["Sverige", "IT", "privat"]}
        self.assertEqual(wp._detect_canary_drift(current, {}), [])

    def test_stable_answers_no_drift(self):
        current = {"gemini": ["Sverige", "IT-bransch", "privat"]}
        prior = {"gemini": ["Sverige", "IT-bransch", "privat"]}
        self.assertEqual(wp._detect_canary_drift(current, prior), [])

    def test_changed_answer_flags_drift(self):
        # HQ-svaret bytte helt från Sverige till Norge → drift
        current = {"gemini": ["Norge Oslo", "IT-bransch", "privat"]}
        prior = {"gemini": ["Sverige Stockholm", "IT-bransch", "privat"]}
        self.assertEqual(wp._detect_canary_drift(current, prior), ["gemini"])

    def test_only_drifted_engine_flagged(self):
        current = {
            "gemini": ["Sverige", "IT", "privat"],        # stabil
            "chatgpt": ["Tyskland", "bil", "börsnoterat"],  # allt ändrat
        }
        prior = {
            "gemini": ["Sverige", "IT", "privat"],
            "chatgpt": ["Sverige", "IT", "privat"],
        }
        self.assertEqual(wp._detect_canary_drift(current, prior), ["chatgpt"])

    def test_new_engine_without_baseline_not_flagged(self):
        # Motor som inte fanns i förra körningen → ingen baslinje → ej flaggad
        current = {"gemini": ["Sverige"], "mistral": ["helt ny motor"]}
        prior = {"gemini": ["Sverige"]}
        self.assertEqual(wp._detect_canary_drift(current, prior), [])


class _Engine:
    def __init__(self, text):
        self.text = text
    def invoke(self, _msgs):
        return SimpleNamespace(content=self.text)


class _Judge:
    def invoke(self, _msgs):
        return SimpleNamespace(content=json.dumps({"salience": 0.6, "valence": 0.6, "confidence": 0.6}))


class RunIntegrationTest(unittest.TestCase):
    def test_canaries_stored_in_measurement(self):
        fakefs.reset(client={"company_name": "Acme AB", "personas": {"active": ["customer"]}},
                     polling_results={})
        doc = wp.run_for_client("acme", engines={"gemini": _Engine("Sverige")}, judge=_Judge())
        meas = doc["measurement"]
        self.assertIn("canaries", meas)
        self.assertEqual(len(meas["canaries"]["gemini"]), len(wp.CANARY_QUESTIONS))
        # Första körningen → ingen drift (ingen baslinje)
        self.assertFalse(meas["drift_suspected"])
        self.assertEqual(meas["drift_engines"], [])
        # anchors-alias finns kvar (bakåtkompat)
        self.assertIn("anchors", meas)

    def test_second_run_detects_drift(self):
        # Första körningen sätter baslinje. Andra körningen med annat svar → drift.
        fakefs.reset(client={"company_name": "Acme AB", "personas": {"active": ["customer"]}},
                     polling_results={})
        wp.run_for_client("acme", engines={"gemini": _Engine("Sverige Stockholm IT privat")}, judge=_Judge())
        # Andra körningen — motorn svarar helt annorlunda
        doc2 = wp.run_for_client("acme", engines={"gemini": _Engine("Tyskland Berlin bil börsnoterat")}, judge=_Judge())
        self.assertTrue(doc2["measurement"]["drift_suspected"])
        self.assertIn("gemini", doc2["measurement"]["drift_engines"])


if __name__ == "__main__":
    unittest.main()
