"""Enhetstester för profilsida + llms.txt (schema_org/profile_page.py)."""
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.compiler import build_render_model
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
                "excerpt": "Marknadsledande inom inbyggda system",
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

    def test_faq_section_rendered(self):
        _setup()
        html = render_profile_html("acme")
        self.assertIn("Vanliga frågor", html)
        self.assertIn("När grundades Acme AB?", html)

    def test_inline_source_attribution_visible(self):
        """A2: källans namn+datum syns inline vid påståendet, inte bara i källistan."""
        _setup()
        html = render_profile_html("acme")
        self.assertIn('class="cite"', html)
        # Datumet ska finnas i den inline-renderade attributionen (inte bara i botten).
        before_sources = html.split('class="sources"')[0]
        self.assertIn("mars 2024", before_sources)

    def test_excerpt_rendered_as_quote_in_bibliography(self):
        """A2: källans ordagranna utdrag visas som citat i KÄLListan (källnivå),
        inte inline vid ett enskilt claim (där det skulle antyda fel proveniens)."""
        _setup()
        html = render_profile_html("acme")
        self.assertIn('class="quote"', html)
        self.assertIn("Marknadsledande inom inbyggda system", html)
        # Citatet hör hemma i bibliografin, inte i den inline-citerade attributionen.
        before_sources, sources_section = html.split('class="sources"', 1)
        self.assertNotIn("Marknadsledande", before_sources)
        self.assertIn("Marknadsledande", sources_section)

    def test_footnote_anchor_still_present(self):
        """A2 får inte regressa fotnotsankaret till bibliografin."""
        _setup()
        html = render_profile_html("acme")
        self.assertIn("#src-1", html)


class LeadIngressTest(unittest.TestCase):
    def test_ingress_rendered_before_facts(self):
        """A3: ledmeningen front-loadas — renderas före faktapanelen."""
        _setup()
        html = render_profile_html("acme")
        self.assertIn('class="lead"', html)
        self.assertLess(html.index('class="lead"'), html.index('class="facts"'))

    def test_templated_lead_from_facts(self):
        """A3: med verksamhet/säte/grundande byggs en självständig ledmening."""
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            company_items={
                "bv1": {
                    "schema_type": "Organization",
                    "url": "https://www.allabolag.se/5566778899",
                    "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                    "included_in_output": True,
                    "extra": {"name": "Acme AB", "founded": "2014"},
                }
            },
            claims={
                "k1": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": ["Inbyggda system", "Fordonsindustri"],
                       "source": [{"kind": "manual"}], "included_in_output": True},
                "a1": {"claim_kind": "property", "subject_ref": "org", "predicate": "address",
                       "value": "Göteborg", "source": [{"kind": "manual"}], "included_in_output": True},
            },
        )
        model = build_render_model("acme")
        self.assertIsNotNone(model.lead)
        self.assertTrue(model.lead.startswith("Acme AB är verksamt inom"))
        self.assertIn("med säte i Göteborg", model.lead)
        self.assertIn("grundat 2014", model.lead)

    def test_lead_falls_back_to_prose_without_facts(self):
        """A3: utan verksamhets-fakta används starkaste prosan som ingress."""
        _setup()  # ingen knowsAbout → prosa-fallback
        model = build_render_model("acme")
        self.assertEqual(model.lead, "Hjälper fordonstillverkare med inbyggda system.")


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

    def test_faq_in_llms_txt(self):
        _setup()
        txt = render_llms_txt("acme")
        self.assertIn("## Frågor & svar", txt)
        self.assertIn("### När grundades Acme AB?", txt)


if __name__ == "__main__":
    unittest.main()
