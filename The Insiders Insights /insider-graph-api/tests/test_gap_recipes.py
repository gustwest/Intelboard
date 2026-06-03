"""Receptmotor Lager A — regel-mallar (services/gap_recipes, Fas 1.3a).

Låser invarianterna: varje aktiv gap-typ ska producera ett deterministisk skelett
med rätt action, kanaler, impact-metric och knowledge-source-mål. Stubbade typer
(persona_mismatch, competitive_displacement) ska returnera None tills de aktiveras
av Fas 2.1 / Fas 4.

Ingen LLM här — Lager B testas separat. Den här filen säkrar att Lager A är
*förutsägbar*: samma gap-flagga in → samma skelett ut, varje gång.
"""
import unittest

from schema_org import humanization_config as hc
from services import gap_recipes as gr


def _flag(kind, dimension="community", **extra):
    return {"kind": kind, "dimension": dimension, **extra}


class OverClaimRecipeTest(unittest.TestCase):
    def test_produces_skeleton_for_over_claim(self):
        skel = gr.build_recipe_skeleton(_flag("over_claim", confidence=0.8, gap_magnitude=0.3))
        self.assertIsNotNone(skel)
        self.assertEqual(skel.gap_type, "over_claim")
        self.assertEqual(skel.dimension, "community")
        self.assertEqual(skel.action_type, gr.ACTION_ADD_EVIDENCE)
        # Anseenderisk slår båda motor-typerna.
        self.assertEqual(skel.knowledge_source_target, "both")
        # Måste primärt rikta mot attesterad data + press — att flytta perception
        # utan att stärka underlaget vore gaming.
        self.assertIn(gr.CHANNEL_ATTESTED_UPLOAD, skel.target_channels)
        self.assertIn(gr.CHANNEL_PRESS, skel.target_channels)
        # Impact = demonstrated stiger (underlaget blir bevisbart), inte valens.
        self.assertEqual(skel.expected_impact_metric, gr.METRIC_DEMONSTRATED)
        # Klartexten ska bära dimensions-labeln.
        self.assertIn("samhällsengagemang", skel.why_template)


class OpportunityRecipeTest(unittest.TestCase):
    def test_produces_publish_proof_skeleton(self):
        skel = gr.build_recipe_skeleton(_flag("opportunity", confidence=0.7))
        self.assertIsNotNone(skel)
        self.assertEqual(skel.action_type, gr.ACTION_PUBLISH_PROOF)
        # Möjlighet handlar om synlighet — pusha till publika kanaler.
        self.assertIn(gr.CHANNEL_LINKEDIN, skel.target_channels)
        self.assertIn(gr.CHANNEL_RSS, skel.target_channels)
        self.assertEqual(skel.expected_impact_metric, gr.METRIC_VALENCE)


class MissingEvidenceRecipeTest(unittest.TestCase):
    def test_high_severity_pushes_to_external_channels(self):
        # Hög severity (AI ser oss) → även LinkedIn/press, inte bara attestering.
        skel = gr.build_recipe_skeleton(_flag("missing_evidence", severity="high"))
        self.assertIsNotNone(skel)
        self.assertIn(gr.CHANNEL_ATTESTED_UPLOAD, skel.target_channels)
        self.assertIn(gr.CHANNEL_LINKEDIN, skel.target_channels)
        self.assertIn(gr.CHANNEL_PRESS, skel.target_channels)
        self.assertEqual(skel.confidence, 0.90)  # mycket säker — det ÄR ett gap

    def test_medium_severity_keeps_focus_on_attestation(self):
        # Medium severity (AI ser oss inte än) → räcker med att börja attestera.
        skel = gr.build_recipe_skeleton(_flag("missing_evidence", severity="medium"))
        self.assertIsNotNone(skel)
        self.assertEqual(skel.target_channels, (gr.CHANNEL_ATTESTED_UPLOAD,))

    def test_default_severity_treated_as_medium(self):
        # Saknad severity (defensiv default) ska bete sig som medium, ej krascha.
        skel = gr.build_recipe_skeleton(_flag("missing_evidence"))
        self.assertIsNotNone(skel)
        self.assertEqual(skel.target_channels, (gr.CHANNEL_ATTESTED_UPLOAD,))


