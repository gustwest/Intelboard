"""Enhetstester för narrativ claims-extraktion (services/claim_extraction.py).

LLM:en mockas; vi verifierar pipelinens regler, inte modellens kvalitet.
"""
import json
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.claim_extraction as ce
from config import settings


class _Resp:
    def __init__(self, content: str):
        self.content = content


class _FakeLLM:
    """Returnerar förbestämda claims vid generering och ett fast valideringssvar."""

    def __init__(self, claims: list[dict], supported: bool = True):
        self._claims = claims
        self._supported = supported

    def invoke(self, messages):
        system = messages[0].content
        if "faktagranskare" in system:  # valideringspasset
            return _Resp(json.dumps({"supported": self._supported}))
        return _Resp(json.dumps({"claims": self._claims}))


def _setup_one_source():
    fakefs.reset(
        client={"company_name": "Acme AB"},
        company_items={"src1": {"content": "Acme AB lanserade en plattform 2023."}},
    )


class ExtractionTest(unittest.TestCase):
    def tearDown(self):
        ce._pick_generator = _orig_pick_generator
        ce._pick_validator = _orig_pick_validator

    def _use(self, llm):
        # Samma fake för båda rollerna — _FakeLLM skiljer på generera/validera
        # via systemprompten, så en instans räcker.
        ce._pick_generator = lambda: llm
        ce._pick_validator = lambda: llm

    def test_grounded_validated_claim_is_written(self):
        _setup_one_source()
        self._use(_FakeLLM([{"statement": "Acme AB lanserade en plattform 2023", "chunks": ["C1"], "confidence": 0.9}]))
        result = ce.extract_claims_for_client("acme")
        self.assertEqual(result["written"], 1)
        written = list(fakefs.writes().values())
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0]["included_in_output"])
        self.assertFalse(written[0]["needs_review"])
        self.assertEqual(written[0]["source"][0]["item_id"], "src1")
        # Validerings-stämpel: sätts när claimet klarat validator-passet.
        self.assertTrue(written[0]["validated_at"])
        self.assertEqual(written[0]["validated_by"], settings.validator_model)

    def test_ungrounded_claim_is_skipped(self):
        _setup_one_source()
        self._use(_FakeLLM([{"statement": "Acme AB är marknadsledande", "chunks": [], "confidence": 0.9}]))
        result = ce.extract_claims_for_client("acme")
        self.assertEqual(result["written"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(fakefs.writes(), {})

    def test_failed_validation_is_discarded(self):
        _setup_one_source()
        self._use(_FakeLLM([{"statement": "Acme AB lanserade en plattform 2023", "chunks": ["C1"], "confidence": 0.9}], supported=False))
        result = ce.extract_claims_for_client("acme")
        self.assertEqual(result["written"], 0)
        self.assertEqual(fakefs.writes(), {})

    def test_low_confidence_goes_to_review(self):
        _setup_one_source()
        self._use(_FakeLLM([{"statement": "Acme AB lanserade en plattform 2023", "chunks": ["C1"], "confidence": 0.4}]))
        ce.extract_claims_for_client("acme")
        written = list(fakefs.writes().values())[0]
        self.assertFalse(written["included_in_output"])
        self.assertTrue(written["needs_review"])

    def test_no_llm_is_noop(self):
        _setup_one_source()
        self._use(None)
        result = ce.extract_claims_for_client("acme")
        self.assertEqual(result.get("reason"), "no_llm")
        self.assertEqual(fakefs.writes(), {})


_orig_pick_generator = ce._pick_generator
_orig_pick_validator = ce._pick_validator


if __name__ == "__main__":
    unittest.main()
