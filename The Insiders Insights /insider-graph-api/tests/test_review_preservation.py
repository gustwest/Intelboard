"""Granskningsbevarande vid (om)extraktion och omladdning.

Kärngarantin: ett claim som en operatör redan tagit ställning till får ALDRIG
nollställas tillbaka till granskningskön när extraktionsjobbet kör om på oförändrad
källa, och en bekräftad "Inkludera i leverans" får inte tyst falla bort när samma
attesterade data laddas upp på nytt.

Verifierar services/claim_extraction._merge_preserving_review (via det transaktionella
fs.write_claim_preserving_review-säte:t) och services/attested_ingest._existing_inclusion.
"""
import json
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.attested_ingest as ai
import services.claim_extraction as ce


class _Resp:
    def __init__(self, content: str):
        self.content = content


class _FakeLLM:
    """Returnerar förbestämda claims vid generering och ett fast valideringssvar."""

    def __init__(self, claims: list[dict], supported: bool = True):
        self._claims = claims
        self._supported = supported

    def invoke(self, messages):
        if "faktagranskare" in messages[0].content:  # valideringspasset
            return _Resp(json.dumps({"supported": self._supported}))
        return _Resp(json.dumps({"claims": self._claims}))


_CLAIM = {"statement": "Acme AB lanserade en plattform 2023", "chunks": ["C1"],
          "quote": "lanserade en plattform 2023", "confidence": 0.4}  # lågt → granskningskö


def _setup_one_source():
    fakefs.reset(
        client={"company_name": "Acme AB"},
        company_items={"src1": {"content": "Acme AB lanserade en plattform 2023."}},
    )


class ClaimReviewPreservationTest(unittest.TestCase):
    def tearDown(self):
        ce._pick_generator = _orig_pick_generator
        ce._pick_validator = _orig_pick_validator

    def _use(self, llm):
        ce._pick_generator = lambda: llm
        ce._pick_validator = lambda: llm

    def _extract_one_into_queue(self) -> tuple[str, dict]:
        """Kör extraktionen en gång → ett lågkonfident claim i granskningskön."""
        _setup_one_source()
        self._use(_FakeLLM([dict(_CLAIM)]))
        ce.extract_claims_for_client("acme")
        (cid, written), = fakefs.writes().items()
        self.assertTrue(written["needs_review"])  # hamnade i kön
        return cid, written

    def test_approved_claim_survives_reextraction(self):
        cid, written = self._extract_one_into_queue()
        # Operatören godkänner i Granska-fliken (review-flödets fält, routers/review.py).
        fakefs.STATE["claims"][cid] = {
            **written, "review_status": "approved", "review_note": "ser bra ut",
            "reviewed_at": "2026-06-07T10:00:00+00:00", "needs_review": False, "included_in_output": True,
        }
        fakefs.STATE["writes"].clear()
        # Dygnsjobbet kör om extraktionen på samma källa → samma deterministiska id.
        ce.extract_claims_for_client("acme")
        redone = fakefs.writes()[cid]
        self.assertEqual(redone["review_status"], "approved")
        self.assertFalse(redone["needs_review"])           # inte tillbaka i kön
        self.assertTrue(redone["included_in_output"])
        self.assertEqual(redone["review_note"], "ser bra ut")
        self.assertEqual(redone["reviewed_at"], "2026-06-07T10:00:00+00:00")

    def test_rejected_claim_stays_suppressed_on_reextraction(self):
        cid, written = self._extract_one_into_queue()
        fakefs.STATE["claims"][cid] = {
            **written, "review_status": "rejected", "review_note": "felaktigt",
            "reviewed_at": "2026-06-07T10:00:00+00:00", "needs_review": False, "included_in_output": False,
        }
        fakefs.STATE["writes"].clear()
        ce.extract_claims_for_client("acme")
        redone = fakefs.writes()[cid]
        self.assertEqual(redone["review_status"], "rejected")
        self.assertFalse(redone["needs_review"])           # dyker inte upp på nytt
        self.assertFalse(redone["included_in_output"])      # läcker inte ut i leveransen

    def test_undecided_claim_is_refreshed_not_preserved(self):
        # Utan beslut ska omkörningen skriva det färska claimet rakt av (ingen sticky-logik).
        cid, written = self._extract_one_into_queue()
        fakefs.STATE["claims"][cid] = {**written}  # ligger i claims men utan beslut
        fakefs.STATE["writes"].clear()
        ce.extract_claims_for_client("acme")
        self.assertTrue(fakefs.writes()[cid]["needs_review"])  # fortsatt i kön (inget att bevara)


class AttestedInclusionPreservationTest(unittest.TestCase):
    def test_reupload_preserves_inclusion_decision(self):
        # En redan bekräftad "Inkludera i leverans" får INTE tyst falla ur leveransen när
        # samma demografi laddas upp på nytt (replace raderar annars och återstagear).
        fakefs.reset(client={"company_name": "Acme AB"})
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics",
                               "dimension,segment,value\nseniority,Director,1500\n", attested_at="2026-05-01")
        (att_id, doc), = fakefs.writes().items()
        self.assertFalse(doc["included_in_output"])  # staged direkt efter uppladdning
        # Operatören bekräftar inkludering → posten lever inkluderad i grafen (claims).
        fakefs.STATE["claims"][att_id] = {**doc, "included_in_output": True}
        fakefs.STATE["writes"].clear()
        # Ny uppladdning av samma demografi (färskare siffra, samma segment → samma id).
        ai.ingest_attested_csv("acme", "linkedin_follower_demographics",
                               "dimension,segment,value\nseniority,Director,1700\n", attested_at="2026-06-01")
        self.assertTrue(fakefs.writes()[att_id]["included_in_output"])  # bekräftelsen överlever


_orig_pick_generator = ce._pick_generator
_orig_pick_validator = ce._pick_validator


if __name__ == "__main__":
    unittest.main()
