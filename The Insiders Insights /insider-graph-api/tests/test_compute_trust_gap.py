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
        # Under salience-golvet: ingen valens/gap, ingen flagga, märkt "not_visible".
        _setup(
            {"c1": _claim("ethics", "declared")},
            perceived={"ethics": {"salience": hc.SALIENCE_FLOOR - 0.05, "valence": 0.9, "confidence": 0.9}},
        )
        doc = ctg.compute("acme")
        dim = doc["dimensions"]["ethics"]
        self.assertEqual(dim["perceived"].get("status"), "not_visible")
        self.assertNotIn("credibility_gap", dim)
        self.assertEqual(doc["flags"], [])

    def test_opportunity_flag_when_underperceived(self):
        # valens << evidens, tillräcklig konfidens → möjlighet (lägre ribba).
        _setup(
            {"c1": _claim("community", "declared")},  # evidens = DECLARED_CAP = 0.3
            perceived={"community": {"salience": 0.6, "valence": 0.05, "confidence": 0.6}},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertTrue(any(f["kind"] == "opportunity" and f["dimension"] == "community" for f in flags))

    def test_over_claim_requires_high_confidence(self):
        # valens >> evidens = anseenderisk. Konfidens 0.6 < ribban → INGEN flagga.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {"salience": 0.7, "valence": 0.8, "confidence": 0.6}},
        )
        self.assertEqual(ctg.compute("acme")["flags"], [])
        # Höj konfidensen över ribban → flaggan reses som over_claim.
        _setup(
            {"c1": _claim("community", "declared")},
            perceived={"community": {"salience": 0.7, "valence": 0.8, "confidence": 0.8}},
        )
        flags = ctg.compute("acme")["flags"]
        self.assertTrue(any(f["kind"] == "over_claim" and f["dimension"] == "community" for f in flags))

    def test_small_gap_never_flags(self):
        # |gap| under magnitudgolvet → ingen flagga oavsett konfidens.
        _setup(
            {"c1": _claim("community", "declared")},  # evidens 0.3
            perceived={"community": {"salience": 0.7, "valence": 0.35, "confidence": 0.95}},
        )
        self.assertEqual(ctg.compute("acme")["flags"], [])


class TrustGapIdempotencyTest(unittest.TestCase):
    def test_unchanged_inputs_skip_write(self):
        _setup({"c1": _claim("ethics", "declared")})
        first = ctg.run("acme")
        self.assertTrue(first["written"])
        second = ctg.run("acme")
        self.assertTrue(second.get("skipped"))


if __name__ == "__main__":
    unittest.main()
