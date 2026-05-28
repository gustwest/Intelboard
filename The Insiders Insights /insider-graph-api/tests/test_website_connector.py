"""Enhetstester för website-connectorns orkestrering (connectors/website.py).

crawl, text-extraktion och relevans-grindning mockas — vi verifierar att
connectorn chunkar, sätter stabila id:n, fyller proveniens-metadata och håller
budgeten. Inget nätverk, ingen LLM.
"""
import unittest

from connectors import readers, website
from connectors.base import ConnectorConfig
from connectors.readers import Document
from services.web_crawl import FetchResult


class WebsiteConnectorTest(unittest.TestCase):
    def setUp(self):
        self._orig_crawl = website.crawl
        self._orig_extract = readers.extract
        self._orig_apply = website.relevance.apply
        self._orig_budget = website.TOTAL_CHUNK_BUDGET
        # relevans = identitet (behåll alla sidor) så vi testar orkestrering isolerat
        website.relevance.apply = lambda cands, gate_llm=None: cands

    def tearDown(self):
        website.crawl = self._orig_crawl
        readers.extract = self._orig_extract
        website.relevance.apply = self._orig_apply
        website.TOTAL_CHUNK_BUDGET = self._orig_budget

    def _run(self, params):
        connector = website.WebsiteConnector()
        return connector.fetch(ConnectorConfig(client_id="acme", params={"website": params}))

    def test_empty_config_returns_nothing(self):
        self.assertEqual(self._run({}), [])

    def test_emits_chunks_with_stable_ids_and_provenance(self):
        website.crawl = lambda cfg: [FetchResult("https://kund.se/om", "html", b"")]
        readers.extract = lambda url, ct, raw: Document(text="Acme bygger plattformar.", title="Om", content_type="html")

        items = self._run({"start_url": "https://kund.se"})
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item.source, "website")
        self.assertEqual(item.schema_type, "Organization")
        self.assertEqual(item.url, "https://kund.se/om")
        self.assertTrue(item.item_id.startswith("web-"))
        self.assertEqual(item.extra["chunk_index"], 0)
        self.assertEqual(item.extra["content_type"], "html")
        self.assertEqual(item.extra["name"], "Om")

    def test_stable_id_is_deterministic(self):
        website.crawl = lambda cfg: [FetchResult("https://kund.se/om", "html", b"")]
        readers.extract = lambda url, ct, raw: Document(text="text", title=None, content_type="html")
        first = self._run({"start_url": "https://kund.se"})[0].item_id
        second = self._run({"start_url": "https://kund.se"})[0].item_id
        self.assertEqual(first, second)  # omkörning → samma id → idempotent persist

    def test_scanned_pdf_is_skipped(self):
        website.crawl = lambda cfg: [FetchResult("https://kund.se/r.pdf", "pdf", b"")]
        readers.extract = lambda url, ct, raw: Document(text="", title=None, content_type="pdf", needs_ocr=True)
        self.assertEqual(self._run({"start_url": "https://kund.se"}), [])

    def test_og_image_lifts_to_first_chunk_only(self):
        """og:image hamnar i FÖRSTA chunkens extra.logo_url så identity-enrichment
        inte snubblar över samma värde N gånger för samma sida."""
        long_text = "Acme bygger plattformar. " * 200  # → flera chunks
        website.crawl = lambda cfg: [FetchResult("https://kund.se", "html", b"")]
        readers.extract = lambda url, ct, raw: Document(
            text=long_text, title="Hem", content_type="html",
            image="https://kund.se/og.png",
        )
        items = self._run({"start_url": "https://kund.se"})
        self.assertGreater(len(items), 1)
        self.assertEqual(items[0].extra["logo_url"], "https://kund.se/og.png")
        for it in items[1:]:
            self.assertNotIn("logo_url", it.extra)

    def test_no_og_image_no_logo_field(self):
        website.crawl = lambda cfg: [FetchResult("https://kund.se", "html", b"")]
        readers.extract = lambda url, ct, raw: Document(text="text", title=None, content_type="html")
        items = self._run({"start_url": "https://kund.se"})
        self.assertNotIn("logo_url", items[0].extra)

    def test_total_budget_caps_output(self):
        website.TOTAL_CHUNK_BUDGET = 2
        long_text = "mening. " * 2000  # många chunks
        website.crawl = lambda cfg: [FetchResult("https://kund.se/om", "html", b"")]
        readers.extract = lambda url, ct, raw: Document(text=long_text, title="Om", content_type="html")
        items = self._run({"start_url": "https://kund.se"})
        self.assertEqual(len(items), 2)


if __name__ == "__main__":
    unittest.main()
