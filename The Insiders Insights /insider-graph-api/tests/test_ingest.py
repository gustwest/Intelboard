"""Enhetstester för onboarding-ingestionen (services/ingest.py).

Verifierar orkestrering: ivalda connectors körs per kund + grafen kompileras,
och att ett fel i ett steg inte tystar de övriga. De faktiska jobben mockas.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from jobs import compile_schema, scrape_active, scrape_website
from services import claim_extraction
from services.ingest import ingest_new_client


class IngestNewClientTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            scrape_active.run_for_client,
            scrape_website.crawl_client,
            claim_extraction.extract_claims_for_client,
            compile_schema.run,
        )
        self.calls = []
        scrape_active.run_for_client = lambda cid, client: self.calls.append(("scrape_active", cid))
        scrape_website.crawl_client = lambda cid, client, force=False: self.calls.append(("website", cid, force))
        claim_extraction.extract_claims_for_client = lambda cid: self.calls.append(("extract_claims", cid))
        compile_schema.run = lambda cid: self.calls.append(("compile", cid))

    def tearDown(self):
        (
            scrape_active.run_for_client,
            scrape_website.crawl_client,
            claim_extraction.extract_claims_for_client,
            compile_schema.run,
        ) = self._orig

    def test_runs_connectors_and_compiles(self):
        fakefs.reset(client={"active_connectors": ["gleif", "website"]})
        ingest_new_client("acme")
        self.assertEqual(self.calls[0], ("scrape_active", "acme"))
        self.assertIn(("website", "acme", True), self.calls)  # force kringgår cadence-guard
        # claim-extraktion måste ske EFTER inhämtning men FÖRE compile
        names = [c[0] for c in self.calls]
        self.assertLess(names.index("extract_claims"), names.index("compile"))
        self.assertEqual(self.calls[-1], ("compile", "acme"))

    def test_website_skipped_when_not_active(self):
        fakefs.reset(client={"active_connectors": ["gleif"]})
        ingest_new_client("acme")
        self.assertNotIn("website", [c[0] for c in self.calls])
        self.assertIn(("compile", "acme"), self.calls)

    def test_missing_client_does_nothing(self):
        fakefs.reset(client=None)
        ingest_new_client("ghost")
        self.assertEqual(self.calls, [])

    def test_connector_failure_still_compiles(self):
        fakefs.reset(client={"active_connectors": ["gleif"]})

        def boom(cid, client):
            raise RuntimeError("connector nere")

        scrape_active.run_for_client = boom
        ingest_new_client("acme")
        self.assertIn(("compile", "acme"), self.calls)  # compile körs trots felet


if __name__ == "__main__":
    unittest.main()
