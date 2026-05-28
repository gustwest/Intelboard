"""Enhetstester för onboarding-tier (services/discovery.py)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from routers.clients import _purge_employee_from_claims
from schemas import EmployeeInput, OnboardRequest, RssFeed
from services.discovery import onboard_client


def _req(**over):
    base = dict(client_id="acme", company_name="Acme AB",
                employees=[EmployeeInput(name="Anna", linkedin_url="https://x/anna")])
    base.update(over)
    return OnboardRequest(**base)


class OnboardTierTest(unittest.TestCase):
    def test_default_tier_no_base_url(self):
        fakefs.reset(client=None)
        onboard_client(_req())
        stored = fakefs.STATE["client"]
        self.assertEqual(stored["tier"], "default")
        self.assertIsNone(stored["profile_base_url"])

    def test_premium_stores_normalized_base_url(self):
        fakefs.reset(client=None)
        onboard_client(_req(tier="premium", profile_base_url="https://profil.kund.se/"))
        stored = fakefs.STATE["client"]
        self.assertEqual(stored["tier"], "premium")
        self.assertEqual(stored["profile_base_url"], "https://profil.kund.se")  # trailing slash strippad

    def test_existing_client_raises(self):
        fakefs.reset(client={"company_name": "Finns"})
        with self.assertRaises(ValueError):
            onboard_client(_req())


class OnboardConnectorParamsTest(unittest.TestCase):
    def test_connector_params_stored_under_settings(self):
        fakefs.reset(client=None)
        onboard_client(_req(
            website_start_url="https://kund.se/",
            rss_feeds=[RssFeed(url="https://kund.se/feed", schema_type="NewsArticle", label="Press")],
            scrape_employee_profiles=True,
        ))
        settings = fakefs.STATE["client"]["settings"]
        self.assertEqual(settings["website"], {"start_url": "https://kund.se/"})
        self.assertEqual(settings["rss_feeds"][0]["url"], "https://kund.se/feed")
        self.assertTrue(settings["scrape_employee_profiles"])

    def test_no_connector_params_leaves_settings_clean(self):
        fakefs.reset(client=None)
        onboard_client(_req())
        settings = fakefs.STATE["client"]["settings"]
        self.assertNotIn("website", settings)
        self.assertNotIn("rss_feeds", settings)
        self.assertFalse(settings["scrape_employee_profiles"])


class OnboardIdentityMetadataTest(unittest.TestCase):
    """Logo + svenskt org.nr fångas vid onboarding; org.nr normaliseras till
    kanonisk NNNNNN-NNNN-form så jämförelse och AI-motorernas matchning fungerar."""

    def test_logo_and_org_number_stored(self):
        fakefs.reset(client=None)
        onboard_client(_req(logo_url="https://acme.se/logo.svg", org_number="5566778899"))
        stored = fakefs.STATE["client"]
        self.assertEqual(stored["logo_url"], "https://acme.se/logo.svg")
        self.assertEqual(stored["org_number"], "556677-8899")  # normaliserad

    def test_org_number_with_dash_kept_canonical(self):
        fakefs.reset(client=None)
        onboard_client(_req(org_number="556677-8899"))
        self.assertEqual(fakefs.STATE["client"]["org_number"], "556677-8899")

    def test_no_identity_metadata_leaves_fields_none(self):
        fakefs.reset(client=None)
        onboard_client(_req())
        stored = fakefs.STATE["client"]
        self.assertIsNone(stored["logo_url"])
        self.assertIsNone(stored["org_number"])


class PurgeEmployeeFromClaimsTest(unittest.TestCase):
    def test_subject_claims_deleted_source_claims_pruned(self):
        fakefs.reset(claims={
            # personens eget claim → raderas
            "c1": {"subject_ref": "anna", "source": [{"employee_id": "anna"}]},
            # företags-claim med flera källor → personens källa dras bort, claim kvar
            "c2": {"subject_ref": "org", "source": [{"employee_id": "anna"}, {"employee_id": "bo"}]},
            # företags-claim med BARA personens källa → källlöst → raderas
            "c3": {"subject_ref": "org", "source": [{"employee_id": "anna"}]},
            # orört claim
            "c4": {"subject_ref": "org", "source": [{"employee_id": "bo"}]},
        })
        removed, pruned = _purge_employee_from_claims("acme", "anna")
        self.assertEqual(removed, 2)   # c1 + c3
        self.assertEqual(pruned, 1)    # c2
        claims = fakefs.STATE["claims"]
        self.assertNotIn("c1", claims)
        self.assertNotIn("c3", claims)
        self.assertIn("c4", claims)
        self.assertEqual(claims["c2"]["source"], [{"employee_id": "bo"}])


if __name__ == "__main__":
    unittest.main()
