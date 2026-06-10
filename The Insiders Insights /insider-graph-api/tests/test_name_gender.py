"""Tester för services.name_gender — namn→kön-estimering ur SCB-data (Parity Fas 0).

Kör mot den riktiga buntade datafilen (data/scb_fornamn_2022.csv.gz): den ÄR
produktionsberoendet och ska finnas i imagen, så testerna verifierar samtidigt
att filen följer med och parsas.
"""
import unittest

from services import name_gender


class EstimateTest(unittest.TestCase):
    def test_clearly_female(self):
        p = name_gender.estimate("Anna")
        self.assertIsNotNone(p)
        self.assertGreater(p, 0.99)

    def test_clearly_male(self):
        p = name_gender.estimate("Erik")
        self.assertIsNotNone(p)
        self.assertLess(p, 0.01)

    def test_unisex_stays_probabilistic(self):
        # Kim är genuint unisex i SCB-datan — får inte klassas hårt åt något håll.
        p = name_gender.estimate("Kim")
        self.assertIsNotNone(p)
        self.assertGreater(p, 0.1)
        self.assertLess(p, 0.9)

    def test_unknown_name_returns_none(self):
        self.assertIsNone(name_gender.estimate("Xqzylophant"))

    def test_empty_and_whitespace(self):
        self.assertIsNone(name_gender.estimate(""))
        self.assertIsNone(name_gender.estimate("   "))

    def test_full_name_uses_first_token(self):
        self.assertEqual(name_gender.estimate("Anna Svensson"),
                         name_gender.estimate("Anna"))

    def test_hyphenated_first_name(self):
        # Bindestreckade namn är egna SCB-poster (eva-lena: 3431 kvinnor, 0 män).
        p = name_gender.estimate("Eva-Lena Berg")
        self.assertIsNotNone(p)
        self.assertGreater(p, 0.99)

    def test_case_and_punctuation_insensitive(self):
        # NER-artefakter ("Anna," / versaler) får inte tappa träffen.
        self.assertEqual(name_gender.estimate("ANNA,"), name_gender.estimate("anna"))

    def test_diacritics_preserved(self):
        # Svenska tecken är betydelsebärande (Åsa ≠ Asa som namnpost).
        p = name_gender.estimate("Åsa Lindqvist")
        self.assertIsNotNone(p)
        self.assertGreater(p, 0.99)


class AggregateTest(unittest.TestCase):
    def test_probability_weighted_parity(self):
        agg = name_gender.aggregate(["Anna Svensson", "Erik Berg"])
        self.assertEqual(agg["n"], 2)
        self.assertEqual(agg["unknown_share"], 0.0)
        # En nästan-säker kvinna + en nästan-säker man → ~0.5, sannolikhetsvägt.
        self.assertAlmostEqual(agg["parity"], 0.5, delta=0.01)

    def test_unknown_names_counted_not_guessed(self):
        agg = name_gender.aggregate(["Anna", "Xqzylophant", "Qwortzig"])
        self.assertEqual(agg["n"], 1)
        self.assertAlmostEqual(agg["unknown_share"], 2 / 3)
        self.assertGreater(agg["parity"], 0.99)

    def test_empty_input(self):
        agg = name_gender.aggregate([])
        self.assertIsNone(agg["parity"])
        self.assertEqual(agg["n"], 0)
        self.assertEqual(agg["unknown_share"], 0.0)

    def test_aggregate_contains_no_names(self):
        # Regressionsskydd för DPA-villkor 2: aggregatet får aldrig bära namnen.
        agg = name_gender.aggregate(["Anna Svensson"])
        flat = repr(agg).casefold()
        self.assertNotIn("anna", flat)
        self.assertNotIn("svensson", flat)


if __name__ == "__main__":
    unittest.main()
