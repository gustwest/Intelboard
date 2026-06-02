"""Tester för services/model_registry — manifestets API och konsistens.

Säkerställer att registret håller en känd form, att lookup-helpers gör vad
de ska, och att de drift-relaterade query-funktionerna fångar de fall
jobs/model_drift_scan litar på.
"""
import unittest
from datetime import date, timedelta

from services import model_registry


class RegistryShapeTest(unittest.TestCase):
    def test_all_entries_have_required_fields(self):
        for entry in model_registry.all_entries():
            self.assertTrue(entry.role, "role saknas")
            self.assertTrue(entry.model_id, f"model_id saknas för {entry.role}")
            self.assertTrue(entry.provider, f"provider saknas för {entry.role}")
            self.assertTrue(entry.latest_known, f"latest_known saknas för {entry.role}")
            # checked_at måste vara giltig ISO-form
            date.fromisoformat(entry.checked_at)

    def test_roles_are_unique(self):
        roles = [e.role for e in model_registry.all_entries()]
        self.assertEqual(len(roles), len(set(roles)), "duplicerade roller i registret")

    def test_authorized_ids_includes_active_and_latest(self):
        ids = model_registry.authorized_model_ids()
        for entry in model_registry.all_entries():
            self.assertIn(entry.model_id, ids)
            self.assertIn(entry.latest_known, ids)


class LookupTest(unittest.TestCase):
    def test_get_returns_entry(self):
        entry = model_registry.get("probe_claude")
        self.assertEqual(entry.role, "probe_claude")
        self.assertEqual(entry.provider, "vertex_anthropic")

    def test_get_id_shortcut(self):
        self.assertEqual(
            model_registry.get_id("geo_validator"),
            model_registry.get("geo_validator").model_id,
        )

    def test_unknown_role_raises(self):
        with self.assertRaises(KeyError):
            model_registry.get("ingen-sådan-roll")


class DriftQueriesTest(unittest.TestCase):
    def test_behind_latest_is_empty_under_strict_policy(self):
        """Policyn är 'alltid senaste stabla' — varje entry SKA ha model_id = latest_known.
        Drift-scannen ska aldrig se en `behind_latest` finding så länge registret är i
        kontrakt; ifall den gör det är registret felaktigt och en commit har glömts."""
        flagged = list(model_registry.behind_latest())
        self.assertEqual(
            flagged, [],
            msg=f"Strict policy bruten: {[e.role for e in flagged]} har model_id != latest_known",
        )

    def test_stale_entries_respects_threshold(self):
        # Med tröskel 0 dagar → alla utom dagens entries blir stale.
        # Med tröskel 100000 dagar → ingen blir stale.
        many_days = date.today() + timedelta(days=1)
        self.assertEqual(list(model_registry.stale_entries(many_days.isoformat(), max_age_days=100000)), [])
        # Vi kan inte lita på att det finns en stale entry just nu — så vi använder en
        # konstruerad framtid: dagens datum + 200 dagar → alla checked_at:n blir gamla.
        future = (date.today() + timedelta(days=200)).isoformat()
        self.assertGreaterEqual(len(list(model_registry.stale_entries(future, max_age_days=90))), 1)

    def test_as_dicts_is_serialisable(self):
        import json

        # Skall kunna serialiseras utan custom encoder (driver API:t).
        json.dumps(model_registry.as_dicts())


if __name__ == "__main__":
    unittest.main()
