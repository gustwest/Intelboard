"""Enhetstester för output-kvalitets-rubric:en (services/output_quality.py).

Ren funktion → tester behöver inte fakefs. LLM-anropet mockas genom att patcha
`make_validator` (söm för konstruktion) och `invoke_json` (söm för respons)
direkt på services.output_quality-modulen."""
from __future__ import annotations

import unittest

from services import output_quality as oq
from services.output_quality import (
    AudiencePriority,
    PersonaTarget,
    RubricClaim,
    RubricRequest,
    score_bundle,
)


def _llm_returns(items):
    """Bygg en mock som efterliknar invoke_json-svaret för rubric:en."""
    return lambda _llm, _system, _user: {"items": items}


def _scored(index, *, action="publish", hint=None, audience=None,
            persona=5, sjalv=5, paastaaende=5, berattelse=5, evidence=5, slot=5,
            reasons=None, suggestion=None):
    """Bygg ett LLM-resultatsitem med standardpoäng = 5 så det blir publish."""
    return {
        "index": index,
        "dimension_hint": hint,
        "best_audience": audience,
        "dimensions": {
            "persona_citerbarhet": persona,
            "sjalvbarighet": sjalv,
            "paastaaende_vs_stat": paastaaende,
            "berattelse_fit": berattelse,
            "evidence_styrka": evidence,
            "schema_passform": slot,
        },
        "action": action,
        "reasons": reasons or [],
        "suggestion": suggestion,
    }


class RubricLlmAvailable(unittest.TestCase):
    """Tester där validator-LLM:n är tillgänglig (mockad)."""

    def setUp(self):
        self._orig = (oq.make_validator, oq.invoke_json)
        # En icke-None LLM-instans räcker — det är invoke_json-mocken som spelar roll.
        oq.make_validator = lambda: object()

    def tearDown(self):
        oq.make_validator, oq.invoke_json = self._orig

    def _audience(self, *types):
        return [
            AudiencePriority(
                audience_type=t,
                weight=1.0,
                personas=[PersonaTarget(role="CXO", industry="SaaS")],
                narrative_axes=["praktisk AI utan hype"],
            )
            for t in types
        ]

    def test_empty_bundle_passes_trivially(self):
        oq.invoke_json = _llm_returns([])
        r = score_bundle(RubricRequest(claims=[], audience_priorities=self._audience("customer")))
        self.assertEqual(r.verdict, "pass")
        self.assertEqual(r.per_claim, [])
        self.assertTrue(r.metadata.get("empty_bundle"))

    def test_high_scores_pass(self):
        claims = [
            RubricClaim(claim_id="c1", statement="62 CXOs och 110 Directors följer bolaget", has_source=True)
        ]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="seniority", audience="customer")
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer"), company_name="Test AB"
        ))
        self.assertEqual(r.verdict, "pass")
        self.assertEqual(r.bundle_score, 5.0)
        self.assertEqual(r.per_claim[0].action, "publish")

    def test_redundancy_flag_when_same_dimension_dominates(self):
        # 5 claims i samma dimension_hint (geography) → flagga, verdict=needs_review
        claims = [
            RubricClaim(claim_id=f"c{i}", statement=f"X följare i ort {i}", has_source=True)
            for i in range(5)
        ]
        oq.invoke_json = _llm_returns([
            _scored(i, hint="geography", audience="customer")
            for i in range(5)
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        types = [f.type for f in r.bundle_flags]
        self.assertIn("high_redundancy", types)
        geo_flag = next(f for f in r.bundle_flags if f.type == "high_redundancy")
        self.assertEqual(geo_flag.dimension_hint, "geography")
        self.assertEqual(r.verdict, "needs_review")

    def test_missing_persona_when_audience_unmatched(self):
        # Audience-prioritering = customer, men alla claims landar hos candidate
        claims = [RubricClaim(claim_id="c1", statement="Talangbredd från entry till senior", has_source=True)]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="seniority", audience="candidate")
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        types = [f.type for f in r.bundle_flags]
        self.assertIn("missing_persona", types)
        self.assertEqual(r.verdict, "needs_review")

    def test_schema_slot_mismatch_blocks(self):
        # Vecka 1-2: schema_slot_mismatch är ett "hårt objektivt fel" → block.
        claims = [RubricClaim(claim_id="c1", statement="Något", has_source=True)]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="other", audience="customer", slot=1)
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        self.assertEqual(r.verdict, "block")
        self.assertTrue(any(f.type == "schema_slot_mismatch" for f in r.bundle_flags))

    def test_low_average_triggers_needs_review(self):
        # Snitt 2.0 (alla dimensioner = 2) → under 3.0-tröskeln
        claims = [RubricClaim(claim_id="c1", statement="Svagt påstående", has_source=True)]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="narrative", audience="customer",
                    persona=2, sjalv=2, paastaaende=2, berattelse=2, evidence=2, slot=2)
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        self.assertEqual(r.verdict, "needs_review")
        self.assertTrue(any(f.type == "low_authority_density" for f in r.bundle_flags))

    def test_low_score_claim_gets_transform_or_drop_action(self):
        claims = [
            RubricClaim(claim_id="weak", statement="Brusig stat", has_source=True),
            RubricClaim(claim_id="strong", statement="Vass syntes", has_source=True),
        ]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="other", audience="customer",
                    persona=1, sjalv=1, paastaaende=1, berattelse=1, evidence=1, slot=3,
                    action="drop"),
            _scored(1, hint="narrative", audience="customer"),
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        weak = next(c for c in r.per_claim if c.claim_id == "weak")
        strong = next(c for c in r.per_claim if c.claim_id == "strong")
        self.assertEqual(weak.action, "drop")
        self.assertEqual(strong.action, "publish")

    def test_volume_too_high_flags(self):
        n = oq.SOFT_VOLUME_CAP + 2
        claims = [RubricClaim(claim_id=f"c{i}", statement=f"claim {i}", has_source=True) for i in range(n)]
        # Sprid hint så vi inte triggar redundans-flagga av misstag.
        hints = ["narrative", "industry", "function", "company_size", "seniority", "geography"]
        oq.invoke_json = _llm_returns([
            _scored(i, hint=hints[i % len(hints)], audience="customer") for i in range(n)
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        self.assertTrue(any(f.type == "volume_too_high" for f in r.bundle_flags))

    def test_no_audience_priorities_flags_but_does_not_block(self):
        claims = [RubricClaim(claim_id="c1", statement="Ok claim", has_source=True)]
        oq.invoke_json = _llm_returns([_scored(0, hint="narrative", audience="customer")])
        r = score_bundle(RubricRequest(claims=claims))
        self.assertTrue(any(f.type == "no_audience_target" for f in r.bundle_flags))
        # Inga schema-fel + bra snitt → ska inte blockera
        self.assertNotEqual(r.verdict, "block")

    def test_multi_audience_weighting_persona_coverage(self):
        """Båda audiences prioriterade → båda behöver minst ett starkt claim, annars flagga."""
        claims = [
            RubricClaim(claim_id="cust", statement="62 CXOs följer", has_source=True),
            RubricClaim(claim_id="cand", statement="Bred publik från entry till senior", has_source=True),
        ]
        oq.invoke_json = _llm_returns([
            _scored(0, hint="seniority", audience="customer"),
            _scored(1, hint="seniority", audience="candidate"),
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer", "candidate")
        ))
        # Båda audiences täckta → ingen missing_persona-flagga
        self.assertFalse(any(f.type == "missing_persona" for f in r.bundle_flags))

    def test_top_improvements_capped_at_three(self):
        claims = [RubricClaim(claim_id=f"c{i}", statement=f"weak {i}", has_source=True) for i in range(10)]
        oq.invoke_json = _llm_returns([
            _scored(i, hint="geography", audience="customer",
                    persona=1, sjalv=1, paastaaende=1, berattelse=1, evidence=1, slot=3,
                    action="transform", suggestion=f"Förslag {i}")
            for i in range(10)
        ])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        self.assertLessEqual(len(r.top_improvements), 3)
        self.assertGreater(len(r.top_improvements), 0)

    def test_llm_returns_wrong_length_falls_back(self):
        """LLM:n returnerar fel antal items → vi behandlar det som LLM-fel."""
        claims = [RubricClaim(claim_id="c1", statement="x", has_source=True),
                  RubricClaim(claim_id="c2", statement="y", has_source=True)]
        oq.invoke_json = _llm_returns([_scored(0)])
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=self._audience("customer")
        ))
        self.assertTrue(r.metadata.get("llm_unavailable"))
        self.assertEqual(r.verdict, "pass")


