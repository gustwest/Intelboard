"""Enhetstester för deterministisk property-härledning (schema_org/claims.py)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.claims import derive_property_claims


class DerivePropertyClaimsTest(unittest.TestCase):
    def test_maps_known_fields_and_skips_social_metrics(self):
        fakefs.reset(
            company_items={
                "bv1": {
                    "schema_type": "Organization",
                    "included_in_output": True,
                    "extra": {
                        "founded": "2014",
                        "address": "Göteborg",
                        "industries": "Mjukvara",
                        "org_number": "5566778899",
                        "baseline_followers": 5000,  # ska ALDRIG bli ett claim
                    },
                }
            }
        )
        claims = list(derive_property_claims("acme"))
        preds = {c.predicate: c.value for c in claims}

        self.assertEqual(preds.get("foundingDate"), "2014")
        self.assertEqual(preds.get("address"), "Göteborg")
        self.assertEqual(preds.get("knowsAbout"), "Mjukvara")
        self.assertEqual(preds.get("identifier"), "5566778899")
        self.assertNotIn("baseline_followers", preds)
        self.assertEqual(len(claims), 4)
        # alla härledda claims är källförsedda (item-källa)
        for c in claims:
            self.assertEqual(c.claim_kind, "property")
            self.assertEqual(c.source[0].kind, "item")
            self.assertEqual(c.source[0].item_id, "bv1")

    def test_skips_items_excluded_from_output(self):
        fakefs.reset(
            company_items={
                "bv1": {"included_in_output": False, "extra": {"founded": "2014"}},
            }
        )
        self.assertEqual(list(derive_property_claims("acme")), [])

    def test_ignores_empty_values(self):
        fakefs.reset(
            company_items={
                "bv1": {"included_in_output": True, "extra": {"founded": "", "address": None, "industries": []}},
            }
        )
        self.assertEqual(list(derive_property_claims("acme")), [])


if __name__ == "__main__":
    unittest.main()
