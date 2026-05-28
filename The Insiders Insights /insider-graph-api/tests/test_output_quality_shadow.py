"""Enhetstester för shadow-mode-loggen (services/output_quality_shadow.py)."""
from __future__ import annotations

import unittest

import fakefs  # installerar fake firestore_client — måste importeras först

from services import output_quality, output_quality_shadow as shadow


def _claim(
    *,
    statement="ett claim",
    origin="",
    predicate=None,
    claim_kind="narrative",
    included=True,
    review_status=None,
    sources=None,
):
    raw: dict = {
        "claim_kind": claim_kind,
        "subject_ref": "org",
        "statement": statement,
        "source": sources if sources is not None else [{"kind": "item", "item_id": "x1"}],
        "included_in_output": included,
        "facet": "operational",
    }
    if predicate:
        raw["predicate"] = predicate
        raw["claim_kind"] = "property"
    if origin:
        raw["origin"] = origin
    if review_status:
        raw["review_status"] = review_status
    return raw


def _audience():
    return [{
        "audience_type": "customer",
        "weight": 1.0,
        "personas": [{"role": "CXO", "industry": "SaaS"}],
        "narrative_axes": ["praktisk AI"],
    }]


def _fake_llm_score(items):
    """Mockad LLM som returnerar standardpoäng för varje item-index."""
    return [
        {
            "index": i,
            "dimension_hint": "narrative",
            "best_audience": "customer",
            "dimensions": {d: 4 for d in output_quality.SCORE_DIMENSIONS},
            "action": "publish",
            "reasons": [],
        }
        for i in range(items)
    ]


