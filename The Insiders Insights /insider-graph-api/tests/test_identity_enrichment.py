"""Enhetstester för identity-enrichment (services/identity_enrichment.py).

Verifierar fyra invarianter: (1) raw_items.extra → client_doc lyfts, (2) provenance
(<fält>_source + <fält>_set_at) skrivs ärligt baserat på raw_item.source, (3) manuell
input vinner alltid, (4) endpointens response särskiljer 'lyfte detta' från 'försökte
men hittade ingen kandidat'.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from services.identity_enrichment import apply_identity_metadata


def _seed(*, client, company_items=None):
    fakefs.reset(client=client, company_items=company_items or {})


class IdentityEnrichmentTest(unittest.TestCase):
    def test_lifts_logo_and_orgnr_with_provenance(self):
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"source": "website",
                          "extra": {"logo_url": "https://acme.se/og.png", "chunk_index": 0},
                          "included_in_output": True},
                "gleif-1": {"source": "gleif",
                            "extra": {"org_number": "5566778899"},
                            "included_in_output": True},
            },
        )
        result = apply_identity_metadata("acme")
        # updates innehåller VAD som lyftes + varifrån
        self.assertEqual(result["updates"]["logo_url"]["value"], "https://acme.se/og.png")
        self.assertEqual(result["updates"]["logo_url"]["source"], "website")
        self.assertEqual(result["updates"]["org_number"]["value"], "556677-8899")  # normaliserad
        self.assertEqual(result["updates"]["org_number"]["source"], "gleif")
        self.assertEqual(result["no_data_for"], [])
        # set_at sätts till en ISO-tid (sträng) i båda fallen
        self.assertTrue(result["updates"]["logo_url"]["set_at"])
        self.assertTrue(result["updates"]["org_number"]["set_at"])
        # client_doc har provenance-fälten skrivna
        client = fakefs.STATE["client"]
        self.assertEqual(client["logo_url_source"], "website")
        self.assertEqual(client["org_number_source"], "gleif")
        self.assertTrue(client["logo_url_set_at"])
        self.assertTrue(client["org_number_set_at"])

    def test_manual_input_wins_over_auto_extraction(self):
        """Ops har manuellt satt logo + org.nr → auto-extrahering ska INTE skriva
        över och fält listas inte i no_data_for (vi försökte inte ens — fältet är taget)."""
        _seed(
            client={
                "company_name": "Acme AB",
                "logo_url": "https://kund.se/brand/manual-logo.svg",
                "logo_url_source": "manual",
                "org_number": "999999-9999",
                "org_number_source": "manual",
            },
            company_items={
                "web-1": {"source": "website",
                          "extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": True},
                "gleif-1": {"source": "gleif",
                            "extra": {"org_number": "5566778899"},
                            "included_in_output": True},
            },
        )
        result = apply_identity_metadata("acme")
        self.assertEqual(result["updates"], {})
        self.assertEqual(result["no_data_for"], [])  # vi försökte inte (fälten redan satta)
        self.assertEqual(fakefs.STATE["client"]["logo_url_source"], "manual")  # orört

    def test_no_data_for_listas_när_inget_hittas(self):
        """Tomt client_doc + ingen raw_item med logo/org_number → båda i no_data_for.
        UI:t använder detta för att visa 'kör Uppdatera profil först'."""
        _seed(client={"company_name": "Acme AB"})  # inga raw_items
        result = apply_identity_metadata("acme")
        self.assertEqual(result["updates"], {})
        self.assertEqual(sorted(result["no_data_for"]), ["logo_url", "org_number"])

    def test_partial_no_data_when_only_one_field_found(self):
        """En sida har og:image, ingen GLEIF-data → logo lyfts, org_number i no_data_for."""
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"source": "website",
                          "extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": True},
            },
        )
        result = apply_identity_metadata("acme")
        self.assertIn("logo_url", result["updates"])
        self.assertEqual(result["no_data_for"], ["org_number"])

    def test_excluded_raw_items_are_ignored(self):
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "web-1": {"source": "website",
                          "extra": {"logo_url": "https://acme.se/og.png"},
                          "included_in_output": False},
            },
        )
        result = apply_identity_metadata("acme")
        self.assertEqual(result["updates"], {})
        self.assertEqual(result["no_data_for"], ["logo_url", "org_number"])

    def test_missing_client_returns_empty_result(self):
        fakefs.reset(client=None)
        self.assertEqual(apply_identity_metadata("ghost"), {"updates": {}, "no_data_for": []})

    def test_unknown_source_label_falls_back_to_auto(self):
        """raw_item utan eller med okänd source → provenance-etiketten blir 'auto'
        (vi ljuger inte om varifrån värdet kom)."""
        _seed(
            client={"company_name": "Acme AB"},
            company_items={
                "x1": {"source": "mystery-connector",
                       "extra": {"logo_url": "https://x.example/logo.png"},
                       "included_in_output": True},
            },
        )
        result = apply_identity_metadata("acme")
        self.assertEqual(result["updates"]["logo_url"]["source"], "auto")
        self.assertEqual(fakefs.STATE["client"]["logo_url_source"], "auto")


if __name__ == "__main__":
    unittest.main()
