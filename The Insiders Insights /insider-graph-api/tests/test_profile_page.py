"""Enhetstester för profilsida + llms.txt (schema_org/profile_page.py)."""
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.profile_page import render_llms_txt, render_profile_html


def _setup():
    fakefs.reset(
        client={
            "company_name": "Acme AB",
            "website": "https://acme.se",
            "company_linkedin_url": "https://www.linkedin.com/company/acme",
        },
        company_items={
            "bv1": {
                "schema_type": "Organization",
                "url": "https://www.allabolag.se/5566778899",
                "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                "included_in_output": True,
                "extra": {"name": "Acme AB", "founded": "2014", "baseline_followers": 5000},
            }
        },
        claims={
            "c1": {
                "claim_kind": "narrative",
                "subject_ref": "org",
                "statement": "Hjälper fordonstillverkare med inbyggda system",
                "source": [{"kind": "item", "item_id": "bv1"}],
                "included_in_output": True,
            }
        },
    )


class ProfileHtmlTest(unittest.TestCase):
    def test_head_has_canonical_and_meta(self):
        _setup()
        html = render_profile_html("acme")
        self.assertIn('<link rel="canonical" href="https://profiles.geogiraph.com/acme">', html)
        self.assertIn('<meta name="description"', html)
        self.assertIn('<meta name="robots" content="index, follow">', html)
        self.assertIn('property="og:title"', html)

    def test_body_has_footnotes_and_jsonld(self):
        _setup()
        html = render_profile_html("acme")
        self.assertIn('<script type="application/ld+json">', html)
        self.assertIn("Hjälper fordonstillverkare", html)
        self.assertIn("#src-1", html)  # fotnotsankare

    def test_social_metrics_not_on_page(self):
        _setup()
        self.assertNotIn("5000", render_profile_html("acme"))


class LlmsTxtTest(unittest.TestCase):
    def test_structure_and_facts(self):
        _setup()
        txt = render_llms_txt("acme")
        self.assertTrue(txt.startswith("# Acme AB"))
        self.assertIn("## Fakta", txt)
        self.assertIn("Grundat: 2014", txt)
        self.assertIn("## Källor", txt)
        self.assertIn("https://www.allabolag.se/5566778899", txt)

    def test_no_social_metrics(self):
        _setup()
        self.assertNotIn("5000", render_llms_txt("acme"))


if __name__ == "__main__":
    unittest.main()
