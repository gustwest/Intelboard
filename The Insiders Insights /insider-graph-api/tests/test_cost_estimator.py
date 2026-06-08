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

    def test_sonar_token_rate_corrected(self):
        # Sonar token-rate ska vara $1/$1 per M (inte gamla 0.20/0.80), exkl. request-avgift.
        usd = cost_estimator.usd_for("sonar", 1_000_000, 1_000_000, calls=0)
        self.assertAlmostEqual(usd, 1.00 + 1.00, places=4)

    def test_sonar_per_request_fee_added(self):
        # Sonar har en request-avgift utöver tokens. 200 anrop × $0.005 = $1.00.
        token_only = cost_estimator.usd_for("sonar", 1_000_000, 1_000_000, calls=0)
        with_requests = cost_estimator.usd_for("sonar", 1_000_000, 1_000_000, calls=200)
        self.assertAlmostEqual(with_requests - token_only, 200 * 0.005, places=6)

    def test_token_only_model_ignores_calls(self):
        # Gemini har ingen per-request-avgift → calls påverkar inte kostnaden.
        a = cost_estimator.usd_for("gemini-2.5-pro", 1000, 1000, calls=0)
        b = cost_estimator.usd_for("gemini-2.5-pro", 1000, 1000, calls=999)
        self.assertEqual(a, b)

    def test_estimate_summary_includes_request_fee(self):
        # estimate_summary ska räkna in Sonars request-avgift via calls.
        summary = {
            "by_model": {
                "sonar": {"input": 0, "output": 0, "calls": 100},
            },
        }
        result = cost_estimator.estimate_summary(summary)
        # 100 requests × $0.005 = $0.50, inga tokens
        self.assertAlmostEqual(result["total_usd"], 0.50, places=4)
        self.assertAlmostEqual(result["by_model"]["sonar"]["usd"], 0.50, places=4)
        # En modell med bara request-avgift (0 tokens) ska INTE flaggas som okänd.
        self.assertEqual(result["unknown_models"], [])

    def test_grounded_inherits_base_token_price_plus_search_fee(self):
        # "<modell>-grounded" ärver basmodellens token-pris och får en web-sök-avgift
        # per anrop. claude-sonnet-4-6: $3/$15 + $0.010/anrop (anthropic-grounding).
        base = cost_estimator.usd_for("claude-sonnet-4-6", 1_000_000, 1_000_000, calls=10)
        grounded = cost_estimator.usd_for("claude-sonnet-4-6-grounded", 1_000_000, 1_000_000, calls=10)
        self.assertAlmostEqual(grounded - base, 10 * 0.010, places=6)

    def test_grounded_search_fee_varies_by_vendor(self):
        # OpenAI $0.025, Google $0.035, Anthropic $0.010 per anrop (utöver tokens).
        for mid, fee in [
            ("gpt-4.1-grounded", 0.025),
            ("gemini-2.5-pro-grounded", 0.035),
            ("claude-sonnet-4-6-grounded", 0.010),
        ]:
            token_only = cost_estimator.usd_for(mid, 1000, 1000, calls=0)
            with_calls = cost_estimator.usd_for(mid, 1000, 1000, calls=100)
            self.assertAlmostEqual(with_calls - token_only, 100 * fee, places=6, msg=mid)

    def test_grounded_is_priced_not_unknown(self):
        # Grounded-nycklar är prissatta (via fallback) → flaggas INTE som okänd modell.
        self.assertTrue(cost_estimator.is_priced("gpt-4.1-grounded"))
        summary = {"by_model": {"gpt-4.1-grounded": {"input": 1000, "output": 1000, "calls": 1}}}
        result = cost_estimator.estimate_summary(summary)
        self.assertEqual(result["unknown_models"], [])
        self.assertGreater(result["by_model"]["gpt-4.1-grounded"]["usd"], 0)

    def test_grounded_unknown_base_still_zero(self):
        # En grounded-variant av en modell vi inte prissätter förblir $0.
        with self.assertLogs("services.cost_estimator", level="WARNING"):
            usd = cost_estimator.usd_for("inte-en-modell-grounded", 1000, 1000, calls=5)
        self.assertEqual(usd, 0.0)
        self.assertFalse(cost_estimator.is_priced("inte-en-modell-grounded"))

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
