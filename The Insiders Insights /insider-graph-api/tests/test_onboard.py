"""Enhetstester för onboarding-tier (services/discovery.py)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from schemas import EmployeeInput, OnboardRequest
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


if __name__ == "__main__":
    unittest.main()
