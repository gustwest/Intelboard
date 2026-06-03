"""Cost-rollup-jobbet: aggregera tokens per modell/kund/jobb-typ → USD.

Den centrala invarianten: USD-summan per jobbtyp ska komma från jobbtypens
EGNA modellnedbrytning, inte från en proportionell gissning. Polling och
risk_detect kör båda Gemini-probarna — utan per-jobb-typ-per-model-spårning
hamnade tidigare hela kostnaden under en enda jobb-typ.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import fakefs  # installerar fake firestore_client


def _run(job_type: str, client_id: str | None, started: datetime, tokens_by_model: dict[str, dict]):
    return {
        "job_type": job_type,
        "client_id": client_id,
        "status": "success",
        "started_at": started,
        "summary": {
            "tokens": {
                "by_model": tokens_by_model,
                "total_input": sum(t["input"] for t in tokens_by_model.values()),
                "total_output": sum(t["output"] for t in tokens_by_model.values()),
                "total_calls": sum(t["calls"] for t in tokens_by_model.values()),
            }
        },
    }


class CostRollupTest(unittest.TestCase):
    def setUp(self):
        # Importera SENARE än fakefs så jobs.cost_rollup binder mot fakefs.
        from jobs import cost_rollup
        self.cost_rollup = cost_rollup

    def test_per_job_type_usd_uses_jobtype_breakdown(self):
        """Två jobb-typer (polling, risk_detect) delar samma probe-modell.
        USD per jobbtyp ska komma från respektive jobs egen modell-bredning,
        inte från total över ALLA jobb. Före fixen blev by_job_type[*].usd = 0."""
        day = datetime(2026, 6, 2, tzinfo=timezone.utc)
        started = day.replace(hour=12)
        runs = {
            "run-1": _run(
                "polling", "acme", started,
                {"gemini-2.5-pro": {"input": 1_000_000, "output": 0, "calls": 1}},
            ),
            "run-2": _run(
                "risk_detect", "acme", started,
                {"gemini-2.5-pro": {"input": 2_000_000, "output": 0, "calls": 2}},
            ),
        }
        fakefs.reset(job_runs=runs)

        with patch.object(self.cost_rollup, "ops_alerts"):  # alerts behövs inte här
            rollup = self.cost_rollup._build_rollup(day.date())

        polling = rollup["by_job_type"]["polling"]
        risk = rollup["by_job_type"]["risk_detect"]
        # gemini-2.5-pro: 1.25 USD per 1M input
        self.assertAlmostEqual(polling["usd"], 1.25, places=4)
        self.assertAlmostEqual(risk["usd"], 2.50, places=4)
        # Per-modell-nedbrytningen ska finnas också (drilldown)
        self.assertEqual(polling["by_model"]["gemini-2.5-pro"]["input"], 1_000_000)
        self.assertEqual(risk["by_model"]["gemini-2.5-pro"]["input"], 2_000_000)
        # Total ska matcha summan över modeller
        self.assertAlmostEqual(rollup["total_usd"], 3.75, places=4)

    def test_per_client_usd_unchanged(self):
        """Sanity: per-kund-aggregaten ska fortfarande stämma efter refactorn."""
        day = datetime(2026, 6, 2, tzinfo=timezone.utc)
        started = day.replace(hour=12)
        runs = {
            "run-a": _run(
                "polling", "acme", started,
                {"gemini-2.5-pro": {"input": 1_000_000, "output": 1_000_000, "calls": 1}},
            ),
            "run-b": _run(
                "polling", "beta", started,
                {"gemini-2.5-flash": {"input": 1_000_000, "output": 1_000_000, "calls": 1}},
            ),
        }
        fakefs.reset(job_runs=runs)

        with patch.object(self.cost_rollup, "ops_alerts"):
            rollup = self.cost_rollup._build_rollup(day.date())

        # Acme: gemini-2.5-pro = 1.25 + 5.00 = 6.25
        # Beta: gemini-2.5-flash = 0.30 + 2.50 = 2.80
        self.assertAlmostEqual(rollup["by_client"]["acme"]["usd"], 6.25, places=4)
        self.assertAlmostEqual(rollup["by_client"]["beta"]["usd"], 2.80, places=4)

    def test_runs_outside_target_day_excluded(self):
        day = datetime(2026, 6, 2, tzinfo=timezone.utc)
        runs = {
            "today": _run(
                "polling", "acme", day.replace(hour=12),
                {"gemini-2.5-pro": {"input": 1_000_000, "output": 0, "calls": 1}},
            ),
            "yesterday": _run(
                "polling", "acme", day - timedelta(days=1),
                {"gemini-2.5-pro": {"input": 9_000_000, "output": 0, "calls": 9}},
            ),
        }
        fakefs.reset(job_runs=runs)

        with patch.object(self.cost_rollup, "ops_alerts"):
            rollup = self.cost_rollup._build_rollup(day.date())

        self.assertEqual(rollup["n_runs"], 1)
        self.assertAlmostEqual(rollup["total_usd"], 1.25, places=4)

    def test_unknown_model_flagged(self):
        day = datetime(2026, 6, 2, tzinfo=timezone.utc)
        runs = {
            "run-x": _run(
                "polling", "acme", day.replace(hour=12),
                {"future-model-2027": {"input": 10_000, "output": 10_000, "calls": 1}},
            ),
        }
        fakefs.reset(job_runs=runs)

        with patch.object(self.cost_rollup, "ops_alerts"):
            rollup = self.cost_rollup._build_rollup(day.date())

        self.assertIn("future-model-2027", rollup["unknown_models"])
        self.assertEqual(rollup["total_usd"], 0.0)


if __name__ == "__main__":
    unittest.main()
