"""B1: installationskit — rendering + e-postutskick till kundkontakten."""
import unittest

import fakefs  # installerar fake firestore_client — först
from config import settings
from routers import delivery as delivery_router
from schema_org import install_kit
from services import notifications


class InstallKitRenderTest(unittest.TestCase):
    def test_build_kit_has_three_artifacts(self):
        fakefs.reset(client={"company_name": "Acme AB", "website": "https://acme.se"})
        kit = install_kit.build_kit("acme")
        self.assertEqual(kit["company_name"], "Acme AB")
        self.assertTrue(kit["profile_url"])
        self.assertIn("application/ld+json", kit["identity_snippet"])
        self.assertIn("data-geogiraph-badge", kit["badge_snippet"])

    def test_html_has_steps_and_print(self):
        fakefs.reset(client={"company_name": "Acme AB", "website": "https://acme.se"})
        html = install_kit.render_install_kit("acme")
        self.assertIn("Installationsinstruktioner", html)
        self.assertIn("&lt;head&gt;", html)        # snutten escapad, inte injicerad
        self.assertIn("window.print()", html)      # utskrivbar till PDF

    def test_badge_respects_client_language(self):
        fakefs.reset(client={"company_name": "Acme AB", "website": "https://acme.se", "language": "en"})
        kit = install_kit.build_kit("acme")
        self.assertIn("AI profile verified by Geogiraph", kit["badge_snippet"])


class InstallKitSendTest(unittest.TestCase):
    def setUp(self):
        self._orig = (settings.brevo_api_key, settings.notify_from_email, notifications._deliver)
        settings.brevo_api_key = "SG.x"
        settings.notify_from_email = "noreply@geogiraph.com"

    def tearDown(self):
        settings.brevo_api_key, settings.notify_from_email, notifications._deliver = self._orig

    def test_sends_kit_to_contact(self):
        fakefs.reset(client={
            "company_name": "Acme AB", "website": "https://acme.se", "contact_email": "vd@acme.se",
        })
        sent: list = []
        notifications._deliver = lambda to, subject, body, html=None, cc=None: sent.append((to, subject, html))
        result = delivery_router.send_install_kit("acme")
        self.assertTrue(result["sent"])
        self.assertEqual(result["to"], "vd@acme.se")
        to, subject, html = sent[0]
        self.assertEqual(to, "vd@acme.se")
        self.assertIn("Acme AB", subject)
        self.assertIn("Installationsinstruktioner", html)  # HTML-kitet mejlades

    def test_noop_without_contact(self):
        fakefs.reset(client={"company_name": "Acme AB", "website": "https://acme.se"})
        result = delivery_router.send_install_kit("acme")
        self.assertFalse(result["sent"])
        self.assertEqual(result["reason"], "no_contact")


class PremiumDomainTest(unittest.TestCase):
    """P5: premium-tier-kit visar kundens egen-domän-sektion; default-tier gör inte det."""

    _PREMIUM = {
        "company_name": "Acme AB", "website": "https://acme.se",
        "tier": "premium", "profile_base_url": "https://profil.acme.se",
    }

    def test_build_kit_exposes_own_domain_for_premium(self):
        fakefs.reset(client=self._PREMIUM)
        kit = install_kit.build_kit("acme")
        self.assertEqual(kit["own_domain"], "https://profil.acme.se")
        self.assertTrue(kit["hosted_url"])  # geogiraph-hostade målet (proxy-/DNS-mål)
        # Kundens profil-länk pekar på deras egen domän (premium-kanonik).
        self.assertIn("profil.acme.se", kit["profile_url"])

    def test_html_has_path_a_proxy_steps_for_premium(self):
        """Väg A: exakta reverse-proxy-steg — mål + de tre villkoren."""
        fakefs.reset(client=self._PREMIUM)
        html = install_kit.render_install_kit("acme")
        self.assertIn("er egen domän", html)
        self.assertIn("profil.acme.se", html)
        self.assertIn("förstaparts", html)              # domänauktoritets-framing
        self.assertIn("reverse-proxy", html)            # vägen (inte redirect)
        self.assertIn("redirect", html)                 # varningen "inte en redirect"
        self.assertIn("Cacha inte", html)               # crawl-health-villkoret
        self.assertIn("canonical", html)                # "rör inte canonical"
        # Proxy-målet (den hostade profilen) finns med som konkret adress.
        self.assertIn(install_kit.build_kit("acme")["hosted_url"], html)

    def test_default_tier_has_no_domain_section(self):
        fakefs.reset(client={"company_name": "Acme AB", "website": "https://acme.se"})
        kit = install_kit.build_kit("acme")
        self.assertEqual(kit["own_domain"], "")
        self.assertNotIn("er egen domän", install_kit.render_install_kit("acme"))

    def test_premium_proxy_steps_in_email_text(self):
        fakefs.reset(client=self._PREMIUM)
        _subject, _html, text = install_kit.render_install_kit_email("acme")
        self.assertIn("egen domän", text)
        self.assertIn("profil.acme.se", text)
        self.assertIn("REVERSE-PROXY", text)
        self.assertIn("redirect", text)                 # "INTE en redirect"
        self.assertIn(install_kit.build_kit("acme")["hosted_url"], text)


if __name__ == "__main__":
    unittest.main()