class RubricLlmUnavailable(unittest.TestCase):
    """När LLM:n är otillgänglig vill vi inte blockera leverans."""

    def setUp(self):
        self._orig = oq.make_validator
        oq.make_validator = lambda: None

    def tearDown(self):
        oq.make_validator = self._orig

    def test_returns_pass_with_metadata_flag(self):
        claims = [RubricClaim(claim_id="c1", statement="claim", has_source=True)]
        r = score_bundle(RubricRequest(
            claims=claims, audience_priorities=[
                AudiencePriority(audience_type="customer", personas=[PersonaTarget(role="CXO")]),
            ]
        ))
        self.assertEqual(r.verdict, "pass")
        self.assertTrue(r.metadata.get("llm_unavailable"))
        self.assertEqual(len(r.per_claim), 1)
        # Alla dimensioner = 0 i fallback (men vi blockerar inte)
        self.assertEqual(r.per_claim[0].score, 0.0)


class PromptShape(unittest.TestCase):
    """Vi verifierar inte LLM:ens svar, men prompten ska innehålla rätt sammanhang."""

    def test_user_prompt_includes_claims_and_audience(self):
        claims = [
            RubricClaim(claim_id="c1", statement="62 CXOs följer bolaget",
                        connector="linkedin_capacity", schema_slot="description", has_source=True)
        ]
        audience = [
            AudiencePriority(
                audience_type="customer", weight=0.7,
                personas=[PersonaTarget(role="CXO", industry="SaaS")],
                narrative_axes=["praktisk AI utan hype"],
            )
        ]
        prompt = oq._build_user_prompt(claims, audience, "Insiders Hub AB")
        self.assertIn("Insiders Hub AB", prompt)
        self.assertIn("CXO", prompt)
        self.assertIn("praktisk AI utan hype", prompt)
        self.assertIn("62 CXOs följer bolaget", prompt)
        self.assertIn("linkedin_capacity", prompt)
        self.assertIn("description", prompt)
        self.assertIn("källa: ja", prompt)


if __name__ == "__main__":
    unittest.main()
