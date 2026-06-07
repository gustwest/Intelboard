"""Enhetstester för den deterministiska röst-/social-metric-grinden (services/claim_voice)."""
import unittest

from services import claim_voice as cv


class NeutralizeTest(unittest.TestCase):
    def test_subject_pronoun_becomes_company(self):
        self.assertEqual(cv.neutralize("Vi hjälper bolag med data.", "Acme AB"),
                         "Acme AB hjälper bolag med data.")

    def test_possessive_becomes_genitive(self):
        self.assertEqual(cv.neutralize("Vår expertis är bred.", "Acme AB"),
                         "Acme ABs expertis är bred.")

    def test_all_plural_first_person_forms(self):
        out = cv.neutralize("Våra kunder litar på oss och på vårt arbete.", "Acme AB")
        self.assertNotIn("våra", out.lower())
        self.assertNotIn(" oss", out.lower())
        self.assertNotIn("vårt", out.lower())
        self.assertIn("Acme ABs kunder", out)

    def test_genitive_skips_extra_s_for_s_ending_name(self):
        # Svensk genitiv: namn på s/x/z tar ingen extra ändelse.
        self.assertEqual(cv.neutralize("Vår metod.", "Atlas"), "Atlas metod.")

    def test_no_first_person_is_untouched(self):
        s = "Acme AB lanserade en plattform 2023."
        self.assertEqual(cv.neutralize(s, "Acme AB"), s)

    def test_numbers_are_preserved(self):
        # Neutraliseringen får aldrig röra siffror — källgrundningen ska stå kvar.
        self.assertIn("2023", cv.neutralize("Vi grundades 2023.", "Acme AB"))

    def test_missing_company_leaves_text_unchanged(self):
        s = "Vi hjälper bolag."
        self.assertEqual(cv.neutralize(s, ""), s)

    def test_does_not_touch_words_containing_pronoun(self):
        # "vidare"/"vården" innehåller "vi"/"vår" men är inte pronomen.
        s = "Bolaget driver vården vidare."
        self.assertEqual(cv.neutralize(s, "Acme AB"), s)


class SocialMetricTest(unittest.TestCase):
    def test_followers_are_flagged(self):
        self.assertTrue(cv.mentions_social_metric("Acme AB har hundratals följare."))
        self.assertTrue(cv.mentions_social_metric("En stor andel av följarna är chefer."))
        self.assertTrue(cv.mentions_social_metric("Följarantalet växer snabbt."))

    def test_likes_and_shares_are_flagged(self):
        self.assertTrue(cv.mentions_social_metric("Inlägget fick tusentals likes."))
        self.assertTrue(cv.mentions_social_metric("Många delningar varje vecka."))

    def test_vanity_count_with_follow_verb_is_flagged(self):
        # Verbformen ("hundratals ledare … följer oss") som noun-mönstret missar.
        self.assertTrue(cv.mentions_social_metric(
            "Hundratals ledare inom försäljning och affärsutveckling följer Acme AB."))

    def test_compliance_follow_is_not_flagged(self):
        # "följer GDPR" utan kvantitetsord får INTE fällas (verbet är legitimt).
        self.assertFalse(cv.mentions_social_metric("Acme AB följer GDPR och ISO 27001."))

    def test_business_claims_are_not_flagged(self):
        self.assertFalse(cv.mentions_social_metric("Acme AB hjälper bolag med data."))
        self.assertFalse(cv.mentions_social_metric("Bolaget grundades 2014 i Stockholm."))


if __name__ == "__main__":
    unittest.main()
