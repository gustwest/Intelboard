"""Tester för warmth_probes per persona (Fas 2.1c).

Verifierar att:
  * run_for_client kör per (motor × persona × dimension) med rätt antal anrop
  * by_engine_persona-strukturen aggregeras till per_persona-axel i resultatet
  * Toppnivå-aggregat är bakåtkompatibelt med compute_trust_gap (har salience,
    valence, confidence, by_engine) — så Fas 1-koden fortsätter funka utan ändring
  * measurement.personas listar de aktiva personor som kördes
  * Defaults används när kund saknar persona-konfig
  * Persona-specifika prompts från registret faktiskt skickas till engine
"""
import json
import unittest
from types import SimpleNamespace
from unittest import mock

import fakefs  # installerar fake firestore_client — först!
from schema_org import humanization_config as hc
from services import persona_registry as pr
from services import warmth_probes as wp


class _FakeEngine:
    """LLM-stub som returnerar en förutsägbar text och sparar vad den fick."""
    def __init__(self, name: str, response_text: str = "ett svar"):
        self.name = name
        self.response_text = response_text
        self.received_questions: list[str] = []

    def invoke(self, msgs):
        # msgs är [SystemMessage, HumanMessage] — fånga HumanMessage-innehållet
        for m in msgs:
            if hasattr(m, "content") and hasattr(m, "type") and m.type == "human":
                self.received_questions.append(m.content)
                break
            elif hasattr(m, "content") and "Du är en sakkunnig" not in (m.content or ""):
                # Fallback för langchain-versioner utan .type
                self.received_questions.append(m.content)
                break
        return SimpleNamespace(content=self.response_text)


class _FakeJudge:
    """Domar-stub: returnerar fixed verdict via invoke_json-mönster.
    invoke_json plockar JSON-objekt från resp.content via regex."""
    def __init__(self, verdict_per_call=None):
        # verdict_per_call: dict from "dim" → {sal, val, conf}
        self.verdict_per_call = verdict_per_call or {}
        self.default = {"salience": 0.5, "valence": 0.6, "confidence": 0.7}
        self.calls = 0

    def invoke(self, msgs):
        self.calls += 1
        # Plocka dimension från payload-message (sista HumanMessage)
        payload_msg = msgs[-1].content if hasattr(msgs[-1], "content") else ""
        verdict = self.default
        try:
            data = json.loads(payload_msg)
            dim = data.get("dimension")
            if dim in self.verdict_per_call:
                verdict = self.verdict_per_call[dim]
        except (json.JSONDecodeError, AttributeError):
            pass
        return SimpleNamespace(content=json.dumps(verdict))


def _setup_client(personas=None):
    """Sätt upp en testkund. None personor → defaults används."""
    client_doc = {"company_name": "Acme AB"}
    if personas is not None:
        client_doc["personas"] = {"active": personas}
    fakefs.reset(client=client_doc, polling_results={})


class RunForClientShapeTest(unittest.TestCase):

    def test_returns_doc_with_personas_axis(self):
        _setup_client(personas=["customer", "employee"])
        engines = {"gemini": _FakeEngine("gemini"), "chatgpt": _FakeEngine("chatgpt")}
        judge = _FakeJudge()
        doc = wp.run_for_client("acme", engines=engines, judge=judge)

        self.assertIsNotNone(doc)
        # Toppnivå-struktur (bakåtkompat med compute_trust_gap):
        self.assertIn("dimensions", doc)
        self.assertIn("measurement", doc)
        # Mätningens metadata listar vilka personor som kördes
        self.assertEqual(doc["measurement"]["personas"], ["customer", "employee"])
        # Varje dimension har BÅDE toppnivå-aggregat och per_persona-axel
        for dim in hc.DIMENSIONS:
            self.assertIn(dim, doc["dimensions"])
            entry = doc["dimensions"][dim]
            # Bakåtkompatibla fält
            self.assertIn("salience", entry)
            self.assertIn("valence", entry)
            self.assertIn("confidence", entry)
            self.assertIn("by_engine", entry)
            # Ny axel
            self.assertIn("per_persona", entry)
            self.assertEqual(set(entry["per_persona"].keys()), {"customer", "employee"})

    def test_persona_specific_questions_are_sent(self):
        # Verifiera att frågorna som faktiskt skickas till motorn kommer från
        # persona_registry — inte från en hårdkodad lista. Customer-frågorna ska
        # innehålla "potentiell kund", employee-frågorna "potentiell anställd".
        _setup_client(personas=["customer", "employee"])
        engine = _FakeEngine("gemini")
        engines = {"gemini": engine}
        judge = _FakeJudge()
        wp.run_for_client("acme", engines=engines, judge=judge)

        all_q = " | ".join(engine.received_questions)
        self.assertIn("potentiell kund", all_q.lower())
        self.assertIn("potentiell anställd", all_q.lower())
        # Företagsnamnet ska vara insubstituerat
        self.assertIn("Acme AB", all_q)

    def test_anchor_question_runs_once_per_engine(self):
        # Ankaren körs en gång per motor (delas mellan personor), inte en gång per
        # (motor × persona). Annars sprängs cost-budgeten i onödan.
        _setup_client(personas=["customer", "employee", "investor"])
        e = _FakeEngine("gemini")
        wp.run_for_client("acme", engines={"gemini": e}, judge=_FakeJudge())
        anchor_count = sum(1 for q in e.received_questions if "huvudkontor" in q)
        self.assertEqual(anchor_count, 1, "ankarfrågan ska köras EXAKT en gång per motor")

    def test_anchor_stored_per_engine(self):
        _setup_client(personas=["customer"])
        engines = {
            "gemini": _FakeEngine("gemini", response_text="Sverige"),
            "chatgpt": _FakeEngine("chatgpt", response_text="Stockholm, Sverige"),
        }
        doc = wp.run_for_client("acme", engines=engines, judge=_FakeJudge())
        anchors = doc["measurement"]["anchors"]
        self.assertEqual(set(anchors.keys()), {"gemini", "chatgpt"})
        self.assertEqual(anchors["gemini"], "Sverige")


