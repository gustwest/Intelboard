"""Receptmotor Lager B — LLM-detaljifiering (services/gap_recipes_llm, Fas 1.3b).

Mockar bort den riktiga LLM:n (patchar _pick_detailifier) och verifierar
invarianterna som måste hålla oavsett vad LLM:n säger:

  * LLM:n får ALDRIG byta action_type / target_channels-mängden /
    knowledge_source_target / expected_impact_metric — strategin är låst.
  * Om LLM:n föreslår en kanal utanför target_channels avvisas hela responsen
    (vi accepterar inte smyg-skift av strategin).
  * Saknas LLM helt (ingen detailifier konfigurerad) returneras skelett +
    details=None (graceful degradation, frontend visar "väntar").
  * Saknas bottenkrav (detailed_action / refined_why / success_criteria) →
    details=None hellre än halvfärdiga rekommendationer.
"""
import json
import unittest
from unittest.mock import patch

from services import gap_recipes as gr
from services import gap_recipes_llm as grl


def _skeleton(kind="over_claim", dimension="community"):
    return gr.build_recipe_skeleton({"kind": kind, "dimension": dimension, "confidence": 0.8})


def _context(**over) -> gr.RecipeContext:
    defaults = dict(
        client_id="acme",
        company_name="Acme AB",
        declared=1.0,
        demonstrated=0.0,
        perceived_valence=0.7,
        perceived_salience=0.6,
        available_proof_points=(),
        extra=None,
    )
    defaults.update(over)
    return gr.RecipeContext(**defaults)


class _FakeLLM:
    """Liten stub som returnerar förbestämd JSON via langchain.invoke-mönstret."""
    def __init__(self, payload):
        self._payload = payload

    def invoke(self, _messages):
        from types import SimpleNamespace
        return SimpleNamespace(content=json.dumps(self._payload))


def _patch_llm(payload):
    """Context-manager-faktoriserare: patchar _pick_detailifier att returnera FakeLLM."""
    return patch.object(grl, "_pick_detailifier", return_value=_FakeLLM(payload))


VALID_RESPONSE = {
    "detailed_action": "Ladda upp Q1-medarbetarenkäten som attesterad källa och länka från om-oss-sidan.",
    "specific_proof_points": ["eNPS 42 från Q1-enkät", "ISO 45001-certifikat"],
    "prioritized_channel": "attested_upload",
    "prioritized_channel_reason": "Snabbast väg till verifierat underlag innan extern publicering.",
    "success_criteria": "Demonstrated stiger från 0 till >0.4 inom två veckor och AI-valens stabiliseras.",
    "refined_why": "Acme har en stark intern bild men ingen oberoende källa AI kan luta sig mot. Det skapar trovärdighetsrisk när någon synar varmt AI-svar.",
    "risks": ["Risk för uppfattning som green-washing om bara positiva siffror släpps"],
}


class HappyPathTest(unittest.TestCase):
    def test_valid_response_produces_full_details(self):
        skel = _skeleton("over_claim")
        with _patch_llm(VALID_RESPONSE):
            recipe = grl.detailify(skel, _context())
        self.assertIsNotNone(recipe.details)
        d = recipe.details
        self.assertEqual(d.prioritized_channel, "attested_upload")
        self.assertIn("eNPS", d.specific_proof_points[0])
        self.assertTrue(d.detailed_action)
        self.assertTrue(d.refined_why)
        self.assertTrue(d.success_criteria)
        self.assertEqual(len(d.risks), 1)
        # Skelettet bevaras exakt — strategin är låst.
        self.assertEqual(recipe.skeleton, skel)
        # detailified_at sätts när LLM gav valid output.
        self.assertIsNotNone(recipe.detailified_at)


class StrategyLockTest(unittest.TestCase):
    def test_invalid_channel_rejects_entire_response(self):
        # LLM:n försöker föreslå en kanal som INTE finns i skelettets target_channels.
        # Vi avvisar hela detaljifieringen — aldrig acceptera smyg-skift av strategi.
        bad = {**VALID_RESPONSE, "prioritized_channel": "tiktok"}  # ej i target_channels
        with _patch_llm(bad):
            recipe = grl.detailify(_skeleton("over_claim"), _context())
        self.assertIsNone(recipe.details)
        self.assertIsNone(recipe.detailified_at)

    def test_skeleton_immutable_action_type_unchanged(self):
        # Även om LLM:n returnerar action_type i responsen (felaktigt), bryr vi oss
        # inte — skelettets action_type bevaras intakt eftersom vi aldrig läser det
        # från LLM-outputen.
        bad = {**VALID_RESPONSE, "action_type": "delete_evidence"}  # försök byta
        skel = _skeleton("over_claim")
        with _patch_llm(bad):
            recipe = grl.detailify(skel, _context())
        # Strategin är låst — action_type kommer från skelettet, inte LLM-svaret.
        self.assertEqual(recipe.skeleton.action_type, gr.ACTION_ADD_EVIDENCE)

    def test_empty_prioritized_channel_falls_back_to_first(self):
        # Modellen orkade inte ange kanal alls → använd skelettets förstaval.
        partial = {**VALID_RESPONSE, "prioritized_channel": ""}
        skel = _skeleton("over_claim")
        with _patch_llm(partial):
            recipe = grl.detailify(skel, _context())
        self.assertIsNotNone(recipe.details)
        self.assertEqual(recipe.details.prioritized_channel, skel.target_channels[0])


