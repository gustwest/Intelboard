"""Enhetstester för profilsida + llms.txt (schema_org/profile_page.py)."""
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.compiler import build_render_model, compile_client
from schema_org.profile_page import RenderBudget, render_llms_txt, render_profile_html


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

    def test_lead_aggregates_split_knowsabout_facts(self):
        """A3-regression: knowsAbout kommer ofta som flera enkel-värda Fact (ett per
        skill ur derive_skill_claims). Ingressen ska lista ALLA, inte bara det första
        (gammal setdefault-bugg gav "verksamt inom AI" trots full kompetensbredd)."""
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            claims={
                "k1": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": "AI", "source": [{"kind": "manual"}], "included_in_output": True},
                "k2": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": "Sales", "source": [{"kind": "manual"}], "included_in_output": True},
                "k3": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": "Marketing", "source": [{"kind": "manual"}], "included_in_output": True},
            },
        )
        model = build_render_model("acme")
        self.assertEqual(model.lead, "Acme AB är verksamt inom AI, Sales, Marketing.")

    def test_facts_panel_consolidates_repeated_predicate(self):
        """2b: flera enkel-värda knowsAbout-fakta blir EN faktarad (ett predikat = en
        dt/dd), inte upprepade "Verksamhet:"-rader."""
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            claims={
                "k1": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": "AI", "source": [{"kind": "manual"}], "included_in_output": True},
                "k2": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": "Sales", "source": [{"kind": "manual"}], "included_in_output": True},
            },
        )
        html = render_profile_html("acme")
        facts = html.split('class="facts"', 1)[1].split("</section>", 1)[0]
        self.assertEqual(facts.count("<dt>"), 1)
        self.assertIn("AI, Sales", facts)


