"""Integrationstester — connectorerna i HELA loopen, inte bara fetch() isolerat.

Dessa hade fångat wiring-glappet (wikidata_id saknades i scrape_active-params)
som enhetstesterna missade. Verifierar att:

  WIKIPEDIA: scrape_active.run_for_client → connector får wikidata_id från
  client-doc → raw_item skrivs → derive_property_claims gör founded/address/
  industry/lei-claims → sameAs (källans URL).

  GLASSDOOR: attested ingest (staged) → iter_culture_claims SER dem INTE förrän
  included_in_output=True → efter include räknar compute_trust_gap demonstrated-
  vikten (third_party_reviewed = 0.7).
"""
import unittest
from unittest import mock

import fakefs  # installerar fake firestore_client — först!


class WikipediaLoopWiringTest(unittest.TestCase):
    """scrape_active måste skicka wikidata_id till connectorn — annars körs den aldrig."""

    def test_scrape_active_passes_wikidata_id(self):
        from jobs import scrape_active
        captured = {}

        class _FakeWiki:
            id = "wikipedia"
            def fetch(self, config):
                captured["params"] = config.params
                return []

        fakefs.reset(client={"company_name": "Acme", "wikidata_id": "Q95",
                             "active_connectors": ["wikipedia"]}, company_items={})
        with mock.patch("connectors.get", return_value=_FakeWiki), \
             mock.patch("jobs.scrape_active.record_run"), \
             mock.patch("jobs.scrape_active.apply_identity_metadata"):
            scrape_active.run_for_client("acme", fakefs.STATE["client"])
        # Glappet som fanns: wikidata_id saknades i params → connectorn fick None.
        self.assertEqual(captured["params"].get("wikidata_id"), "Q95")

    def test_full_chain_wikidata_to_property_claims(self):
        from jobs import scrape_active
        from schema_org.claims import derive_property_claims

        # Riktig WikipediaConnector, men nätverket mockat → raw_item skrivs av scrape_active.
        fakefs.reset(client={"company_name": "Acme AB", "wikidata_id": "Q95",
                             "active_connectors": ["wikipedia"]}, company_items={})
        with mock.patch("connectors.wikipedia._get_entity", return_value={
                 "labels": {"sv": {"value": "Acme AB"}},
                 "claims": {
                     "P571": [{"mainsnak": {"datavalue": {"value": {"time": "+1998-01-01T00:00:00Z"}}}}],
                     "P159": [{"mainsnak": {"datavalue": {"value": {"id": "Q1234"}}}}],
                     "P1278": [{"mainsnak": {"datavalue": {"value": "5493001KJTIIGC8Y1R12"}}}],
                 },
                 "sitelinks": {"svwiki": {"title": "Acme AB"}},
             }), \
             mock.patch("connectors.wikipedia._get_labels", return_value={"Q1234": "Göteborg"}), \
             mock.patch("connectors.wikipedia._wikipedia_article",
                        return_value=("https://sv.wikipedia.org/wiki/Acme_AB", "Acme AB är ett mjukvarubolag.")), \
             mock.patch("jobs.scrape_active.record_run"), \
             mock.patch("jobs.scrape_active.apply_identity_metadata"):
            scrape_active.run_for_client("acme", fakefs.STATE["client"])

        # raw_item ska ha skrivits till company_items
        items = fakefs.STATE["company_items"]
        self.assertIn("wikipedia-Q95", items)
        wiki_item = items["wikipedia-Q95"]
        self.assertEqual(wiki_item["url"], "https://sv.wikipedia.org/wiki/Acme_AB")
        self.assertEqual(wiki_item["extra"]["founded"], "1998")
        self.assertEqual(wiki_item["extra"]["address"], "Göteborg")

        # derive_property_claims ska göra operationella claims av extra-fälten
        claims = list(derive_property_claims("acme"))
        preds = {(c.predicate, str(c.value)) for c in claims}
        self.assertIn(("foundingDate", "1998"), preds)
        self.assertIn(("address", "Göteborg"), preds)
        self.assertIn(("leiCode", "5493001KJTIIGC8Y1R12"), preds)


class GlassdoorLoopIntegrationTest(unittest.TestCase):
    """Glassdoor-claims är staged → räknas i trust_gap FÖRST efter include."""

    def _ingest(self):
        from services import attested_ingest as ai
        csv = b"category,rating,review_count\nWork/Life Balance,4.4,150\n"
        ai.ingest_attested("acme", "glassdoor_reviews", "gd.csv", csv, attested_at="2026-06-04")

    def test_staged_claim_not_in_trust_gap_until_included(self):
        from schema_org.claims import iter_culture_claims
        fakefs.reset(client={"company_name": "Acme AB"}, claims={})
        self._ingest()
        # Direkt efter ingest: claim finns men included_in_output=False → osynlig för trust_gap
        culture_before = [c for c in iter_culture_claims("acme") if c.dimension == "wellbeing"]
        self.assertEqual(culture_before, [])

    def test_included_glassdoor_claim_weights_demonstrated(self):
        from schema_org.claims import iter_culture_claims
        from jobs import compute_trust_gap as ctg
        fakefs.reset(client={"company_name": "Acme AB"}, claims={})
        self._ingest()
        # Simulera operatörens "Inkludera i leverans": flippa included_in_output
        gd_id = next(k for k, v in fakefs.STATE["writes"].items()
                     if v.get("dimension") == "wellbeing")
        # writes-bucketen är där attested-claims hamnar i fakefs; lyft in i claims + inkludera
        claim = {**fakefs.STATE["writes"][gd_id], "included_in_output": True}
        fakefs.reset(client={"company_name": "Acme AB"}, claims={gd_id: claim})

        culture = [c for c in iter_culture_claims("acme") if c.dimension == "wellbeing"]
        self.assertEqual(len(culture), 1)
        self.assertEqual(culture[0].warmth_mode, "demonstrated")
        self.assertEqual(culture[0].source[0].assurance_level, "third_party_reviewed")
        # compute_trust_gap ska väga demonstrated > 0 på wellbeing (third_party_reviewed=0.7)
        doc = ctg.compute("acme")
        self.assertGreater(doc["dimensions"]["wellbeing"]["demonstrated"], 0.0)


if __name__ == "__main__":
    unittest.main()
