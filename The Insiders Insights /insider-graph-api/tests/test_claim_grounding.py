"""Enhetstester för den deterministiska källgrinden (services/claim_grounding.py)."""
import unittest

from services import claim_grounding as cg

SOURCE = "Acme AB lanserade en plattform 2023 och minskade utsläppen med 40% under året."


class VerifyTest(unittest.TestCase):
    def test_grounded_claim_passes(self):
        ok, reason = cg.verify("Acme AB lanserade en plattform 2023", "lanserade en plattform 2023", SOURCE)
        self.assertTrue(ok, reason)

    def test_quote_not_in_source_fails(self):
        ok, reason = cg.verify("Acme AB vann pris 2023", "vann pris för bästa plattform", SOURCE)
        self.assertFalse(ok)
        self.assertIn("spann", reason)

    def test_missing_quote_fails(self):
        ok, reason = cg.verify("Acme AB lanserade en plattform", "", SOURCE)
        self.assertFalse(ok)
        self.assertIn("källspann", reason)

    def test_too_short_quote_fails(self):
        ok, _ = cg.verify("Acme AB", "Acme", SOURCE)
        self.assertFalse(ok)

    def test_hallucinated_number_fails(self):
        # 2024 finns inte i källan.
        ok, reason = cg.verify("Acme AB lanserade en plattform 2024", "lanserade en plattform 2023", SOURCE)
        self.assertFalse(ok)
        self.assertIn("2024", reason)

    def test_grounded_number_passes(self):
        ok, reason = cg.verify("Acme AB minskade utsläppen med 40%", "minskade utsläppen med 40%", SOURCE)
        self.assertTrue(ok, reason)

    def test_normalization_tolerates_punctuation_and_case(self):
        # Citat med annan skiftläge/skiljetecken matchar ändå mot källan.
        ok, _ = cg.verify("Acme AB lanserade en plattform 2023", "Lanserade  en plattform, 2023", SOURCE)
        self.assertTrue(ok)


class NumberExtractionTest(unittest.TestCase):
    def test_numbers_parsed(self):
        nums = cg._numbers("Scope 1 var 1 200 ton, lönegapet 3,5% och målet 2030.")
        self.assertIn("1200", nums)   # tusentalsavgränsare borttagen
        self.assertIn("3.5", nums)    # komma-decimal → punkt
        self.assertIn("2030", nums)


if __name__ == "__main__":
    unittest.main()
