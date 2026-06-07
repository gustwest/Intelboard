"""P4a: groundade probe-motorer (services/llm + model_registry) — inga nätverksanrop.

Testar de rena delarna: knowledge_source-taggning av "-grounded"-id:n, prompt-
flattening, Claude-blockextraktion, svar-wrappern och factory-gating utan nycklar.
De faktiska grounding-anropen verifieras live (kan inte mockas meningsfullt här).
"""
import os
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client (polling importerar det)
from config import settings
from services import llm, model_registry, polling


class KnowledgeSourceTest(unittest.TestCase):
    def test_grounded_suffix_is_web_rag(self):
        self.assertEqual(model_registry.knowledge_source_for("gpt-4.1-grounded"), "web_rag")
        self.assertEqual(model_registry.knowledge_source_for("gemini-2.5-pro-grounded"), "web_rag")
        self.assertEqual(model_registry.knowledge_source_for("claude-sonnet-4-6-grounded"), "web_rag")

    def test_bare_ids_unchanged(self):
        # De rena training-probarna ska INTE råka taggas web_rag.
        self.assertEqual(model_registry.knowledge_source_for("gpt-4.1"), "training")
        self.assertEqual(model_registry.knowledge_source_for("sonar"), "web_rag")  # legacy web_rag


class PromptFlattenTest(unittest.TestCase):
    def test_string_passthrough(self):
        self.assertEqual(llm._messages_to_prompt("hej"), "hej")

    def test_messages_joined(self):
        class M:
            def __init__(self, c):
                self.content = c
        out = llm._messages_to_prompt([M("system-prompt"), M("frågan")])
        self.assertEqual(out, "system-prompt\n\nfrågan")


class AnthropicBlocksTest(unittest.TestCase):
    def test_extracts_only_text_blocks(self):
        # Claude+web_search ger en blandning av server_tool_use, sökresultat och text.
        content = [
            {"type": "server_tool_use", "name": "web_search", "input": {"query": "x"}},
            {"type": "web_search_tool_result", "content": [{"url": "https://a.se"}]},
            {"type": "text", "text": "Volvo och Spotify "},
            {"type": "text", "text": "nämns ofta."},
        ]
        self.assertEqual(llm._anthropic_text_blocks(content), "Volvo och Spotify nämns ofta.")

    def test_string_content_passthrough(self):
        self.assertEqual(llm._anthropic_text_blocks("ren text"), "ren text")


class GroundedRespTest(unittest.TestCase):
    def test_content_attr(self):
        self.assertEqual(llm._GroundedResp("svar").content, "svar")


class FactoryGatingTest(unittest.TestCase):
    def setUp(self):
        self._orig = (settings.openai_api_key, settings.anthropic_api_key, settings.gcp_project)

    def tearDown(self):
        settings.openai_api_key, settings.anthropic_api_key, settings.gcp_project = self._orig

    def test_no_keys_no_engines(self):
        settings.openai_api_key = ""
        settings.anthropic_api_key = ""
        settings.gcp_project = ""
        self.assertEqual(llm.make_grounded_probe_engines(), {})


class PollingOptInTest(unittest.TestCase):
    """P4a opt-in: POLLING_GROUNDED styr om groundade motorer mergas i polling."""

    def setUp(self):
        self._probe = llm.make_probe_engines
        self._grounded = llm.make_grounded_probe_engines
        self._env = os.environ.get("POLLING_GROUNDED")
        llm.make_probe_engines = lambda *a, **k: {"gpt-4.1": object()}
        llm.make_grounded_probe_engines = lambda: {"gpt-4.1-grounded": object()}

    def tearDown(self):
        llm.make_probe_engines = self._probe
        llm.make_grounded_probe_engines = self._grounded
        if self._env is None:
            os.environ.pop("POLLING_GROUNDED", None)
        else:
            os.environ["POLLING_GROUNDED"] = self._env

    def test_off_by_default(self):
        os.environ.pop("POLLING_GROUNDED", None)
        self.assertEqual(set(polling._build_models()), {"gpt-4.1"})

    def test_on_merges_grounded(self):
        os.environ["POLLING_GROUNDED"] = "1"
        self.assertEqual(set(polling._build_models()), {"gpt-4.1", "gpt-4.1-grounded"})


if __name__ == "__main__":
    unittest.main()