class ShadowLoggingTest(unittest.TestCase):
    def setUp(self):
        # Mocka output_quality:s LLM-söm så vi inte beror på Vertex AI
        self._orig = (output_quality.make_validator, output_quality.invoke_json)
        output_quality.make_validator = lambda: object()

    def tearDown(self):
        output_quality.make_validator, output_quality.invoke_json = self._orig

    def test_skips_when_no_client(self):
        fakefs.reset(client=None)
        self.assertIsNone(shadow.run_shadow("ghost"))

    def test_skips_when_no_claims(self):
        fakefs.reset(client={"company_name": "Acme AB"}, claims={})
        self.assertIsNone(shadow.run_shadow("acme"))

    def test_writes_log_with_score_and_verdict(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "audience_priorities": _audience()},
            claims={
                "c1": _claim(statement="Praktisk AI", origin=""),
                "c2": _claim(statement="Annat", origin=""),
            },
        )
        output_quality.invoke_json = lambda *_a: {"items": _fake_llm_score(2)}

        summary = shadow.run_shadow("acme")
        self.assertIsNotNone(summary)
        self.assertEqual(summary["claim_count"], 2)
        self.assertEqual(summary["verdict"], "pass")

        # Loggen ska finnas och innehålla per-connector-aggregat
        logs = dict(fakefs.iter_output_quality_logs("acme"))
        self.assertEqual(len(logs), 1)
        log_doc = next(iter(logs.values()))
        self.assertEqual(log_doc["claim_count"], 2)
        self.assertEqual(log_doc["bundle_score"], 4.0)
        self.assertIn("per_connector", log_doc)
        self.assertIn("per_claim", log_doc)

    def test_filters_rejected_and_excluded_claims(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "audience_priorities": _audience()},
            claims={
                "ok": _claim(statement="Bra"),
                "no": _claim(statement="Borttaget", included=False),
                "rej": _claim(statement="Avvisat", review_status="rejected"),
            },
        )
        output_quality.invoke_json = lambda *_a: {"items": _fake_llm_score(1)}
        summary = shadow.run_shadow("acme")
        self.assertEqual(summary["claim_count"], 1)

    def test_resolves_connector_from_origin(self):
        cases = [
            ("attested:linkedin_follower_demographics", "linkedin_capacity"),
            ("attested:linkedin_visitor_demographics", "linkedin_capacity"),
            ("attested:linkedin_posts", "linkedin_capacity"),
            ("attested:gleif", "gleif"),
            ("verified:survey_aggregate", "verification"),
            ("source:upload", "manual_upload"),
        ]
        for origin, expected in cases:
            with self.subTest(origin=origin):
                self.assertEqual(
                    shadow._resolve_connector({"origin": origin}),
                    expected,
                )

    def test_resolves_connector_from_url_fallback(self):
        self.assertEqual(
            shadow._resolve_connector({"source": [{"url": "https://linkedin.com/x"}]}),
            "linkedin",
        )
        self.assertEqual(
            shadow._resolve_connector({"source": [{"url": "https://kund.se/om"}]}),
            "website",
        )
        self.assertEqual(shadow._resolve_connector({"source": []}), "extraction")

    def test_per_connector_aggregation(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "audience_priorities": _audience()},
            claims={
                "li1": _claim(statement="Demografi A", origin="attested:linkedin_follower_demographics"),
                "li2": _claim(statement="Demografi B", origin="attested:linkedin_follower_demographics"),
                "web": _claim(statement="Webb-claim",
                              sources=[{"kind": "item", "url": "https://kund.se/om"}]),
            },
        )
        output_quality.invoke_json = lambda *_a: {"items": _fake_llm_score(3)}
        shadow.run_shadow("acme")

        log = next(iter(dict(fakefs.iter_output_quality_logs("acme")).values()))
        per_conn = log["per_connector"]
        self.assertIn("linkedin_capacity", per_conn)
        self.assertIn("website", per_conn)
        self.assertEqual(per_conn["linkedin_capacity"]["claim_count"], 2)
        self.assertEqual(per_conn["website"]["claim_count"], 1)
        # origin-strängarna räknas separat (för fas-4-filtrering)
        self.assertEqual(
            per_conn["linkedin_capacity"]["origins"]["attested:linkedin_follower_demographics"], 2
        )

    def test_audience_priorities_parsed_from_firestore(self):
        # Korrupta entries filtreras bort, weight clampas
        fakefs.reset(
            client={
                "company_name": "X",
                "audience_priorities": [
                    {"audience_type": "customer", "weight": 1.5,
                     "personas": [{"role": "CXO"}], "narrative_axes": ["a"]},
                    {"audience_type": "junk", "weight": 0.5, "personas": [{"role": "X"}]},
                    {"audience_type": "candidate", "weight": -0.2,
                     "personas": [{"role": "Eng"}, {}]},  # tom persona droppas
                ],
            },
            claims={"c1": _claim()},
        )
        parsed = shadow._parse_audience_priorities([
            {"audience_type": "customer", "weight": 1.5,
             "personas": [{"role": "CXO"}], "narrative_axes": ["a"]},
            {"audience_type": "junk", "weight": 0.5, "personas": [{"role": "X"}]},
            {"audience_type": "candidate", "weight": -0.2,
             "personas": [{"role": "Eng"}, {}]},
        ])
        self.assertEqual([p.audience_type for p in parsed], ["customer", "candidate"])
        self.assertEqual(parsed[0].weight, 1.0)
        self.assertEqual(parsed[1].weight, 0.0)
        self.assertEqual(len(parsed[1].personas), 1)

    def test_llm_unavailable_still_writes_log(self):
        """Om LLM:n är nere ska vi fortfarande logga (med metadata.llm_unavailable=true)."""
        fakefs.reset(
            client={"company_name": "X", "audience_priorities": _audience()},
            claims={"c1": _claim()},
        )
        output_quality.make_validator = lambda: None
        summary = shadow.run_shadow("acme")
        self.assertTrue(summary["llm_unavailable"])
        self.assertEqual(summary["verdict"], "pass")
        log = next(iter(dict(fakefs.iter_output_quality_logs("acme")).values()))
        self.assertTrue(log["metadata"]["llm_unavailable"])


if __name__ == "__main__":
    unittest.main()
