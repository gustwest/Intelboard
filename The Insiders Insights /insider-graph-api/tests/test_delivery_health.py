"""Enhetstester för P2 — leverans-hälsoverifiering (services/delivery_health.py).

evaluate() är ren → testas direkt. check_live() testas med injicerad fetch + fakefs.
"""
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client före routers/services
from services import delivery_health as dh

CANON = "https://profiles.geogiraph.com/acme"


def _page(*, jsonld: str | None) -> str:
    block = f'<script type="application/ld+json">{jsonld}</script>' if jsonld else ""
    return f"<!doctype html><html><head>{block}</head><body>Acme</body></html>"


_GOOD_LD = '{"@type":"Organization","@id":"https://profiles.geogiraph.com/acme",' \
    '"name":"Acme","dateModified":"2026-06-01"}'


class EvaluateTest(unittest.TestCase):
    def test_live_when_reachable_match_and_fresh(self):
        r = dh.evaluate(status=200, html=_page(jsonld=_GOOD_LD), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "live")
        self.assertTrue(r["is_live"])
        self.assertTrue(r["reachable"] and r["has_jsonld"] and r["identity_match"] and r["fresh"])

    def test_missing_when_not_reachable(self):
        r = dh.evaluate(status=0, html="", canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "missing")
        self.assertFalse(r["is_live"])

    def test_missing_when_no_jsonld(self):
        r = dh.evaluate(status=200, html=_page(jsonld=None), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "missing")

    def test_mismatch_when_jsonld_is_other_entity(self):
        other = '{"@type":"Organization","@id":"https://x.com/other","name":"Other","dateModified":"2026-06-01"}'
        r = dh.evaluate(status=200, html=_page(jsonld=other), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "mismatch")

    def test_stale_when_match_but_no_datemodified(self):
        nofresh = '{"@type":"Organization","@id":"https://profiles.geogiraph.com/acme","name":"Acme"}'
        r = dh.evaluate(status=200, html=_page(jsonld=nofresh), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "stale")

    def test_identity_match_by_company_name(self):
        byname = '{"@type":"Organization","name":"Acme","dateModified":"2026-06-01"}'
        r = dh.evaluate(status=200, html=_page(jsonld=byname), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "live")

    def test_graph_wrapper_is_flattened(self):
        graph = '{"@graph":[{"@type":"WebPage"},' + _GOOD_LD + "]}"
        r = dh.evaluate(status=200, html=_page(jsonld=graph), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "live")

    def test_broken_block_does_not_crash(self):
        r = dh.evaluate(status=200, html=_page(jsonld="{not json"), canonical=CANON, company_name="Acme")
        self.assertEqual(r["verdict"], "missing")  # inga parsebara block


class CheckLiveTest(unittest.TestCase):
    def test_uses_profile_url_and_injected_fetch(self):
        captured = {}

        def fake_fetch(url):
            captured["url"] = url
            return 200, _page(jsonld=_GOOD_LD)

        out = dh.check_live(
            "acme",
            {"company_name": "Acme", "profile_url": "https://cdn.example/acme/"},
            fetch=fake_fetch,
        )
        self.assertEqual(captured["url"], "https://cdn.example/acme/")
        self.assertEqual(out["verdict"], "live")
        self.assertIn("checked_at", out)
        self.assertEqual(out["client_id"], "acme")

    def test_network_failure_is_missing_not_exception(self):
        out = dh.check_live("acme", {"company_name": "Acme"}, fetch=lambda _u: (0, ""))
        self.assertEqual(out["verdict"], "missing")

    def test_router_404_when_client_missing(self):
        from fastapi import HTTPException
        from routers import delivery as router

        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            router.get_delivery_health("nope")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
