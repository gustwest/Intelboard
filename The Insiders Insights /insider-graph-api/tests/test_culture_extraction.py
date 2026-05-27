"""Enhetstester för culture-signal-extraktion (services/culture_extraction.py).

LLM:en mockas; vi verifierar grundningsregeln, taxonomi-mappningen och persistensen
(facet/warmth_mode/dimension/predikat) — inte modellens kvalitet.
"""
import json
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.culture_extraction as ce


class _Resp:
    def __init__(self, content: str):
        self.content = content


class _FakeLLM:
    def __init__(self, payload: dict):
        self._payload = payload

    def invoke(self, messages):
        return _Resp(json.dumps(self._payload))


def _written_claims():
    return list(fakefs.STATE["writes"].values())


class CultureExtractionTest(unittest.TestCase):
    def _setup(self, items, client=None):
        fakefs.reset(client=client or {"company_name": "Acme AB"}, company_items=items)

    def test_grounded_declared_signal_persisted_with_taxonomy(self):
        self._setup({
            "web-1": {
                "source": "website", "schema_type": "Organization",
                "content": "Våra ledord är mod, omtanke och nyfikenhet i allt vi gör.",
                "url": "https://acme.se/om-oss",
            }
        })
        llm = _FakeLLM({"signals": [{
            "field": "slogan", "value": "Mod, omtanke och nyfikenhet",
            "chunks": ["C1"], "quote": "Våra ledord är mod, omtanke och nyfikenhet",
        }]})
        result = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(result["written"], 1)
        claims = _written_claims()
        self.assertEqual(len(claims), 1)
        c = claims[0]
        self.assertEqual(c["facet"], "culture")
        self.assertEqual(c["predicate"], "slogan")
        self.assertEqual(c["warmth_mode"], "declared")
        self.assertEqual(c["claim_kind"], "property")
        self.assertEqual(c["source"][0]["kind"], "item")
        self.assertEqual(c["source"][0]["url"], "https://acme.se/om-oss")

    def test_demonstrated_signal_maps_to_dimension(self):
        self._setup({
            "web-2": {
                "source": "website", "schema_type": "Organization",
                "content": "Vi har kollektivavtal med Unionen för alla anställda.",
                "url": "https://acme.se/jobba",
            }
        })
        llm = _FakeLLM({"signals": [{
            "field": "collective_agreement", "value": "Unionen",
            "chunks": ["C1"], "quote": "Vi har kollektivavtal med Unionen",
        }]})
        ce.extract_culture_for_client("acme", llm)
        c = _written_claims()[0]
        self.assertEqual(c["predicate"], "memberOf")
        self.assertEqual(c["warmth_mode"], "demonstrated")
        self.assertEqual(c["dimension"], "transparency")

    def test_ungrounded_quote_is_rejected(self):
        # citatet finns INTE i källtexten → källgrinden fäller signalen
        self._setup({"web-3": {"source": "website", "content": "Vi bygger broar.", "url": "u"}})
        llm = _FakeLLM({"signals": [{
            "field": "slogan", "value": "Påhittat ledord",
            "chunks": ["C1"], "quote": "ett ledord som inte står någonstans i texten",
        }]})
        result = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(result["written"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(_written_claims(), [])

    def test_value_not_in_source_is_rejected(self):
        # citatet finns i källan, MEN det publicerade värdet gör det inte → fälls
        self._setup({"web-v": {
            "source": "website",
            "content": "Vi tror på laganda och engagemang i allt vi gör.",
            "url": "u",
        }})
        llm = _FakeLLM({"signals": [{
            "field": "slogan", "value": "Innovation och hållbarhet",
            "chunks": ["C1"], "quote": "Vi tror på laganda och engagemang",
        }]})
        result = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(result["written"], 0)
        self.assertEqual(result["skipped"], 1)

    def test_csr_topic_partially_in_source_is_rejected(self):
        # ett av två teman saknas i källan → hela listsignalen fälls (ingen halv proveniens)
        self._setup({"web-p": {
            "source": "website",
            "content": "Vi engagerar oss i klimat genom flera initiativ.",
            "url": "u",
        }})
        llm = _FakeLLM({"signals": [{
            "field": "csr_topics", "value": ["klimat", "jämställdhet"],
            "chunks": ["C1"], "quote": "Vi engagerar oss i klimat",
        }]})
        result = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(result["written"], 0)

    def test_unknown_field_is_skipped(self):
        self._setup({"web-4": {"source": "website", "content": "Vi gör bra saker.", "url": "u"}})
        llm = _FakeLLM({"signals": [{
            "field": "favorite_color", "value": "blå", "chunks": ["C1"], "quote": "Vi gör bra saker",
        }]})
        result = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(result["written"], 0)

    def test_csr_topics_list_value(self):
        self._setup({
            "web-5": {
                "source": "website",
                "content": "Vi engagerar oss i klimat och jämställdhet genom flera initiativ.",
                "url": "https://acme.se/hallbarhet",
            }
        })
        llm = _FakeLLM({"signals": [{
            "field": "csr_topics", "value": ["klimat", "jämställdhet"],
            "chunks": ["C1"], "quote": "Vi engagerar oss i klimat och jämställdhet",
        }]})
        ce.extract_culture_for_client("acme", llm)
        c = _written_claims()[0]
        self.assertEqual(c["predicate"], "knowsAbout")
        self.assertEqual(c["value"], ["klimat", "jämställdhet"])
        self.assertIn("klimat, jämställdhet", c["statement"])

    def test_no_llm_is_noop(self):
        self._setup({"web-6": {"source": "website", "content": "x", "url": "u"}})
        ce._pick_generator = lambda: None
        try:
            result = ce.extract_culture_for_client("acme")
        finally:
            ce._pick_generator = lambda: ce.llm_factory.make_generator()
        self.assertEqual(result["written"], 0)
        self.assertEqual(result["reason"], "no_llm")

    def test_unchanged_corpus_is_skipped(self):
        items = {"web-7": {"source": "website", "content": "Våra ledord är mod och omtanke.", "url": "u"}}
        self._setup(items)
        llm = _FakeLLM({"signals": [{
            "field": "slogan", "value": "Mod och omtanke",
            "chunks": ["C1"], "quote": "Våra ledord är mod och omtanke",
        }]})
        first = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(first["written"], 1)
        # andra körningen: korpus oförändrad → hoppa över (hash på klientdokumentet)
        second = ce.extract_culture_for_client("acme", llm)
        self.assertEqual(second["reason"], "unchanged")

    def test_no_text_is_noop(self):
        self._setup({"web-8": {"source": "website", "content": "", "url": "u"}})
        result = ce.extract_culture_for_client("acme", _FakeLLM({"signals": []}))
        self.assertEqual(result["reason"], "no_text")


if __name__ == "__main__":
    unittest.main()
