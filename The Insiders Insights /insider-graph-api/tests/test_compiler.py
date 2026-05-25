"""Enhetstester för JSON-LD-kompilatorn (schema_org/compiler.py)."""
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.compiler import compile_client


def _graph_setup(**overrides):
    base = dict(
        client={
            "company_name": "Acme AB",
            "website": "https://acme.se",
            "company_linkedin_url": "https://www.linkedin.com/company/acme",
        },
        employees={"emp_1": {"name": "Anna Svensson", "title": "VD"}},
        company_items={
            "bv1": {
                "schema_type": "Organization",
                "url": "https://www.allabolag.se/5566778899",
                "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                "included_in_output": True,
                "extra": {"name": "Acme AB", "founded": "2014", "address": "Göteborg", "baseline_followers": 5000},
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
            "c2": {
                "claim_kind": "narrative",
                "subject_ref": "org",
                "statement": "Utsedd till årets leverantör 2023",
                "source": [{"kind": "manual", "label": "uppgift från bolaget"}],
                "included_in_output": True,
            },
        },
    )
    base.update(overrides)
    fakefs.reset(**base)


def _nodes(graph, typ):
    return [n for n in graph["@graph"] if n["@type"] == typ]


class CompileClientTest(unittest.TestCase):
    def test_org_properties_projected_from_property_claims(self):
        _graph_setup()
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertEqual(org["@id"], "https://profiles.geogiraph.com/acme#org")
        self.assertEqual(org["foundingDate"], "2014")
        self.assertEqual(org["address"], "Göteborg")

    def test_social_metrics_never_emitted(self):
        _graph_setup()
        org = _nodes(compile_client("acme"), "Organization")[0]
        blob = repr(org)
        self.assertNotIn("5000", blob)
        self.assertNotIn("ollow", blob)  # followers/follower

    def test_description_built_from_narrative_claims(self):
        _graph_setup()
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertIn("Hjälper fordonstillverkare", org["description"])
        self.assertIn("årets leverantör", org["description"])

    def test_manual_claim_has_no_isbasedon(self):
        _graph_setup()
        claims = _nodes(compile_client("acme"), "Claim")
        manual = [c for c in claims if "årets leverantör" in c["text"]][0]
        self.assertNotIn("isBasedOn", manual)
        item_backed = [c for c in claims if "fordonstillverkare" in c["text"]][0]
        self.assertIn("isBasedOn", item_backed)

    def test_sameas_links_company_and_sources(self):
        _graph_setup()
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertIn("https://acme.se", org["sameAs"])
        self.assertIn("https://www.allabolag.se/5566778899", org["sameAs"])

    def test_profile_base_url_override(self):
        _graph_setup(
            client={
                "company_name": "Acme AB",
                "profile_base_url": "https://profil.acme.se",
            }
        )
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertEqual(org["@id"], "https://profil.acme.se#org")

    def test_rejected_claims_excluded(self):
        _graph_setup(
            claims={
                "c1": {
                    "claim_kind": "narrative",
                    "subject_ref": "org",
                    "statement": "Avvisat påstående",
                    "source": [{"kind": "manual", "label": "x"}],
                    "included_in_output": True,
                    "review_status": "rejected",
                }
            }
        )
        claims = _nodes(compile_client("acme"), "Claim")
        self.assertFalse(any("Avvisat" in c["text"] for c in claims))

    def test_faqpage_emitted_with_cited_answers(self):
        _graph_setup()
        faq = _nodes(compile_client("acme"), "FAQPage")
        self.assertEqual(len(faq), 1)
        questions = {q["name"]: q["acceptedAnswer"] for q in faq[0]["mainEntity"]}
        self.assertIn("Vad gör Acme AB?", questions)
        self.assertIn("När grundades Acme AB?", questions)
        # faktasvar bär proveniens via citation
        self.assertIn("citation", questions["När grundades Acme AB?"])
        self.assertIn("2014", questions["När grundades Acme AB?"]["text"])

    def test_missing_client_raises(self):
        fakefs.reset(client=None)
        with self.assertRaises(KeyError):
            compile_client("ghost")


if __name__ == "__main__":
    unittest.main()
