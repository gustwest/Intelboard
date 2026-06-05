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

    def test_aggregated_claim_skipped_even_when_included(self):
        """Regression: ett aggregerat original med review_status='aggregated' och
        included_in_output=True (gammal data) får inte fälla compile på Claim-
        validering — det ska skippas, inte renderas."""
        _graph_setup(claims={
            "agg-orphan": {
                "claim_kind": "narrative",
                "subject_ref": "org",
                "statement": "Original som slukats av ett narrative",
                "source": [{"kind": "manual", "label": "uppgift från bolaget"}],
                "included_in_output": True,   # gammal data — flaggan kvar truthy
                "review_status": "aggregated",
            },
        })
        graph = compile_client("acme")  # ska inte kasta ValidationError
        self.assertNotIn("slukats av ett narrative", repr(graph))

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

    def test_knowsabout_ordered_strongest_first(self):
        # Aktiv annons (1.0) + stängd annons som avklingat (0.7). Den fullt bevisade
        # kompetensen ska stå först i knowsAbout-listan; vikten visas aldrig som siffra.
        from datetime import timedelta

        closed_8mo = datetime.now(timezone.utc) - timedelta(days=int(8 * 30.4375))
        _graph_setup(
            company_items={
                "jp-active": {
                    "schema_type": "JobPosting",
                    "included_in_output": True,
                    "extra": {"name": "Cloud Eng", "skills": ["Kubernetes"]},
                },
                "jp-closed": {
                    "schema_type": "JobPosting",
                    "included_in_output": False,
                    "closed_at": closed_8mo,
                    "extra": {"name": "Sec", "skills": ["ISO 27001"]},
                },
            },
            claims={},
        )
        org = _nodes(compile_client("acme"), "Organization")[0]
        self.assertEqual(org["knowsAbout"], ["Kubernetes", "ISO 27001"])  # 1.0 före 0.7
        # ingen rå confidence-siffra läcker ut i grafen
        self.assertNotIn("confidence", repr(org).lower())

    def test_active_job_emits_jobposting_node_closed_does_not(self):
        from datetime import timedelta

        closed = datetime.now(timezone.utc) - timedelta(days=int(8 * 30.4375))
        _graph_setup(
            company_items={
                "jp-open": {
                    "schema_type": "JobPosting",
                    "included_in_output": True,
                    "url": "https://acme.se/jobs/1",
                    "published_at": datetime(2025, 5, 1, tzinfo=timezone.utc),
                    "global_title": "Digital Transformation Manager",
                    "extra": {"name": "Uppdragsledare", "skills": ["AWS"], "jobLocation": "Stockholm"},
                },
                "jp-closed": {
                    "schema_type": "JobPosting",
                    "included_in_output": False,
                    "closed_at": closed,
                    "extra": {"name": "Gammal roll", "skills": ["Go"]},
                },
            },
            claims={},
        )
        graph = compile_client("acme")
        jobs = _nodes(graph, "JobPosting")
        self.assertEqual(len(jobs), 1)  # bara den öppna
        job = jobs[0]
        self.assertEqual(job["title"], "Digital Transformation Manager")  # global_title vinner
        self.assertEqual(job["skills"], ["AWS"])
        self.assertEqual(job["hiringOrganization"], {"@id": "https://profiles.geogiraph.com/acme#org"})
        self.assertEqual(job["jobLocation"], {"@type": "Place", "address": "Stockholm"})
        self.assertEqual(job["datePosted"], "2025-05-01T00:00:00+00:00")

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


