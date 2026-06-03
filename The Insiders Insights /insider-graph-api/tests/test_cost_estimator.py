"""Tester för services/cost_estimator.

Verifierar pris-uppslag, hantering av okänd modell, summa-aggregat över en
job_runs.summary.tokens-payload.
"""
from __future__ import annotations

import unittest

from services import cost_estimator


class CostEstimatorTest(unittest.TestCase):
    def test_known_model_returns_usd(self):
        # gemini-2.5-pro: 1.25/M in, 5.00/M ut
        usd = cost_estimator.usd_for("gemini-2.5-pro", 1_000_000, 1_000_000)
        self.assertAlmostEqual(usd, 1.25 + 5.00, places=4)

    def test_zero_tokens_zero_usd(self):
        self.assertEqual(cost_estimator.usd_for("gemini-2.5-pro", 0, 0), 0.0)

    def test_unknown_model_zero_and_warning(self):
        with self.assertLogs("services.cost_estimator", level="WARNING"):
            usd = cost_estimator.usd_for("inte-en-modell", 1000, 1000)
        self.assertEqual(usd, 0.0)

    def test_estimate_summary_aggregates(self):
        summary = {
            "by_model": {
                "gemini-2.5-pro": {"input": 1_000_000, "output": 1_000_000, "calls": 10},
                "claude-sonnet-4-5": {"input": 500_000, "output": 100_000, "calls": 5},
            },
            "total_input": 1_500_000,
            "total_output": 1_100_000,
            "total_calls": 15,
        }
        result = cost_estimator.estimate_summary(summary)
        gemini_usd = 1.25 + 5.00
        claude_usd = 3.0 * 0.5 + 15.0 * 0.1  # 1.5 + 1.5
        self.assertAlmostEqual(result["total_usd"], gemini_usd + claude_usd, places=4)
        self.assertEqual(result["by_model"]["gemini-2.5-pro"]["calls"], 10)
        self.assertEqual(result["unknown_models"], [])

    def test_estimate_flags_unknown_models(self):
        summary = {
            "by_model": {
                "gemini-2.5-pro": {"input": 1_000_000, "output": 0, "calls": 1},
                "future-model-x": {"input": 1000, "output": 1000, "calls": 1},
            },
        }
        result = cost_estimator.estimate_summary(summary)
        self.assertIn("future-model-x", result["unknown_models"])
        self.assertNotIn("gemini-2.5-pro", result["unknown_models"])

    def test_prices_for_ui_has_required_fields(self):
        prices = cost_estimator.prices_for_ui()
        self.assertTrue(len(prices) > 0)
        for p in prices:
            self.assertIn("model_id", p)
            self.assertIn("label", p)
            self.assertIn("vendor", p)
            self.assertIn("input_per_million_usd", p)
            self.assertIn("output_per_million_usd", p)


if __name__ == "__main__":
    unittest.main()
