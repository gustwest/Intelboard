"""Tester för connector-administration — särskilt post-onboarding-editering av
text-input-fält (wikidata_id, lei) på en BEFINTLIG kund.

Tidigare kunde wikidata_id/lei bara sättas vid onboarding; PUT /connectors
hanterade bara active_connectors + feeds. Detta verifierar den generiska
connector_params-vägen som löser det för alla text-typade input-fält.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from fastapi import HTTPException
from routers import connectors_router as cr


class TextInputFieldsTest(unittest.TestCase):
    def test_only_text_fields_are_editable(self):
        fields = cr._text_input_fields()
        # wikidata_id (wikipedia) + lei (gleif) är de enda text-typade fälten.
        self.assertEqual(fields.get("wikidata_id"), "wikipedia")
        self.assertEqual(fields.get("lei"), "gleif")
        # feed_list och url ska INTE vara editerbara här (egen lagringsform).
        self.assertNotIn("rss_feeds", fields)
        self.assertNotIn("job_feeds", fields)
        self.assertNotIn("website_start_url", fields)


class ConnectorParamsUpdateTest(unittest.TestCase):
    def test_set_wikidata_id_on_existing_client(self):
        fakefs.reset(client={"company_name": "Acme AB", "active_connectors": ["website"]})
        cr.update_client_connectors("acme", cr.ConnectorsUpdate(
            active_connectors=["website", "wikipedia"],
            connector_params={"wikidata_id": "q95"},
        ))
        stored = fakefs.STATE["client"]
        self.assertIn("wikipedia", stored["active_connectors"])
        # Normaliseras till versaler (speglar discovery.onboard_client)
        self.assertEqual(stored["wikidata_id"], "Q95")

    def test_set_lei_on_existing_client(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        cr.update_client_connectors("acme", cr.ConnectorsUpdate(
            connector_params={"lei": " 5493001KJTIIGC8Y1R12 "},
        ))
        self.assertEqual(fakefs.STATE["client"]["lei"], "5493001KJTIIGC8Y1R12")

    def test_clearing_param_sets_none(self):
        fakefs.reset(client={"company_name": "Acme AB", "wikidata_id": "Q95"})
        cr.update_client_connectors("acme", cr.ConnectorsUpdate(
            connector_params={"wikidata_id": ""},
        ))
        self.assertIsNone(fakefs.STATE["client"]["wikidata_id"])

    def test_unknown_param_rejected(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            cr.update_client_connectors("acme", cr.ConnectorsUpdate(
                connector_params={"org_number": "5560000000"},
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_feed_list_param_not_allowed_via_connector_params(self):
        """rss_feeds får INTE smyga in via connector_params (egen väg finns)."""
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            cr.update_client_connectors("acme", cr.ConnectorsUpdate(
                connector_params={"rss_feeds": "x"},
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_get_reflects_current_connector_params(self):
        fakefs.reset(client={
            "company_name": "Acme AB",
            "wikidata_id": "Q689141",
            "lei": "5493001KJTIIGC8Y1R12",
        })
        out = cr.get_client_connectors("acme")
        self.assertEqual(out["connector_params"]["wikidata_id"], "Q689141")
        self.assertEqual(out["connector_params"]["lei"], "5493001KJTIIGC8Y1R12")

    def test_get_returns_none_for_unset_params(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        out = cr.get_client_connectors("acme")
        self.assertIsNone(out["connector_params"]["wikidata_id"])

    def test_update_unknown_client_404(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            cr.update_client_connectors("ghost", cr.ConnectorsUpdate(
                connector_params={"wikidata_id": "Q1"},
            ))
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