class ContradictionRecipeTest(unittest.TestCase):
    def test_includes_engine_names_in_why(self):
        # Kontradiktion ska visa VILKA motorer som är oense i klartexten.
        skel = gr.build_recipe_skeleton(
            _flag("contradiction", spread=0.4, warmest_engine="gemini", coolest_engine="perplexity")
        )
        self.assertIsNotNone(skel)
        self.assertEqual(skel.action_type, gr.ACTION_HARMONIZE)
        # Specifika motorer i why-texten — annars är receptet inte handlingsbart.
        self.assertIn("gemini", skel.why_template)
        self.assertIn("perplexity", skel.why_template)
        # Spread-metriken är vad vi mäter när receptet följs upp.
        self.assertEqual(skel.expected_impact_metric, gr.METRIC_VALENCE_VARIANCE)
        # Diagnos-pseudokanal — ingen direkt åtgärd förrän källan är identifierad.
        self.assertIn(gr.CHANNEL_DIAGNOSIS, skel.target_channels)


class FactualDriftRecipeTest(unittest.TestCase):
    def test_includes_since_date_in_why(self):
        skel = gr.build_recipe_skeleton(_flag("factual_drift", since_date="2026-05-01", valence_drop=0.2))
        self.assertIsNotNone(skel)
        self.assertEqual(skel.action_type, gr.ACTION_FIX_RECORD)
        self.assertIn("2026-05-01", skel.why_template)
        # Drift drabbar primärt training (cachead content som åldras).
        self.assertEqual(skel.knowledge_source_target, "training")
        # Wikipedia + press är kanoniska källor AI re-indexerar.
        self.assertIn(gr.CHANNEL_WIKIPEDIA, skel.target_channels)
        self.assertIn(gr.CHANNEL_PRESS, skel.target_channels)


class StubbedTypesTest(unittest.TestCase):
    def test_persona_mismatch_returns_none_until_fas_2(self):
        # Persona-mismatch är registrerad i GAP_TAXONOMY men har ingen regel än —
        # Lager A returnerar None. När Fas 2.1 aktiverar typen läggs regel till.
        self.assertIn("persona_mismatch", hc.GAP_TAXONOMY)
        self.assertIsNone(gr.build_recipe_skeleton(_flag("persona_mismatch")))

    def test_competitive_displacement_returns_none_until_fas_4(self):
        self.assertIn("competitive_displacement", hc.GAP_TAXONOMY)
        self.assertIsNone(gr.build_recipe_skeleton(_flag("competitive_displacement")))

    def test_unknown_kind_returns_none(self):
        # Okänd typ → None, inte exception.
        self.assertIsNone(gr.build_recipe_skeleton(_flag("totally_unknown_kind")))

    def test_missing_kind_returns_none(self):
        self.assertIsNone(gr.build_recipe_skeleton({"dimension": "ethics"}))

    def test_missing_dimension_returns_none(self):
        self.assertIsNone(gr.build_recipe_skeleton({"kind": "over_claim"}))


class BatchTest(unittest.TestCase):
    def test_build_skeletons_filters_none(self):
        # En batch med blandade flaggor — stubbade hoppas över tyst, aktiva tas med.
        flags = [
            _flag("over_claim", confidence=0.8),
            _flag("persona_mismatch"),     # stubbad → hoppas över
            _flag("missing_evidence", dimension="ethics"),
            _flag("totally_unknown"),      # okänd → hoppas över
        ]
        skeletons = gr.build_recipe_skeletons(flags)
        self.assertEqual(len(skeletons), 2)
        kinds = {s.gap_type for s in skeletons}
        self.assertEqual(kinds, {"over_claim", "missing_evidence"})


class CoverageInvariantTest(unittest.TestCase):
    def test_all_active_taxonomy_types_have_rules(self):
        # Strukturell invariant: varje icke-stubbad typ i GAP_TAXONOMY ska ha en
        # regel i _RULES. Annars finns det en gap-typ utan recept — operatör skulle
        # få en flagga utan handlingsbar instruktion.
        stubbed = {"persona_mismatch", "competitive_displacement"}
        active_types = set(hc.GAP_TAXONOMY) - stubbed
        rule_types = set(gr._RULES.keys())
        self.assertEqual(
            active_types, rule_types,
            f"Aktiva gap-typer utan regel: {active_types - rule_types}. "
            f"Regler utan motsvarande aktiv typ: {rule_types - active_types}.",
        )

    def test_as_dict_is_json_safe(self):
        # Lager C lagrar skeletons i Firestore via .as_dict() — säkerställ att
        # ingen dataclass-internalia läcker ut (target_channels måste bli list,
        # inte tuple).
        skel = gr.build_recipe_skeleton(_flag("over_claim"))
        self.assertIsNotNone(skel)
        d = skel.as_dict()
        self.assertIsInstance(d["target_channels"], list)
        # Alla värden ska vara JSON-serialiserbara primitiver.
        import json
        json.dumps(d)  # kastar om något inte går


if __name__ == "__main__":
    unittest.main()
