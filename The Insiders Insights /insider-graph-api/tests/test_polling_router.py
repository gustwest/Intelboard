"""Per-motor-aggregeringen i routers/polling.py är ren och kan testas isolerat."""
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client innan routers importeras
from routers.polling import _aggregate_per_engine


class AggregatePerEngineTests(unittest.TestCase):
    def test_empty_input_returns_empty_dict(self):
        self.assertEqual(_aggregate_per_engine([]), {})

    def test_groups_by_model_and_computes_sov_sentiment(self):
        raw = [
            {"model": "gpt-4o", "mentioned": True, "sentiment": 0.6},
            {"model": "gpt-4o", "mentioned": True, "sentiment": 0.4},
            {"model": "gpt-4o", "mentioned": False, "sentiment": None},
            {"model": "gemini", "mentioned": True, "sentiment": -0.2},
            {"model": "gemini", "mentioned": False, "sentiment": None},
        ]
        out = _aggregate_per_engine(raw)
        self.assertAlmostEqual(out["gpt-4o"]["share_of_voice"], 2 / 3)
        self.assertAlmostEqual(out["gpt-4o"]["sentiment_score"], 0.5)
        self.assertEqual(out["gpt-4o"]["answer_count"], 3)
        self.assertEqual(out["gpt-4o"]["mention_count"], 2)
        self.assertAlmostEqual(out["gemini"]["share_of_voice"], 0.5)
        self.assertAlmostEqual(out["gemini"]["sentiment_score"], -0.2)

    def test_missing_model_defaults_to_okand(self):
        out = _aggregate_per_engine([{"mentioned": True, "sentiment": 0.1}])
        self.assertIn("okänd", out)
        self.assertEqual(out["okänd"]["mention_count"], 1)

    def test_sentiment_none_when_no_mentions_with_sentiment(self):
        raw = [
            {"model": "gpt-4o", "mentioned": False, "sentiment": None},
            {"model": "gpt-4o", "mentioned": False, "sentiment": None},
        ]
        out = _aggregate_per_engine(raw)
        self.assertEqual(out["gpt-4o"]["share_of_voice"], 0.0)
        self.assertIsNone(out["gpt-4o"]["sentiment_score"])


if __name__ == "__main__":
    unittest.main()
