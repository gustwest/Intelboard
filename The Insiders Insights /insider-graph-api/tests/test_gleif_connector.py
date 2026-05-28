"""Enhetstester för GLEIF-connectorns parsning/orkestrering (connectors/gleif.py).

GLEIF-anropen (_get) mockas — vi verifierar Level 1-extraktion, Level 2-relationer
(moder + paginerade dotterbolag) och robusthet när relationer saknas. Inget nätverk.
"""
import unittest

import connectors.gleif as gleif
from connectors.base import ConnectorConfig


def _record(lei, name, city=None, country=None, status=None, registered_as=None):
    entity = {"legalName": {"name": name}}
    if city or country:
        entity["legalAddress"] = {"city": city, "country": country}
    if registered_as:
        entity["registeredAs"] = registered_as
    attrs = {"lei": lei, "entity": entity}
    if status:
        attrs["registration"] = {"status": status}
    return {"type": "lei-records", "id": lei, "attributes": attrs}


class GleifFetchTest(unittest.TestCase):
    def setUp(self):
        self._orig_get = gleif._get

    def tearDown(self):
        gleif._get = self._orig_get

    def _install(self, responses):
        gleif._get = lambda path, params=None: responses.get(path)

    def _fetch(self, lei):
        return gleif.GleifConnector().fetch(
            ConnectorConfig(client_id="acme", params={"lei": lei})
        )

    def test_level1_and_paginated_children(self):
        lei = "PARENT0000000000000X"
        self._install({
            f"/lei-records/{lei}": {"data": _record(lei, "Acme Group AB", "Göteborg", "SE", "ISSUED")},
            f"/lei-records/{lei}/direct-parent": None,  # ingen moder
            f"/lei-records/{lei}/direct-children": {
                "data": [_record("CHILD1", "Acme Nordic AB"), _record("CHILD2", "Acme Tech AB")],
                "links": {"next": f"{gleif.API_BASE}/lei-records/{lei}/direct-children?page=2"},
            },
            f"/lei-records/{lei}/direct-children?page=2": {
                "data": [_record("CHILD3", "Acme Labs AB")],
                "links": {},
            },
        })
        items = self._fetch(lei)
        self.assertEqual(len(items), 1)
        extra = items[0].extra
        self.assertEqual(extra["lei"], lei)
        self.assertEqual(extra["name"], "Acme Group AB")
        self.assertEqual(extra["address"], "Göteborg, SE")
        self.assertEqual(extra["registration_status"], "ISSUED")
        self.assertNotIn("parent_organization", extra)
        # paginering ihopslagen, ordning bevarad
        self.assertEqual([s["lei"] for s in extra["subsidiaries"]], ["CHILD1", "CHILD2", "CHILD3"])

    def test_parent_and_no_children(self):
        lei = "CHILD000000000000001"
        self._install({
            f"/lei-records/{lei}": {"data": _record(lei, "Acme Nordic AB")},
            f"/lei-records/{lei}/direct-parent": {"data": _record("PARENTLEI00000000001", "Acme Group AB")},
            f"/lei-records/{lei}/direct-children": None,  # 404 → inga barn
        })
        extra = self._fetch(lei)[0].extra
        self.assertEqual(extra["parent_organization"], {"name": "Acme Group AB", "lei": "PARENTLEI00000000001"})
        self.assertNotIn("subsidiaries", extra)

    def test_unknown_lei_returns_empty(self):
        self._install({})  # allt → None (404)
        self.assertEqual(self._fetch("NOPE"), [])

    def test_missing_lei_param_returns_empty(self):
        items = gleif.GleifConnector().fetch(ConnectorConfig(client_id="acme", params={}))
        self.assertEqual(items, [])

    def test_registered_as_lifts_to_org_number(self):
        """Lokal identifierare (svenska bolag: org.nr från Bolagsverket) → extra.org_number.
        Identity-enrichment lyfter sedan upp värdet till client_doc."""
        lei = "ACMELEI00000000000Y"
        self._install({
            f"/lei-records/{lei}": {"data": _record(lei, "Acme AB", registered_as="5566778899")},
            f"/lei-records/{lei}/direct-parent": None,
            f"/lei-records/{lei}/direct-children": None,
        })
        extra = self._fetch(lei)[0].extra
        self.assertEqual(extra["org_number"], "5566778899")

    def test_no_registered_as_no_org_number(self):
        lei = "NOREG00000000000000Z"
        self._install({
            f"/lei-records/{lei}": {"data": _record(lei, "Foreign Co.")},
            f"/lei-records/{lei}/direct-parent": None,
            f"/lei-records/{lei}/direct-children": None,
        })
        extra = self._fetch(lei)[0].extra
        self.assertNotIn("org_number", extra)

    def test_child_pagination_capped(self):
        lei = "LOOP00000000000000001"
        # next pekar alltid framåt → oändlig paginering; MAX_CHILD_PAGES ska bryta.
        def fake_get(path, params=None):
            if path == f"/lei-records/{lei}":
                return {"data": _record(lei, "Loopy AB")}
            if "direct-children" in path:
                return {"data": [_record("C", "Child AB")],
                        "links": {"next": f"{gleif.API_BASE}/lei-records/{lei}/direct-children?page=next"}}
            return None
        gleif._get = fake_get
        extra = self._fetch(lei)[0].extra
        # taket bryter efter MAX_CHILD_PAGES hämtningar (1 barn/sida här)
        self.assertEqual(len(extra["subsidiaries"]), gleif.MAX_CHILD_PAGES)


if __name__ == "__main__":
    unittest.main()