class ClaimReviewMarkupTest(unittest.TestCase):
    """Bestyrkande-markup (Bron #1): verifierade claims → ClaimReview-noder där
    Geogiraph går i god för bevisstyrkan, maskinläsbart och URL-agnostiskt."""

    def _assured(self, level="independently_assured", with_record=True, **claim_extra):
        claim = {
            "claim_kind": "narrative",
            "subject_ref": "org",
            "statement": "Tredjepartsmätt eNPS uppgår till 62",
            "source": [{
                "kind": "attested",
                "label": "Medarbetarundersökning, bestyrkt av Geogiraph",
                "attested_at": "2026-05-01",
                "assurance_level": level,
                "verification_id": "ver-abc123",
            }],
            "included_in_output": True,
        }
        claim.update(claim_extra)
        setup = dict(claims={"c1": claim})
        if with_record:
            setup["verifications"] = {"ver-abc123": {
                "verdict": "verified",
                "verified_at": "2026-05-01T09:00:00+00:00",
                "verification_text": "Oberoende bestyrkt av tredjepartsinstitut.",
                "expires_at": "2027-05-01T09:00:00+00:00",
            }}
        _graph_setup(**setup)

    def test_assured_claim_emits_claimreview(self):
        from schema_org.compiler import GEOGIRAPH_REVIEWER_ID

        self._assured()
        graph = compile_client("acme")
        reviews = _nodes(graph, "ClaimReview")
        self.assertEqual(len(reviews), 1)
        rev = reviews[0]
        # pekar på rätt claim-nod
        claim = [c for c in _nodes(graph, "Claim") if "eNPS" in c["text"]][0]
        self.assertEqual(rev["itemReviewed"]["@id"], claim["@id"])
        # Geogiraph går i god för — via det konstanta reviewer-IRI:t
        self.assertEqual(rev["author"]["@id"], GEOGIRAPH_REVIEWER_ID)
        self.assertEqual(rev["author"]["name"], "Geogiraph")
        # betyget avser bevisstyrka, inte sanningshalt
        self.assertEqual(rev["reviewAspect"], "assurance")
        self.assertEqual(rev["reviewRating"]["ratingValue"], 3)
        self.assertEqual(rev["reviewRating"]["bestRating"], 3)
        self.assertEqual(rev["reviewRating"]["alternateName"], "Oberoende bestyrkt")
        # berikat ur Verification-recordet
        self.assertEqual(rev["datePublished"], "2026-05-01T09:00:00+00:00")
        self.assertEqual(rev["reviewBody"], "Oberoende bestyrkt av tredjepartsinstitut.")
        self.assertEqual(rev["expires"], "2027-05-01T09:00:00+00:00")

    def test_unverified_claims_emit_no_claimreview(self):
        # Default-setupen: item- och manual-källor utan assurance_level.
        _graph_setup()
        self.assertEqual(_nodes(compile_client("acme"), "ClaimReview"), [])

    def test_self_declared_rated_lowest(self):
        self._assured(level="self_declared")
        rev = _nodes(compile_client("acme"), "ClaimReview")[0]
        self.assertEqual(rev["reviewRating"]["ratingValue"], 1)
        self.assertEqual(rev["reviewRating"]["alternateName"], "Självdeklarerad")

    def test_strongest_assurance_wins_across_sources(self):
        # Samma claim styrkt av två källor: självdeklarerad + oberoende bestyrkt.
        # Betyget ska spegla den starkaste (3), inte den första/svagaste.
        _graph_setup(claims={"c1": {
            "claim_kind": "narrative", "subject_ref": "org",
            "statement": "Klimatmål verifierat mot SBTi",
            "source": [
                {"kind": "manual", "label": "uppgift från bolaget",
                 "assurance_level": "self_declared", "verification_id": "ver-weak"},
                {"kind": "attested", "label": "SBTi-bestyrkande", "attested_at": "2026-04-01",
                 "assurance_level": "independently_assured", "verification_id": "ver-strong"},
            ],
            "included_in_output": True,
        }})
        rev = _nodes(compile_client("acme"), "ClaimReview")[0]
        self.assertEqual(rev["reviewRating"]["ratingValue"], 3)

    def test_claimreview_url_agnostic_under_profile_base_url(self):
        # URL-agnostiskt: review/claim-@id följer kundens profil-bas (Bron #2 byter
        # bara denna), men vem som intygar är konstant oavsett hosting.
        from schema_org.compiler import GEOGIRAPH_REVIEWER_ID

        _graph_setup(
            client={"company_name": "Acme AB", "profile_base_url": "https://profil.acme.se"},
            claims={"c1": {
                "claim_kind": "narrative", "subject_ref": "org",
                "statement": "Tredjepartsmätt eNPS uppgår till 62",
                "source": [{
                    "kind": "attested", "label": "Medarbetarundersökning, bestyrkt av Geogiraph",
                    "attested_at": "2026-05-01", "assurance_level": "independently_assured",
                    "verification_id": "ver-abc123",
                }],
                "included_in_output": True,
            }},
            verifications={"ver-abc123": {
                "verdict": "verified", "verified_at": "2026-05-01T09:00:00+00:00",
                "verification_text": "Oberoende bestyrkt av tredjepartsinstitut.",
            }},
        )
        rev = _nodes(compile_client("acme"), "ClaimReview")[0]
        self.assertTrue(rev["@id"].startswith("https://profil.acme.se#review-"))
        self.assertTrue(rev["itemReviewed"]["@id"].startswith("https://profil.acme.se#claim-"))
        # bestyrkande part oförändrad — inte härledd ur kundens bas
        self.assertEqual(rev["author"]["@id"], GEOGIRAPH_REVIEWER_ID)

    def test_degrades_gracefully_without_verification_record(self):
        # assurance_level satt men inget Verification-record → ClaimReview byggs ändå
        # ur nivån; datum/text utelämnas hellre än att kasta.
        self._assured(with_record=False)
        rev = _nodes(compile_client("acme"), "ClaimReview")[0]
        self.assertEqual(rev["reviewRating"]["ratingValue"], 3)
        self.assertNotIn("reviewBody", rev)
        self.assertNotIn("datePublished", rev)


if __name__ == "__main__":
    unittest.main()
