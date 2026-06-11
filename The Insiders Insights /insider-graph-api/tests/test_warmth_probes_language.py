"""F4b-tester: sv/en-mätspråk för warmth-prober (eget mätspår, aldrig poolat).

Verifierar att en engelsk mätning ställer engelska prober, lagras i ett SKILT
språk-nyckladt dokument, uppdaterar en egen baseline, och hoppar över personor utan
engelska prober (så det engelska spåret aldrig förorenas av svenska svar)."""
import json
import unittest
from types import SimpleNamespace

import fakefs  # installerar fake firestore_client — först!
from schema_org import humanization_config as hc
from services import engine_baselines
from services import warmth_probes as wp


class _FakeEngine:
    def __init__(self, name: str, response_text: str = "a concrete answer"):
        self.name = name
        self.response_text = response_text
        self.received_questions: list[str] = []

    def invoke(self, msgs):
        for m in msgs:
            if getattr(m, "type", None) == "human":
                self.received_questions.append(m.content)
                break
        return SimpleNamespace(content=self.response_text)


class _FakeJudge:
    def invoke(self, msgs):
        return SimpleNamespace(content=json.dumps({"salience": 0.6, "valence": 0.6, "confidence": 0.7}))


def _run(personas, language=None):
    client_doc = {"company_name": "Acme AB", "personas": {"active": personas}}
    if language is not None:
        client_doc["measurement_language"] = language
    fakefs.reset(client=client_doc, polling_results={})
    engine = _FakeEngine("gemini")
    doc = wp.run_for_client("acme", engines={"gemini": engine}, judge=_FakeJudge())
    return doc, engine


class WarmthLanguageTest(unittest.TestCase):
    def test_english_sends_english_probes(self):
        doc, engine = _run(["customer", "talent"], language="en")
        all_q = " | ".join(engine.received_questions).lower()
        self.assertIn("prospective customer", all_q)
        self.assertIn("prospective employee", all_q)
        self.assertNotIn("potentiell kund", all_q)
        self.assertEqual(doc["measurement"]["language"], "en")

    def test_english_persists_to_separate_doc(self):
        _run(["customer"], language="en")
        en_doc = f"{hc.WARMTH_PROBE_DOC}-en"
        self.assertIn(en_doc, fakefs.STATE["polling_results"])
        # Svenska doknamnet ska INTE ha skrivits av en engelsk körning.
        self.assertNotIn(hc.WARMTH_PROBE_DOC, fakefs.STATE["polling_results"])

    def test_english_baseline_separate(self):
        _run(["customer"], language="en")
        self.assertIn(f"{engine_baselines.ENGINE_BASELINE_DOC}-en", fakefs.STATE["polling_results"])
        self.assertNotIn(engine_baselines.ENGINE_BASELINE_DOC, fakefs.STATE["polling_results"])

    def test_swedish_default_unchanged(self):
        doc, engine = _run(["customer"], language=None)
        all_q = " | ".join(engine.received_questions).lower()
        self.assertIn("potentiell kund", all_q)
        self.assertEqual(doc["measurement"]["language"], "sv")
        self.assertIn(hc.WARMTH_PROBE_DOC, fakefs.STATE["polling_results"])

    def test_persona_without_english_probes_skipped(self):
        # partner har inga en-prober → hoppas över i en-mätningen så spåret förblir rent.
        doc, _ = _run(["customer", "partner"], language="en")
        self.assertEqual(doc["measurement"]["personas"], ["customer"])

    def test_english_canary_questions(self):
        _, engine = _run(["customer"], language="en")
        all_q = " | ".join(engine.received_questions).lower()
        self.assertIn("headquarters", all_q)
        self.assertNotIn("huvudkontor", all_q)


if __name__ == "__main__":
    unittest.main()
