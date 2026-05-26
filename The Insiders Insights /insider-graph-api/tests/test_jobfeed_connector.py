"""Enhetstester för jobfeed-connectorn (connectors/jobfeed.py).

Verifierar parsning av både ATS-XML (<job>) och RSS-fallback (<item>), att varje
annons får ett stabilt, klient-bundet item_id (idempotent persist) och att den
externa job_id exponeras i extra — det är den diff-loopen i jobs/xml_sync.py
behöver för att upptäcka stängda jobb. Inget nätverk.
"""
import unittest
import xml.etree.ElementTree as ET

from connectors.base import ConnectorConfig
from connectors.jobfeed import JobFeedConnector, _entry_to_raw, _iter_jobs, _stable_item_id

ATS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<jobs>
  <job>
    <id>123</id><title>Senior Cloud Engineer</title>
    <description>AWS, ISO 27001, Kubernetes</description>
    <url>https://x.teamtailor.com/jobs/123</url>
    <location>Stockholm</location>
    <created-at>Mon, 05 May 2025 10:00:00 +0000</created-at>
  </job>
  <job>
    <id>456</id><title>Hallbarhetschef</title>
    <description>ESG, CSRD</description>
    <url>https://x.teamtailor.com/jobs/456</url>
  </job>
</jobs>"""

RSS_XML = """<?xml version="1.0"?>
<rss><channel>
  <item><guid>RSS-9</guid><title>DevOps Lead</title>
  <description>Terraform</description><link>https://k.se/9</link></item>
</channel></rss>"""


class JobFeedParseTest(unittest.TestCase):
    def _items(self, xml: str):
        root = ET.fromstring(xml.encode("utf-8"))
        return [_entry_to_raw("acme", j, "https://feed") for j in _iter_jobs(root)]

    def test_parses_ats_jobs(self):
        items = self._items(ATS_XML)
        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first.schema_type, "JobPosting")
        self.assertEqual(first.source, "jobfeed")
        self.assertEqual(first.extra["job_id"], "123")
        self.assertEqual(first.extra["name"], "Senior Cloud Engineer")
        self.assertEqual(first.extra["jobLocation"], "Stockholm")
        self.assertEqual(first.url, "https://x.teamtailor.com/jobs/123")
        # strategiska kompetenser extraheras och persistas direkt i extra (spec §2/§3)
        self.assertEqual(first.extra["skills"], ["AWS", "ISO 27001", "Kubernetes"])
        self.assertEqual(items[1].extra["skills"], ["CSRD", "ESG"])

    def test_rss_fallback_when_no_job_elements(self):
        items = self._items(RSS_XML)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].extra["job_id"], "RSS-9")
        self.assertEqual(items[0].schema_type, "JobPosting")

    def test_stable_id_is_deterministic_and_client_scoped(self):
        self.assertEqual(_stable_item_id("acme", "123"), _stable_item_id("acme", "123"))
        self.assertNotEqual(_stable_item_id("acme", "123"), _stable_item_id("other", "123"))
        # samma annons → samma id över körningar → idempotent overwrite
        self.assertEqual(self._items(ATS_XML)[0].item_id, self._items(ATS_XML)[0].item_id)

    def test_empty_feeds_returns_nothing(self):
        connector = JobFeedConnector()
        self.assertEqual(connector.fetch(ConnectorConfig(client_id="acme", params={})), [])

    def test_entry_without_id_or_link_is_skipped(self):
        root = ET.fromstring(b"<jobs><job><description>tom</description></job></jobs>")
        self.assertEqual([_entry_to_raw("acme", j, "u") for j in _iter_jobs(root)], [None])


if __name__ == "__main__":
    unittest.main()
