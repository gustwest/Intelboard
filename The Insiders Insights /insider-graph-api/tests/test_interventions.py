"""Sluten-loop-mätning av interventioner (services/interventions, Fas 1.4).

Vad det här ska bevisa:
  * Baseline fångas korrekt när ett recept hamnar i acted-status (auto-trigger
    via services/recipes.update_status).
  * verify_open klassificerar:
      - resolved_full när target_gap_type är borta och inga nya bad flaggor
      - resolved_partial när target borta men annan flagga dök upp
      - regressed när target kvar och demonstrated/valens försämrats
      - no_change_yet annars
  * resolved_full/resolved_partial auto-verifierar receptet (loopen stängd).
  * dismiss på recept med öppen intervention → abandoned (vi mäter inte längre).
  * Idempotens: dubbla anrop till create_for_acted_recipe skapar inte dubbletter.
"""
import unittest
from unittest.mock import patch

import fakefs  # installerar fake firestore_client
from services import interventions
from services import recipes


def _trust_gap_doc(dimension_data, *, flags=None):
    return {
        "computed_at": "2026-06-03T00:00:00+00:00",
        "overall_score": 0.5,
        "coverage": {"declared": 1, "demonstrated": 0, "of": 6},
        "dimensions": {"ethics": dimension_data},
        "flags": flags or [],
    }


def _recipe_doc(*, status="acted", gap_type="missing_evidence", dimension="ethics"):
    return {
        "recipe_id": f"{gap_type}-{dimension}",
        "client_id": "acme",
        "skeleton": {
            "gap_type": gap_type,
            "dimension": dimension,
            "knowledge_source_target": "both",
            "expected_impact_metric": "demonstrated",
            "target_channels": ["attested_upload"],
        },
        "details": {"prioritized_channel": "attested_upload"},
        "status": status,
        "created_at": "2026-06-01T10:00:00+00:00",
        "updated_at": "2026-06-02T10:00:00+00:00",
        "agreed_at": "2026-06-01T11:00:00+00:00",
        "acted_at": "2026-06-02T10:00:00+00:00",
        "verified_at": None, "dismissed_at": None, "notes": [],
    }


class CreateInterventionTest(unittest.TestCase):
    def test_create_captures_baseline_from_trust_gap(self):
        recipe = _recipe_doc()
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc(
                {"declared": 1.0, "demonstrated": 0.0, "score": 0.3,
                 "perceived": {"salience": 0.6, "valence": 0.4, "confidence": 0.6}},
                flags=[{"kind": "missing_evidence", "dimension": "ethics", "severity": "high"}],
            ),
            recipes={recipe["recipe_id"]: recipe},
        )
        result = interventions.create_for_acted_recipe(
            "acme", recipe["recipe_id"], now="2026-06-02T10:00:00+00:00",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["status"], "open")
        self.assertEqual(result["gap_type"], "missing_evidence")
        self.assertEqual(result["dimension"], "ethics")
        # Baseline reflekterar trust_gap-tillståndet just nu.
        self.assertEqual(result["baseline"]["demonstrated"], 0.0)
        self.assertEqual(result["baseline"]["valence"], 0.4)
        self.assertEqual(result["baseline"]["flag_kinds"], ["missing_evidence"])

    def test_create_idempotent(self):
        recipe = _recipe_doc()
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc({"declared": 1.0, "demonstrated": 0.0, "score": 0.3}),
            recipes={recipe["recipe_id"]: recipe},
        )
        first = interventions.create_for_acted_recipe("acme", recipe["recipe_id"], now="2026-06-02T10:00:00+00:00")
        second = interventions.create_for_acted_recipe("acme", recipe["recipe_id"], now="2026-06-02T10:00:00+00:00")
        self.assertEqual(first["intervention_id"], second["intervention_id"])
        self.assertEqual(len(fakefs.STATE["interventions"]), 1)

    def test_create_skips_if_recipe_not_acted(self):
        recipe = _recipe_doc(status="pending")
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc({"declared": 1.0, "demonstrated": 0.0, "score": 0.3}),
            recipes={recipe["recipe_id"]: recipe},
        )
        result = interventions.create_for_acted_recipe("acme", recipe["recipe_id"])
        self.assertIsNone(result)
        self.assertEqual(fakefs.STATE["interventions"], {})


