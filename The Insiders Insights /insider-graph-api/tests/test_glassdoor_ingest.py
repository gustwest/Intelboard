"""Tester för Glassdoor attesterad ingest (Spår B-1).

Verifierar att exporterade Glassdoor-betyg blir:
  * demonstrated culture-claims (facet=culture, warmth_mode=demonstrated, rätt dimension)
  * med assurance_level=third_party_reviewed (väger 0.7 i compute_trust_gap)
  * audience=["employee"] (employee-genererad evidens)
  * staged (included_in_output=False) tills ops bekräftar
  * betyg ≥3,5 → proof; <3,5 → markerat raw_item (ej proof, sanning utan smink)
"""
import unittest

import fakefs  # installerar fake firestore_client — först!
from services import attested_ingest as ai


def _build(rows):
    """Kör _glassdoor_build mot en CSV-liknande flik."""
    ctx = ai.BuildCtx(company="Acme AB", attested_at="2026-06-04", url="https://glassdoor.com/acme")
    return ai._glassdoor_build({"__csv__": rows}, ctx)


HEADER = ["category", "rating", "review_count"]


class DimensionMappingTest(unittest.TestCase):
    def test_categories_map_to_warmth_dimensions(self):
        writes = _build([
            HEADER,
            ["Work/Life Balance", "4.2", "138"],
            ["Culture & Values", "4.0", "138"],
            ["Career Opportunities", "3.8", "138"],
            ["Diversity & Inclusion", "4.5", "138"],
        ])
        claims = [w for w in writes if w[0] == "claim"]
        dims = {c[2]["dimension"] for c in claims}
        self.assertEqual(dims, {"wellbeing", "ethics", "development", "inclusion"})

    def test_unknown_category_skipped(self):
        writes = _build([HEADER, ["Random Category", "4.5", "10"]])
        self.assertEqual(writes, [])

    def test_swedish_aliases(self):
        writes = _build([HEADER, ["Karriärmöjligheter", "4.1", "50"]])
        self.assertEqual(writes[0][2]["dimension"], "development")


class ClaimShapeTest(unittest.TestCase):
    def test_proof_claim_is_demonstrated_culture_with_assurance(self):
        writes = _build([HEADER, ["Work/Life Balance", "4.2", "138"]])
        target, cid, payload = writes[0]
        self.assertEqual(target, "claim")
        self.assertEqual(payload["facet"], "culture")
        self.assertEqual(payload["warmth_mode"], "demonstrated")
        self.assertEqual(payload["dimension"], "wellbeing")
        self.assertEqual(payload["audience"], ["employee"])
        self.assertFalse(payload["included_in_output"])  # staged
        # Källan bär third_party_reviewed → väger 0.7 i trust_gap
        self.assertEqual(payload["source"][0]["assurance_level"], "third_party_reviewed")
        self.assertEqual(payload["source"][0]["kind"], "attested")

    def test_statement_includes_rating_and_count(self):
        writes = _build([HEADER, ["Work/Life Balance", "4.2", "138"]])
        stmt = writes[0][2]["statement"]
        self.assertIn("4,2/5", stmt)
        self.assertIn("138 recensioner", stmt)
        self.assertIn("Acme AB", stmt)

    def test_deterministic_id(self):
        a = _build([HEADER, ["Work/Life Balance", "4.2", "138"]])[0][1]
        b = _build([HEADER, ["Work/Life Balance", "4.4", "200"]])[0][1]
        self.assertEqual(a, b)  # samma kategori → samma id (omkörning skriver över)


class ThresholdTest(unittest.TestCase):
    def test_above_threshold_is_proof_claim(self):
        writes = _build([HEADER, ["Work/Life Balance", "3.5", "10"]])  # exakt tröskel
        self.assertEqual(writes[0][0], "claim")

    def test_below_threshold_is_raw_item_not_proof(self):
        writes = _build([HEADER, ["Senior Management", "2.1", "40"]])
        target, item_id, payload = writes[0]
        self.assertEqual(target, "raw_item")
        self.assertEqual(payload["content"], "")  # tom → aldrig claim-extraherat
        self.assertTrue(payload["extra"]["below_threshold"])
        self.assertEqual(payload["extra"]["rating"], 2.1)
        self.assertEqual(payload["attested_source"], "glassdoor_reviews")

    def test_mixed_upload_splits_correctly(self):
        writes = _build([
            HEADER,
            ["Work/Life Balance", "4.2", "100"],   # proof
            ["Senior Management", "2.4", "100"],   # risk (ej proof)
        ])
        claims = [w for w in writes if w[0] == "claim"]
        raws = [w for w in writes if w[0] == "raw_item"]
        self.assertEqual(len(claims), 1)
        self.assertEqual(len(raws), 1)


class ParsingRobustnessTest(unittest.TestCase):
    def test_comma_decimal(self):
        writes = _build([HEADER, ["Work/Life Balance", "4,2", "138"]])  # svensk decimal
        self.assertEqual(writes[0][0], "claim")

    def test_missing_count_ok(self):
        writes = _build([["category", "rating"], ["Work/Life Balance", "4.2"]])
        self.assertEqual(writes[0][0], "claim")
        self.assertNotIn("recensioner", writes[0][2]["statement"])

    def test_out_of_range_rating_skipped(self):
        writes = _build([HEADER, ["Work/Life Balance", "7.0", "10"]])  # ogiltigt >5
        self.assertEqual(writes, [])

    def test_empty_or_headerless_returns_empty(self):
        self.assertEqual(_build([]), [])
        self.assertEqual(_build([["foo", "bar"]]), [])


class RegistryTest(unittest.TestCase):
    def test_glassdoor_registered(self):
        self.assertIn("glassdoor_reviews", ai.SOURCE_TYPES)
        st = ai.SOURCE_TYPES["glassdoor_reviews"]
        self.assertEqual(st.mode, "replace")

    def test_ingest_end_to_end(self):
        fakefs.reset(client={"company_name": "Acme AB"}, claims={})
        csv = b"category,rating,review_count\nWork/Life Balance,4.2,138\nSenior Management,2.1,40\n"
        ai.ingest_attested("acme", "glassdoor_reviews", "glassdoor.csv", csv, attested_at="2026-06-04")
        # Proof-claimet ska ha skrivits med origin attested:glassdoor_reviews
        writes = fakefs.STATE.get("writes", {})
        proof = [v for v in writes.values() if v.get("dimension") == "wellbeing"]
        self.assertTrue(proof)
        self.assertEqual(proof[0]["origin"], "attested:glassdoor_reviews")
        self.assertEqual(proof[0]["warmth_mode"], "demonstrated")


if __name__ == "__main__":
    unittest.main()
