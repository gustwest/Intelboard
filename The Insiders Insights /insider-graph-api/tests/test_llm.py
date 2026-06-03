"""Enhetstester för LLM-fabrikens routning (services/llm.py).

Verifierar att resonemangsmodeller går via Vertex EU och att probarna kör med rätt
location (`global` för Vertex-probarna, OpenAI som separat direktanslutning). Sömmarna
patchas så inga SDK:er eller nätverk behövs.
"""
import unittest

from services import llm, model_registry


class EuRoutingTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            llm.settings.gcp_project,
            llm.settings.openai_api_key, llm.settings.gemini_api_key,
            llm.settings.vertex_location,
            llm._vertex_gemini, llm._vertex_anthropic,
        )
        llm._vertex_gemini = lambda model, temperature=0, location=None: ("gemini", model, location)
        llm._vertex_anthropic = lambda model, location=None: ("anthropic", model, location)

    def tearDown(self):
        (llm.settings.gcp_project,
         llm.settings.openai_api_key, llm.settings.gemini_api_key,
         llm.settings.vertex_location,
         llm._vertex_gemini, llm._vertex_anthropic) = self._orig

    def test_none_without_gcp_project(self):
        llm.settings.gcp_project = ""
        self.assertIsNone(llm.make_generator())
        self.assertIsNone(llm.make_validator())
        self.assertIsNone(llm.make_claim_validator())

    def test_no_us_fallback_even_with_keys(self):
        llm.settings.gcp_project = ""
        llm.settings.openai_api_key = "sk-xxx"
        llm.settings.gemini_api_key = "g-xxx"
        self.assertIsNone(llm.make_validator())
        self.assertIsNone(llm.make_generator())

    def test_routes_via_vertex_when_project_set(self):
        llm.settings.gcp_project = "proj-eu"
        llm.settings.vertex_location = "europe-west1"
        self.assertEqual(
            llm.make_generator()._inner,
            ("gemini", llm.GEO_GENERATOR_MODEL, "europe-west1"),
        )
        self.assertEqual(
            llm.make_validator()._inner,
            ("gemini", llm.GEO_VALIDATOR_MODEL, "europe-west1"),
        )
        self.assertEqual(
            llm.make_claim_validator()._inner,
            ("gemini", llm.GEO_VALIDATOR_MODEL, "europe-west1"),
        )

    def test_reasoning_falls_back_to_settings_when_registry_empty(self):
        llm.settings.gcp_project = "proj-eu"
        llm.settings.vertex_location = "europe-west4"
        self.assertEqual(llm.make_generator()._inner[-1], "europe-west4")

    def test_claim_validator_uses_temperature_for_self_consistency(self):
        captured = {}
        llm._vertex_gemini = lambda model, temperature=0, location=None: captured.update(t=temperature)
        llm.settings.gcp_project = "proj-eu"
        llm.make_claim_validator()
        self.assertGreater(captured["t"], 0)


class ProbeEnginesTest(unittest.TestCase):
    """Probarna mäter publika AI-assistenter (Claude, Gemini, ChatGPT, Mistral).
    Vertex-probarna kör `global` endpoint (publik payload — ingen EU-låsning);
    ChatGPT-proben går direkt mot OpenAI eftersom GPT inte finns i Vertex Model
    Garden. Mistral kommer via Vertex MaaS (OpenAI-kompatibel endpoint)."""

    def setUp(self):
        self._orig = (
            llm.settings.gcp_project, llm.settings.openai_api_key,
            llm.settings.vertex_location,
            llm._vertex_gemini, llm._vertex_anthropic, llm._vertex_mistral, llm._openai_chat,
        )
        llm._vertex_gemini = lambda model, temperature=0, location=None: ("gemini", model, location)
        llm._vertex_anthropic = lambda model, location=None: ("claude", model, location)
        llm._vertex_mistral = lambda model, location=None: ("mistral", model, location)
        llm._openai_chat = lambda model: ("openai", model)

    def tearDown(self):
        (llm.settings.gcp_project, llm.settings.openai_api_key,
         llm.settings.vertex_location,
         llm._vertex_gemini, llm._vertex_anthropic, llm._vertex_mistral, llm._openai_chat) = self._orig

    def test_all_four_probes_when_credentials_set(self):
        llm.settings.gcp_project = "proj-eu"
        llm.settings.openai_api_key = "sk-test"
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {
            model_registry.get_id("probe_claude"),
            model_registry.get_id("probe_gemini"),
            model_registry.get_id("probe_mistral"),
            model_registry.get_id("probe_openai"),
        })

    def test_openai_probe_works_without_gcp_project(self):
        llm.settings.gcp_project = ""
        llm.settings.openai_api_key = "sk-test"
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {model_registry.get_id("probe_openai")})

    def test_vertex_probes_work_without_openai_key(self):
        llm.settings.gcp_project = "proj-eu"
        llm.settings.openai_api_key = ""
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {
            model_registry.get_id("probe_claude"),
            model_registry.get_id("probe_gemini"),
            model_registry.get_id("probe_mistral"),
        })

    def test_empty_when_no_credentials(self):
        llm.settings.gcp_project = ""
        llm.settings.openai_api_key = ""
        self.assertEqual(llm.make_probe_engines(), {})

    def test_resilient_to_individual_probe_init_failure(self):
        llm.settings.gcp_project = "proj-eu"
        llm.settings.openai_api_key = "sk-test"

        def boom(*_a, **_kw):
            raise RuntimeError("simulated init failure")

        llm._vertex_anthropic = boom
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {
            model_registry.get_id("probe_gemini"),
            model_registry.get_id("probe_mistral"),
            model_registry.get_id("probe_openai"),
        })

    def test_probes_use_global_vertex_location(self):
        """vertex_location='global' i registret ska överstyra settings."""
        llm.settings.gcp_project = "proj-eu"
        llm.settings.openai_api_key = ""
        llm.settings.vertex_location = "europe-west1"
        engines = llm.make_probe_engines()
        claude_inner = engines[model_registry.get_id("probe_claude")]._inner
        gemini_inner = engines[model_registry.get_id("probe_gemini")]._inner
        mistral_inner = engines[model_registry.get_id("probe_mistral")]._inner
        self.assertEqual(claude_inner[-1], "global")
        self.assertEqual(gemini_inner[-1], "global")
        self.assertEqual(mistral_inner[-1], "global")


if __name__ == "__main__":
    unittest.main()
