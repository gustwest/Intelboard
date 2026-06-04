"""Tester för Wikipedia/Wikidata-connectorn (Spår B-3).

Mockar httpx-anropen. Verifierar:
  * Exakt Q-id krävs (ingen luddig matchning); ogiltigt id → tom lista
  * Wikidata-egenskaper → rätt extra-fält (founded/address/industry/lei/website)
  * Entity-värdade egenskaper (HQ/bransch) slås upp till etiketter
  * Wikipedia-extract → content; kanonisk URL → RawItem.url (→ sameAs)
  * Felhantering: temporärt fel → tom lista, kastar aldrig
  * search_wikidata för onboarding
"""
import unittest
from unittest import mock

from connectors import REGISTRY
from connectors.base import ConnectorConfig
from connectors.wikipedia import WikipediaConnector, search_wikidata


def _cfg(qid):
    return ConnectorConfig(client_id="acme", params={"wikidata_id": qid})


# Realistiskt Wikidata-entity-svar (förenklat).
_ENTITY = {
    "labels": {"sv": {"value": "Acme AB"}, "en": {"value": "Acme Inc"}},
    "claims": {
        "P571": [{"mainsnak": {"datavalue": {"value": {"time": "+1998-03-01T00:00:00Z"}}}}],
        "P159": [{"mainsnak": {"datavalue": {"value": {"id": "Q1234"}}}}],
        "P452": [{"mainsnak": {"datavalue": {"value": {"id": "Q5678"}}}}],
        "P856": [{"mainsnak": {"datavalue": {"value": "https://acme.se"}}}],
        "P1278": [{"mainsnak": {"datavalue": {"value": "5493001KJTIIGC8Y1R12"}}}],
    },
    "sitelinks": {"svwiki": {"title": "Acme AB"}},
}
_REF_LABELS = {"Q1234": "Göteborg", "Q5678": "mjukvaruutveckling"}
_SUMMARY = {
    "extract": "Acme AB är ett svenskt mjukvarubolag grundat 1998.",
    "content_urls": {"desktop": {"page": "https://sv.wikipedia.org/wiki/Acme_AB"}},
}


def _fake_fetch(connector):
    """Patcha de tre nätverks-helpers connectorn använder."""
    return mock.patch.multiple(
        "connectors.wikipedia",
        _get_entity=mock.DEFAULT,
        _get_labels=mock.DEFAULT,
        _wikipedia_article=mock.DEFAULT,
    )


class FetchTest(unittest.TestCase):
    def _run(self, qid="Q95", entity=_ENTITY):
        with mock.patch("connectors.wikipedia._get_entity", return_value=entity), \
             mock.patch("connectors.wikipedia._get_labels", return_value=_REF_LABELS), \
             mock.patch("connectors.wikipedia._wikipedia_article",
                        return_value=("https://sv.wikipedia.org/wiki/Acme_AB", _SUMMARY["extract"])):
            return WikipediaConnector().fetch(_cfg(qid))

    def test_emits_organization_item(self):
        items = self._run()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].schema_type, "Organization")
        self.assertEqual(items[0].source, "wikipedia")
        self.assertEqual(items[0].item_id, "wikipedia-Q95")

    def test_scalar_properties_mapped(self):
        extra = self._run()[0].extra
        self.assertEqual(extra["founded"], "1998")
        self.assertEqual(extra["lei"], "5493001KJTIIGC8Y1R12")
        self.assertEqual(extra["official_website"], "https://acme.se")
        self.assertEqual(extra["name"], "Acme AB")
        self.assertEqual(extra["wikidata_id"], "Q95")

    def test_entity_properties_resolved_to_labels(self):
        extra = self._run()[0].extra
        # HQ (Q1234) + bransch (Q5678) slås upp till läsbara etiketter
        self.assertEqual(extra["address"], "Göteborg")
        self.assertEqual(extra["industry"], "mjukvaruutveckling")

    def test_extract_becomes_content_and_url_is_canonical(self):
        item = self._run()[0]
        self.assertIn("mjukvarubolag", item.content)
        self.assertEqual(item.url, "https://sv.wikipedia.org/wiki/Acme_AB")

    def test_no_wikipedia_article_falls_back_to_wikidata_url(self):
        with mock.patch("connectors.wikipedia._get_entity", return_value={**_ENTITY, "sitelinks": {}}), \
             mock.patch("connectors.wikipedia._get_labels", return_value=_REF_LABELS), \
             mock.patch("connectors.wikipedia._wikipedia_article", return_value=(None, None)):
            item = WikipediaConnector().fetch(_cfg("Q95"))[0]
        self.assertEqual(item.url, "https://www.wikidata.org/wiki/Q95")
        self.assertEqual(item.content, "")


class GuardrailTest(unittest.TestCase):
    def test_invalid_qid_returns_empty(self):
        for bad in ("", "95", "abc", "Qxyz", "12Q"):
            self.assertEqual(WikipediaConnector().fetch(_cfg(bad)), [])

    def test_unknown_entity_returns_empty(self):
        with mock.patch("connectors.wikipedia._get_entity", return_value=None):
            self.assertEqual(WikipediaConnector().fetch(_cfg("Q99999999")), [])

    def test_no_fuzzy_name_matching_in_fetch(self):
        # fetch tar BARA wikidata_id — aldrig company_name. Säkerställ att namn ignoreras.
        cfg = ConnectorConfig(client_id="acme", params={"company_name": "Acme"})
        self.assertEqual(WikipediaConnector().fetch(cfg), [])


class RegistryTest(unittest.TestCase):
    def test_registered(self):
        self.assertIn("wikipedia", REGISTRY)
        self.assertEqual(REGISTRY["wikipedia"], WikipediaConnector)

    def test_metadata_shape(self):
        from connectors import all_metadata
        meta = {m["id"]: m for m in all_metadata()}["wikipedia"]
        self.assertEqual(meta["fetch_method"], "api")
        self.assertEqual(meta["output_types"], ["Organization"])
        self.assertEqual(meta["input_fields"][0]["name"], "wikidata_id")


class SearchTest(unittest.TestCase):
    def test_search_returns_candidates(self):
        with mock.patch("connectors.wikipedia._get_json", return_value={
            "search": [
                {"id": "Q95", "label": "Google", "description": "amerikanskt teknikföretag"},
                {"id": "Q9366", "label": "Google Search", "description": "sökmotor"},
            ]
        }):
            out = search_wikidata("Google")
        self.assertEqual(out[0]["id"], "Q95")
        self.assertEqual(out[0]["name"], "Google")

    def test_empty_query_returns_empty(self):
        self.assertEqual(search_wikidata("  "), [])


if __name__ == "__main__":
    unittest.main()
