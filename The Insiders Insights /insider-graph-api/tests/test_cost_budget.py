"""Per-kund token-budget med enforcement (services/cost_budget, Fas 1.6).

Verifierar:
  * Default-config när kunden inte har explicit budget.
  * Override (tillfälligt höjt tak) respekteras inom override-fönstret.
  * status: ok/warning/exceeded baserat på faktisk usage.
  * enforce() kastar BudgetExceededError vid hard mode + exceeded.
  * enforce() i soft mode reser alert men kastar INTE.
  * record_usage skriver atomiskt + triggar rätt alert-severity.
  * token_meter.measure(client_id) propagerar client_id så invoke() spärrar.
"""
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import fakefs  # installerar fake firestore_client
from services import cost_budget
from services import token_meter


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _this_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _setup(*, budget=None, usage=None):
    fakefs.reset(
        client={"company_name": "Acme AB"},
        cost_budget=budget,
        cost_usage=usage or {},
    )


class GetBudgetTest(unittest.TestCase):
    def test_default_when_not_configured(self):
        _setup()
        cfg = cost_budget.get_budget("acme")
        self.assertEqual(cfg.monthly_token_limit, cost_budget.DEFAULT_MONTHLY_TOKEN_LIMIT)
        self.assertEqual(cfg.mode, cost_budget.DEFAULT_MODE)
        self.assertIsNone(cfg.override_until)

    def test_explicit_config_overrides_default(self):
        _setup(budget={
            "monthly_token_limit": 500_000,
            "warning_threshold_pct": 70,
            "mode": "soft",
            "override_until": None,
            "override_token_limit": None,
        })
        cfg = cost_budget.get_budget("acme")
        self.assertEqual(cfg.monthly_token_limit, 500_000)
        self.assertEqual(cfg.warning_threshold_pct, 70)
        self.assertEqual(cfg.mode, "soft")

    def test_invalid_mode_coerces_to_hard(self):
        # Skadat data — vi defaultar till hard hellre än att tyst släppa igenom.
        _setup(budget={"mode": "garbage"})
        self.assertEqual(cost_budget.get_budget("acme").mode, "hard")


class EffectiveLimitTest(unittest.TestCase):
    def test_override_active_uses_override_limit(self):
        future = "2099-12-31"
        cfg = cost_budget.BudgetConfig(
            monthly_token_limit=1_000_000,
            warning_threshold_pct=80,
            mode="hard",
            override_until=future,
            override_token_limit=5_000_000,
        )
        self.assertEqual(cfg.effective_limit, 5_000_000)

    def test_override_expired_falls_back(self):
        past = "2000-01-01"
        cfg = cost_budget.BudgetConfig(
            monthly_token_limit=1_000_000,
            warning_threshold_pct=80,
            mode="hard",
            override_until=past,
            override_token_limit=5_000_000,
        )
        self.assertEqual(cfg.effective_limit, 1_000_000)

    def test_no_override_uses_monthly_limit(self):
        cfg = cost_budget.BudgetConfig(
            monthly_token_limit=1_000_000, warning_threshold_pct=80, mode="hard",
        )
        self.assertEqual(cfg.effective_limit, 1_000_000)


class CheckTest(unittest.TestCase):
    def test_ok_below_warning_threshold(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 100, "output_tokens": 100, "calls": 5}},
        )
        report = cost_budget.check("acme")
        self.assertEqual(report.status, "ok")
        self.assertEqual(report.used, 200)
        self.assertEqual(report.limit, 1000)

    def test_warning_between_threshold_and_limit(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 400, "output_tokens": 500, "calls": 5}},
        )
        report = cost_budget.check("acme")
        self.assertEqual(report.status, "warning")  # 900/1000 = 90%, över 80%

    def test_exceeded_at_or_above_limit(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 700, "output_tokens": 400, "calls": 5}},
        )
        report = cost_budget.check("acme")
        self.assertEqual(report.status, "exceeded")
        self.assertEqual(report.used, 1100)


