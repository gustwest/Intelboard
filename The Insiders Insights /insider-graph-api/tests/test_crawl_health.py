"""Crawl-health — rena delarna (UA-igenkänning + aggregering + dok-bygge)."""
import unittest

from services import crawl_health as ch
from services import crawler_agents as ca


class TestCrawlerAgents(unittest.TestCase):
    def test_identifies_known_bots_with_category(self):
        self.assertEqual(ca.identify("Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"),
                         ("GPTBot", "ai_training"))
        self.assertEqual(ca.identify("PerplexityBot/1.0")[0], "PerplexityBot")
        self.assertEqual(ca.identify("PerplexityBot/1.0")[1], "ai_search")
        self.assertEqual(ca.identify("ChatGPT-User/1.0")[1], "ai_search")
        self.assertEqual(ca.identify("ClaudeBot/1.0")[1], "ai_training")

    def test_unknown_and_empty_are_none(self):
        self.assertIsNone(ca.identify("Mozilla/5.0 (Macintosh) Safari/605"))
        self.assertIsNone(ca.identify(""))
        self.assertIsNone(ca.identify(None))

    def test_specific_before_generic(self):
        # OAI-SearchBot ska inte fastna på en bredare GPT-regel
        self.assertEqual(ca.identify("OAI-SearchBot/1.0")[0], "OAI-SearchBot")


class TestClientFromObject(unittest.TestCase):
    def test_clean_url_layout(self):
        self.assertEqual(ch.client_from_object("TheInsidersHubAB/index.html"), "TheInsidersHubAB")
        self.assertEqual(ch.client_from_object("TheInsidersHubAB/schema.json"), "TheInsidersHubAB")

    def test_path_style_layout(self):
        self.assertEqual(ch.client_from_object("clients/Acme/index.html"), "Acme")

    def test_root_files_have_no_client(self):
        self.assertIsNone(ch.client_from_object("robots.txt"))
        self.assertIsNone(ch.client_from_object("sitemap.xml"))
        self.assertIsNone(ch.client_from_object(""))
        self.assertIsNone(ch.client_from_object(None))


def _row(ua, obj, status="200", method="GET", micros="1000"):
    return {"cs_user_agent": ua, "cs_object": obj, "sc_status": status,
            "cs_method": method, "time_micros": micros}


class TestAggregateRows(unittest.TestCase):
    KNOWN = {"TheInsidersHubAB", "Acme"}

    def test_counts_known_bots_for_known_clients(self):
        rows = [
            _row("GPTBot/1.1", "TheInsidersHubAB/index.html", micros="2000"),
            _row("GPTBot/1.1", "TheInsidersHubAB/schema.json", micros="3000"),
            _row("PerplexityBot/1.0", "TheInsidersHubAB/index.html", micros="5000"),
        ]
        agg = ch.aggregate_rows(rows, self.KNOWN)
        c = agg["TheInsidersHubAB"]
        self.assertEqual(c["total_hits"], 3)
        self.assertEqual(c["last_crawl_micros"], 5000)
        self.assertEqual(c["per_bot"]["GPTBot"]["hits"], 2)
        self.assertEqual(c["per_bot"]["GPTBot"]["last_seen_micros"], 3000)
        self.assertEqual(c["per_bot"]["GPTBot"]["artifacts"], {"index.html", "schema.json"})
        self.assertEqual(c["per_bot"]["PerplexityBot"]["hits"], 1)

    def test_filters_non_bots_unknown_clients_methods_and_errors(self):
        rows = [
            _row("Mozilla/5.0 Safari", "TheInsidersHubAB/index.html"),   # ej bot
            _row("GPTBot/1.1", "UnknownCo/index.html"),                   # okänd kund
            _row("GPTBot/1.1", "robots.txt"),                            # ingen kund
            _row("GPTBot/1.1", "TheInsidersHubAB/index.html", method="HEAD"),  # ej GET
            _row("GPTBot/1.1", "TheInsidersHubAB/index.html", status="404"),   # fel
        ]
        self.assertEqual(ch.aggregate_rows(rows, self.KNOWN), {})

    def test_304_revalidation_counts(self):
        rows = [_row("GPTBot/1.1", "TheInsidersHubAB/index.html", status="304")]
        self.assertEqual(ch.aggregate_rows(rows, self.KNOWN)["TheInsidersHubAB"]["total_hits"], 1)


class TestBuildDoc(unittest.TestCase):
    def test_zero_doc_when_no_hits(self):
        doc = ch.build_doc(None, 30, now_iso="2026-06-10T00:00:00+00:00")
        self.assertEqual(doc["total_hits"], 0)
        self.assertEqual(doc["bots_seen"], 0)
        self.assertEqual(doc["per_bot"], {})
        self.assertIsNone(doc["last_crawl_at"])
        self.assertEqual(doc["window_days"], 30)

    def test_converts_micros_to_iso_and_sorts_artifacts(self):
        agg = ch.aggregate_rows(
            [
                _row("GPTBot/1.1", "Acme/schema.json", micros="1700000000000000"),
                _row("GPTBot/1.1", "Acme/index.html", micros="1700000001000000"),
            ],
            {"Acme"},
        )
        doc = ch.build_doc(agg["Acme"], 30, now_iso="2026-06-10T00:00:00+00:00")
        self.assertEqual(doc["bots_seen"], 1)
        bot = doc["per_bot"]["GPTBot"]
        self.assertEqual(bot["artifacts"], ["index.html", "schema.json"])  # sorterad lista
        self.assertTrue(bot["last_seen"].startswith("2023-11-14"))  # micros → iso
        self.assertEqual(bot["category_label"], ca.CATEGORY_LABELS["ai_training"])


if __name__ == "__main__":
    unittest.main()
