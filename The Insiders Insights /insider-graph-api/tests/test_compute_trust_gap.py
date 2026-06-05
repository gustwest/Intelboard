"""Kalibrering & invarianter för Förtroendegap-motorn (jobs/compute_trust_gap, spec §8).

Viktparametrarna i humanization_config är defaultnivåer som ska finjusteras mot fältdata
(spec §12). Det som låses HÄR är de STRUKTURELLA invarianterna som inte får drifta oavsett
hur nivåerna justeras — annars betyder en poäng eller en flagga ingenting:

  * declared ensamt är kapat (TAK) och kan aldrig dominera en dimension,
  * demonstrated kräver oberoende/verifierat underlag — bolagets eget ord (self_declared)
    rör aldrig demonstrated (anti-gaming, Goodhart),
  * perception (salience/valens) ingår ALDRIG i poängen — bara i gap/flaggor,
  * under salience-golvet beräknas ingen valens/gap och inga flaggor reses ("ej synlig"),
  * flagg-grinden är asymmetrisk: anseenderisk (perceived > evidens) kräver högre
    konfidens än möjlighet (perceived < evidens).

LLM/probes mockas bort helt — vi matar persisterade culture-claims och perceptions-dok direkt.
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from jobs import compute_trust_gap as ctg
from schema_org import humanization_config as hc


def _claim(dimension, warmth_mode, *, kind="item", assurance_level=None, predicate="x"):
    """Minimalt giltigt persisterat culture-claim-dok (Claim(**raw) ska gå)."""
    src = {"kind": kind}
    if assurance_level:
        src["assurance_level"] = assurance_level
    return {
        "claim_kind": "property",
        "subject_ref": "org",
        "predicate": predicate,
        "statement": f"{dimension}-{warmth_mode}",
        "facet": "culture",
        "warmth_mode": warmth_mode,
        "dimension": dimension,
        "included_in_output": True,
        "source": [src],
    }


def _setup(claims=None, perceived=None):
    polling = {hc.WARMTH_PROBE_DOC: {"dimensions": perceived}} if perceived else {}
    fakefs.reset(client={"company_name": "Acme AB"}, claims=claims or {}, polling_results=polling)


class TrustGapScoringTest(unittest.TestCase):
    def test_empty_is_zero(self):
        _setup()
        doc = ctg.compute("acme")
        self.assertEqual(doc["overall_score"], 0.0)
        self.assertEqual(doc["coverage"], {"declared": 0, "demonstrated": 0, "of": len(hc.DIMENSIONS)})
        self.assertEqual(doc["flags"], [])

    def test_declared_only_is_capped(self):
        # En declared-claim → score == DECLARED_CAP exakt, demonstrated 0, substansgap negativt.
        _setup({"c1": _claim("ethics", "declared")})
        doc = ctg.compute("acme")
        dim = doc["dimensions"]["ethics"]
        self.assertEqual(dim["declared"], 1.0)
        self.assertEqual(dim["demonstrated"], 0.0)
        self.assertAlmostEqual(dim["score"], hc.DECLARED_CAP)
        self.assertAlmostEqual(dim["substance_gap"], -1.0)
        self.assertEqual(doc["coverage"]["declared"], 1)

    def test_self_declared_never_moves_demonstrated(self):
        # Anti-gaming: bolagets eget ord (self_declared) väger 0 i demonstrated.
        _setup({"c1": _claim("wellbeing", "demonstrated", kind="manual", assurance_level="self_declared")})
        dim = ctg.compute("acme")["dimensions"]["wellbeing"]
        self.assertEqual(dim["demonstrated"], 0.0)
        self.assertEqual(dim["score"], 0.0)

    def test_verified_demonstrated_dominates(self):
        # Två oberoende bestyrkta demonstrated → demonstrated mättat, score nära taket.
        _setup({
            "c1": _claim("transparency", "demonstrated", kind="attested", assurance_level="independently_assured"),
            "c2": _claim("transparency", "demonstrated", kind="attested", assurance_level="independently_assured", predicate="y"),
        })
        dim = ctg.compute("acme")["dimensions"]["transparency"]
        self.assertEqual(dim["demonstrated"], 1.0)  # min(1, (1.0+1.0)/TARGET_NORM)
        self.assertAlmostEqual(dim["score"], hc.SCORE_W_DEMONSTRATED)
        # demonstrated väger tyngre än declared ensamt
        self.assertGreater(dim["score"], hc.DECLARED_CAP)

    def test_unverified_item_partial_weight(self):
        # Självverifierande item utan manuell verifiering → ITEM_UNVERIFIED_WEIGHT.
        _setup({"c1": _claim("wellbeing", "demonstrated", kind="item")})
        dim = ctg.compute("acme")["dimensions"]["wellbeing"]
        self.assertAlmostEqual(dim["demonstrated"], min(1.0, hc.ITEM_UNVERIFIED_WEIGHT / hc.TARGET_NORM))


class TrustGapPerceptionTest(unittest.TestCase):
    def test_perception_never_enters_score(self):
        # Hög valens/salience får INTE höja poängen — bara producera ett credibility_gap.
        _setup(
            {"c1": _claim("ethics", "declared")},
            perceived={"ethics": {"salience": 0.8, "valence": 0.9, "confidence": 0.9}},
        )
        dim = ctg.compute("acme")["dimensions"]["ethics"]
        self.assertAlmostEqual(dim["score"], hc.DECLARED_CAP)  # oförändrad av perception
        self.assertIn("credibility_gap", dim)

    def test_low_salience_is_not_visible_no_flag(self):
        # Under salience-golvet: ingen valens/gap, inga perception-flaggor, märkt "not_visible".
        # (missing_evidence kan fortfarande resas — det är perception-oberoende.)
        _setup(
            {"c1": _claim("ethics", "declared")},
            perceived={"ethics": {"salience": hc.SALIENCE_FLOOR - 0.05, "valence": 0.9, "confidence": 0.9}},
        )
        doc = ctg.compute("acme")
        dim = doc["dimensions"]["ethics"]
        self.assertEqual(dim["perceived"].get("status"), "not_visible")
        self.assertNotIn("credibility_gap", dim)
        kinds = {f["kind"] for f in doc["flags"]}
        self.assertNotIn("over_claim", kinds)
        self.assertNotIn("opportunity", kinds)

    def test_opportunity_flag_when_underperceived(self):
        # valens << evidens, tillräcklig konfidens → möjlighet (lägre ribba).
        _setup(
            {"c1": _claim("community", "declared")},  # evidens = DECLARED_CAP = 0.3
            perceived={"community": {"salience": 0.6, "valence": 0.05, "confidence": 0.6}},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertTrue(any(f["kind"] == "opportunity" and f["dimension"] == "community" for f in flags))

    def test_over_claim_requires_high_confidence(self):
        # valens >> evidens = anseenderisk. Konfidens 0.6 < ribban → INGEN over_claim-flagga
        # (missing_evidence kan fortfarande resas eftersom declared utan demonstrated).
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {"salience": 0.7, "valence": 0.8, "confidence": 0.6}},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertNotIn("over_claim", kinds)
        # Höj konfidensen över ribban → over_claim reses.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {"salience": 0.7, "valence": 0.8, "confidence": 0.8}},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertTrue(any(f["kind"] == "over_claim" and f["dimension"] == "community" for f in flags))

    def test_small_gap_never_flags(self):
        # |gap| under magnitudgolvet → inga perception-flaggor (over_claim/opportunity).
        _setup(
            {"c1": _claim("community", "declared")},  # evidens 0.3
            perceived={"community": {"salience": 0.7, "valence": 0.35, "confidence": 0.95}},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertNotIn("over_claim", kinds)
        self.assertNotIn("opportunity", kinds)


class TrustGapIdempotencyTest(unittest.TestCase):
    def test_unchanged_inputs_skip_write(self):
        _setup({"c1": _claim("ethics", "declared")})
        first = ctg.run("acme")
        self.assertTrue(first["written"])
        second = ctg.run("acme")
        self.assertTrue(second.get("skipped"))


# --- Utökad gap-taxonomi (Fas 1.1) --------------------------------------------

def _setup_with_snapshots(claims=None, perceived=None, snapshots=None):
    polling = {hc.WARMTH_PROBE_DOC: {"dimensions": perceived}} if perceived else {}
    fakefs.reset(
        client={"company_name": "Acme AB"},
        claims=claims or {},
        polling_results=polling,
        trust_gap_snapshots=snapshots or {},
    )


class GapTaxonomyMissingEvidenceTest(unittest.TestCase):
    def test_declared_without_evidence_raises_missing_evidence(self):
        # Deklarerat men ej belagt → missing_evidence (perception-oberoende).
        _setup({"c1": _claim("ethics", "declared")})
        flags = ctg.compute("acme")["flags"]
        me = [f for f in flags if f["kind"] == "missing_evidence" and f["dimension"] == "ethics"]
        self.assertEqual(len(me), 1)
        # Utan AI-synlighet är severity "medium" — risken är låg när ingen ser oss.
        self.assertEqual(me[0]["severity"], "medium")

    def test_missing_evidence_high_severity_when_ai_visible(self):
        # Deklarerat + AI ser oss → severity "high" (risken är mer exponerad).
        _setup(
            {"c1": _claim("ethics", "declared")},
            perceived={"ethics": {"salience": 0.6, "valence": 0.5, "confidence": 0.6}},
        )
        flags = ctg.compute("acme")["flags"]
        me = [f for f in flags if f["kind"] == "missing_evidence"]
        self.assertEqual(me[0]["severity"], "high")

    def test_no_missing_evidence_when_demonstrated(self):
        # Demonstrated → ingen missing_evidence oavsett declared.
        _setup({
            "c1": _claim("ethics", "declared"),
            "c2": _claim("ethics", "demonstrated", kind="item"),
        })
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "missing_evidence" for f in flags))


class GapTaxonomyContradictionTest(unittest.TestCase):
    def test_engines_disagree_raises_contradiction(self):
        # Två motorer över salience-golvet med spread ≥ CONTRADICTION_SPREAD_MIN.
        _setup(
            {"c1": _claim("community", "demonstrated", kind="item")},
            perceived={
                "community": {
                    "salience": 0.6, "valence": 0.5, "confidence": 0.6,
                    "by_engine": {
                        "gemini": {"salience": 0.7, "valence": 0.85},
                        "chatgpt": {"salience": 0.6, "valence": 0.2},
                    },
                },
            },
        )
        flags = ctg.compute("acme")["flags"]
        c = [f for f in flags if f["kind"] == "contradiction"]
        self.assertEqual(len(c), 1)
        self.assertEqual(c[0]["warmest_engine"], "gemini")
        self.assertEqual(c[0]["coolest_engine"], "chatgpt")
        self.assertGreaterEqual(c[0]["spread"], hc.CONTRADICTION_SPREAD_MIN)

    def test_engines_below_salience_floor_ignored(self):
        # Motorer under salience-golvet räknas inte (de "vet ingenting" — då ej oense).
        _setup(
            {"c1": _claim("community", "demonstrated", kind="item")},
            perceived={
                "community": {
                    "salience": 0.6, "valence": 0.5, "confidence": 0.6,
                    "by_engine": {
                        "gemini": {"salience": 0.7, "valence": 0.85},
                        "chatgpt": {"salience": 0.1, "valence": 0.2},  # under floor
                    },
                },
            },
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "contradiction" for f in flags))

    def test_small_spread_no_contradiction(self):
        # Spread under tröskeln → ingen flagga (motorerna är "ungefär överens").
        _setup(
            {"c1": _claim("community", "demonstrated", kind="item")},
            perceived={
                "community": {
                    "salience": 0.6, "valence": 0.5, "confidence": 0.6,
                    "by_engine": {
                        "gemini": {"salience": 0.7, "valence": 0.55},
                        "chatgpt": {"salience": 0.6, "valence": 0.45},
                    },
                },
            },
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "contradiction" for f in flags))


class GapTaxonomyFactualDriftTest(unittest.TestCase):
    def test_valence_drop_without_evidence_drop_raises_drift(self):
        # Föregående snapshot: hög valens, lågt demonstrated (0.2). Nu: lägre valens, men
        # demonstrated har stigit (ny item-claim → 0.25). Underlaget har INTE rasat → drift.
        prior = {
            "2026-05-01": {
                "date": "2026-05-01",
                "trust_gap": {
                    "dimensions": {
                        "ethics": {
                            "declared": 1.0,
                            "demonstrated": 0.2,
                            "perceived": {"salience": 0.7, "valence": 0.8, "confidence": 0.8},
                        }
                    }
                },
            },
        }
        _setup_with_snapshots(
            claims={"c1": _claim("ethics", "demonstrated", kind="item")},
            perceived={"ethics": {"salience": 0.7, "valence": 0.55, "confidence": 0.8}},
            snapshots=prior,
        )
        flags = ctg.compute("acme")["flags"]
        drift = [f for f in flags if f["kind"] == "factual_drift"]
        self.assertEqual(len(drift), 1)
        self.assertEqual(drift[0]["since_date"], "2026-05-01")
        self.assertAlmostEqual(drift[0]["valence_drop"], 0.25)

    def test_no_drift_if_evidence_also_dropped(self):
        # Om underlaget rasat → det är inte drift, det är verklighetsförändring.
        prior = {
            "2026-05-01": {
                "date": "2026-05-01",
                "trust_gap": {
                    "dimensions": {
                        "ethics": {
                            "declared": 1.0,
                            "demonstrated": 1.0,  # Tidigare högt belagt
                            "perceived": {"salience": 0.7, "valence": 0.8, "confidence": 0.8},
                        }
                    }
                },
            },
        }
        _setup_with_snapshots(
            claims={"c1": _claim("ethics", "declared")},  # nu bara declared, inget demonstrated
            perceived={"ethics": {"salience": 0.7, "valence": 0.55, "confidence": 0.8}},
            snapshots=prior,
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "factual_drift" for f in flags))

    def test_no_drift_without_prior_snapshot(self):
        # Ingen tidigare snapshot → ingen drift-detektion möjlig.
        _setup_with_snapshots(
            claims={"c1": _claim("ethics", "demonstrated", kind="item")},
            perceived={"ethics": {"salience": 0.7, "valence": 0.55, "confidence": 0.8}},
            snapshots={},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "factual_drift" for f in flags))


class GapTaxonomyMultipleFlagsTest(unittest.TestCase):
    def test_same_dimension_can_raise_multiple_flags(self):
        # Declared utan demonstrated + AI ser oss varmt = missing_evidence + over_claim.
        _setup(
            {"c1": _claim("community", "declared")},  # evidens = DECLARED_CAP = 0.3
            perceived={"community": {"salience": 0.7, "valence": 0.8, "confidence": 0.8}},
        )
        flags = ctg.compute("acme")["flags"]
        kinds = {f["kind"] for f in flags if f["dimension"] == "community"}
        self.assertIn("missing_evidence", kinds)
        self.assertIn("over_claim", kinds)


# --- Persona-mismatch-detektion (Fas 2.1d) -----------------------------------


class GapTaxonomyPersonaMismatchTest(unittest.TestCase):
    """Aktiverar persona_mismatch — stubbad sedan Fas 1.1. Mirror av contradiction
    men över persona-axeln. Tröskel: hc.PERSONA_MISMATCH_SPREAD_MIN (0.3)."""

    def test_personas_with_large_spread_raises_flag(self):
        # Två personor med valens-spread över tröskeln → persona_mismatch.
        # employee ser bolaget kallt (0.3), customer ser det varmt (0.8) — klassiskt
        # "vi når kunder men inte kandidater"-mönster.
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.55, "confidence": 0.7,
                "per_persona": {
                    "talent": {"salience": 0.7, "valence": 0.3, "confidence": 0.7},
                    "customer": {"salience": 0.7, "valence": 0.8, "confidence": 0.7},
                },
            }},
        )
        flags = ctg.compute("acme")["flags"]
        pm = [f for f in flags if f["kind"] == "persona_mismatch"]
        self.assertEqual(len(pm), 1)
        self.assertEqual(pm[0]["dimension"], "wellbeing")
        self.assertEqual(pm[0]["warmest_persona"], "customer")
        self.assertEqual(pm[0]["coolest_persona"], "talent")
        self.assertAlmostEqual(pm[0]["spread"], 0.5)
        self.assertAlmostEqual(pm[0]["warmest_valence"], 0.8)
        self.assertAlmostEqual(pm[0]["coolest_valence"], 0.3)

    def test_small_spread_no_flag(self):
        # Spread under tröskeln (0.2 vs 0.3) → ingen flagga, personor är "i linje"
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.55, "confidence": 0.7,
                "per_persona": {
                    "talent": {"salience": 0.7, "valence": 0.45},
                    "customer": {"salience": 0.7, "valence": 0.65},
                },
            }},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "persona_mismatch" for f in flags))

    def test_persona_below_salience_floor_excluded(self):
        # Persona under salience-golvet räknas inte (den "vet inget" → kan inte
        # vara i konflikt). Inga flaggor även om dess valence skulle gett stor spread.
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.7, "confidence": 0.7,
                "per_persona": {
                    "talent": {"salience": 0.05, "valence": 0.2},  # under floor
                    "customer": {"salience": 0.7, "valence": 0.8},
                },
            }},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "persona_mismatch" for f in flags))

    def test_single_persona_no_flag(self):
        # Bara EN persona över salience-golvet — kan inte vara "oense med sig själv".
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.55, "confidence": 0.7,
                "per_persona": {
                    "customer": {"salience": 0.7, "valence": 0.8},
                },
            }},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "persona_mismatch" for f in flags))

    def test_missing_per_persona_no_crash(self):
        # Bakåtkompat: warmth-data utan per_persona (gammal körning) ska inte krascha
        # eller resa flaggor. Compute_trust_gap fortsätter funka.
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.5, "confidence": 0.7,
                # ingen per_persona-axel
            }},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertFalse(any(f["kind"] == "persona_mismatch" for f in flags))

    def test_three_personas_picks_extremes(self):
        # Med 3 personor: warmest/coolest ska vara de yttre, inte mittenpersonan.
        _setup(
            {"c1": _claim("ethics", "demonstrated", kind="item")},
            perceived={"ethics": {
                "salience": 0.7, "valence": 0.6, "confidence": 0.7,
                "per_persona": {
                    "investor": {"salience": 0.7, "valence": 0.85},   # warmest
                    "regulator": {"salience": 0.7, "valence": 0.55},  # mid
                    "media": {"salience": 0.7, "valence": 0.30},      # coolest
                },
            }},
        )
        flags = ctg.compute("acme")["flags"]
        pm = next(f for f in flags if f["kind"] == "persona_mismatch")
        self.assertEqual(pm["warmest_persona"], "investor")
        self.assertEqual(pm["coolest_persona"], "media")


class VarianceGatingTest(unittest.TestCase):
    """Fas 2.2c: perception-flaggor grindas av mätstabiliteten (valence_variance).
    Instabil perception → inga perception-flaggor (vi larmar inte på brus).
    missing_evidence är perception-oberoende och passerar grinden."""

    def test_high_variance_suppresses_over_claim(self):
        # Skulle annars resa over_claim (valens >> evidens, hög konfidens) men
        # variansen är över taket → flaggan reses inte.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {
                "salience": 0.7, "valence": 0.8, "confidence": 0.8,
                "valence_variance": 0.4,  # > PERCEPTION_VARIANCE_CEILING (0.25)
            }},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertNotIn("over_claim", kinds)
        self.assertNotIn("opportunity", kinds)

    def test_high_variance_suppresses_persona_mismatch(self):
        _setup(
            {"c1": _claim("wellbeing", "demonstrated", kind="item")},
            perceived={"wellbeing": {
                "salience": 0.7, "valence": 0.55, "confidence": 0.7,
                "valence_variance": 0.5,  # instabilt
                "per_persona": {
                    "talent": {"salience": 0.7, "valence": 0.3},
                    "customer": {"salience": 0.7, "valence": 0.8},
                },
            }},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertNotIn("persona_mismatch", kinds)

    def test_high_variance_still_allows_missing_evidence(self):
        # missing_evidence är perception-oberoende → passerar variansgrinden.
        _setup(
            {"c1": _claim("ethics", "declared")},  # declared utan demonstrated
            perceived={"ethics": {
                "salience": 0.6, "valence": 0.8, "confidence": 0.8,
                "valence_variance": 0.6,  # mycket instabilt
            }},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertIn("missing_evidence", kinds)

    def test_low_variance_allows_flags(self):
        # Stabil mätning (varians under taket) → flaggorna reses som vanligt.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {
                "salience": 0.7, "valence": 0.8, "confidence": 0.8,
                "valence_variance": 0.05,  # stabilt
            }},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertIn("over_claim", kinds)

    def test_missing_variance_field_treated_as_stable(self):
        # Bakåtkompat: warmth-data utan valence_variance (pre-2.2a) → behandlas
        # som stabil, flaggor reses som tidigare.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {
                "salience": 0.7, "valence": 0.8, "confidence": 0.8,
                # ingen valence_variance
            }},
        )
        kinds = {f["kind"] for f in ctg.compute("acme")["flags"]}
        self.assertIn("over_claim", kinds)


if __name__ == "__main__":
    unittest.main()
