"""Kontrakts-test: identitets-snippet (kund-sajtens <head>) och kompilerad graf
(profilsidan) måste hänga ihop. @id är den hårda kopplingen — om den glider isär
ser AI-motorerna två olika entiteter och hela leveransen rasar.

Testet låser även de snippet-fält motorerna agerar på direkt (description,
mainEntityOfPage, subjectOf, sameAs som leder till fetchbar sida).
"""
import json
import re
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from config import settings
from schema_org.compiler import compile_client
from schema_org.delivery import render_identity_snippet


def _seed(**overrides):
    base = dict(
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
                "extra": {"name": "Acme AB", "founded": "2014", "lei": "ACMELEI00000000000X"},
            }
        },
        claims={
            "c1": {
                "claim_kind": "narrative",
                "subject_ref": "org",
                "statement": "Hjälper fordonstillverkare med inbyggda system",
                "source": [{"kind": "item", "item_id": "bv1"}],
                "included_in_output": True,
            },
        },
    )
    base.update(overrides)
    fakefs.reset(**base)


def _parse(snippet: str) -> dict:
    m = re.search(r'<script type="application/ld\+json">(.+?)</script>', snippet, re.DOTALL)
    assert m, f"snippeten är inte ett välformat JSON-LD-script: {snippet!r}"
    return json.loads(m.group(1))


def _org_node(graph: dict) -> dict:
    return next(n for n in graph["@graph"] if n.get("@type") == "Organization")


class IdentityContractTest(unittest.TestCase):
    """Den hårda kopplingen: @id måste vara identiskt i snippet och kompilerad graf."""

    def setUp(self):
        self._orig = (settings.cdn_clean_urls, settings.cdn_base_url)
        settings.cdn_base_url = "https://cdn.example.com"

    def tearDown(self):
        settings.cdn_clean_urls, settings.cdn_base_url = self._orig

    def test_at_id_matches_in_path_style(self):
        settings.cdn_clean_urls = False
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        org = _org_node(compile_client("acme"))
        self.assertEqual(snippet["@id"], org["@id"])
        self.assertTrue(snippet["@id"].endswith("#org"))

    def test_at_id_matches_in_clean_url_mode(self):
        settings.cdn_clean_urls = True
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        org = _org_node(compile_client("acme"))
        self.assertEqual(snippet["@id"], org["@id"])

    def test_at_id_matches_with_premium_domain(self):
        _seed(client={
            "company_name": "Acme AB",
            "website": "https://acme.se",
            "company_linkedin_url": "https://www.linkedin.com/company/acme",
            "profile_base_url": "https://ai.acme.se",
        })
        snippet = _parse(render_identity_snippet("acme"))
        org = _org_node(compile_client("acme"))
        self.assertEqual(snippet["@id"], org["@id"])
        self.assertEqual(snippet["@id"], "https://ai.acme.se#org")


class SnippetReachabilityTest(unittest.TestCase):
    """sameAs måste leda crawlers till en FETCHBAR sida med den färska grafen.
    I path-style-läget är DEFAULT_BASE aspirationell (icke-deployad) — då ska
    served_url stoppas in i sameAs så snippeten inte är en återvändsgränd."""

    def setUp(self):
        self._orig = (settings.cdn_clean_urls, settings.cdn_base_url)
        settings.cdn_base_url = "https://cdn.example.com"

    def tearDown(self):
        settings.cdn_clean_urls, settings.cdn_base_url = self._orig

    def test_sameAs_includes_served_url_in_path_style(self):
        settings.cdn_clean_urls = False
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        # Den faktiska, fetchbara profilsidan måste finnas i sameAs.
        self.assertIn("https://cdn.example.com/clients/acme/index.html", snippet["sameAs"])

    def test_sameAs_includes_served_url_in_clean_mode(self):
        settings.cdn_clean_urls = True
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertIn("https://cdn.example.com/acme/", snippet["sameAs"])

    def test_sameAs_includes_linkedin(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertIn("https://www.linkedin.com/company/acme", snippet["sameAs"])

    def test_sameAs_does_not_duplicate_url(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        # url ska inte också ligga i sameAs (rent som schema.org-konventionen)
        if snippet.get("url"):
            self.assertNotIn(snippet["url"], snippet["sameAs"])


class SnippetContentRichnessTest(unittest.TestCase):
    """Motorerna agerar på det som finns IN snippet — inte på det de måste crawla
    för att hitta. De viktiga signalerna ska därför finnas direkt på org-noden."""

    def setUp(self):
        self._orig = (settings.cdn_clean_urls, settings.cdn_base_url)
        settings.cdn_base_url = "https://cdn.example.com"

    def tearDown(self):
        settings.cdn_clean_urls, settings.cdn_base_url = self._orig

    def test_url_is_canonical_website(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertEqual(snippet["url"], "https://acme.se")

    def test_description_is_emitted_when_present(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertIn("fordonstillverkare", snippet["description"])

    def test_main_entity_of_page_anchors_to_customer_website(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertEqual(
            snippet["mainEntityOfPage"],
            {"@type": "WebPage", "@id": "https://acme.se"},
        )

    def test_subject_of_points_to_machine_readable_graph(self):
        settings.cdn_clean_urls = False
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        subj = snippet["subjectOf"]
        self.assertEqual(subj["@type"], "Dataset")
        self.assertEqual(subj["@id"], "https://cdn.example.com/clients/acme/schema.json")

    def test_lei_code_is_lifted_into_snippet(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertEqual(snippet["leiCode"], "ACMELEI00000000000X")

    def test_date_modified_reflects_latest_source(self):
        _seed()
        snippet = _parse(render_identity_snippet("acme"))
        self.assertIn("2024-03-01", snippet["dateModified"])

    def test_payload_is_minified(self):
        _seed()
        raw = render_identity_snippet("acme")
        # Minifierad JSON-LD: ingen indent, ingen radbrytning inuti payloaden.
        body = re.search(r'<script[^>]*>(.+?)</script>', raw, re.DOTALL).group(1)
        self.assertNotIn("\n  ", body)  # ingen indent
        self.assertNotIn(": ", body)    # ingen mellanslag efter kolon


class FreshClientFallbackTest(unittest.TestCase):
    """En kund utan claims/källor ska fortfarande få en giltig snippet —
    färre fält, men @id, name, url och subjectOf-pekare måste finnas."""

    def test_snippet_renders_for_empty_client(self):
        fakefs.reset(client={"company_name": "Tom AB", "website": "https://tom.se"})
        snippet = _parse(render_identity_snippet("tom"))
        self.assertEqual(snippet["name"], "Tom AB")
        self.assertEqual(snippet["url"], "https://tom.se")
        self.assertIn("@id", snippet)
        self.assertIn("subjectOf", snippet)
        self.assertNotIn("description", snippet)  # ingen prosa → ingen description
        self.assertNotIn("leiCode", snippet)


if __name__ == "__main__":
    unittest.main()
