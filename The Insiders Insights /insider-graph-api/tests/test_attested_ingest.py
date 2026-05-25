"""Enhetstester för attesterad ingestion (services/attested_ingest.py)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.attested_ingest as ai

CSV = """dimension,segment,value
seniority,Director,1500
seniority,VP,400
function,Engineering,900
location,Stockholm,1200
okänd_dimension,Något,999
"""


def _setup():
    fakefs.reset(client={"company_name": "Acme AB"})


class AttestedIngestTest(unittest.TestCase):
    def test_writes_attested_claims_with_label_and_date(self):
        _setup()
        result = ai.ingest_attested_csv(
            "acme", "linkedin_follower_demographics", CSV,
            attested_at="2026-05-01", url="https://www.linkedin.com/company/acme",
        )
        self.assertEqual(result["written"], 4)  # 2 seniority + 1 function + 1 location; okänd dim ignoreras
        claims = list(fakefs.writes().values())
        sample = claims[0]
        src = sample["source"][0]
        self.assertEqual(src["kind"], "attested")
        self.assertEqual(src["label"], "LinkedIn-data, verifierad av Geogiraph")
        self.assertEqual(src["attested_at"], "2026-05-01")
        self.assertTrue(sample["included_in_output"])
        self.assertFalse(sample["needs_review"])

    def test_statement_uses_company_and_value(self):
        _setup()
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics", CSV, attested_at="2026-05-01")
        statements = [c["statement"] for c in fakefs.writes().values()]
        self.assertTrue(any("1500 av Acme ABs LinkedIn-följare är på nivån Director" in s for s in statements))
        self.assertTrue(any("Engineering" in s for s in statements))

    def test_unknown_dimension_is_skipped(self):
        _setup()
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics", CSV, attested_at="2026-05-01")
        statements = " ".join(c["statement"] for c in fakefs.writes().values())
        self.assertNotIn("okänd", statements)

    def test_reupload_overwrites_same_segment(self):
        _setup()
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics",
                               "dimension,segment,value\nseniority,Director,1500\n", attested_at="2026-05-01")
        first_ids = set(fakefs.writes().keys())
        _setup()  # nollställ writes men behåll kund
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics",
                               "dimension,segment,value\nseniority,Director,1700\n", attested_at="2026-06-01")
        second_ids = set(fakefs.writes().keys())
        self.assertEqual(first_ids, second_ids)  # samma id → överskrivning, ingen dubblett

    def test_unknown_source_type_raises(self):
        _setup()
        with self.assertRaises(ValueError):
            ai.ingest_attested_csv("acme", "bogus", CSV, attested_at="2026-05-01")

    def test_missing_client_raises(self):
        fakefs.reset(client=None)
        with self.assertRaises(ValueError):
            ai.ingest_attested_csv("ghost", "linkedin_follower_demographics", CSV, attested_at="2026-05-01")

    def test_invalid_csv_raises(self):
        _setup()
        with self.assertRaises(ValueError):
            ai.ingest_attested_csv("acme", "linkedin_follower_demographics", "fel,kolumner\n1,2\n", attested_at="2026-05-01")


if __name__ == "__main__":
    unittest.main()
