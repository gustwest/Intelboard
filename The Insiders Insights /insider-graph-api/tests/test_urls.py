"""Enhetstester för profil-URL:erna (schema_org/urls.py) — låser fast både
path-style-läget (default) och clean-URL-läget (cutover), så de inte glider isär."""
import unittest

from config import settings
from schema_org import urls


class UrlsTest(unittest.TestCase):
    def setUp(self):
        self._orig = (settings.cdn_clean_urls, settings.cdn_base_url)
        settings.cdn_base_url = "https://cdn.example.com"

    def tearDown(self):
        settings.cdn_clean_urls, settings.cdn_base_url = self._orig

    # ---- path-style (default, pre-cutover) --------------------------------
    def test_pathstyle_objects_and_urls(self):
        settings.cdn_clean_urls = False
        self.assertEqual(urls.object_prefix("acme"), "clients/acme")
        self.assertEqual(urls.schema_object("acme"), "clients/acme/schema.json")
        self.assertEqual(urls.page_object("acme"), "clients/acme/index.html")
        self.assertEqual(urls.llms_object("acme"), "clients/acme/llms.txt")
        self.assertEqual(urls.cdn_url("acme"), "https://cdn.example.com/clients/acme/schema.json")
        # served_url pekar explicit på objektet (path-style serverar ej index.html)
        self.assertEqual(urls.served_url("acme"), "https://cdn.example.com/clients/acme/index.html")
        # kanoniken är den aspirationella publika domänen — oförändrat beteende
        self.assertEqual(urls.canonical_url("acme"), "https://profiles.geogiraph.com/acme")

    # ---- clean URLs (bakom HTTPS-LB, cutover) -----------------------------
    def test_clean_objects_and_urls(self):
        settings.cdn_clean_urls = True
        self.assertEqual(urls.object_prefix("acme"), "acme")
        self.assertEqual(urls.schema_object("acme"), "acme/schema.json")
        self.assertEqual(urls.page_object("acme"), "acme/index.html")
        self.assertEqual(urls.cdn_url("acme"), "https://cdn.example.com/acme/schema.json")
        # ren katalog-URL, och kanoniken == den serverade adressen
        self.assertEqual(urls.served_url("acme"), "https://cdn.example.com/acme/")
        self.assertEqual(urls.canonical_url("acme"), "https://cdn.example.com/acme/")

    # ---- premium: kundens egen domän överstyr kanoniken i båda lägen ------
    def test_profile_base_url_override(self):
        for clean in (False, True):
            settings.cdn_clean_urls = clean
            self.assertEqual(
                urls.canonical_url("acme", "https://ai.kund.se/"),
                "https://ai.kund.se",
            )


class CleanLogoUrlTest(unittest.TestCase):
    """Logo-garde: släpp bilder igenom, stoppa startsides-/icke-bild-URL:er."""

    def test_image_url_passes(self):
        for u in ("https://kund.se/logo.svg", "https://cdn.x/a/b/logo.png",
                  "http://kund.se/assets/marke.JPG"):
            self.assertEqual(urls.clean_logo_url(u), u)

    def test_extensionless_deep_path_passes(self):
        # CDN-serverade bilder utan filändelse ska inte fällas.
        u = "https://images.kund.se/media/12345"
        self.assertEqual(urls.clean_logo_url(u), u)

    def test_homepage_is_rejected(self):
        self.assertIsNone(urls.clean_logo_url("https://kund.se", website="https://kund.se"))
        self.assertIsNone(urls.clean_logo_url("https://kund.se/", website="https://kund.se"))

    def test_bare_domain_rejected(self):
        self.assertIsNone(urls.clean_logo_url("https://kund.se"))
        self.assertIsNone(urls.clean_logo_url("https://kund.se/"))

    def test_non_image_extension_rejected(self):
        self.assertIsNone(urls.clean_logo_url("https://kund.se/om-oss.html"))
        self.assertIsNone(urls.clean_logo_url("https://kund.se/broschyr.pdf"))

    def test_empty_and_garbage_rejected(self):
        self.assertIsNone(urls.clean_logo_url(None))
        self.assertIsNone(urls.clean_logo_url("   "))
        self.assertIsNone(urls.clean_logo_url("inte-en-url"))


class ResolveWebsiteTest(unittest.TestCase):
    def test_top_level_website_wins(self):
        self.assertEqual(urls.resolve_website({"website": "https://kund.se"}), "https://kund.se")

    def test_falls_back_to_settings_start_url(self):
        # Onboarding sparar URL:en nästlad — den ska ändå bli `url`.
        data = {"settings": {"website": {"start_url": "https://kund.se/"}}}
        self.assertEqual(urls.resolve_website(data), "https://kund.se/")

    def test_top_level_preferred_over_nested(self):
        data = {"website": "https://kanonisk.se", "settings": {"website": {"start_url": "https://crawl.se"}}}
        self.assertEqual(urls.resolve_website(data), "https://kanonisk.se")

    def test_none_when_absent(self):
        self.assertIsNone(urls.resolve_website({}))


if __name__ == "__main__":
    unittest.main()
