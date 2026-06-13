"""Tester för derive_claim_audience + get_active_personas (Fas 2.1b).

Strategin är medvetet regelbaserad: dimension + facet → set av personor från
DIMENSION_PERSONA_RELEVANCE, begränsat till kundens aktiva personor. Här låser
vi:
  * Operational claims förblir evergreen (tom audience)
  * Culture claims taggas mot dimension-relevant personor
  * Aktiv-lista begränsar resultatet (vi taggar aldrig personor kunden ej spårar)
  * Ordningen är registry-stabil (UI vill ha förutsägbara resultat)
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from services import persona_derivation as pd
from services import persona_registry as pr


def _claim(facet="culture", dimension="wellbeing", claim_kind="property", **over):
    base = {"claim_kind": claim_kind, "facet": facet, "dimension": dimension}
    base.update(over)
    return base


class DeriveClaimAudienceTest(unittest.TestCase):

    def test_operational_claim_is_evergreen(self):
        # Operational facet → tom audience oavsett dimension
        out = pd.derive_claim_audience(_claim(facet="operational", dimension=None))
        self.assertEqual(out, [])

    def test_culture_claim_without_dimension_is_evergreen(self):
        # Culture-claim utan dimension (slogan etc) → tom audience
        out = pd.derive_claim_audience(_claim(facet="culture", dimension=None))
        self.assertEqual(out, [])

    def test_unknown_dimension_is_evergreen(self):
        out = pd.derive_claim_audience(_claim(dimension="unknown_dim"))
        self.assertEqual(out, [])

    def test_wellbeing_targets_employee_centric_personas(self):
        # Inga aktiva-begränsningar → alla relevant-personor från mappningen
        out = pd.derive_claim_audience(_claim(dimension="wellbeing"), active_personas=None)
        # wellbeing → employee, patient, student, investor
        self.assertIn("talent", out)
        self.assertIn("investor", out)
        # Och INTE personor som inte är relevanta för wellbeing
        self.assertNotIn("donor", out)
        self.assertNotIn("regulator", out)

    def test_ethics_includes_governance_personas(self):
        out = pd.derive_claim_audience(_claim(dimension="ethics"), active_personas=None)
        self.assertIn("investor", out)
        self.assertIn("regulator", out)
        self.assertIn("media", out)

    def test_active_personas_limit_result(self):
        # Kund spårar bara customer + employee. Wellbeing-claim ska bara tagga employee
        # (customer finns inte i wellbeing's relevans-set).
        out = pd.derive_claim_audience(
            _claim(dimension="wellbeing"),
            active_personas=["customer", "talent"],
        )
        self.assertEqual(out, ["talent"])

    def test_empty_active_personas_returns_empty(self):
        # Tom aktiv-lista → vi har ingen att tagga med → evergreen
        out = pd.derive_claim_audience(
            _claim(dimension="wellbeing"),
            active_personas=[],
        )
        self.assertEqual(out, [])

    def test_invalid_active_personas_filtered(self):
        # Okända persona-id i active-lista filtreras bort tyst
        out = pd.derive_claim_audience(
            _claim(dimension="ethics"),
            active_personas=["customer", "unknown", "investor"],
        )
        self.assertIn("customer", out)
        self.assertIn("investor", out)
        self.assertNotIn("unknown", out)

    def test_result_in_registry_order(self):
        # UI-stabilitet: registry-ordning är customer, employee, investor, partner, ...
        # ethics matchar customer, investor, partner, media, donor, regulator.
        # Aktiv-set: ge ALLA, kontrollera ordningen.
        all_ids = [p.id for p in pr.all_personas()]
        out = pd.derive_claim_audience(_claim(dimension="ethics"), active_personas=all_ids)
        # Customer (idx 0) ska komma före investor (idx 2) som ska komma före partner (idx 3) etc.
        order = {pid: i for i, pid in enumerate(all_ids)}
        for a, b in zip(out, out[1:]):
            self.assertLess(order[a], order[b], f"{a} ska komma före {b}")

    def test_inclusion_dimension(self):
        out = pd.derive_claim_audience(_claim(dimension="inclusion"), active_personas=None)
        self.assertIn("talent", out)
        self.assertIn("customer", out)

    # --- A1-utökning 2026-06-12: operationella claims taggas via PREDIKAT ---------

    def test_operational_mapped_predicate_is_tagged(self):
        """Operationellt property-claim med kartlagt predikat når persona-sektionen."""
        out = pd.derive_claim_audience(
            _claim(facet="operational", dimension=None, predicate="hasCredential"),
            active_personas=None,
        )
        self.assertEqual(out, ["customer", "investor", "partner"])  # registry-ordning

    def test_operational_unmapped_predicate_is_evergreen(self):
        """Predikat utan kartläggning (t.ex. address) förblir evergreen."""
        out = pd.derive_claim_audience(
            _claim(facet="operational", dimension=None, predicate="address"),
            active_personas=None,
        )
        self.assertEqual(out, [])

    def test_operational_narrative_without_predicate_is_evergreen(self):
        """Narrative-claim utan predikat (operationellt) förblir evergreen."""
        out = pd.derive_claim_audience(
            _claim(facet="operational", dimension=None, claim_kind="narrative"),
            active_personas=None,
        )
        self.assertEqual(out, [])

    def test_financial_predicate_targets_investor(self):
        out = pd.derive_claim_audience(
            _claim(facet="operational", dimension=None, predicate="revenue"),
            active_personas=None,
        )
        self.assertEqual(out, ["investor"])

    def test_operational_predicate_respects_active_personas(self):
        """hasCredential → {customer, investor, partner}, men aktiv-set begränsar."""
        out = pd.derive_claim_audience(
            _claim(facet="operational", dimension=None, predicate="hasCredential"),
            active_personas=["customer", "talent"],
        )
        self.assertEqual(out, ["customer"])  # investor/partner ej aktiva, talent ej relevant


class GetActivePersonasTest(unittest.TestCase):

    def test_returns_defaults_when_client_missing(self):
        fakefs.reset(client=None)
        out = pd.get_active_personas("nonexistent")
        self.assertEqual(set(out), set(pr.default_persona_ids()))

    def test_returns_defaults_when_personas_not_configured(self):
        fakefs.reset(client={"company_name": "Acme"})
        out = pd.get_active_personas("acme")
        self.assertEqual(set(out), set(pr.default_persona_ids()))

    def test_returns_configured_personas(self):
        fakefs.reset(client={
            "company_name": "Acme",
            "personas": {"active": ["customer", "media", "partner"]},
        })
        out = pd.get_active_personas("acme")
        self.assertEqual(set(out), {"customer", "media", "partner"})

    def test_sanitizes_through_validate_active_set(self):
        # Innehåller okänd persona + duplicate — ska saneras
        fakefs.reset(client={
            "company_name": "Acme",
            "personas": {"active": ["customer", "customer", "unknown"]},
        })
        out = pd.get_active_personas("acme")
        self.assertEqual(out.count("customer"), 1)
        self.assertNotIn("unknown", out)

    def test_caps_at_max_active(self):
        # Skicka in 10 — sanering ska kapa till MAX_ACTIVE_PERSONAS_PER_CLIENT
        all_ids = [p.id for p in pr.all_personas()]
        fakefs.reset(client={
            "company_name": "Acme",
            "personas": {"active": all_ids},
        })
        out = pd.get_active_personas("acme")
        self.assertLessEqual(len(out), pr.MAX_ACTIVE_PERSONAS_PER_CLIENT)


class ClaimSchemaAudienceFieldTest(unittest.TestCase):
    """Sanitychecks på den nya audience-fältet på Claim-modellen."""

    def test_default_is_empty_list(self):
        from schemas import Claim, ClaimSource
        c = Claim(
            claim_kind="property", predicate="x", value="y",
            source=[ClaimSource(kind="manual", label="test")],
        )
        self.assertEqual(c.audience, [])

    def test_accepts_persona_ids(self):
        from schemas import Claim, ClaimSource
        c = Claim(
            claim_kind="narrative", statement="test",
            source=[ClaimSource(kind="manual", label="x")],
            audience=["customer", "talent"],
        )
        self.assertEqual(c.audience, ["customer", "talent"])

    def test_serializes_to_dict_with_audience(self):
        from schemas import Claim, ClaimSource
        c = Claim(
            claim_kind="property", predicate="x", value="y",
            source=[ClaimSource(kind="manual", label="test")],
            audience=["investor"],
        )
        d = c.model_dump()
        self.assertEqual(d["audience"], ["investor"])


if __name__ == "__main__":
    unittest.main()
