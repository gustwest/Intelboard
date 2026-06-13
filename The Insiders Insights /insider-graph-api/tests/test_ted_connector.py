"""Enhetstester för TED-connectorn (connectors/ted.py) + social-proof-härledningen
(schema_org/claims.derive_contract_claims).

Sök-API:t (_search) mockas — vi verifierar query-konstruktionen (OR av org.nr-former +
SORT BY), notis-parsningen (språk-mappar, links-träd, vinnardubbelkoll) och att en
TED-notis blir ett källförsett customer-taggat narrative-claim. Inget nätverk.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först

import connectors.ted as ted
from connectors.base import ConnectorConfig
from schema_org.claims import derive_contract_claims


def _notice(pub, winners, buyer_swe=None, title_swe=None, date=None):
    n = {"publication-number": pub, "winner-identifier": winners}
    if buyer_swe is not None:
        n["buyer-name"] = {"swe": [buyer_swe]}
    if title_swe is not None:
        n["notice-title"] = {"swe": [title_swe]}
    if date:
        n["publication-date"] = date
    n["links"] = {"html": {"SWE": f"https://ted.europa.eu/sv/notice/-/detail/{pub}"}}
    return n


class TedFetchTest(unittest.TestCase):
    def setUp(self):
        self._orig = ted._search

    def tearDown(self):
        ted._search = self._orig

    def _fetch(self, org, notices, capture=None):
        def fake_search(query):
            if capture is not None:
                capture["query"] = query
            return notices
        ted._search = fake_search
        return ted.TedConnector().fetch(ConnectorConfig(client_id="acme", params={"org_number": org}))

    def test_builds_items_from_notices(self):
        notices = [
            _notice("468084-2023", ["556569-3792"], buyer_swe="Trafikkontoret", title_swe="Konsulttjänster", date="2023-08-01Z"),
            _notice("326072-2024", ["556569-3792", "5560000000"], buyer_swe="Region Skåne", date="2024-05-01Z"),
        ]
        items = self._fetch("5565693792", notices)
        self.assertEqual(len(items), 2)
        a = items[0]
        self.assertEqual(a.source, "ted")
        self.assertEqual(a.item_id, "ted-5565693792-468084-2023")
        self.assertEqual(a.extra["buyer"], "Trafikkontoret")
        self.assertEqual(a.extra["notice_year"], "2023")
        self.assertFalse(a.extra["multiple_winners"])
        self.assertEqual(a.url, "https://ted.europa.eu/sv/notice/-/detail/468084-2023")
        self.assertTrue(items[1].extra["multiple_winners"])  # två vinnare

    def test_query_ors_org_forms_and_sorts(self):
        cap = {}
        self._fetch("5565693792", [], capture=cap)
        q = cap["query"]
        self.assertIn('winner-identifier="556569-3792"', q)   # streckform
        self.assertIn('winner-identifier="SE556569379201"', q)  # VAT-form
        self.assertIn('winner-identifier="5565693792"', q)    # rentsiffrig
        self.assertIn(" OR ", q)
        self.assertIn("SORT BY publication-date DESC", q)

    def test_double_check_drops_non_winner(self):
        # Servern skulle inte returnerat den här, men om den gör det ska vår org.nr-koll
        # släppa notisen (vinnaren är ett annat bolag).
        items = self._fetch("5565693792", [_notice("999-2024", ["5560000000"], buyer_swe="X")])
        self.assertEqual(items, [])

    def test_vat_form_winner_matches(self):
        # Vinnaren lagrad som VAT (SE+org+01) → org.nr som delsträng → matchar.
        items = self._fetch("5564834173", [_notice("422982-2023", ["SE556483417301"], buyer_swe="Y")])
        self.assertEqual(len(items), 1)

    def test_missing_buyer_skipped(self):
        items = self._fetch("5565693792", [_notice("1-2024", ["556569-3792"], buyer_swe=None)])
        self.assertEqual(items, [])

    def test_bad_org_number_returns_empty_without_search(self):
        called = {"n": 0}
        ted._search = lambda q: called.__setitem__("n", called["n"] + 1) or []
        out = ted.TedConnector().fetch(ConnectorConfig(client_id="acme", params={"org_number": "123"}))
        self.assertEqual(out, [])
        self.assertEqual(called["n"], 0)  # ogiltigt org.nr → inget API-anrop


class TedContractClaimsTest(unittest.TestCase):
    def _item(self, **extra):
        base = {"buyer": "Trafikkontoret", "notice_year": "2024", "multiple_winners": False}
        base.update(extra)
        return {"source": "ted", "included_in_output": True,
                "url": "https://ted.europa.eu/sv/notice/-/detail/1-2024", "extra": base}

    def test_ted_item_becomes_sourced_customer_claim(self):
        fakefs.reset(client={"company_name": "Acme AB"},  # defaults inkl. customer
                     company_items={"ted-x-1-2024": self._item()})
        claims = list(derive_contract_claims("acme"))
        self.assertEqual(len(claims), 1)
        c = claims[0]
        self.assertEqual(c.claim_kind, "narrative")
        self.assertIn("Trafikkontoret", c.statement)
        self.assertIn("2024", c.statement)
        self.assertEqual(c.source[0].kind, "item")          # STARK källa (TED-notisen)
        self.assertEqual(c.source[0].item_id, "ted-x-1-2024")
        self.assertEqual(c.audience, ["customer"])
        self.assertEqual(c.warmth_mode, "demonstrated")

    def test_audience_gated_to_active_personas(self):
        fakefs.reset(client={"company_name": "Acme AB", "personas": {"active": ["talent"]}},
                     company_items={"ted-x-1-2024": self._item()})
        self.assertEqual(list(derive_contract_claims("acme"))[0].audience, [])

    def test_multiple_winners_phrasing(self):
        fakefs.reset(client={"company_name": "Acme AB"},
                     company_items={"ted-x-1-2024": self._item(multiple_winners=True)})
        self.assertIn("en av flera leverantörer", list(derive_contract_claims("acme"))[0].statement)

    def test_non_ted_items_ignored(self):
        fakefs.reset(client={"company_name": "Acme AB"},
                     company_items={"g1": {"source": "gleif", "included_in_output": True, "extra": {"lei": "X"}}})
        self.assertEqual(list(derive_contract_claims("acme")), [])


if __name__ == "__main__":
    unittest.main()
