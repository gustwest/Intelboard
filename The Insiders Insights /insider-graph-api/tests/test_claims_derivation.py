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
        self.assertNotIn("baseline_followers", preds)
        self.assertEqual(len(claims), 3)
        # alla härledda claims är källförsedda (item-källa)
        for c in claims:
            self.assertEqual(c.claim_kind, "property")
            self.assertEqual(c.source[0].kind, "item")
            self.assertEqual(c.source[0].item_id, "bv1")

    def test_operational_claims_get_persona_audience(self):
        """A1-wiring (2026-06-12): deriverade operationella property-claims taggas via
        predikat mot aktiva personor. foundingDate→investor; address (okartlagt)→evergreen."""
        fakefs.reset(
            client={"company_name": "Acme AB"},  # inga personas konf. → defaults (customer/talent/investor)
            company_items={"bv1": {"schema_type": "Organization", "included_in_output": True,
                                   "extra": {"founded": "2014", "address": "Göteborg"}}},
        )
        by_pred = {c.predicate: c for c in derive_property_claims("acme")}
        self.assertEqual(by_pred["foundingDate"].audience, ["investor"])
        self.assertEqual(by_pred["address"].audience, [])  # okartlagt predikat → evergreen

    def test_industry_knowsabout_tagged_customer(self):
        """(b) 2026-06-12: övergripande verksamhetsområde (industry→knowsAbout via
        derive_property_claims) taggas customer — kundens #1-fråga "vad gör bolaget"."""
        fakefs.reset(
            client={"company_name": "Acme AB"},  # defaults inkl. customer
            company_items={"bv1": {"schema_type": "Organization", "included_in_output": True,
                                   "extra": {"industries": "Molninfrastruktur"}}},
        )
        by_pred = {c.predicate: c for c in derive_property_claims("acme")}
        self.assertEqual(by_pred["knowsAbout"].audience, ["customer"])

    def test_operational_audience_respects_active_personas(self):
        """foundingDate→investor men investor måste vara aktiv hos kunden."""
        fakefs.reset(
            client={"company_name": "Acme AB", "personas": {"active": ["customer", "talent"]}},
            company_items={"bv1": {"schema_type": "Organization", "included_in_output": True,
                                   "extra": {"founded": "2014"}}},
        )
        by_pred = {c.predicate: c for c in derive_property_claims("acme")}
        self.assertEqual(by_pred["foundingDate"].audience, [])  # investor ej aktiv → evergreen

    def test_lei_and_corporate_structure(self):
        fakefs.reset(
            company_items={
                "g1": {
                    "schema_type": "Organization",
                    "included_in_output": True,
                    "extra": {
                        "name": "Acme Nordic AB",  # namn mappas inte → inget claim
                        "lei": "CHILD000000000000001",
                        "parent_organization": {"name": "Acme Group AB", "lei": "PARENTLEI00000000001"},
                        "subsidiaries": [
                            {"name": "Acme Tech AB", "lei": "T1"},
                            {"name": "Acme Labs AB", "lei": "T2"},
                        ],
                    },
                }
            }
        )
        by_pred: dict = {}
        claims = list(derive_property_claims("acme"))
        for c in claims:
            by_pred.setdefault(c.predicate, []).append(c.value)

        self.assertEqual(by_pred["leiCode"], ["CHILD000000000000001"])
        self.assertEqual(
            by_pred["parentOrganization"],
            [{"@type": "Organization", "name": "Acme Group AB", "leiCode": "PARENTLEI00000000001"}],
        )
        self.assertIn({"@type": "Organization", "name": "Acme Tech AB", "leiCode": "T1"}, by_pred["subOrganization"])
        self.assertEqual(len(by_pred["subOrganization"]), 2)
        self.assertNotIn("name", by_pred)
        for c in claims:  # alla källförsedda mot item g1
            self.assertEqual(c.source[0].item_id, "g1")

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
