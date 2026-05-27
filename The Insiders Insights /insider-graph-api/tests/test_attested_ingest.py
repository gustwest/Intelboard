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
        self.assertFalse(sample["included_in_output"])  # staged tills "Inkludera i leverans" bekräftas
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

    def test_replace_mode_reported_in_result(self):
        _setup()
        res = ai.ingest_attested_csv("acme", "linkedin_follower_demographics", CSV, attested_at="2026-05-01")
        self.assertEqual(res["mode"], "replace")

    def test_replace_deletes_prior_claims_same_source(self):
        # Tidigare attesterade claims från samma källtyp ska raderas; andra origin lämnas.
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "old1": {"origin": "attested:linkedin_follower_demographics",
                         "statement": "gammalt", "source": [{"kind": "attested", "attested_at": "2026-04-01"}]},
                "keep": {"origin": "attested:linkedin_posts", "statement": "annan källa"},
            },
        )
        res = ai.ingest_attested_csv(
            "acme", "linkedin_follower_demographics",
            "dimension,segment,value\nseniority,Director,1500\n", attested_at="2026-05-01",
        )
        self.assertEqual(res["removed"], 1)
        self.assertNotIn("old1", fakefs.STATE["claims"])  # raderad (replace)
        self.assertIn("keep", fakefs.STATE["claims"])      # annan källtyp → orörd

    def test_status_reports_counts_and_latest_date(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "a": {"origin": "attested:linkedin_follower_demographics", "source": [{"attested_at": "2026-04-01"}]},
                "b": {"origin": "attested:linkedin_follower_demographics", "source": [{"attested_at": "2026-05-01"}]},
            },
        )
        row = [s for s in ai.attested_status("acme") if s["key"] == "linkedin_follower_demographics"][0]
        self.assertEqual(row["staged"], 2)  # fixturen saknar included_in_output → staged
        self.assertEqual(row["included"], 0)
        self.assertEqual(row["last_attested_at"], "2026-05-01")
        self.assertEqual(row["mode"], "replace")

    def test_include_flips_staged_to_included(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "att-1": {"origin": "attested:linkedin_follower_demographics", "included_in_output": False,
                          "statement": "1500 av Acme ABs följare …", "source": [{"attested_at": "2026-05-01"}]},
            },
        )
        before = [s for s in ai.attested_status("acme") if s["key"] == "linkedin_follower_demographics"][0]
        self.assertEqual(before["staged"], 1)
        self.assertEqual(before["included"], 0)
        n = ai.include_source("acme", "linkedin_follower_demographics")
        self.assertEqual(n, 1)
        after = [s for s in ai.attested_status("acme") if s["key"] == "linkedin_follower_demographics"][0]
        self.assertEqual(after["included"], 1)
        self.assertEqual(after["staged"], 0)


class NativeSheetsTest(unittest.TestCase):
    """Native multi-flik-export (LinkedIns .xls-layout), testad på build-nivå."""

    CTX = ai.BuildCtx(company="Acme AB", attested_at="2026-05-27", url=None)

    def test_visitor_demographics_from_sheets(self):
        sheets = {
            "Visitor metrics": [["Date", "Overview page views (total)"], ["05/26/2025", "3"]],  # tidsserie → ignoreras
            "Seniority": [["Seniority", "Total views"], ["Senior", "262"], ["Director", "94"]],
            "Location": [["Location", "Total views"], ["Stockholm", "415"]],
        }
        writes = ai.SOURCE_TYPES["linkedin_visitor_demographics"].build(sheets, self.CTX)
        statements = [p["statement"] for tgt, _id, p in writes if tgt == "claim"]
        self.assertEqual(len(writes), 3)  # 2 seniority + 1 location; tidsserien räknas inte
        self.assertTrue(any("besökarna på Acme ABs LinkedIn-sida är på nivån Senior" in s for s in statements))
        self.assertTrue(any("262" in s for s in statements))

    def test_content_posts_become_socialmediaposting_without_author(self):
        sheets = {
            "All posts": [
                ["Engagement metrics for individual posts..."],  # beskrivningsrad
                ["Post title", "Post link", "Post type", "Posted by", "Created date"],
                ["Vi hjälper bolag med data.", "https://linkedin.com/post/1", "Organic", "Erik Bergqvist", "05/07/2026"],
            ],
        }
        writes = ai.SOURCE_TYPES["linkedin_content"].build(sheets, self.CTX)
        self.assertEqual(len(writes), 1)
        tgt, _id, p = writes[0]
        self.assertEqual(tgt, "raw_item")
        self.assertEqual(p["schema_type"], "SocialMediaPosting")
        self.assertEqual(p["content"], "Vi hjälper bolag med data.")
        self.assertEqual(p["url"], "https://linkedin.com/post/1")
        self.assertEqual(p["published_at"].year, 2026)
        self.assertNotIn("Erik", str(p))  # författare tas aldrig med


if __name__ == "__main__":
    unittest.main()
