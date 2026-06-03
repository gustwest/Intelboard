"""Receptmotor Lager C — persistens + lifecycle (services/recipes, Fas 1.3c).

Verifierar två invarianter som driver hela receptmotorns nytta:

  * **Idempotens vid regenerering**: deterministisk recipe_id; uppdatering
    in-place om status=pending; FRYSER om status flyttats vidare (operatörens
    beslut är heligt).
  * **Strikt lifecycle**: pending → agreed → acted → verified, eller
    pending/agreed/acted → dismissed. Inga andra övergångar tillåts (en bug
    i frontend kan annars rulla tillbaka acted till pending och förlora spår).
"""
import json
import unittest
from unittest.mock import patch

import fakefs  # registrerar fake firestore_client
from services import gap_recipes as gr
from services import gap_recipes_llm as grl
from services import recipes


def _setup(*, trust_gap=None, claims=None, recipes_state=None):
    fakefs.reset(
        client={"company_name": "Acme AB"},
        trust_gap=trust_gap,
        claims=claims or {},
        recipes=recipes_state or {},
    )


def _flag(kind="missing_evidence", dimension="ethics", **extra):
    return {"kind": kind, "dimension": dimension, **extra}


def _tg_with_flags(*flags, dimensions=None):
    """Trust_gap-dok med givna flaggor + (valfritt) dimension-data."""
    return {
        "computed_at": "2026-06-03T00:00:00+00:00",
        "overall_score": 0.2,
        "coverage": {"declared": 1, "demonstrated": 0, "of": 6},
        "dimensions": dimensions or {
            "ethics": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3},
        },
        "flags": list(flags),
    }


VALID_LLM = {
    "detailed_action": "Ladda upp Q1-uppförandekod-revisionen som attesterad källa.",
    "specific_proof_points": ["ISO 26000-rapport 2025"],
    "prioritized_channel": "attested_upload",
    "prioritized_channel_reason": "Snabbast väg till verifierat underlag.",
    "success_criteria": "Demonstrated stiger från 0 → >0.4 inom två veckor.",
    "refined_why": "Acme har en uppförandekod internt men ingen oberoende källa AI kan luta sig mot.",
    "risks": [],
}


def _fake_llm():
    class _LLM:
        def invoke(self, _msgs):
            from types import SimpleNamespace
            return SimpleNamespace(content=json.dumps(VALID_LLM))
    return _LLM()


class RecipeIdTest(unittest.TestCase):
    def test_id_is_deterministic_per_gap_type_and_dimension(self):
        skel = gr.build_recipe_skeleton(_flag("over_claim", "community"))
        self.assertEqual(recipes.recipe_id(skel), "over_claim-community")

    def test_id_ignores_flagg_diskriminator(self):
        # Två kontradiktioner med olika engines → samma id (en gap-typ per dim
        # = ett recept; idempotent re-generering, ingen parallell ström av dupletter).
        a = gr.build_recipe_skeleton(_flag("contradiction", "ethics",
                                          warmest_engine="gemini", coolest_engine="perplexity"))
        b = gr.build_recipe_skeleton(_flag("contradiction", "ethics",
                                          warmest_engine="claude", coolest_engine="chatgpt"))
        self.assertEqual(recipes.recipe_id(a), recipes.recipe_id(b))