class ClassifyTest(unittest.TestCase):
    def test_resolved_full_when_target_gone_no_new_bad(self):
        s = interventions._classify(
            baseline_flag_kinds=["missing_evidence"], current_flag_kinds=[],
            target_gap_type="missing_evidence",
            baseline_demonstrated=0.0, current_demonstrated=0.5,
            baseline_valence=None, current_valence=None,
        )
        self.assertEqual(s, "resolved_full")

    def test_resolved_partial_when_target_gone_but_new_flag(self):
        # missing_evidence borta, men nu finns over_claim — gapet skiftade.
        s = interventions._classify(
            baseline_flag_kinds=["missing_evidence"], current_flag_kinds=["over_claim"],
            target_gap_type="missing_evidence",
            baseline_demonstrated=0.0, current_demonstrated=0.5,
            baseline_valence=None, current_valence=None,
        )
        self.assertEqual(s, "resolved_partial")

    def test_regressed_when_demonstrated_dropped(self):
        s = interventions._classify(
            baseline_flag_kinds=["missing_evidence"], current_flag_kinds=["missing_evidence"],
            target_gap_type="missing_evidence",
            baseline_demonstrated=0.5, current_demonstrated=0.2,  # rasade
            baseline_valence=None, current_valence=None,
        )
        self.assertEqual(s, "regressed")

    def test_regressed_when_opportunity_valence_dropped(self):
        # Opportunity vill ha valens-stigning; sjunkit ≥ 0.1 = regression.
        s = interventions._classify(
            baseline_flag_kinds=["opportunity"], current_flag_kinds=["opportunity"],
            target_gap_type="opportunity",
            baseline_demonstrated=0.5, current_demonstrated=0.5,
            baseline_valence=0.4, current_valence=0.2,
        )
        self.assertEqual(s, "regressed")

    def test_regressed_when_over_claim_valence_grew(self):
        # over_claim vill ha valens-sänkning; STIGIT ≥ 0.1 = regression (förvärrade).
        s = interventions._classify(
            baseline_flag_kinds=["over_claim"], current_flag_kinds=["over_claim"],
            target_gap_type="over_claim",
            baseline_demonstrated=0.5, current_demonstrated=0.5,
            baseline_valence=0.6, current_valence=0.8,
        )
        self.assertEqual(s, "regressed")

    def test_no_change_yet_when_target_still_there_and_stable(self):
        s = interventions._classify(
            baseline_flag_kinds=["missing_evidence"], current_flag_kinds=["missing_evidence"],
            target_gap_type="missing_evidence",
            baseline_demonstrated=0.0, current_demonstrated=0.05,  # liten rörelse
            baseline_valence=None, current_valence=None,
        )
        self.assertEqual(s, "no_change_yet")


class VerifyOpenTest(unittest.TestCase):
    def _seed_open_intervention(self, *, demonstrated, flag_kinds, gap_type="missing_evidence"):
        recipe = _recipe_doc(status="acted", gap_type=gap_type)
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc(
                {"declared": 1.0, "demonstrated": demonstrated, "score": 0.3 + 0.7 * demonstrated,
                 "perceived": {"salience": 0.6, "valence": 0.4, "confidence": 0.6}},
                flags=[{"kind": k, "dimension": "ethics"} for k in flag_kinds],
            ),
            recipes={recipe["recipe_id"]: recipe},
            interventions={
                "int-existing": {
                    "intervention_id": "int-existing",
                    "client_id": "acme",
                    "recipe_id": recipe["recipe_id"],
                    "gap_type": gap_type,
                    "dimension": "ethics",
                    "baseline": {
                        "declared": 1.0, "demonstrated": 0.0, "valence": 0.4, "salience": 0.6,
                        "flag_kinds": [gap_type], "captured_at": "2026-06-02T10:00:00+00:00",
                    },
                    "current": {},
                    "status": "open",
                    "acted_at": "2026-06-02T10:00:00+00:00",
                    "expected_impact_metric": "demonstrated",
                }
            },
        )

    def test_resolved_full_auto_verifies_recipe(self):
        # Demonstrated upp till 0.5 OCH ingen missing_evidence-flagga kvar → resolved_full.
        self._seed_open_intervention(demonstrated=0.5, flag_kinds=[])
        summary = interventions.verify_open("acme", now="2026-06-10T10:00:00+00:00")
        self.assertEqual(summary["resolved_full"], 1)
        stored = fakefs.STATE["interventions"]["int-existing"]
        self.assertEqual(stored["status"], "resolved_full")
        self.assertIsNotNone(stored["closure"])
        self.assertEqual(stored["closure"]["days_to_close"], 8)  # 2→10 juni
        # Receptet ska ha auto-verifierats via _try_verify_recipe.
        recipe = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(recipe["status"], "verified")
        self.assertIsNotNone(recipe["verified_at"])

    def test_no_change_yet_keeps_open(self):
        # Demonstrated oförändrat, target-flag kvar → no_change_yet.
        self._seed_open_intervention(demonstrated=0.0, flag_kinds=["missing_evidence"])
        interventions.verify_open("acme")
        stored = fakefs.STATE["interventions"]["int-existing"]
        self.assertEqual(stored["status"], "no_change_yet")
        # Receptet bör fortfarande vara acted (inte auto-verifierat).
        recipe = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(recipe["status"], "acted")

    def test_regressed_keeps_recipe_at_acted(self):
        # Demonstrated har fallit, target-flag kvar → regressed; recept förblir acted.
        recipe = _recipe_doc(status="acted")
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc(
                {"declared": 1.0, "demonstrated": 0.0, "score": 0.3,
                 "perceived": {"salience": 0.6, "valence": 0.4, "confidence": 0.6}},
                flags=[{"kind": "missing_evidence", "dimension": "ethics"}],
            ),
            recipes={recipe["recipe_id"]: recipe},
            interventions={
                "int-existing": {
                    "intervention_id": "int-existing",
                    "client_id": "acme",
                    "recipe_id": recipe["recipe_id"],
                    "gap_type": "missing_evidence",
                    "dimension": "ethics",
                    "baseline": {
                        "declared": 1.0, "demonstrated": 0.4, "valence": 0.4, "salience": 0.6,
                        "flag_kinds": ["missing_evidence"], "captured_at": "2026-06-02T10:00:00+00:00",
                    },
                    "current": {},
                    "status": "open",
                    "acted_at": "2026-06-02T10:00:00+00:00",
                    "expected_impact_metric": "demonstrated",
                }
            },
        )
        interventions.verify_open("acme")
        stored = fakefs.STATE["interventions"]["int-existing"]
        self.assertEqual(stored["status"], "regressed")
        # Receptet förblir acted — operatören kan välja att agera igen.
        self.assertEqual(fakefs.STATE["recipes"]["missing_evidence-ethics"]["status"], "acted")


