"""Enhetstester för relevans-lagret (services/relevance.py).

Fokus: heuristisk förfiltrering (brus-URL:er, paginering, dedup, minlängd) och
path-prioritering (startsida + faktasidor först). LLM-grinden mockas bort genom
att anropa heuristic_filter/prioritize direkt — inget nätverk, ingen LLM.
"""
import unittest

from services import relevance
from services.relevance import Candidate

_LONG = "x" * 300  # passerar MIN_TEXT_LEN


def _cand(url, text=_LONG, title=None):
    return Candidate(url=url, title=title, text=text)


class HeuristicFilterTest(unittest.TestCase):
    def test_keeps_normal_company_page(self):
        out = relevance.heuristic_filter([_cand("https://kund.se/tjanster")])
        self.assertEqual(len(out), 1)

    def test_drops_too_short(self):
        out = relevance.heuristic_filter([_cand("https://kund.se/om", text="kort")])
        self.assertEqual(out, [])

    def test_drops_legal_and_login_noise(self):
        urls = [
            "https://kund.se/cookies",
            "https://kund.se/integritet",
            "https://kund.se/wp-login.php",
            "https://kund.se/kassa",
        ]
        out = relevance.heuristic_filter([_cand(u) for u in urls])
        self.assertEqual(out, [])

    def test_drops_seo_archive_pages(self):
        urls = [
            "https://kund.se/tag/ekonomi",
            "https://kund.se/taggar/ai",
            "https://kund.se/category/nyheter",
            "https://kund.se/kategori/blogg",
            "https://kund.se/author/anna",
            "https://kund.se/forfattare/erik",
            "https://kund.se/sok?q=test",
        ]
        out = relevance.heuristic_filter([_cand(u) for u in urls])
        self.assertEqual(out, [], f"kvar: {[c.url for c in out]}")

    def test_drops_pagination(self):
        urls = [
            "https://kund.se/blogg/page/2",
            "https://kund.se/nyheter/sida/3",
            "https://kund.se/artiklar?page=4",
        ]
        out = relevance.heuristic_filter([_cand(u) for u in urls])
        self.assertEqual(out, [])

    def test_does_not_overmatch_legit_paths(self):
        # 'category'/'tag' som delsträng i ett riktigt ord ska INTE filtreras bort.
        # Distinkt text per sida så dedupen inte stör mätningen av brus-filtret.
        out = relevance.heuristic_filter([
            _cand("https://kund.se/kategorisering-av-data", text="A" + _LONG),  # 'kategori' + bokstav
            _cand("https://kund.se/contact", text="B" + _LONG),                 # 'contact' ≠ 'cart'
        ])
        self.assertEqual(len(out), 2, f"kvar: {[c.url for c in out]}")

    def test_dedupes_near_identical(self):
        same = "Acme bygger plattformar för logistik. " * 20
        out = relevance.heuristic_filter([
            _cand("https://kund.se/a", text=same),
            _cand("https://kund.se/b", text=same),
        ])
        self.assertEqual(len(out), 1)


class PathRankTest(unittest.TestCase):
    def test_homepage_is_highest(self):
        self.assertEqual(relevance.path_rank("https://kund.se"), 0)
        self.assertEqual(relevance.path_rank("https://kund.se/"), 0)

    def test_known_fact_pages_rank_above_generic(self):
        for url in [
            "https://kund.se/om-oss",
            "https://kund.se/team",
            "https://kund.se/tjanster",
            "https://kund.se/kontakt",
            "https://kund.se/karriar/utvecklare",
        ]:
            self.assertEqual(relevance.path_rank(url), 1, url)

    def test_unknown_page_is_lowest(self):
        self.assertEqual(relevance.path_rank("https://kund.se/blogg/inlagg-42"), 2)

    def test_prioritize_orders_home_then_facts_then_rest(self):
        cands = [
            _cand("https://kund.se/blogg/x"),
            _cand("https://kund.se/team"),
            _cand("https://kund.se/"),
        ]
        out = relevance.prioritize(cands)
        self.assertEqual([c.url for c in out],
                         ["https://kund.se/", "https://kund.se/team", "https://kund.se/blogg/x"])

    def test_prioritize_is_stable_within_tier(self):
        # Två lika-rankade sidor (båda tier 2) behåller inbördes ordning.
        cands = [_cand("https://kund.se/b"), _cand("https://kund.se/a")]
        out = relevance.prioritize(cands)
        self.assertEqual([c.url for c in out], ["https://kund.se/b", "https://kund.se/a"])


if __name__ == "__main__":
    unittest.main()
