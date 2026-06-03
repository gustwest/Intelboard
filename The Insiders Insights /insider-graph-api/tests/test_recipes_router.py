"""Enhetstester för recept-routerns endpoints (routers/recipes.py, Fas 1.3c)."""
import unittest

from fastapi import HTTPException

import fakefs  # installerar fake firestore_client
from routers import recipes as router


def _recipe(rid="missing_evidence-ethics", status="pending", **over):
    base = {
        "recipe_id": rid,
        "skeleton": {"gap_type": rid.split("-", 1)[0], "dimension": rid.split("-", 1)[1]},
        "details": {"detailed_action": "exempel"},
        "status": status,
        "created_at": "2026-06-01T10:00:00+00:00",
        "updated_at": "2026-06-01T10:00:00+00:00",
        "agreed_at": None, "acted_at": None, "verified_at": None,
        "dismissed_at": None, "notes": [],
    }
    base.update(over)
    return base


def _setup(recipes=None):
    fakefs.reset(client={"company_name": "Acme AB"}, recipes=recipes or {})


class ListRecipesTest(unittest.TestCase):
    def test_returns_404_for_unknown_client(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            router.list_recipes("nope")
        self.assertEqual(cm.exception.status_code, 404)

    def test_lists_with_counts_and_sort(self):
        # Pending först (operatörens kö), sen agreed, sen acted/verified/dismissed.
        _setup({
            "a-1": _recipe("a-1", "verified"),
            "b-2": _recipe("b-2", "pending"),
            "c-3": _recipe("c-3", "agreed"),
            "d-4": _recipe("d-4", "dismissed"),
        })
        out = router.list_recipes("acme")
        ids = [it["recipe_id"] for it in out["recipes"]]
        # Pending först, dismissed sist.
        self.assertEqual(ids[0], "b-2")
        self.assertEqual(ids[1], "c-3")
        self.assertEqual(out["counts"]["pending"], 1)
        self.assertEqual(out["counts"]["agreed"], 1)
        self.assertEqual(out["counts"]["verified"], 1)
        self.assertEqual(out["counts"]["dismissed"], 1)

    def test_filter_by_status(self):
        _setup({"a-1": _recipe("a-1", "pending"), "b-2": _recipe("b-2", "agreed")})
        out = router.list_recipes("acme", status="agreed")
        self.assertEqual(len(out["recipes"]), 1)
        self.assertEqual(out["recipes"][0]["recipe_id"], "b-2")

    def test_filter_by_gap_type(self):
        _setup({
            "over_claim-ethics": _recipe("over_claim-ethics"),
            "missing_evidence-ethics": _recipe("missing_evidence-ethics"),
        })
        out = router.list_recipes("acme", gap_type="over_claim")
        self.assertEqual(len(out["recipes"]), 1)
        self.assertEqual(out["recipes"][0]["recipe_id"], "over_claim-ethics")


class InterventionAttachmentTest(unittest.TestCase):
    """Listan ska bifoga intervention per recept (Fas 1.4 → Fas 1.5)."""

    def test_intervention_attached_when_present(self):
        rid = "missing_evidence-ethics"
        fakefs.reset(
            client={"company_name": "Acme AB"},
            recipes={rid: _recipe(rid, "acted")},
            interventions={
                "int-1": {
                    "intervention_id": "int-1",
                    "recipe_id": rid,
                    "status": "open",
                    "updated_at": "2026-06-03T10:00:00+00:00",
                    "baseline": {"demonstrated": 0.0},
                }
            },
        )
        out = router.list_recipes("acme")
        recipe = out["recipes"][0]
        self.assertIsNotNone(recipe.get("intervention"))
        self.assertEqual(recipe["intervention"]["intervention_id"], "int-1")

    def test_no_intervention_field_is_none(self):
        # Recept utan tillhörande intervention → fältet ska finnas men vara None,
        # så frontend kan särskilja "inte mätt än" från "data saknas".
        fakefs.reset(
            client={"company_name": "Acme AB"},
            recipes={"missing_evidence-ethics": _recipe("missing_evidence-ethics", "pending")},
        )
        out = router.list_recipes("acme")
        self.assertIn("intervention", out["recipes"][0])
        self.assertIsNone(out["recipes"][0]["intervention"])

    def test_open_intervention_trumps_resolved(self):
        # Om båda finns för samma recept (osannolikt men möjligt vid debug) ska
        # öppen visas — operatören vill se aktiv mätning.
        rid = "missing_evidence-ethics"
        fakefs.reset(
            client={"company_name": "Acme AB"},
            recipes={rid: _recipe(rid, "acted")},
            interventions={
                "int-resolved": {
                    "intervention_id": "int-resolved", "recipe_id": rid,
                    "status": "resolved_full",
                    "updated_at": "2026-06-10T10:00:00+00:00",
                },
                "int-open": {
                    "intervention_id": "int-open", "recipe_id": rid,
                    "status": "open",
                    "updated_at": "2026-06-05T10:00:00+00:00",  # tidigare timestamp
                },
            },
        )
        out = router.list_recipes("acme")
        self.assertEqual(out["recipes"][0]["intervention"]["intervention_id"], "int-open")


class TransitionStatusTest(unittest.TestCase):
    def test_happy_path_pending_to_agreed(self):
        _setup({"missing_evidence-ethics": _recipe("missing_evidence-ethics", "pending")})
        body = router.StatusUpdate(status="agreed", note="kör")
        out = router.transition_status("acme", "missing_evidence-ethics", body)
        self.assertEqual(out["status"], "agreed")

    def test_invalid_transition_returns_409(self):
        # acted → agreed är bakåt-rörelse → 409 från service-laget.
        rid = "over_claim-ethics"
        _setup({rid: _recipe(rid, "acted")})
        body = router.StatusUpdate(status="agreed")
        with self.assertRaises(HTTPException) as cm:
            router.transition_status("acme", rid, body)
        self.assertEqual(cm.exception.status_code, 409)

    def test_unknown_recipe_returns_404(self):
        _setup({})
        body = router.StatusUpdate(status="agreed")
        with self.assertRaises(HTTPException) as cm:
            router.transition_status("acme", "nonexistent", body)
        self.assertEqual(cm.exception.status_code, 404)

    def test_unknown_client_returns_404(self):
        fakefs.reset(client=None)
        body = router.StatusUpdate(status="agreed")
        with self.assertRaises(HTTPException) as cm:
            router.transition_status("nope", "r", body)
        self.assertEqual(cm.exception.status_code, 404)

    def test_verified_not_in_operator_schema(self):
        # Pydantic ska underkänna "verified" — det är Fas 1.4-API:ets domän, inte UI:t.
        with self.assertRaises(Exception):
            router.StatusUpdate(status="verified")


class GenerateRecipesTest(unittest.TestCase):
    def test_returns_404_for_unknown_client(self):
        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as cm:
            router.generate_recipes("nope")
        self.assertEqual(cm.exception.status_code, 404)

    def test_returns_no_trust_gap_reason_when_missing(self):
        # Klient finns men trust_gap saknas → tom summering med skäl.
        fakefs.reset(client={"company_name": "Acme AB"}, trust_gap=None)
        out = router.generate_recipes("acme")
        self.assertEqual(out["total"], 0)
        self.assertEqual(out["reason"], "no_trust_gap")


if __name__ == "__main__":
    unittest.main()
