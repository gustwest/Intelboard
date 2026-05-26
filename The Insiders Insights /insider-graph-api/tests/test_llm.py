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
    """Probe-motorerna är avsiktligt första-parts (vi mäter de publika motorerna)."""

    def setUp(self):
        s = llm.settings
        self._orig = (s.openai_api_key, s.gemini_api_key, llm._openai_probe, llm._gemini_probe)
        llm._openai_probe = lambda: "gpt-4o"
        llm._gemini_probe = lambda: "gemini"

    def tearDown(self):
        s = llm.settings
        (s.openai_api_key, s.gemini_api_key, llm._openai_probe, llm._gemini_probe) = self._orig

    def test_both_when_keys_present(self):
        s = llm.settings
        s.openai_api_key, s.gemini_api_key = "sk-xxx", "g-xxx"
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {"gpt-4o", "gemini-1.5-pro"})

    def test_only_configured_keys(self):
        s = llm.settings
        s.openai_api_key, s.gemini_api_key = "", "g-xxx"
        self.assertEqual(set(llm.make_probe_engines()), {"gemini-1.5-pro"})

    def test_empty_without_keys(self):
        s = llm.settings
        s.openai_api_key, s.gemini_api_key = "", ""
        self.assertEqual(llm.make_probe_engines(), {})


if __name__ == "__main__":
    unittest.main()
