"""Tester för persona-registry-routern + persona-config på clients (Fas 2.1g)."""
import unittest

import fakefs  # installerar fake firestore_client — först
from routers import personas as personas_router
from routers import clients as clients_router
from services import persona_registry as pr


class RegistryEndpointTest(unittest.TestCase):
    def test_returns_full_palette(self):
        out = personas_router.get_registry()
        self.assertEqual(len(out["personas"]), 10)
        self.assertEqual(set(out["defaults"]), {"customer", "talent", "investor"})
        self.assertEqual(out["max_active"], pr.MAX_ACTIVE_PERSONAS_PER_CLIENT)

    def test_personas_have_templates_for_ui(self):
        out = personas_router.get_registry()
        customer = next(p for p in out["personas"] if p["id"] == "customer")
        self.assertIn("probe_templates", customer)
        self.assertIn("description_sv", customer)
        # Templates ska vara strukturerade för read-only-vyn
        for dim, payload in customer["probe_templates"].items():
            self.assertIn("neutral", payload)
            self.assertIn("adversarial", payload)


class ClientPersonaConfigTest(unittest.TestCase):
    def test_get_client_returns_default_personas_when_unset(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        out = clients_router.get_client("acme")
        self.assertEqual(set(out["personas"]), set(pr.default_persona_ids()))

    def test_get_client_returns_configured_personas(self):
        fakefs.reset(client={
            "company_name": "Acme AB",
            "personas": {"active": ["customer", "media", "partner"]},
        })
        out = clients_router.get_client("acme")
        self.assertEqual(set(out["personas"]), {"customer", "media", "partner"})

    def test_put_config_saves_sanitized_personas(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        payload = clients_router.ClientConfigUpdate(
            personas=["customer", "customer", "media", "unknown_persona"],
        )
        clients_router.update_client_config("acme", payload)
        stored = fakefs.STATE["client"]["personas"]["active"]
        # Dedup + okänd-filtrering
        self.assertEqual(stored.count("customer"), 1)
        self.assertNotIn("unknown_persona", stored)
        self.assertIn("media", stored)

    def test_put_config_caps_at_max_active(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        all_ids = [p["id"] for p in personas_router.get_registry()["personas"]]
        payload = clients_router.ClientConfigUpdate(personas=all_ids)
        clients_router.update_client_config("acme", payload)
        stored = fakefs.STATE["client"]["personas"]["active"]
        self.assertLessEqual(len(stored), pr.MAX_ACTIVE_PERSONAS_PER_CLIENT)

    def test_put_config_empty_falls_back_to_defaults(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        payload = clients_router.ClientConfigUpdate(personas=[])
        clients_router.update_client_config("acme", payload)
        stored = fakefs.STATE["client"]["personas"]["active"]
        self.assertEqual(set(stored), set(pr.default_persona_ids()))


class ClientCompetitorsTest(unittest.TestCase):
    """GEO-riskloop §5.1: competitors sätts/läses på befintlig kund."""

    def test_set_competitors_strips_and_dedupes(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        payload = clients_router.ClientConfigUpdate(
            competitors=[" Globex ", "Globex", "Initech", ""],
        )
        clients_router.update_client_config("acme", payload)
        self.assertEqual(fakefs.STATE["client"]["competitors"], ["Globex", "Initech"])

    def test_empty_list_clears_competitors(self):
        fakefs.reset(client={"company_name": "Acme AB", "competitors": ["Globex"]})
        clients_router.update_client_config("acme", clients_router.ClientConfigUpdate(competitors=[]))
        self.assertEqual(fakefs.STATE["client"]["competitors"], [])

    def test_none_leaves_competitors_untouched(self):
        fakefs.reset(client={"company_name": "Acme AB", "competitors": ["Globex"]})
        clients_router.update_client_config("acme", clients_router.ClientConfigUpdate(industry="tech"))
        self.assertEqual(fakefs.STATE["client"]["competitors"], ["Globex"])

    def test_get_client_returns_competitors(self):
        fakefs.reset(client={"company_name": "Acme AB", "competitors": ["Globex"]})
        self.assertEqual(clients_router.get_client("acme")["competitors"], ["Globex"])

    def test_get_client_defaults_empty(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        self.assertEqual(clients_router.get_client("acme")["competitors"], [])


if __name__ == "__main__":
    unittest.main()
