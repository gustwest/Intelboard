"""Enhetstester för persona-derivation (services/persona_derivation.py).

LLM:n mockas via samma söm som rubric:en (`make_validator` + `invoke_json`).
Firestore-läsningen går via fakefs.
"""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först

from services import persona_derivation as pd
from services.output_quality import AudiencePriority


def _llm_returns(payload):
    return lambda _llm, _system, _user: payload


def _website_item(*, url, title, text, item_id="w1"):
    """Speglar website-connectorns faktiska RawItem-form (content + extra.name)."""
    return {
        item_id: {
            "url": url,
            "source": "website",
            "schema_type": "Organization",
            "content": text,
            "published_at": "2026-05-28T08:00:00Z",
            "extra": {"name": title, "doc_url": url, "chunk_index": 0, "chunk_total": 1},
        }
    }


def _job_item(*, title, text, item_id="j1"):
    """Speglar jobfeed-connectorns faktiska RawItem-form."""
    return {
        item_id: {
            "source": "jobfeed",
            "schema_type": "JobPosting",
            "content": text,
            "published_at": "2026-05-28T08:00:00Z",
            "extra": {"name": title, "job_id": "ext-" + item_id, "jobLocation": "Stockholm"},
        }
    }


class DerivationLlmAvailable(unittest.TestCase):
    def setUp(self):
        self._orig = (pd.make_validator, pd.invoke_json)
        pd.make_validator = lambda: object()

    def tearDown(self):
        pd.make_validator, pd.invoke_json = self._orig

    def test_returns_parsed_priorities(self):
        items = {
            **_website_item(url="https://x.se/om-oss", title="Om oss",
                            text="Vi hjälper B2B SaaS-bolag att...", item_id="w1"),
            **_job_item(title="Senior Data Engineer", text="Vi söker datatekniker...", item_id="j1"),
        }
        fakefs.reset(client={"company_name": "Acme AB"}, company_items=items)
        pd.invoke_json = _llm_returns({
            "audience_priorities": [
                {
                    "audience_type": "customer",
                    "weight": 0.7,
                    "personas": [{"role": "CXO", "industry": "SaaS", "company_size": "50-500"}],
                    "narrative_axes": ["praktisk AI utan hype", "B2B-fokus"],
                },
                {
                    "audience_type": "candidate",
                    "weight": 0.3,
                    "personas": [{"role": "Senior Data Engineer"}],
                    "narrative_axes": ["modern stack", "platt organisation"],
                },
            ]
        })

        result = pd.derive_audience_priorities("acme", company_name="Acme AB")
        self.assertFalse(result.insufficient_data)
        self.assertFalse(result.llm_unavailable)
        self.assertEqual(len(result.audience_priorities), 2)
        self.assertEqual(result.audience_priorities[0].audience_type, "customer")
        self.assertEqual(result.audience_priorities[0].personas[0].role, "CXO")
        # LLM gav "candidate" → normaliseras till kanoniskt "talent".
        self.assertEqual(result.audience_priorities[1].audience_type, "talent")
        self.assertEqual(result.source_counts, {"website": 1, "jobfeed": 1})

    def test_filters_unknown_audience_type(self):
        fakefs.reset(client={"company_name": "X"},
                     company_items=_website_item(url="x", title="x", text="x" * 50))
        pd.invoke_json = _llm_returns({
            "audience_priorities": [
                {"audience_type": "junk", "weight": 0.5, "personas": [{"role": "X"}]},
                {"audience_type": "customer", "weight": 0.5, "personas": [{"role": "CXO"}]},
            ]
        })
        result = pd.derive_audience_priorities("acme")
        self.assertEqual([a.audience_type for a in result.audience_priorities], ["customer"])

    def test_weight_clamped_to_zero_one(self):
        fakefs.reset(client={"company_name": "X"},
                     company_items=_website_item(url="x", title="x", text="x" * 50))
        pd.invoke_json = _llm_returns({
            "audience_priorities": [
                {"audience_type": "customer", "weight": 1.5, "personas": [{"role": "CXO"}]},
                {"audience_type": "candidate", "weight": -0.2, "personas": [{"role": "Eng"}]},
            ]
        })
        result = pd.derive_audience_priorities("acme")
        self.assertEqual(result.audience_priorities[0].weight, 1.0)
        self.assertEqual(result.audience_priorities[1].weight, 0.0)

    def test_personas_without_role_dropped(self):
        fakefs.reset(client={"company_name": "X"},
                     company_items=_website_item(url="x", title="x", text="x" * 50))
        pd.invoke_json = _llm_returns({
            "audience_priorities": [
                {"audience_type": "customer", "weight": 0.5,
                 "personas": [{"role": "CXO"}, {"industry": "tech"}, {}]}
            ]
        })
        result = pd.derive_audience_priorities("acme")
        self.assertEqual(len(result.audience_priorities[0].personas), 1)
        self.assertEqual(result.audience_priorities[0].personas[0].role, "CXO")

    def test_insufficient_data_when_no_sources(self):
        fakefs.reset(client={"company_name": "X"}, company_items={})
        result = pd.derive_audience_priorities("acme")
        self.assertTrue(result.insufficient_data)
        self.assertEqual(result.audience_priorities, [])
        self.assertEqual(result.source_counts, {"website": 0, "jobfeed": 0})

    def test_malformed_llm_output_treated_as_unavailable(self):
        fakefs.reset(client={"company_name": "X"},
                     company_items=_website_item(url="x", title="x", text="x" * 50))
        pd.invoke_json = _llm_returns({"oops": "wrong shape"})
        result = pd.derive_audience_priorities("acme")
        self.assertTrue(result.llm_unavailable)

    def test_collects_only_top_n_website_items_by_length(self):
        # Bygg fler items än budgeten + variera textlängd → bara de längsta plockas
        items = {}
        for i in range(pd.MAX_WEBSITE_ITEMS + 5):
            items.update(_website_item(
                url=f"https://x.se/{i}", title=f"page {i}",
                text="x" * (10 if i < pd.MAX_WEBSITE_ITEMS else 5_000),
                item_id=f"w{i}",
            ))
        fakefs.reset(client={"company_name": "X"}, company_items=items)
        collected = pd._collect_website_items("acme")
        self.assertEqual(len(collected), pd.MAX_WEBSITE_ITEMS)
        # De längsta texterna (5000 tecken) ska komma först
        self.assertGreater(len(collected[0]["content"]), 1000)

    def test_distinguishes_website_from_jobfeed_items(self):
        items = {
            **_website_item(url="https://x.se", title="Om", text="om-text" * 20, item_id="w1"),
            **_job_item(title="Engineer", text="job-text" * 20, item_id="j1"),
        }
        fakefs.reset(client={"company_name": "X"}, company_items=items)
        web = pd._collect_website_items("acme")
        jobs = pd._collect_job_items("acme")
        self.assertEqual(len(web), 1)
        self.assertEqual(len(jobs), 1)
        self.assertIn("om-text", web[0]["content"])
        self.assertIn("job-text", jobs[0]["content"])


