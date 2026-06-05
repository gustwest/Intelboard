"""Tester för persona-projektion i schema.org-compilern + llms.txt (Fas 2.1f).

Verifierar att Claim.audience flödar hela vägen till:
  * Schema.org Audience-noder på Claim-noderna i JSON-LD-grafen
  * "## För <persona>"-sektioner i llms.txt

Bakåtkompat: claims utan audience (evergreen) emitterar ingen Audience-markup
och hamnar inte i någon persona-sektion.
"""
import unittest
from datetime import datetime, timezone

import fakefs  # installerar fake firestore_client — först!
from schema_org.compiler import compile_client
from schema_org.profile_page import render_llms_txt


def _setup(claims):
    fakefs.reset(
        client={"company_name": "Acme AB", "website": "https://acme.se"},
        company_items={
            "src1": {
                "schema_type": "Organization",
                "url": "https://www.allabolag.se/123",
                "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                "included_in_output": True,
                "extra": {"name": "Acme AB"},
            }
        },
        claims=claims,
    )


def _claim(statement, audience=None, kind="narrative", **over):
    base = {
        "claim_kind": kind,
        "subject_ref": "org",
        "statement": statement,
        "source": [{"kind": "item", "item_id": "src1"}],
        "included_in_output": True,
    }
    if audience is not None:
        base["audience"] = audience
    base.update(over)
    return base


def _claim_nodes(graph):
    return [n for n in graph["@graph"] if n.get("@type") == "Claim"]


class AudienceMarkupTest(unittest.TestCase):

    def test_evergreen_claim_has_no_audience(self):
        # Claim utan audience → ingen Audience-markup på noden
        _setup({"c1": _claim("Hjälper fordonstillverkare", audience=[])})
        nodes = _claim_nodes(compile_client("acme"))
        self.assertTrue(nodes)
        for n in nodes:
            self.assertNotIn("audience", n)

    def test_single_persona_emits_audience_object(self):
        _setup({"c1": _claim("Tar in 50% traineer per år", audience=["talent"])})
        nodes = _claim_nodes(compile_client("acme"))
        target = next(n for n in nodes if "traineer" in n["text"])
        self.assertIn("audience", target)
        aud = target["audience"]
        # Singel-persona → ett objekt (inte lista)
        self.assertEqual(aud["@type"], "Audience")
        self.assertEqual(aud["audienceType"], "Employee")  # employee.schema_audience_type
        self.assertEqual(aud["name"], "Talang")

    def test_multi_persona_emits_list(self):
        _setup({"c1": _claim("Stark ESG-profil", audience=["investor", "regulator"])})
        nodes = _claim_nodes(compile_client("acme"))
        target = next(n for n in nodes if "ESG" in n["text"])
        aud = target["audience"]
        self.assertIsInstance(aud, list)
        types = {a["audienceType"] for a in aud}
        self.assertEqual(types, {"Investor", "GovernmentAudience"})

    def test_unknown_persona_skipped_in_markup(self):
        # Okänd persona-id (t.ex. avregistrerad) → hoppas tyst över, ingen trasig markup
        _setup({"c1": _claim("Ett påstående", audience=["customer", "weird_persona"])})
        nodes = _claim_nodes(compile_client("acme"))
        target = next(n for n in nodes if "påstående" in n["text"])
        aud = target["audience"]
        # Bara customer ska finnas — weird_persona filtreras bort
        if isinstance(aud, list):
            types = {a["audienceType"] for a in aud}
        else:
            types = {aud["audienceType"]}
        self.assertEqual(types, {"Customer"})

    def test_audience_node_well_formed(self):
        _setup({"c1": _claim("X", audience=["customer"])})
        nodes = _claim_nodes(compile_client("acme"))
        aud = next(n for n in nodes if n["text"] == "X")["audience"]
        self.assertEqual(set(aud.keys()), {"@type", "audienceType", "name"})


class LlmsTxtSectionsTest(unittest.TestCase):

    def test_persona_sections_rendered(self):
        _setup({
            "c1": _claim("Tar in 50% traineer per år", audience=["talent"]),
            "c2": _claim("Stark finansiell tillväxt", audience=["investor"]),
            "c3": _claim("Hjälper fordonstillverkare", audience=[]),  # evergreen
        })
        txt = render_llms_txt("acme")
        # Persona-sektioner ska finnas med svensk rubrik
        self.assertIn("## för talang", txt.lower())
        self.assertIn("## för investerare", txt.lower())
        # Persona-taggade claims hamnar under rätt rubrik
        self.assertIn("traineer", txt)
        self.assertIn("finansiell tillväxt", txt)

    def test_evergreen_claims_not_in_persona_sections(self):
        # Evergreen-claim (tom audience) ska INTE skapa en persona-sektion
        _setup({"c1": _claim("Hjälper fordonstillverkare", audience=[])})
        txt = render_llms_txt("acme")
        self.assertNotIn("## för ", txt.lower())

    def test_claim_under_multiple_personas_appears_in_each(self):
        # Claim taggat för flera personor visas i varje sektion (medveten redundans)
        _setup({"c1": _claim("Transparent styrning och rapportering",
                             audience=["investor", "regulator"])})
        txt = render_llms_txt("acme")
        self.assertIn("## för investerare", txt.lower())
        self.assertIn("## för myndighet", txt.lower())
        # Texten ska förekomma i båda sektionerna → minst 2 gånger
        self.assertGreaterEqual(txt.count("Transparent styrning"), 2)

    def test_sections_in_registry_order(self):
        # customer (idx 0) före investor (idx 2) i registry → samma i llms.txt
        _setup({
            "c1": _claim("Investerar-relevant", audience=["investor"]),
            "c2": _claim("Kund-relevant", audience=["customer"]),
        })
        txt = render_llms_txt("acme").lower()
        self.assertLess(txt.index("## för kund"), txt.index("## för investerare"))


if __name__ == "__main__":
    unittest.main()