class Spar3FixesTest(unittest.TestCase):
    def test_faq_answers_carry_inline_source(self):
        """A6: FAQ-svar visar synlig källattribution (namn · datum), inte bara [n]."""
        _setup()  # c1 narrative med item-källa bv1 → FAQ-intro källförsedd
        html = render_profile_html("acme")
        faq = html.split('class="faq"', 1)[1].split("</section>", 1)[0]
        self.assertIn('class="cite"', faq)

    def test_og_image_and_favicon_when_logo(self):
        fakefs.reset(client={"company_name": "Acme AB", "logo_url": "https://acme.se/logo.svg",
                             "website": "https://acme.se"})
        html = render_profile_html("acme")
        self.assertIn('property="og:image"', html)
        self.assertIn('rel="icon"', html)
        self.assertIn("https://acme.se/logo.svg", html)

    def test_no_og_image_without_logo(self):
        _setup()
        self.assertNotIn('property="og:image"', render_profile_html("acme"))

    def test_empty_sources_section_omitted(self):
        """Källlös profil får ingen tom Källor-rubrik (motsade annars trust-raden)."""
        fakefs.reset(client={"company_name": "Acme AB"},
                     claims={"s1": {"claim_kind": "property", "subject_ref": "org",
                                    "predicate": "slogan", "value": "Människor först",
                                    "source": [{"kind": "manual"}], "included_in_output": True}})
        html = render_profile_html("acme")
        self.assertNotIn('class="sources"', html)
        self.assertNotIn("<h2>Källor</h2>", html)

    def test_main_landmark_present(self):
        _setup()
        self.assertIn("<main>", render_profile_html("acme"))

    def test_english_persona_heading_localized(self):
        """i18n: engelsk profil får engelsk persona-rubrik (ej hårdkodad label_sv)."""
        fakefs.reset(
            client={"company_name": "Acme Inc", "website": "https://acme.com", "language": "en"},
            company_items={"bv1": {"schema_type": "Organization", "url": "https://allabolag.se/1",
                                   "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                                   "included_in_output": True, "extra": {"name": "Allabolag"}}},
            claims={"c1": {"claim_kind": "narrative", "subject_ref": "org",
                           "statement": "Fast delivery to customers", "audience": ["customer"],
                           "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True}},
        )
        html = render_profile_html("acme")
        self.assertIn("For customer", html)
        self.assertNotIn("För kund", html)


class DemographicRenderTest(unittest.TestCase):
    def test_follower_demographic_claim_survives_social_metric_gate(self):
        """Regression: kvalitativ följar-demografi ('LinkedIn-följare …') måste RENDERAS —
        compilerns demografi-undantag släpper den förbi social-metric-spärren. Buggen var
        att mallen sa 'följare på LinkedIn' (matchar ej undantaget) → tyst bortfiltrerad."""
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={"d1": {"claim_kind": "narrative", "subject_ref": "org",
                           "statement": "Acme ABs LinkedIn-följare är i hög grad i seniora specialistroller.",
                           "audience": ["customer"],
                           "source": [{"kind": "attested", "label": "LinkedIn-data, verifierad av Geogiraph",
                                       "attested_at": "2026-05-01"}],
                           "included_in_output": True, "review_status": "approved"}},
        )
        self.assertIn("i seniora specialistroller", render_profile_html("acme"))


class AlternateNameTest(unittest.TestCase):
    def test_alternate_name_emitted_and_deduped(self):
        """2d: varumärkes-/kortnamn → Organization.alternateName; legala namnet filtreras."""
        fakefs.reset(client={"company_name": "The Insiders Hub AB",
                             "alternate_names": ["The Insiders", "The Insiders Hub AB"]})
        org = compile_client("acme")["@graph"][1]
        self.assertEqual(org["alternateName"], "The Insiders")  # legala namnet bortfiltrerat

    def test_no_alternate_name_without_field(self):
        _setup()
        org = compile_client("acme")["@graph"][1]
        self.assertNotIn("alternateName", org)


class StructureAndFreshnessTest(unittest.TestCase):
    def test_section_headings_present(self):
        """A4: faktapanel + om-sektion har egna rubriker (ren hierarki för chunking)."""
        _setup()
        html = render_profile_html("acme")
        self.assertIn("<h2>Fakta</h2>", html)
        self.assertIn("<h2>Om Acme AB</h2>", html)

    def test_prose_split_into_paragraphs(self):
        """A4: varje narrativ-claim blir ett eget <p> i om-sektionen, inte en klump."""
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            company_items={
                "bv1": {
                    "schema_type": "Organization",
                    "url": "https://www.allabolag.se/5566778899",
                    "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                    "included_in_output": True,
                    "extra": {"name": "Allabolag"},
                }
            },
            claims={
                "c1": {"claim_kind": "narrative", "subject_ref": "org",
                       "statement": "Hjälper fordonstillverkare med inbyggda system",
                       "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True},
                "c2": {"claim_kind": "narrative", "subject_ref": "org",
                       "statement": "Utsedd till årets leverantör 2023",
                       "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True},
            },
        )
        html = render_profile_html("acme")
        about = html.split('class="about"', 1)[1].split("</section>", 1)[0]
        self.assertEqual(about.count("<p>"), 2)
        self.assertIn("Hjälper fordonstillverkare", about)
        self.assertIn("årets leverantör", about)

    def test_date_modified_matches_last_source_date(self):
        """A5: Organization.dateModified = senaste källdatum (matchar trust-raden)."""
        _setup()
        graph = compile_client("acme")["@graph"]
        org = graph[0]
        self.assertEqual(org["dateModified"], "2024-03-01T00:00:00+00:00")
        # Synliga trust-raden visar samma datum mänskligt formaterat.
        self.assertIn("mars 2024", render_profile_html("acme"))


class FaqPersonaLogoTest(unittest.TestCase):
    def test_faq_covers_extended_predicates(self):
        """A6: fler predikat blir källförsedda Q&A (FAQ som evidensbärare)."""
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={"s1": {"claim_kind": "property", "subject_ref": "org",
                           "predicate": "slogan", "value": "Människor först",
                           "source": [{"kind": "manual"}], "included_in_output": True}},
        )
        html = render_profile_html("acme")
        self.assertIn("Vad står Acme AB för?", html)
        self.assertIn("Människor först", html)

    def test_persona_sections_in_html(self):
        """A7: persona-taggade claims renderas som egna sektioner i HTML (ej bara llms.txt)."""
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            company_items={
                "bv1": {"schema_type": "Organization", "url": "https://www.allabolag.se/5566778899",
                        "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                        "included_in_output": True, "extra": {"name": "Allabolag"}}
            },
            claims={"c1": {"claim_kind": "narrative", "subject_ref": "org",
                           "statement": "Snabb leverans till kunder", "audience": ["customer"],
                           "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True}},
        )
        html = render_profile_html("acme")
        self.assertIn('class="audience"', html)
        self.assertIn("För kund", html)
        audience = html.split('class="audience"', 1)[1]
        self.assertIn("Snabb leverans till kunder", audience)

    def test_no_persona_sections_when_evergreen(self):
        """A7: utan persona-taggar renderas inga audience-sektioner."""
        _setup()
        self.assertNotIn('class="audience"', render_profile_html("acme"))

    def test_logo_rendered_when_set(self):
        """A9: logotyp visas bredvid H1 när logo_url finns."""
        fakefs.reset(client={"company_name": "Acme AB", "logo_url": "https://acme.se/logo.svg"})
        html = render_profile_html("acme")
        self.assertIn('class="logo"', html)
        self.assertIn("https://acme.se/logo.svg", html)

    def test_no_logo_img_without_url(self):
        """A9: ingen img när logo saknas (rent fallback)."""
        _setup()
        self.assertNotIn('class="logo"', render_profile_html("acme"))


class LanguageTest(unittest.TestCase):
    """A1: språk väljs per kund via client.language; sv är default + oförändrat."""

    def _setup_lang(self, lang):
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se", "language": lang},
            company_items={
                "bv1": {"schema_type": "Organization", "url": "https://www.allabolag.se/x",
                        "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                        "included_in_output": True, "extra": {"name": "Allabolag", "founded": "2014"}}
            },
            claims={
                "k1": {"claim_kind": "property", "subject_ref": "org", "predicate": "knowsAbout",
                       "value": ["Embedded systems"], "source": [{"kind": "item", "item_id": "bv1"}],
                       "included_in_output": True},
                "c1": {"claim_kind": "narrative", "subject_ref": "org",
                       "statement": "Builds embedded systems for vehicles",
                       "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True},
            },
        )

    def test_english_client_renders_english(self):
        self._setup_lang("en")
        html = render_profile_html("acme")
        self.assertIn('<html lang="en">', html)
        self.assertIn("<h2>Facts</h2>", html)
        self.assertIn("<h2>About Acme AB</h2>", html)
        self.assertIn("Compiled from 1 source", html)      # trust-rad
        self.assertIn("March 2024", html)                  # månad på engelska
        self.assertIn("AI profile verified by Geogiraph.", html)  # footer
        self.assertIn("What does Acme AB do?", html)        # FAQ-intro
        self.assertNotIn("Vanliga frågor", html)            # ingen svenska kvar
        self.assertNotIn("mars 2024", html)

    def test_inlanguage_in_faq_node(self):
        self._setup_lang("en")
        graph = compile_client("acme")["@graph"]
        faq = next(n for n in graph if n.get("@type") == "FAQPage")
        self.assertEqual(faq["inLanguage"], "en")

    def test_swedish_is_default_and_unchanged(self):
        self._setup_lang("sv")
        html = render_profile_html("acme")
        self.assertIn('<html lang="sv">', html)
        self.assertIn("<h2>Fakta</h2>", html)
        self.assertIn("Sammanställd från 1 källa", html)
        self.assertIn("mars 2024", html)

    def test_unknown_language_falls_back_to_swedish(self):
        self._setup_lang("xx")
        html = render_profile_html("acme")
        self.assertIn('<html lang="sv">', html)
        self.assertIn("<h2>Fakta</h2>", html)


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


class ClaimLevelCitationTest(unittest.TestCase):
    """A2.1: ett claims VERIFIERADE verbatim-spann (ClaimSource.quote, grindat av
    claim_grounding vid persist) visas inline vid påståendet — den starkaste
    citeringsformen, korrekt på claim-nivå (till skillnad från käll-excerpt i A2)."""

    def _setup_with_quote(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            company_items={
                "bv1": {
                    "schema_type": "Organization",
                    "url": "https://www.allabolag.se/5566778899",
                    "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                    "included_in_output": True,
                    "excerpt": "Marknadsledande inom inbyggda system",
                    "extra": {"name": "Acme AB"},
                }
            },
            claims={
                "c1": {
                    "claim_kind": "narrative",
                    "subject_ref": "org",
                    "statement": "Erbjuder sex månaders extra föräldralön utöver lag",
                    "source": [{"kind": "item", "item_id": "bv1",
                                "quote": "sex månaders extra föräldralön"}],
                    "included_in_output": True,
                }
            },
        )

    def test_claim_quote_rendered_inline(self):
        self._setup_with_quote()
        html = render_profile_html("acme")
        before_sources = html.split('class="sources"')[0]
        # Claim-citatet syns INLINE vid påståendet (i cite-spannet), inte bara i botten.
        self.assertIn("sex månaders extra föräldralön", before_sources)
        self.assertIn('class="cite"', before_sources)
        self.assertIn('class="quote"', before_sources)

    def test_no_quote_means_no_inline_quote(self):
        """Bakåtkompat: claim utan quote → bara namn+datum inline; käll-excerpt
        läcker fortfarande inte upp till den inline-citerade attributionen."""
        _setup()  # originalfixturet: claim-källa utan quote
        html = render_profile_html("acme")
        before_sources = html.split('class="sources"')[0]
        self.assertNotIn("Marknadsledande", before_sources)


class A3VisibilityTest(unittest.TestCase):
    """A3 (2026-06-12): data som tidigare bara fanns i JSON-LD ska nu synas i HTML."""

    def _setup_a3(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se",
                    "org_number": "5566778899"},
            employees={"e1": {"name": "Anna Svensson", "title": "Forskningschef"}},
            company_items={
                "bv1": {
                    "schema_type": "Organization",
                    "url": "https://www.allabolag.se/5566778899",
                    "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                    "included_in_output": True,
                    "extra": {"name": "Acme AB"},
                }
            },
            claims={
                "pc1": {"claim_kind": "narrative", "subject_ref": "e1",
                        "statement": "Leder bolagets forskning inom maskininlärning",
                        "source": [{"kind": "item", "item_id": "bv1"}],
                        "included_in_output": True},
                "cert": {"claim_kind": "property", "subject_ref": "org",
                         "predicate": "hasCredential", "value": "ISO 27001",
                         "source": [{"kind": "item", "item_id": "bv1",
                                     "assurance_level": "independently_assured"}],
                         "included_in_output": True},
            },
        )

    def test_person_expertise_section_visible(self):
        """Person-expertis-claims (R1) renderas synligt, inte bara i grafen."""
        self._setup_a3()
        html = render_profile_html("acme")
        before_sources = html.split('class="sources"')[0]
        self.assertIn("Medarbetarnas expertis", before_sources)
        self.assertIn("Anna Svensson", before_sources)
        self.assertIn("Forskningschef", before_sources)
        self.assertIn("Leder bolagets forskning inom maskininlärning", before_sources)
        self.assertIn('class="expertise"', html)

    def test_assurance_level_visible_as_text(self):
        """Bestyrkandenivån (Bron #1) syns som läsbar text inline vid claimet."""
        self._setup_a3()
        html = render_profile_html("acme")
        self.assertIn('class="assurance"', html)
        self.assertIn("Oberoende bestyrkt", html)

    def test_org_number_visible(self):
        self._setup_a3()
        html = render_profile_html("acme")
        self.assertIn('class="orgnr"', html)
        self.assertIn("Org.nr", html)
        self.assertIn("5566778899", html)

    def test_no_assurance_no_label(self):
        """Auto-deriverade claims utan assurance får ingen etikett (proportionellt)."""
        _setup()  # claim-källa utan assurance_level
        self.assertNotIn('class="assurance"', render_profile_html("acme"))

    def test_no_org_number_no_row(self):
        _setup()  # ingen org_number i fixturet
        self.assertNotIn('class="orgnr"', render_profile_html("acme"))


class A2BudgetTest(unittest.TestCase):
    """A2 (2026-06-12): budget = prioritering, default INGA tak (no-truncation)."""

    def _setup_two_prose(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "website": "https://acme.se"},
            company_items={
                "bv1": {"schema_type": "Organization", "url": "https://acme.se/om",
                        "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                        "included_in_output": True, "extra": {"name": "Acme AB"}},
            },
            claims={
                "p1": {"claim_kind": "narrative", "subject_ref": "org",
                       "statement": "Levererar inbyggda system till fordonsindustrin",
                       "source": [{"kind": "item", "item_id": "bv1",
                                   "assurance_level": "independently_assured"}],
                       "included_in_output": True},
                "p2": {"claim_kind": "narrative", "subject_ref": "org",
                       "statement": "Erbjuder konsulttjänster inom mjukvara",
                       "source": [{"kind": "manual"}], "included_in_output": True},
            },
        )

    def test_default_budget_keeps_all_prose(self):
        self._setup_two_prose()
        about = render_profile_html("acme").split('class="about"', 1)[1].split("</section>", 1)[0]
        self.assertIn("Levererar inbyggda system", about)
        self.assertIn("Erbjuder konsulttjänster", about)

    def test_max_prose_keeps_highest_priority(self):
        """max_prose=1 behåller det starkast bestyrkta stycket (assurance > antal källor)."""
        self._setup_two_prose()
        html = render_profile_html("acme", RenderBudget(max_prose=1))
        about = html.split('class="about"', 1)[1].split("</section>", 1)[0]
        self.assertIn("Levererar inbyggda system", about)        # independently_assured
        self.assertNotIn("Erbjuder konsulttjänster", about)      # manual, lägre prioritet
        self.assertEqual(about.count("<p>"), 1)


if __name__ == "__main__":
    unittest.main()