class PersistRecipeTest(unittest.TestCase):
    def test_first_persist_creates_pending(self):
        _setup()
        with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()):
            ctx = gr.RecipeContext("acme", "Acme AB", 1.0, 0.0, None, None)
            skel = gr.build_recipe_skeleton(_flag("missing_evidence"))
            recipe = grl.detailify(skel, ctx)
        result = recipes.persist_recipe("acme", recipe, now="2026-06-03T10:00:00+00:00")
        self.assertEqual(result["action"], "created")
        self.assertEqual(result["status"], "pending")
        # Doc-data finns i Firestore med lifecycle-fälten initialiserade.
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(stored["status"], "pending")
        self.assertEqual(stored["created_at"], "2026-06-03T10:00:00+00:00")
        self.assertIsNone(stored["agreed_at"])
        self.assertEqual(stored["notes"], [])

    def test_re_persist_pending_updates_in_place(self):
        # Pending recept regenereras → skelett+details uppdateras, lifecycle bevaras.
        _setup(recipes_state={
            "missing_evidence-ethics": {
                "recipe_id": "missing_evidence-ethics",
                "skeleton": {"gap_type": "missing_evidence", "dimension": "ethics",
                             "old_field": "should_be_overwritten"},
                "details": None,
                "status": "pending",
                "created_at": "2026-06-01T10:00:00+00:00",
                "updated_at": "2026-06-01T10:00:00+00:00",
                "agreed_at": None, "acted_at": None, "verified_at": None,
                "dismissed_at": None, "notes": [],
            }
        })
        with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()):
            ctx = gr.RecipeContext("acme", "Acme AB", 1.0, 0.0, None, None)
            skel = gr.build_recipe_skeleton(_flag("missing_evidence"))
            recipe = grl.detailify(skel, ctx)
        result = recipes.persist_recipe("acme", recipe, now="2026-06-03T10:00:00+00:00")
        self.assertEqual(result["action"], "updated")
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        # Created_at bevarat (lifecycle), updated_at fräscht, ny detaljer in.
        self.assertEqual(stored["created_at"], "2026-06-01T10:00:00+00:00")
        self.assertEqual(stored["updated_at"], "2026-06-03T10:00:00+00:00")
        self.assertIsNotNone(stored["details"])
        # Gamla fältet finns INTE — nya skelettet skrev över.
        self.assertNotIn("old_field", stored["skeleton"])

    def test_frozen_when_status_is_agreed_or_later(self):
        # Agreed → regenerering hoppar över. Vi skriver inte över operatör.
        for frozen_status in ("agreed", "acted", "verified", "dismissed"):
            _setup(recipes_state={
                "missing_evidence-ethics": {
                    "recipe_id": "missing_evidence-ethics",
                    "skeleton": {"old": True},
                    "status": frozen_status,
                    "created_at": "2026-06-01T10:00:00+00:00",
                    "updated_at": "2026-06-02T10:00:00+00:00",
                }
            })
            with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()):
                ctx = gr.RecipeContext("acme", "Acme AB", 1.0, 0.0, None, None)
                skel = gr.build_recipe_skeleton(_flag("missing_evidence"))
                recipe = grl.detailify(skel, ctx)
            result = recipes.persist_recipe("acme", recipe, now="2026-06-03T10:00:00+00:00")
            self.assertEqual(result["action"], "frozen", f"misslyckades för {frozen_status}")
            stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
            # Status oförändrad, gamla skelettet kvar.
            self.assertEqual(stored["status"], frozen_status)
            self.assertEqual(stored["skeleton"], {"old": True})


class GenerateForClientTest(unittest.TestCase):
    def test_runs_lager_a_b_for_every_flag(self):
        _setup(trust_gap=_tg_with_flags(
            _flag("missing_evidence", "ethics"),
            _flag("over_claim", "community", confidence=0.8, gap_magnitude=0.3),
        ))
        with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()):
            summary = recipes.generate_for_client("acme", now="2026-06-03T10:00:00+00:00")
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["created"], 2)
        self.assertIn("missing_evidence-ethics", fakefs.STATE["recipes"])
        self.assertIn("over_claim-community", fakefs.STATE["recipes"])

    def test_skips_stubbed_gap_types_silently(self):
        # Stubbade typer (persona_mismatch) ska inte räknas — Lager A returnerar
        # None, persist anropas aldrig.
        _setup(trust_gap=_tg_with_flags(
            _flag("persona_mismatch", "ethics"),
            _flag("missing_evidence", "ethics"),
        ))
        with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()):
            summary = recipes.generate_for_client("acme")
        self.assertEqual(summary["total"], 1)
        self.assertNotIn("persona_mismatch-ethics", fakefs.STATE["recipes"])

    def test_llm_failure_persists_skeleton_only(self):
        # När LLM:n faller → details=None, men receptet PERSISTERAS ändå
        # (frontend visar "väntar på detaljifiering" istället för att skelettet
        # tappas bort).
        _setup(trust_gap=_tg_with_flags(_flag("missing_evidence", "ethics")))
        with patch.object(grl, "_pick_detailifier", return_value=None):
            summary = recipes.generate_for_client("acme")
        self.assertEqual(summary["llm_failed"], 1)
        self.assertEqual(summary["created"], 1)
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertIsNone(stored["details"])

    def test_no_trust_gap_returns_empty(self):
        _setup(trust_gap=None)
        summary = recipes.generate_for_client("acme")
        self.assertEqual(summary["total"], 0)
        self.assertEqual(summary["reason"], "no_trust_gap")

    def test_proof_points_include_narrative_claims(self):
        # Claims som finns för kunden ska propageras till LLM-kontexten som
        # available_proof_points (operatören ska kunna välja från redan-godkänt
        # underlag, inte hitta på nya proof points).
        _setup(
            trust_gap=_tg_with_flags(_flag("missing_evidence", "ethics")),
            claims={
                "c1": {"claim_kind": "narrative", "statement": "Acme har ISO 26000-certifiering."},
                "c2": {"claim_kind": "property", "statement": "B2B SaaS"},  # property → ej proof point
            },
        )
        captured: dict[str, Any] = {}
        original_detailify = grl.detailify

        def _capture(skel, ctx):
            captured["ctx"] = ctx
            return original_detailify(skel, ctx)

        with patch.object(grl, "_pick_detailifier", return_value=_fake_llm()), \
             patch.object(grl, "detailify", side_effect=_capture):
            recipes.generate_for_client("acme")
        ctx = captured.get("ctx")
        self.assertIsNotNone(ctx)
        # Bara narrative-claim:et togs med — property hoppas över.
        self.assertEqual(len(ctx.available_proof_points), 1)
        self.assertIn("ISO 26000", ctx.available_proof_points[0])


