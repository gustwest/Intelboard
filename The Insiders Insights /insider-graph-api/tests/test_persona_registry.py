"""Tester för services/persona_registry (Fas 2.1a).

Sanity-tests för palettens integritet och seed-mekanismen.

Detaljerad probe-template-kvalitet kvalitetskollas i UI:t (Nivå 2) — inte här.
Här säkrar vi STRUKTURELLA invarianter:
  * 10 personor i registret, 3 defaults
  * Varje persona har templates för ALLA 6 dimensioner × 2 vinklar
  * Varje template-sträng innehåller {company}-placeholder
  * MAX_ACTIVE_PERSONAS_PER_CLIENT respekteras av validate_active_set
  * seed_to_firestore skriver rätt struktur som UI kan läsa
"""
import unittest

import fakefs  # installerar fake firestore_client — måste före imports som binder
from schema_org import humanization_config as hc
from services import persona_registry as pr


class PaletteIntegrityTest(unittest.TestCase):
    def test_exactly_ten_personas(self):
        self.assertEqual(len(pr.all_personas()), 10)

    def test_three_defaults(self):
        defaults = pr.default_persona_ids()
        self.assertEqual(set(defaults), {"customer", "talent", "investor"})

    def test_no_duplicate_ids(self):
        ids = [p.id for p in pr.all_personas()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_get_unknown_raises(self):
        with self.assertRaises(KeyError):
            pr.get("nonexistent")

    def test_get_returns_canonical(self):
        c = pr.get("customer")
        self.assertEqual(c.id, "customer")
        self.assertEqual(c.label_sv, "Kund")
        self.assertTrue(c.is_default)


class ProbeTemplateCoverageTest(unittest.TestCase):
    """Varje persona MÅSTE ha templates för varje värmedimension, båda vinklar.
    Annars producerar warmth_probes-kören tom data för persona × dimension-paret."""

    def test_every_persona_covers_all_dimensions(self):
        for persona in pr.all_personas():
            for dim in hc.DIMENSIONS:
                self.assertIn(
                    dim, persona.probe_templates,
                    f"{persona.id} saknar template för dimension {dim}",
                )

    def test_every_template_has_both_angles(self):
        for persona in pr.all_personas():
            for dim, templates in persona.probe_templates.items():
                self.assertEqual(
                    len(templates), 2,
                    f"{persona.id}/{dim} ska ha (neutral, adversarial), fick {len(templates)}",
                )
                neutral, adversarial = templates
                self.assertTrue(neutral.strip(), f"{persona.id}/{dim} har tom neutral")
                self.assertTrue(adversarial.strip(), f"{persona.id}/{dim} har tom adversarial")

    def test_every_template_has_company_placeholder(self):
        # Strukturell invariant: warmth_probes substituerar {company} vid körning;
        # template utan placeholder ger samma fråga för alla kunder.
        for persona in pr.all_personas():
            for dim, (neut, adv) in persona.probe_templates.items():
                self.assertIn("{company}", neut, f"{persona.id}/{dim} neutral saknar placeholder")
                self.assertIn("{company}", adv, f"{persona.id}/{dim} adversarial saknar placeholder")

    def test_total_template_count_is_120(self):
        total = sum(
            len(p.probe_templates) * 2 for p in pr.all_personas()
        )
        # 10 personor × 6 dimensioner × 2 vinklar = 120
        self.assertEqual(total, 120)


class ActiveSetValidationTest(unittest.TestCase):
    def test_default_when_empty(self):
        out = pr.validate_active_set([])
        self.assertEqual(out, list(pr.default_persona_ids()))

    def test_default_when_all_unknown(self):
        out = pr.validate_active_set(["xxx", "yyy"])
        self.assertEqual(out, list(pr.default_persona_ids()))

    def test_dedupes(self):
        out = pr.validate_active_set(["customer", "customer", "talent"])
        self.assertEqual(out.count("customer"), 1)

    def test_drops_unknown(self):
        out = pr.validate_active_set(["customer", "weird", "talent"])
        self.assertNotIn("weird", out)
        self.assertIn("customer", out)
        self.assertIn("talent", out)

    def test_caps_at_max_active(self):
        # Skicka in fler än MAX — sanering ska kapa till exakt MAX.
        all_ids = [p.id for p in pr.all_personas()]
        self.assertGreater(len(all_ids), pr.MAX_ACTIVE_PERSONAS_PER_CLIENT)
        out = pr.validate_active_set(all_ids)
        self.assertEqual(len(out), pr.MAX_ACTIVE_PERSONAS_PER_CLIENT)

    def test_ordered_by_registry(self):
        # UI-stabilitet: returnen sorteras i registry-ordning oavsett input-ordning.
        out = pr.validate_active_set(["investor", "customer", "talent"])
        self.assertEqual(out, ["customer", "talent", "investor"])


class SerializationTest(unittest.TestCase):
    def test_as_dicts_is_json_safe(self):
        import json
        dicts = pr.as_dicts()
        # Hela paletten ska vara JSON-serialiserbar utan internalia. ensure_ascii=False
        # så test-assertions kan söka på svensk text utan att brottas med \uXXXX-escape.
        blob = json.dumps(dicts, ensure_ascii=False)
        self.assertIn("customer", blob)
        self.assertIn("anställd", blob.lower())  # employee.label_sv = "Anställd & kandidat"

    def test_as_dicts_has_all_required_fields(self):
        for d in pr.as_dicts():
            for key in ("id", "label_sv", "description_sv", "schema_audience_type",
                        "is_default", "default_channels", "probe_templates"):
                self.assertIn(key, d)


class FirestoreSeedTest(unittest.TestCase):
    """Seed-flödet skriver ÅS spegel av Python-registret till Firestore — UI:t
    läser därifrån (Nivå 2)."""

    def test_seed_writes_all_personas(self):
        fakefs.reset(persona_templates={})
        result = pr.seed_to_firestore()
        self.assertEqual(result["personas_written"], 10)
        self.assertEqual(result["templates_written"], 120)
        # Varje persona ska finnas i Firestore-staten
        for persona in pr.all_personas():
            self.assertIn(persona.id, fakefs.STATE["persona_templates"])

    def test_seed_is_idempotent(self):
        fakefs.reset(persona_templates={})
        first = pr.seed_to_firestore()
        second = pr.seed_to_firestore()
        self.assertEqual(first["personas_written"], second["personas_written"])
        self.assertEqual(len(fakefs.STATE["persona_templates"]), 10)

    def test_seeded_doc_has_template_shape(self):
        fakefs.reset(persona_templates={})
        pr.seed_to_firestore()
        stored = fakefs.STATE["persona_templates"]["customer"]
        self.assertEqual(stored["id"], "customer")
        self.assertTrue(stored["is_default"])
        self.assertIn("probe_templates", stored)
        # Probe-templates ska ha both neutral och adversarial per dimension
        for dim, payload in stored["probe_templates"].items():
            self.assertIn("neutral", payload)
            self.assertIn("adversarial", payload)
            self.assertIn("{company}", payload["neutral"])


class ProbesForLanguageTest(unittest.TestCase):
    """F4b: probes_for väljer mätspråk; default-personor har en-prober, övriga faller till sv."""

    def test_default_personas_have_english(self):
        for pid in ("customer", "talent", "investor"):
            templates, eff = pr.probes_for(pr.get(pid), "en")
            self.assertEqual(eff, "en", pid)
            for _dim, (neutral, _adversarial) in templates.items():
                self.assertIn("{company}", neutral)
                self.assertNotIn("Som potentiell", neutral)

    def test_non_default_persona_falls_back_to_sv(self):
        templates, eff = pr.probes_for(pr.get("partner"), "en")
        self.assertEqual(eff, "sv")
        self.assertIs(templates, pr.get("partner").probe_templates)

    def test_swedish_always_returns_swedish(self):
        templates, eff = pr.probes_for(pr.get("customer"), "sv")
        self.assertEqual(eff, "sv")
        self.assertIs(templates, pr.get("customer").probe_templates)


if __name__ == "__main__":
    unittest.main()
