"""Enhetstester för LLM-fabrikens EU-only-routning (services/llm.py).

Verifierar att våra resonemangsmodeller går via Vertex AI EU och att det INTE finns
någon första-parts US-fallback: utan GCP-projekt returneras None även om US-nycklar
är satta. Konstruktions-sömmarna patchas så inga SDK:er eller nätverk behövs.
"""
import unittest

from services import llm, model_registry


class EuRoutingTest(unittest.TestCase):
    def setUp(self):
        self._orig = (
            llm.settings.gcp_project,
            llm.settings.openai_api_key, llm.settings.gemini_api_key,
            llm._vertex_gemini, llm._vertex_anthropic,
        )
        llm._vertex_gemini = lambda model, temperature=0: ("gemini", model)
        llm._vertex_anthropic = lambda model: ("anthropic", model)

    def tearDown(self):
        (llm.settings.gcp_project,
         llm.settings.openai_api_key, llm.settings.gemini_api_key,
         llm._vertex_gemini, llm._vertex_anthropic) = self._orig

    def test_none_without_gcp_project(self):
        llm.settings.gcp_project = ""
        self.assertIsNone(llm.make_generator())
        self.assertIsNone(llm.make_validator())
        self.assertIsNone(llm.make_claim_validator())

    def test_no_us_fallback_even_with_keys(self):
        # US-nycklar satta men inget GCP-projekt → fortfarande None (ingen US-väg).
        llm.settings.gcp_project = ""
        llm.settings.openai_api_key = "sk-xxx"
        llm.settings.gemini_api_key = "g-xxx"
        self.assertIsNone(llm.make_validator())
        self.assertIsNone(llm.make_generator())

    def test_routes_via_vertex_when_project_set(self):
        # Claude är inte EU-resident i projektets region → BÅDA rollerna går på Gemini i EU.
        # Fabrikerna wrappar nu i en token-mätar-proxy (_TrackedLLM); _inner är raw-objektet.
        llm.settings.gcp_project = "proj-eu"
        self.assertEqual(llm.make_generator()._inner, ("gemini", llm.GEO_GENERATOR_MODEL))
        self.assertEqual(llm.make_validator()._inner, ("gemini", llm.GEO_VALIDATOR_MODEL))
        self.assertEqual(llm.make_claim_validator()._inner, ("gemini", llm.GEO_VALIDATOR_MODEL))

    def test_claim_validator_uses_temperature_for_self_consistency(self):
        # make_claim_validator ska köra med temperatur > 0 (variation för självkonsistens).
        captured = {}
        llm._vertex_gemini = lambda model, temperature=0: captured.update(t=temperature)
        llm.settings.gcp_project = "proj-eu"
        llm.make_claim_validator()
        self.assertGreater(captured["t"], 0)


class ProbeEnginesTest(unittest.TestCase):
    """Probe-motorerna (Claude + Gemini) körs via Vertex AI sedan 2026-06-02.
    Modellerna är identiska med publika API:erna; Vertex är leveransvägen, inte
    ett annat modellbygge. Tidigare gick de mot OpenAI/Gemini direkt med separata
    API-nycklar (källa till whitespace-/Illegal-header-fel)."""

    def setUp(self):
        self._orig = (
            llm.settings.gcp_project,
            llm._vertex_gemini, llm._vertex_anthropic,
        )
        llm._vertex_gemini = lambda model, temperature=0: ("gemini", model)
        llm._vertex_anthropic = lambda model: ("claude", model)

    def tearDown(self):
        (llm.settings.gcp_project,
         llm._vertex_gemini, llm._vertex_anthropic) = self._orig

    def test_both_probes_when_project_set(self):
        llm.settings.gcp_project = "proj-eu"
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {
            model_registry.get_id("probe_claude"),
            model_registry.get_id("probe_gemini"),
        })

    def test_empty_without_gcp_project(self):
        """Ingen US-fallback — utan GCP-projekt blir polling/risk-detect no-op."""
        llm.settings.gcp_project = ""
        self.assertEqual(llm.make_probe_engines(), {})

    def test_resilient_to_individual_probe_init_failure(self):
        """Om en enskild probe failar vid init ska den andra fortfarande returneras."""
        llm.settings.gcp_project = "proj-eu"

        def boom(*_a, **_kw):
            raise RuntimeError("simulated init failure")

        llm._vertex_anthropic = boom  # Claude failar att initieras
        engines = llm.make_probe_engines()
        self.assertEqual(set(engines), {model_registry.get_id("probe_gemini")})


if __name__ == "__main__":
    unittest.main()
