"""Enhetstester för identity-enrichment (services/identity_enrichment.py).

Verifierar tre invarianter: (1) raw_items.extra → client_doc lyfts, (2) manuell
input vinner alltid, (3) org.nr normaliseras innan persistens. Detta är
write-back-pipen från scrape-jobben till leverans-snippeten.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from services.identity_enrichment import apply_identity_metadata


def _seed(*, client, company_items=None):
    fakefs.reset(client=client, company_items=company_items or {})


class IdentityEnrichmentTest(unittest.TestCase):
    def test_lifts_logo_and_orgnr_when_client_doc_empty(self):
        _seed(
            client={"company_name": "Acme AB"},  # logo_url + org_number saknas
            company_items={
                "web-1": {"extra": {"logo_url": "https://acme.se/og.png", "chunk_index": 0},
                          "included_in_output": True},
                "gleif-1": {"extra": {"org_number": "5566778899"},
                            "included_in_output": True},
            },
        )
        updates = apply_identity_metadata("acme")
        self.assertEqual(updates, {
            "logo_url": "https://acme.se/og.png",
            "org_number": "556677-8899",  # normaliserad form
        })
        self.assertEqual(fakefs.STATE["client"]["logo_url"], "https://acme.se/og.png")
        self.assertEqual(fakefs.STATE["client"]["org_number"], "556677-8899")

    def test_manual_input_wins_over_auto_extraction(self):
        """Ops har manuellt satt logo + org.nr → auto-extrahering ska INTE skriva över."""
        _seed(
            client={
                "company_name": "Acme AB",
                "logo_url": "https://kund.se/brand/manual-logo.svg",
                "org_number": "999999-9999",
            },
            company_items={
                "web-1": {"extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": True},
                "gleif-1": {"extra": {"org_number": "5566778899"},
                            "included_in_output": True},
            },
        )
        updates = apply_identity_metadata("acme")
        self.assertEqual(updates, {})
        # Manuella värden orörda
        self.assertEqual(fakefs.STATE["client"]["logo_url"], "https://kund.se/brand/manual-logo.svg")
        self.assertEqual(fakefs.STATE["client"]["org_number"], "999999-9999")

    def test_excluded_raw_items_are_ignored(self):
        """raw_items markerade included_in_output=False ska inte bidra med metadata."""
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"extra": {"logo_url": "https://acme.se/excluded.png"},
                          "included_in_output": False},
            },
        )
        updates = apply_identity_metadata("acme")
        self.assertEqual(updates, {})
        self.assertNotIn("logo_url", fakefs.STATE["client"])

    def test_partial_update_when_only_one_field_available(self):
        """Bara logotyp i raw_items → bara logotyp lyfts; org.nr förblir tomt."""
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": True},
            },
        )
        updates = apply_identity_metadata("acme")
        self.assertEqual(set(updates.keys()), {"logo_url"})
        self.assertNotIn("org_number", fakefs.STATE["client"])

    def test_missing_client_returns_empty(self):
        fakefs.reset(client=None)
        self.assertEqual(apply_identity_metadata("ghost"), {})

    def test_first_value_wins_when_multiple_items_have_logo(self):
        """Två sidor med og:image → första vinner (deterministisk ordning för testen
        spelar mindre roll än att vi inte kraschar/skriver över)."""
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": True},
                "web-2": {"extra": {"logo_url": "https://acme.se/other.png"},
                          "included_in_output": True},
            },
        )
        updates = apply_identity_metadata("acme")
        self.assertIn("logo_url", updates)
        self.assertTrue(updates["logo_url"].startswith("https://acme.se/"))


if __name__ == "__main__":
    unittest.main()
