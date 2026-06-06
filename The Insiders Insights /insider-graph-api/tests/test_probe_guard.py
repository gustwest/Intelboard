"""Enhetstester för subjekt-grinden (services/probe_guard.py).

Grinden ska fånga andrapersons-tilltal UTAN bolagsnamn (då tror probe-motorn att
"du/you" är den själv) men släppa igenom legitima frågor — inkl. värme-probernas
"du" som adresserar svararen när bolaget ändå namnges.
"""
import unittest

from services import probe_guard as pg


class TextMentionsTest(unittest.TestCase):
    def test_full_name_word_boundary(self):
        self.assertTrue(pg.text_mentions("Vi rekommenderar Acme AB starkt.", "Acme AB"))

    def test_distinctive_token_matches_legal_form_variant(self):
        # Kund "Acme AB" men motorn skrev bara "Acme" → ska räknas som omnämnande.
        self.assertTrue(pg.text_mentions("Acme är ett bra val.", "Acme AB", split_tokens=True))

    def test_no_substring_false_positive(self):
        # "Volvo" får INTE träffa "Volvocars" (annan entitet) med ordgränser.
        self.assertFalse(pg.text_mentions("Volvocars lanserar en ny modell.", "Volvo", split_tokens=True))

    def test_person_name_requires_full_match(self):
        # Personnamn matchas på helt namn, inte token (annars matchar "Anna" vem som helst).
        self.assertTrue(pg.text_mentions("Kontakta Anna Svensson.", "Anna Svensson"))
        self.assertFalse(pg.text_mentions("Anna Lindgren ringde.", "Anna Svensson"))

    def test_empty_inputs(self):
        self.assertFalse(pg.text_mentions("", "Acme"))
        self.assertFalse(pg.text_mentions("text", ""))


class AddressesSubjectInSecondPersonTest(unittest.TestCase):
    def test_flags_second_person_without_company(self):
        # Det klassiska felfallet: "You claim to…" utan att namnge bolaget.
        self.assertTrue(
            pg.addresses_subject_in_second_person(
                "You claim to help everyone from startups to the public sector. "
                "What clients do you see the most success with?",
                "Acme Consulting",
            )
        )

    def test_flags_swedish_second_person_without_company(self):
        self.assertTrue(
            pg.addresses_subject_in_second_person("Hur säkerställer ni er leveranskvalitet?", "Acme AB")
        )

    def test_safe_when_company_named_third_person(self):
        # Tredje person, namngivet → ofarligt.
        self.assertFalse(
            pg.addresses_subject_in_second_person(
                "Är Acme seriösa och tillräckligt stabila för ett flerårigt avtal?", "Acme AB"
            )
        )

    def test_safe_warmth_style_du_addresses_engine(self):
        # Värme-probe-stilen: "du" adresserar SVARAREN, bolaget namnges → ofarligt.
        self.assertFalse(
            pg.addresses_subject_in_second_person(
                "Som potentiell kund, märker du om Acme prioriterar mångfald?", "Acme AB"
            )
        )

    def test_core_token_matches_legal_suffix_name(self):
        # "Acme" i frågan räcker även om kundnamnet är "Acme AB".
        self.assertFalse(
            pg.addresses_subject_in_second_person("Hur transparent är Acme med era priser?", "Acme AB")
        )

    def test_no_second_person_is_safe(self):
        self.assertFalse(
            pg.addresses_subject_in_second_person(
                "Vilka är de ledande leverantörerna i marknaden?", "Acme AB"
            )
        )

    def test_substring_not_flagged(self):
        # "education"/"under" innehåller "du" men ska INTE träffa (ordgränser).
        self.assertFalse(
            pg.addresses_subject_in_second_person(
                "Vilka utbildningskrav finns i branschen under nästa år?", "Acme AB"
            )
        )

    def test_empty_text(self):
        self.assertFalse(pg.addresses_subject_in_second_person("", "Acme AB"))

    def test_second_person_no_company_name_configured(self):
        # Inget bolagsnamn känt → andrapersons-fråga kan inte avfärdas → flaggas.
        self.assertTrue(pg.addresses_subject_in_second_person("Do you have any clients?", ""))


if __name__ == "__main__":
    unittest.main()