class CallCountTest(unittest.TestCase):
    """Antal probe-anrop måste matcha (engines × personas × dimensioner × 2) +
    (engines × canary-suite). Annars är vi inte 5x-säkra mot dagens flöde i tier-modellen."""

    def test_call_count_matches_formula(self):
        _setup_client(personas=["customer", "employee"])
        e1 = _FakeEngine("gemini")
        e2 = _FakeEngine("chatgpt")
        engines = {"gemini": e1, "chatgpt": e2}
        wp.run_for_client("acme", engines=engines, judge=_FakeJudge())

        # 2 personor × 6 dim × 2 frågor = 24 probe-anrop per motor + canary-suite (3)
        expected_per_engine = len(hc.DIMENSIONS) * 2 * 2 + len(wp.CANARY_QUESTIONS)
        self.assertEqual(len(e1.received_questions), expected_per_engine)
        self.assertEqual(len(e2.received_questions), expected_per_engine)

    def test_more_personas_more_calls(self):
        # Sanity: lägga till en persona → fler probe-anrop, ankaren oförändrad
        _setup_client(personas=["customer"])
        e = _FakeEngine("gemini")
        wp.run_for_client("acme", engines={"gemini": e}, judge=_FakeJudge())
        with_one = len(e.received_questions)

        _setup_client(personas=["customer", "employee", "investor"])
        e2 = _FakeEngine("gemini")
        wp.run_for_client("acme", engines={"gemini": e2}, judge=_FakeJudge())
        with_three = len(e2.received_questions)

        # 3 personor → 3x probe-anrop (förutom canary-suiten som är konstant per motor)
        canary = len(wp.CANARY_QUESTIONS)
        non_canary_one = with_one - canary
        non_canary_three = with_three - canary
        self.assertEqual(non_canary_three, non_canary_one * 3)


class DefaultPersonasTest(unittest.TestCase):

    def test_defaults_used_when_personas_not_configured(self):
        # Klient utan personas-config → defaults (customer/employee/investor)
        _setup_client(personas=None)
        doc = wp.run_for_client("acme", engines={"x": _FakeEngine("x")}, judge=_FakeJudge())
        self.assertEqual(
            set(doc["measurement"]["personas"]),
            set(pr.default_persona_ids()),
        )


class AggregationCorrectnessTest(unittest.TestCase):

    def test_toplevel_aggregate_pools_personas(self):
        # Med två personor som ger olika valens på samma dim ska toppnivå-aggregatet
        # ligga mellan deras värden (snitt).
        _setup_client(personas=["customer", "employee"])
        # Customer-judge ger högt valence, employee-judge ger lågt — på SAMMA dim.
        # Domaren ser dock dim, inte persona, så vi måste forcera olika svar via
        # response_text per engine. Enklare: testa shape-invariant utan att försöka
        # snitta exakta värden (det är _aggregate_by_engine-test).
        doc = wp.run_for_client(
            "acme",
            engines={"e1": _FakeEngine("e1")},
            judge=_FakeJudge(verdict_per_call={
                "ethics": {"salience": 0.7, "valence": 0.8, "confidence": 0.8}
            }),
        )
        ethics = doc["dimensions"]["ethics"]
        # Båda personor ska finnas i per_persona-axeln
        self.assertEqual(set(ethics["per_persona"].keys()), {"customer", "employee"})
        # Toppnivå-valence ska ligga nära 0.8 (båda personor får samma judge-verdict)
        self.assertAlmostEqual(ethics["valence"], 0.8, places=2)

    def test_engine_failure_falls_back_to_none_for_that_pair(self):
        # Om EN persona × dim failar på EN motor ska resten fortsätta
        _setup_client(personas=["customer", "employee"])
        good_engine = _FakeEngine("good")
        flaky_engine = _FakeEngine("flaky")
        # Patch:a flaky-engine att kasta efter sin första invoke (ankarn lyckas)
        orig_invoke = flaky_engine.invoke
        call_count = [0]

        def maybe_fail(msgs):
            call_count[0] += 1
            if call_count[0] > 1:  # låt ankaren lyckas, sen krascha
                raise RuntimeError("simulated engine failure")
            return orig_invoke(msgs)

        flaky_engine.invoke = maybe_fail
        doc = wp.run_for_client(
            "acme",
            engines={"good": good_engine, "flaky": flaky_engine},
            judge=_FakeJudge(),
        )
        # Goda motorn ska finnas i per_persona-aggregatet
        ethics = doc["dimensions"]["ethics"]
        self.assertIn("customer", ethics["per_persona"])
        # Goda motorns by_engine ska finnas på persona-nivå
        self.assertIn("good", ethics["per_persona"]["customer"]["by_engine"])


if __name__ == "__main__":
    unittest.main()