class DerivationLlmUnavailable(unittest.TestCase):
    def setUp(self):
        self._orig = pd.make_validator
        pd.make_validator = lambda: None

    def tearDown(self):
        pd.make_validator = self._orig

    def test_returns_unavailable_flag(self):
        fakefs.reset(client={"company_name": "X"},
                     company_items=_website_item(url="x", title="x", text="x" * 50))
        result = pd.derive_audience_priorities("acme")
        self.assertTrue(result.llm_unavailable)
        self.assertEqual(result.audience_priorities, [])


class PromptShape(unittest.TestCase):
    def test_includes_website_and_job_sections(self):
        web = [{"url": "https://x.se/om", "title": "Om", "content": "Vi är ett B2B SaaS-bolag" * 5,
                "schema_type": "Organization"}]
        jobs = [{"title": "Senior Engineer", "content": "Vi söker en senior...", "location": "Stockholm",
                 "published_at": "2026-05-28T08:00:00Z"}]
        prompt = pd._build_user_prompt(web, jobs, "Acme AB")
        self.assertIn("Acme AB", prompt)
        self.assertIn("[WEBSITE", prompt)
        self.assertIn("[JOBBANNONSER", prompt)
        self.assertIn("Senior Engineer", prompt)
        self.assertIn("Stockholm", prompt)
        self.assertIn("Om", prompt)

    def test_handles_empty_sources_gracefully(self):
        prompt = pd._build_user_prompt([], [], None)
        self.assertIn("(okänt)", prompt)
        self.assertIn("inga sidor", prompt)
        self.assertIn("inga aktiva", prompt)


if __name__ == "__main__":
    unittest.main()