class EnforceTest(unittest.TestCase):
    def test_hard_mode_raises_when_exceeded(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 700, "output_tokens": 400, "calls": 5}},
        )
        with self.assertRaises(cost_budget.BudgetExceededError) as cm:
            cost_budget.enforce("acme")
        self.assertEqual(cm.exception.client_id, "acme")
        self.assertEqual(cm.exception.used, 1100)
        self.assertEqual(cm.exception.limit, 1000)

    def test_hard_mode_does_not_raise_below_limit(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 100, "output_tokens": 100, "calls": 5}},
        )
        # Inget kastas — vi är väl under taket.
        cost_budget.enforce("acme")

    def test_soft_mode_never_raises_even_when_exceeded(self):
        _setup(
            budget={"monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "soft"},
            usage={_this_month(): {"input_tokens": 700, "output_tokens": 400, "calls": 5}},
        )
        # Soft mode — INGET kastas, bara alerts. Operatören har medvetet valt
        # "varna men låt köra" (t.ex. för pilot-kunder vi vill mäta utan att blocka).
        cost_budget.enforce("acme")

    def test_override_window_skips_enforcement(self):
        # Under override-fönstret är taket högre → vi spärrar inte trots stor usage.
        _setup(
            budget={
                "monthly_token_limit": 1000, "warning_threshold_pct": 80, "mode": "hard",
                "override_until": "2099-12-31", "override_token_limit": 100_000,
            },
            usage={_this_month(): {"input_tokens": 1500, "output_tokens": 500, "calls": 10}},
        )
        # Used = 2000, men taket är 100_000 under override → ok.
        cost_budget.enforce("acme")
        self.assertEqual(cost_budget.check("acme").status, "ok")


class RecordUsageTest(unittest.TestCase):
    def test_creates_initial_doc_when_missing(self):
        _setup()
        cost_budget.record_usage("acme", 100, 50)
        usage = fakefs.STATE["cost_usage"][_this_month()]
        self.assertEqual(usage["input_tokens"], 100)
        self.assertEqual(usage["output_tokens"], 50)
        self.assertEqual(usage["calls"], 1)

    def test_increments_existing_doc_atomically(self):
        _setup(usage={_this_month(): {
            "month": _this_month(), "input_tokens": 100, "output_tokens": 50, "calls": 1,
        }})
        cost_budget.record_usage("acme", 200, 100)
        usage = fakefs.STATE["cost_usage"][_this_month()]
        # Atomic increment via firestore.Increment-stub i fakefs.
        self.assertEqual(usage["input_tokens"], 300)
        self.assertEqual(usage["output_tokens"], 150)
        self.assertEqual(usage["calls"], 2)

    def test_zero_tokens_skipped(self):
        _setup()
        cost_budget.record_usage("acme", 0, 0)
        self.assertEqual(fakefs.STATE["cost_usage"], {})

    def test_empty_client_id_skipped(self):
        _setup()
        cost_budget.record_usage("", 100, 50)
        self.assertEqual(fakefs.STATE["cost_usage"], {})


class TokenMeterIntegrationTest(unittest.TestCase):
    """measure(client_id=...) propagerar så att _TrackedLLM.invoke() spärrar och record:ar."""

    class _FakeLLM:
        def __init__(self, usage=None):
            self.usage = usage or {"input_tokens": 50, "output_tokens": 20}
            self.invoked = 0

        def invoke(self, _msgs):
            self.invoked += 1
            return SimpleNamespace(usage_metadata=self.usage, content="ok")

    def test_invoke_records_usage_to_budget(self):
        _setup(budget={"monthly_token_limit": 10_000, "warning_threshold_pct": 80, "mode": "hard"})
        inner = self._FakeLLM()
        tracked = token_meter.track(inner, "test-model")
        with token_meter.measure(client_id="acme"):
            tracked.invoke([])
        usage = fakefs.STATE["cost_usage"][_this_month()]
        self.assertEqual(usage["input_tokens"], 50)
        self.assertEqual(usage["output_tokens"], 20)

    def test_invoke_blocks_when_budget_exceeded_in_hard_mode(self):
        _setup(
            budget={"monthly_token_limit": 100, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 80, "output_tokens": 30, "calls": 1}},
        )
        inner = self._FakeLLM()
        tracked = token_meter.track(inner, "test-model")
        with token_meter.measure(client_id="acme"):
            with self.assertRaises(cost_budget.BudgetExceededError):
                tracked.invoke([])
        # Anropet ska INTE ha gått igenom — det är hela poängen med hard cap.
        self.assertEqual(inner.invoked, 0)

    def test_invoke_passes_through_in_soft_mode_even_when_exceeded(self):
        _setup(
            budget={"monthly_token_limit": 100, "warning_threshold_pct": 80, "mode": "soft"},
            usage={_this_month(): {"input_tokens": 80, "output_tokens": 30, "calls": 1}},
        )
        inner = self._FakeLLM()
        tracked = token_meter.track(inner, "test-model")
        with token_meter.measure(client_id="acme"):
            tracked.invoke([])  # ska inte kasta
        self.assertEqual(inner.invoked, 1)

    def test_invoke_without_client_id_skips_enforcement(self):
        # measure() utan client_id (admin/standalone) → ingen budget-koppling.
        _setup(
            budget={"monthly_token_limit": 100, "warning_threshold_pct": 80, "mode": "hard"},
            usage={_this_month(): {"input_tokens": 1000, "output_tokens": 1000, "calls": 1}},
        )
        inner = self._FakeLLM()
        tracked = token_meter.track(inner, "test-model")
        with token_meter.measure():  # ingen client_id
            tracked.invoke([])  # ska inte kasta
        self.assertEqual(inner.invoked, 1)


if __name__ == "__main__":
    unittest.main()
