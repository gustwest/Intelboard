"""F2-tester: summering av synlighetsinflation över flera veckor (services/sov_inflation).

Verifierar underlagsgrinden (<4 veckor → "samlar data"), medelvärdesfönstret, nivå-
klassningen och no_inflation-fallet när neutrala kontrollfrågor är minst lika starka."""
import unittest

from services import sov_inflation


def _week(week_id, framed, control, framed_n=6, control_n=3):
    return {
        "week_id": week_id,
        "framing_inflation": {
            "framed_sov": framed, "control_sov": control,
            "delta": round(framed - control, 4),
            "framed_n": framed_n, "control_n": control_n,
        },
    }


class CollectingGateTest(unittest.TestCase):
    def test_no_weeks(self):
        out = sov_inflation.summarize([])
        self.assertEqual(out["status"], "collecting")
        self.assertEqual(out["weeks_with_control"], 0)

    def test_below_min_weeks(self):
        weeks = [_week(f"2026-W0{i}", 0.6, 0.3) for i in range(1, 4)]  # 3 < 4
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["status"], "collecting")
        self.assertEqual(out["weeks_with_control"], 3)
        self.assertIn("3/4", out["insight"])

    def test_weeks_without_control_dont_count(self):
        # En vecka utan framing_inflation (före omläggningen) och en med control_n=0
        # räknas inte mot underlaget.
        weeks = [
            {"week_id": "2026-W01"},                                  # ingen framing_inflation
            _week("2026-W02", 0.6, 0.0, control_n=0),                 # control inte mätt
        ] + [_week(f"2026-W0{i}", 0.6, 0.3) for i in range(3, 5)]     # 2 användbara
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["status"], "collecting")
        self.assertEqual(out["weeks_with_control"], 2)


class ReadySummaryTest(unittest.TestCase):
    def test_moderate_inflation(self):
        # 4 veckor, batteri 0.60 vs kontroll 0.50 → 10 pp → moderate.
        weeks = [_week(f"2026-W0{i}", 0.60, 0.50) for i in range(1, 5)]
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["status"], "ready")
        self.assertEqual(out["level"], "moderate")
        self.assertAlmostEqual(out["delta_pp"], 10.0)
        self.assertEqual(out["weeks_averaged"], 4)
        self.assertIn("procentenheter", out["insight"])

    def test_high_inflation(self):
        weeks = [_week(f"2026-W0{i}", 0.70, 0.30) for i in range(1, 6)]  # 40 pp
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["level"], "high")
        self.assertIn("kraftigt", out["insight"])

    def test_no_inflation_when_control_matches(self):
        # Kontroll lika stark som batteriet → no_inflation.
        weeks = [_week(f"2026-W0{i}", 0.50, 0.52) for i in range(1, 5)]
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["status"], "no_inflation")
        self.assertEqual(out["level"], "none")
        self.assertIn("Inget tecken", out["insight"])

    def test_window_caps_at_recent_weeks(self):
        # 10 veckor; fönstret ska bara medelvärdesbilda de senaste WINDOW.
        weeks = [_week(f"2026-W{i:02d}", 0.60, 0.40) for i in range(1, 11)]
        out = sov_inflation.summarize(weeks)
        self.assertEqual(out["weeks_with_control"], 10)
        self.assertEqual(out["weeks_averaged"], sov_inflation.WINDOW)


if __name__ == "__main__":
    unittest.main()
