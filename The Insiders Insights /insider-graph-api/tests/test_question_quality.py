"""F1 (frågedesign-programmet): kvalitetsramverket för frågor — flaggar ledande
språk utan att blockera. Verifierar detektorerna + att flaggor följer med i
review-flödet (custom-frågor) och polling-fingerprintet (F3)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först

from services import question_quality as qq
from services import polling


class AssessTest(unittest.TestCase):
    def test_clean_question_has_no_flags(self):
        self.assertEqual(qq.assess("Vilka företag i Sverige arbetar med AI-säkerhet?"), [])

    def test_negative_presupposition(self):
        self.assertIn(
            "negativ_presupposition",
            qq.assess("Varför är Acme så dåliga på leveranstider?"),
        )
        self.assertIn(
            "negativ_presupposition",
            qq.assess("Varför döljer Acme sina ägarförhållanden?"),
        )
        # Öppen ja/nej-fråga postulerar inte bristen → ingen flagga
        self.assertNotIn(
            "negativ_presupposition",
            qq.assess("Finns det rapporter om leveransproblem hos Acme?"),
        )

    def test_superlative_framing(self):
        # Default-mallens inramning flaggas medvetet — gör priming synlig (audit p.18.1)
        self.assertIn(
            "superlativ_inramning",
            qq.assess("Vilka är de ledande svenska bolagen inom fintech?"),
        )
        self.assertIn(
            "superlativ_inramning",
            qq.assess("Vilka är de mest attraktiva arbetsgivarna inom industrin?"),
        )

    def test_emotive_language(self):
        self.assertIn("emotivt_sprak", qq.assess("Har Acme varit inblandade i någon skandal?"))

    def test_false_dichotomy(self):
        self.assertIn(
            "falsk_dikotomi",
            qq.assess("Är Acme antingen marknadsledare eller på väg ut ur marknaden?"),
        )

    def test_multi_part_question(self):
        self.assertIn(
            "flerledad",
            qq.assess("Hur är Acmes kultur och ledarskap och hur hanterar de kritik?"),
        )

    def test_second_person_without_company(self):
        self.assertIn("du_tilltal_utan_foretag", qq.assess("Hur hanterar ni reklamationer?", "Acme AB"))
        # Namnges bolaget är du-tilltal ofarligt
        self.assertNotIn(
            "du_tilltal_utan_foretag",
            qq.assess("Hur hanterar Acme reklamationer?", "Acme AB"),
        )

    def test_labels_translate_known_ids(self):
        self.assertEqual(qq.labels(["flerledad"]), ["Flera frågor i en"])
        self.assertEqual(qq.labels(None), [])


class FingerprintTest(unittest.TestCase):
    def test_fingerprint_stable_and_order_independent(self):
        a = polling._questions_fingerprint([("affar", "Fråga 1?"), ("hr", "Fråga 2?")])
        b = polling._questions_fingerprint([("hr", "Fråga 2?"), ("affar", "Fråga 1?")])
        self.assertEqual(a, b)

    def test_fingerprint_changes_when_question_changes(self):
        a = polling._questions_fingerprint([("affar", "Fråga 1?")])
        b = polling._questions_fingerprint([("affar", "Fråga 1 — omformulerad?")])
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
