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

    def test_corporate_structure_projected_to_org_node(self):
        _graph_setup(
            company_items={
                "g1": {
                    "schema_type": "Organization",
                    "url": "https://search.gleif.org/#/record/CHILD000000000000001",
                    "included_in_output": True,
                    "extra": {
                        "lei": "CHILD000000000000001",
                        "parent_organization": {"name": "Acme Group AB", "lei": "PARENTLEI00000000001"},
                        "subsidiaries": [{"name": "Acme Tech AB", "lei": "T1"}],
                    },
                }
            },
            claims={},
        )
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertEqual(org["leiCode"], "CHILD000000000000001")
        self.assertEqual(
            org["parentOrganization"],
            {"@type": "Organization", "name": "Acme Group AB", "leiCode": "PARENTLEI00000000001"},
        )
        self.assertEqual(
            org["subOrganization"],
            {"@type": "Organization", "name": "Acme Tech AB", "leiCode": "T1"},
        )

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

    def test_duplicate_narrative_claims_merge_and_union_sources(self):
        # Samma påstående från två källor → ett claim, båda källorna förenade.
        same = "Hjälper fordonstillverkare med inbyggda system"
        _graph_setup(
            company_items={
                "bv1": {"schema_type": "Organization", "url": "https://allabolag.se/x",
                        "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                        "included_in_output": True, "extra": {}},
                "li1": {"schema_type": "SocialMediaPosting", "url": "https://linkedin.com/post/1",
                        "published_at": datetime(2024, 5, 1, tzinfo=timezone.utc),
                        "included_in_output": True, "extra": {}},
            },
            claims={
                "c1": {"claim_kind": "narrative", "subject_ref": "org", "statement": same,
                       "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True},
                "c2": {"claim_kind": "narrative", "subject_ref": "org", "statement": same + ".",  # nästan-exakt
                       "source": [{"kind": "item", "item_id": "li1"}], "included_in_output": True},
            },
        )
        graph = compile_client("acme")
        org = _nodes(graph, "Organization")[0]
        # bara en mening i description (inte dubblerad)
        self.assertEqual(org["description"].count("Hjälper fordonstillverkare"), 1)
        # ett narrative Claim, med båda källorna i isBasedOn
        narr = [c for c in _nodes(graph, "Claim") if "fordonstillverkare" in c["text"]]
        self.assertEqual(len(narr), 1)
        self.assertEqual(len(narr[0]["isBasedOn"]), 2)

    def test_attested_source_emitted_as_verified_dataset(self):
        _graph_setup(
            claims={
                "c1": {
                    "claim_kind": "narrative",
                    "subject_ref": "org",
                    "statement": "1500 ledare följer aktivt bolaget på LinkedIn",
                    "source": [{
                        "kind": "attested",
                        "label": "LinkedIn-data, verifierad av Geogiraph",
                        "attested_at": "2026-05-01",
                        "url": "https://www.linkedin.com/company/acme",
                    }],
                    "included_in_output": True,
                }
            }
        )
        graph = compile_client("acme")
        datasets = _nodes(graph, "Dataset")
        self.assertEqual(len(datasets), 1)
        src = datasets[0]
        self.assertEqual(src["name"], "LinkedIn-data, verifierad av Geogiraph")
        self.assertEqual(src["datePublished"], "2026-05-01")
        self.assertEqual(src["sdPublisher"], {"@type": "Organization", "name": "Geogiraph"})
        # claimet pekar på den attesterade källan
        claim = [c for c in _nodes(graph, "Claim") if "1500 ledare" in c["text"]][0]
        self.assertEqual(claim["isBasedOn"]["@id"], src["@id"])
        # publik ankare hamnar i sameAs
        org = _nodes(graph, "Organization")[0]
        self.assertIn("https://www.linkedin.com/company/acme", org["sameAs"])

    def test_attested_source_without_url_has_no_link(self):
        _graph_setup(
            claims={
                "c1": {
                    "claim_kind": "narrative",
                    "subject_ref": "org",
                    "statement": "Följarbasen domineras av seniora beslutsfattare",
                    "source": [{"kind": "attested", "label": "LinkedIn-data, verifierad av Geogiraph",
                                "attested_at": "2026-05-01"}],
                    "included_in_output": True,
                }
            }
        )
        src = _nodes(compile_client("acme"), "Dataset")[0]
        self.assertNotIn("url", src)
        self.assertEqual(src["sdPublisher"]["name"], "Geogiraph")

    def test_missing_client_raises(self):
        fakefs.reset(client=None)
        with self.assertRaises(KeyError):
            compile_client("ghost")


if __name__ == "__main__":
    unittest.main()
