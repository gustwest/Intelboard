"""Enhetstester för den tidsstyrda avklingningen (services/confidence_scorer.py)."""
import unittest
from datetime import datetime, timedelta, timezone

from services import confidence_scorer as cs

NOW = datetime(2026, 5, 26, tzinfo=timezone.utc)


def _months_ago(months: float) -> datetime:
    return NOW - timedelta(days=months * 30.4375)


class DecayWeightTest(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual(cs.decay_weight(_months_ago(1), NOW), 1.0)   # 0–6
        self.assertEqual(cs.decay_weight(_months_ago(5.9), NOW), 1.0)
        self.assertEqual(cs.decay_weight(_months_ago(8), NOW), 0.7)   # 6–12
        self.assertEqual(cs.decay_weight(_months_ago(18), NOW), 0.4)  # 12–24
        self.assertEqual(cs.decay_weight(_months_ago(30), NOW), 0.0)  # sunset

    def test_boundaries_are_lower_inclusive(self):
        # exakt 6 mån → ur första bucketen, ned till 0.7
        self.assertEqual(cs.decay_weight(_months_ago(6), NOW), 0.7)
        self.assertEqual(cs.decay_weight(_months_ago(12), NOW), 0.4)
        self.assertEqual(cs.decay_weight(_months_ago(24), NOW), 0.0)

    def test_future_close_is_full_weight(self):
        # negativ ålder klampas till 0 mån → 1.0 (robusthet mot klock-skew)
        self.assertEqual(cs.decay_weight(NOW + timedelta(days=5), NOW), 1.0)

    def test_accepts_iso_string_and_naive_datetime(self):
        iso = _months_ago(8).isoformat()
        self.assertEqual(cs.decay_weight(iso, NOW), 0.7)
        naive = _months_ago(8).replace(tzinfo=None)  # antas UTC
        self.assertEqual(cs.decay_weight(naive, NOW), 0.7)

    def test_is_sunset(self):
        self.assertFalse(cs.is_sunset(_months_ago(23), NOW))
        self.assertTrue(cs.is_sunset(_months_ago(24), NOW))
        self.assertTrue(cs.is_sunset(_months_ago(40), NOW))


class SkillConfidenceTest(unittest.TestCase):
    def test_active_is_full(self):
        self.assertEqual(cs.skill_confidence(None, now=NOW), 1.0)

    def test_closed_decays_without_dual_source(self):
        self.assertEqual(cs.skill_confidence(_months_ago(8), now=NOW), 0.7)

    def test_dual_source_rescues_to_full(self):
        # även en stängd/sunsetad kompetens lyfts till 1.0 om LinkedIn re-verifierar
        self.assertEqual(cs.skill_confidence(_months_ago(8), dual_source=True, now=NOW), 1.0)
        self.assertEqual(cs.skill_confidence(_months_ago(40), dual_source=True, now=NOW), 1.0)


if __name__ == "__main__":
    unittest.main()
