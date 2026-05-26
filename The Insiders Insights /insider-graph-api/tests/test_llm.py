"""Enhetstester för LLM-fabrikens EU-only-routning (services/llm.py).

Verifierar att våra resonemangsmodeller går via Vertex AI EU och att det INTE finns
någon första-parts US-fallback: utan GCP-projekt returneras None även om US-nycklar
är satta. Konstruktions-sömmarna patchas så inga SDK:er eller nätverk behövs.
"""
import unittest

from services import llm


class EuRoutingTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            llm.settings.gcp_project, llm.settings.anthropic_api_key,
            llm.settings.openai_api_key, llm.settings.gemini_api_key,
            llm._vertex_gemini, llm._vertex_anthropic,
        )
        llm._vertex_gemini = lambda model: ("gemini", model)
        llm._vertex_anthropic = lambda model: ("anthropic", model)

    def tearDown(self):
        (llm.settings.gcp_project, llm.settings.anthropic_api_key,
         llm.settings.openai_api_key, llm.settings.gemini_api_key,
         llm._vertex_gemini, llm._vertex_anthropic) = self._orig

    def test_none_without_gcp_project(self):
        llm.settings.gcp_project = ""
        self.assertIsNone(llm.make_generator())
        self.assertIsNone(llm.make_validator())

    def test_no_us_fallback_even_with_keys(self):
        # US-nycklar satta men inget GCP-projekt → fortfarande None (ingen US-väg).
        llm.settings.gcp_project = ""
        llm.settings.anthropic_api_key = "sk-ant-xxx"
        llm.settings.openai_api_key = "sk-xxx"
        llm.settings.gemini_api_key = "g-xxx"
        self.assertIsNone(llm.make_validator())
        self.assertIsNone(llm.make_generator())

    def test_routes_via_vertex_when_project_set(self):
        llm.settings.gcp_project = "proj-eu"
        self.assertEqual(llm.make_generator(), ("gemini", llm.settings.generator_model))
        self.assertEqual(llm.make_validator(), ("anthropic", llm.settings.validator_model))


class ProbeEnginesTest(unittest.TestCase):
    def setUp(self):
        s = llm.settings
        self._orig = (
            s.gcp_project, s.eu_only, s.openai_api_key, s.azure_openai_endpoint,
            s.azure_openai_api_key, s.azure_openai_deployment,
            llm._vertex_gemini, llm._azure_openai, llm._openai_us,
        )
        llm._vertex_gemini = lambda model: ("vertex-gemini", model)
        llm._azure_openai = lambda: "azure-gpt"
        llm._openai_us = lambda: "us-gpt"
        # neutralt utgångsläge
        s.gcp_project = "proj-eu"
        s.eu_only = True
        s.openai_api_key = ""
        s.azure_openai_endpoint = s.azure_openai_api_key = s.azure_openai_deployment = ""

    def tearDown(self):
        s = llm.settings
        (s.gcp_project, s.eu_only, s.openai_api_key, s.azure_openai_endpoint,
         s.azure_openai_api_key, s.azure_openai_deployment,
         llm._vertex_gemini, llm._azure_openai, llm._openai_us) = self._orig

    def test_eu_gemini_only_when_azure_absent(self):
        # EU-only utan Azure → bara Gemini-via-Vertex; GPT fail-closed (avstängd).
        engines = llm.make_probe_engines()
        self.assertIn(llm.settings.probe_gemini_model, engines)
        self.assertNotIn("gpt-4o", engines)

    def test_eu_includes_gpt_via_azure_when_configured(self):
        s = llm.settings
        s.azure_openai_endpoint = "https://x.openai.azure.com"
        s.azure_openai_api_key = "key"
        s.azure_openai_deployment = "gpt-4o-eu"
        engines = llm.make_probe_engines()
        self.assertEqual(engines["gpt-4o"], "azure-gpt")
        self.assertIn(s.probe_gemini_model, engines)

    def test_us_escape_hatch_only_when_eu_off(self):
        s = llm.settings
        s.eu_only = False
        s.openai_api_key = "sk-xxx"
        self.assertEqual(llm.make_probe_engines()["gpt-4o"], "us-gpt")

    def test_no_us_gpt_in_eu_mode_even_with_key(self):
        s = llm.settings
        s.eu_only = True
        s.openai_api_key = "sk-xxx"  # finns men ska INTE användas i EU-läge
        self.assertNotIn("gpt-4o", llm.make_probe_engines())

    def test_empty_without_project_or_azure(self):
        s = llm.settings
        s.gcp_project = ""
        self.assertEqual(llm.make_probe_engines(), {})


if __name__ == "__main__":
    unittest.main()