class GracefulDegradationTest(unittest.TestCase):
    def test_no_llm_returns_skeleton_only(self):
        # Ingen detailifier konfigurerad (CI / lokal utan GCP) → bart skelett.
        with patch.object(grl, "_pick_detailifier", return_value=None):
            recipe = grl.detailify(_skeleton("opportunity"), _context())
        self.assertIsNone(recipe.details)
        self.assertIsNone(recipe.detailified_at)
        # Skelettet finns kvar — frontend kan visa why_template + skeleton_text.
        self.assertEqual(recipe.skeleton.gap_type, "opportunity")

    def test_llm_failure_returns_skeleton_only(self):
        # LLM:n kastar (timeout, blockerad, API-fel). invoke_json hanterar detta
        # och returnerar None → vi returnerar bart skelett, aldrig en exception.
        class _BoomLLM:
            def invoke(self, _msgs):
                raise RuntimeError("upstream tajmade")
        with patch.object(grl, "_pick_detailifier", return_value=_BoomLLM()):
            recipe = grl.detailify(_skeleton("missing_evidence"), _context())
        self.assertIsNone(recipe.details)

    def test_invalid_json_returns_skeleton_only(self):
        # LLM:n returnerar brus istället för JSON.
        class _NoiseLLM:
            def invoke(self, _msgs):
                from types import SimpleNamespace
                return SimpleNamespace(content="här kommer ingen JSON, bara prat")
        with patch.object(grl, "_pick_detailifier", return_value=_NoiseLLM()):
            recipe = grl.detailify(_skeleton("opportunity"), _context())
        self.assertIsNone(recipe.details)

    def test_missing_base_fields_returns_none_details(self):
        # detailed_action / refined_why / success_criteria saknas → details=None
        # hellre än halvfärdiga recept (operatörens UI ska aldrig visa stympad text).
        for missing_key in ("detailed_action", "refined_why", "success_criteria"):
            partial = {**VALID_RESPONSE, missing_key: ""}
            with _patch_llm(partial):
                recipe = grl.detailify(_skeleton("over_claim"), _context())
            self.assertIsNone(
                recipe.details,
                f"Saknat {missing_key} borde ge details=None, fick {recipe.details}",
            )


class PromptBuildingTest(unittest.TestCase):
    def test_prompt_includes_skeleton_locked_fields(self):
        # Validera att prompten gör det LOCKADE blocket explicit för LLM:n —
        # annars är det inte konstigt att den försöker ändra strategin.
        skel = _skeleton("over_claim")
        payload = grl._build_user_payload(skel, _context())
        self.assertIn("DU FÅR INTE ÄNDRA", payload)
        self.assertIn(skel.action_type, payload)
        self.assertIn(skel.expected_impact_metric, payload)
        for ch in skel.target_channels:
            self.assertIn(ch, payload)

    def test_prompt_includes_proof_points_when_provided(self):
        ctx = _context(available_proof_points=("eNPS 42 från Q1", "ISO-certifikat"))
        payload = grl._build_user_payload(_skeleton("over_claim"), ctx)
        self.assertIn("TILLGÄNGLIGA PROOF POINTS", payload)
        self.assertIn("eNPS 42", payload)

    def test_prompt_includes_extra_context_when_provided(self):
        # Flagg-specifik kontext (warmest_engine för contradiction etc).
        ctx = _context(extra={"warmest_engine": "gemini", "coolest_engine": "perplexity"})
        payload = grl._build_user_payload(_skeleton("contradiction"), ctx)
        self.assertIn("ÖVRIG KONTEXT", payload)
        self.assertIn("gemini", payload)


class SerializationTest(unittest.TestCase):
    def test_detailed_recipe_serializes_to_json(self):
        # Lager C behöver kunna skriva till Firestore — full as_dict() måste vara
        # JSON-serialiserbar utan dataclass-internalia.
        with _patch_llm(VALID_RESPONSE):
            recipe = grl.detailify(_skeleton("over_claim"), _context())
        json.dumps(recipe.as_dict())  # kastar om något inte går
        # Sanity: skelett + details + metadata alla med.
        d = recipe.as_dict()
        self.assertIn("skeleton", d)
        self.assertIn("details", d)
        self.assertIn("detailifier_model", d)
        self.assertIn("detailified_at", d)


if __name__ == "__main__":
    unittest.main()