class RecipeStatusHookTest(unittest.TestCase):
    """Recipes.update_status ska trigga create / abandon via interventions."""

    def test_acted_creates_intervention(self):
        recipe = _recipe_doc(status="agreed")  # tillåten transition: agreed → acted
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_trust_gap_doc(
                {"declared": 1.0, "demonstrated": 0.0, "score": 0.3},
                flags=[{"kind": "missing_evidence", "dimension": "ethics"}],
            ),
            recipes={recipe["recipe_id"]: recipe},
        )
        recipes.update_status("acme", recipe["recipe_id"], "acted",
                              now="2026-06-02T10:00:00+00:00")
        # En intervention ska ha skapats av hooken.
        self.assertEqual(len(fakefs.STATE["interventions"]), 1)
        intervention = list(fakefs.STATE["interventions"].values())[0]
        self.assertEqual(intervention["recipe_id"], recipe["recipe_id"])
        self.assertEqual(intervention["status"], "open")

    def test_dismissed_marks_open_intervention_abandoned(self):
        # Recept har gått pending → agreed → acted → öppen intervention. Operatör
        # ångrar sig och dismissar. Interventionen ska markeras abandoned.
        recipe = _recipe_doc(status="acted")
        fakefs.reset(
            client={"company_name": "Acme AB"},
            recipes={recipe["recipe_id"]: recipe},
            interventions={
                "int-abc": {
                    "intervention_id": "int-abc",
                    "recipe_id": recipe["recipe_id"],
                    "status": "open",
                    "dimension": "ethics",
                    "gap_type": "missing_evidence",
                }
            },
        )
        recipes.update_status("acme", recipe["recipe_id"], "dismissed",
                              now="2026-06-05T10:00:00+00:00")
        self.assertEqual(fakefs.STATE["interventions"]["int-abc"]["status"], "abandoned")


class MarkAbandonedTest(unittest.TestCase):
    def test_only_open_interventions_are_marked(self):
        recipe = _recipe_doc()
        fakefs.reset(
            client={"company_name": "Acme AB"},
            recipes={recipe["recipe_id"]: recipe},
            interventions={
                "int-open": {"recipe_id": recipe["recipe_id"], "status": "open"},
                "int-resolved": {"recipe_id": recipe["recipe_id"], "status": "resolved_full"},
                "int-other": {"recipe_id": "other-recipe", "status": "open"},
            },
        )
        count = interventions.mark_abandoned("acme", recipe["recipe_id"],
                                             now="2026-06-05T10:00:00+00:00")
        self.assertEqual(count, 1)
        # int-open uppdaterad; int-resolved och int-other oförändrade.
        self.assertEqual(fakefs.STATE["interventions"]["int-open"]["status"], "abandoned")
        self.assertEqual(fakefs.STATE["interventions"]["int-resolved"]["status"], "resolved_full")
        self.assertEqual(fakefs.STATE["interventions"]["int-other"]["status"], "open")


if __name__ == "__main__":
    unittest.main()
