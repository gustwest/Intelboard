"""Enhetstester för crawl-logiken (services/web_crawl.py).

Hämtaren injiceras, så vi testar upptäckt/avgränsning utan nätverk.
"""
import unittest

from services.web_crawl import CrawlConfig, FetchResult, crawl


def _html(*links: str) -> bytes:
    body = "".join(f'<a href="{l}">x</a>' for l in links)
    return f"<html><body>{body}</body></html>".encode("utf-8")


class FakeFetcher:
    """url → FetchResult. Saknad url → None (som en 404)."""

    def __init__(self, pages: dict[str, FetchResult]):
        self.pages = pages
        self.calls: list[str] = []

    def __call__(self, url: str, max_mb: int) -> FetchResult | None:
        self.calls.append(url)
        return self.pages.get(url)


class CrawlTest(unittest.TestCase):
    def test_explicit_list_wins_and_nothing_else_fetched(self):
        pages = {
            "https://kund.se/a": FetchResult("https://kund.se/a", "html", _html()),
            "https://kund.se/b": FetchResult("https://kund.se/b", "html", _html()),
        }
        fetcher = FakeFetcher(pages)
        cfg = CrawlConfig(start_url="https://kund.se", urls=list(pages))
        res = crawl(cfg, fetcher)
        self.assertEqual({r.url for r in res}, set(pages))
        # sitemap ska aldrig sökas när explicit lista finns
        self.assertNotIn("https://kund.se/sitemap.xml", fetcher.calls)

    def test_sitemap_is_used_when_no_explicit_list(self):
        sitemap = (
            b'<?xml version="1.0"?><urlset>'
            b"<url><loc>https://kund.se/om</loc></url>"
            b"<url><loc>https://annan.se/x</loc></url>"  # annan domän → filtreras bort
            b"</urlset>"
        )
        pages = {
            "https://kund.se/sitemap.xml": FetchResult("https://kund.se/sitemap.xml", "html", sitemap),
            "https://kund.se/om": FetchResult("https://kund.se/om", "html", _html()),
        }
        res = crawl(CrawlConfig(start_url="https://kund.se"), FakeFetcher(pages))
        self.assertEqual([r.url for r in res], ["https://kund.se/om"])

    def test_bfs_follows_same_domain_within_depth(self):
        pages = {
            "https://kund.se": FetchResult(
                "https://kund.se", "html",
                _html("/om", "https://extern.se/x", "/produkter"),
            ),
            "https://kund.se/om": FetchResult("https://kund.se/om", "html", _html("/djupt")),
            "https://kund.se/produkter": FetchResult("https://kund.se/produkter", "html", _html()),
            "https://kund.se/djupt": FetchResult("https://kund.se/djupt", "html", _html()),
            "https://extern.se/x": FetchResult("https://extern.se/x", "html", _html()),
        }
        fetcher = FakeFetcher(pages)
        # ingen sitemap → fetcher returnerar None för sitemap.xml, faller till BFS
        res = crawl(CrawlConfig(start_url="https://kund.se", max_depth=1), fetcher)
        urls = {r.url for r in res}
        self.assertIn("https://kund.se", urls)
        self.assertIn("https://kund.se/om", urls)
        self.assertNotIn("https://extern.se/x", urls)   # extern domän
        self.assertNotIn("https://kund.se/djupt", urls)  # bortom max_depth=1

    def test_max_pages_caps_bfs(self):
        pages = {
            "https://kund.se": FetchResult(
                "https://kund.se", "html", _html("/a", "/b", "/c", "/d"),
            ),
            **{
                f"https://kund.se/{p}": FetchResult(f"https://kund.se/{p}", "html", _html())
                for p in ("a", "b", "c", "d")
            },
        }
        res = crawl(CrawlConfig(start_url="https://kund.se", max_pages=2), FakeFetcher(pages))
        self.assertEqual(len(res), 2)


if __name__ == "__main__":
    unittest.main()