class StatusTransitionTest(unittest.TestCase):
    def _make_recipe(self, status="pending"):
        _setup(recipes_state={
            "missing_evidence-ethics": {
                "recipe_id": "missing_evidence-ethics", "skeleton": {}, "details": None,
                "status": status, "created_at": "2026-06-01T10:00:00+00:00",
                "updated_at": "2026-06-01T10:00:00+00:00",
                "agreed_at": None, "acted_at": None, "verified_at": None,
                "dismissed_at": None, "notes": [],
            }
        })

    def test_happy_path_pending_to_agreed_to_acted(self):
        self._make_recipe("pending")
        recipes.update_status("acme", "missing_evidence-ethics", "agreed",
                              note="Vi gör det", now="2026-06-03T10:00:00+00:00")
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(stored["status"], "agreed")
        self.assertEqual(stored["agreed_at"], "2026-06-03T10:00:00+00:00")
        self.assertEqual(len(stored["notes"]), 1)
        self.assertEqual(stored["notes"][0]["text"], "Vi gör det")

        recipes.update_status("acme", "missing_evidence-ethics", "acted",
                              now="2026-06-04T10:00:00+00:00")
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(stored["status"], "acted")
        self.assertEqual(stored["acted_at"], "2026-06-04T10:00:00+00:00")
        # agreed_at bevaras (lifecycle är ackumulerande).
        self.assertEqual(stored["agreed_at"], "2026-06-03T10:00:00+00:00")

    def test_dismiss_from_pending(self):
        self._make_recipe("pending")
        recipes.update_status("acme", "missing_evidence-ethics", "dismissed",
                              note="Inte aktuellt", now="2026-06-03T10:00:00+00:00")
        stored = fakefs.STATE["recipes"]["missing_evidence-ethics"]
        self.assertEqual(stored["status"], "dismissed")
        self.assertEqual(stored["dismissed_at"], "2026-06-03T10:00:00+00:00")

    def test_invalid_transition_raises(self):
        # acted → pending är ogiltigt (bakåt-rörelse skulle förlora spår).
        self._make_recipe("acted")
        with self.assertRaises(recipes.StatusTransitionError):
            recipes.update_status("acme", "missing_evidence-ethics", "pending")

    def test_skipping_states_raises(self):
        # pending → acted (utan agreed) är ogiltigt.
        self._make_recipe("pending")
        with self.assertRaises(recipes.StatusTransitionError):
            recipes.update_status("acme", "missing_evidence-ethics", "acted")

    def test_terminal_states_cannot_be_left(self):
        for terminal in ("verified", "dismissed"):
            self._make_recipe(terminal)
            for new in ("pending", "agreed", "acted"):
                with self.assertRaises(recipes.StatusTransitionError):
                    recipes.update_status("acme", "missing_evidence-ethics", new)

    def test_unknown_recipe_raises_keyerror(self):
        _setup()
        with self.assertRaises(KeyError):
            recipes.update_status("acme", "nonexistent-recipe", "agreed")


if __name__ == "__main__":
    unittest.main()
