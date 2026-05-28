"""Enhetstester för connector-score-aggregatorn (steg 5)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import fakefs  # installerar fake firestore_client — måste importeras först

from services import output_quality_aggregator as agg


def _now_iso(offset_days: float = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).isoformat()


def _shadow_log(*, per_connector, logged_at=None, bundle_flags=None):
    return {
        "logged_at": logged_at or _now_iso(),
        "source": "compile_schema",
        "bundle_score": 3.0,
        "verdict": "pass",
        "claim_count": sum(c.get("claim_count", 0) for c in per_connector.values()),
        "per_connector": per_connector,
        "bundle_flags": bundle_flags or [],
        "metadata": {},
    }


def _gate_log(*, actions, logged_at=None, connector="linkedin_capacity"):
    return {
        "logged_at": logged_at or _now_iso(),
        "source": "gate",
        "connector": connector,
        "scope": "demographics",
        "bundle_score": 1.5,
        "verdict": "block",
        "actions": actions,
        "bundle_flags": [],
        "metadata": {},
    }


class AggregatorTest(unittest.TestCase):
    def test_empty_returns_no_connectors(self):
        fakefs.reset(clients={"acme": {"company_name": "Acme"}})
        r = agg.aggregate_connector_scores()
        self.assertEqual(r["connectors"], [])
        self.assertEqual(r["log_count"], 0)

    def test_aggregates_per_connector_across_clients(self):
        fakefs.reset(clients={"acme": {}, "beta": {}})
        # Per-kund-loggar via opt-in: output_quality_logs_by_client
        fakefs.STATE["output_quality_logs_by_client"] = {
            "acme": {
                "log1": _shadow_log(per_connector={
                    "linkedin_capacity": {"claim_count": 10, "avg_score": 1.5,
                                           "action_counts": {"drop": 8, "transform": 1, "publish": 1},
                                           "origins": {"attested:linkedin_follower_demographics": 10}},
                }),
            },
            "beta": {
                "log1": _shadow_log(per_connector={
                    "website": {"claim_count": 5, "avg_score": 3.8,
                                "action_counts": {"publish": 5, "drop": 0, "transform": 0},
                                "origins": {}},
                }),
            },
        }
        r = agg.aggregate_connector_scores()
        by_conn = {c["connector"]: c for c in r["connectors"]}
        self.assertIn("linkedin_capacity", by_conn)
        self.assertIn("website", by_conn)
        self.assertEqual(by_conn["linkedin_capacity"]["claim_count"], 10)
        self.assertEqual(by_conn["linkedin_capacity"]["avg_score"], 1.5)
        self.assertEqual(by_conn["linkedin_capacity"]["n_clients"], 1)
        self.assertEqual(by_conn["website"]["avg_score"], 3.8)
        # Sorting: lägst snittpoäng först
        self.assertEqual(r["connectors"][0]["connector"], "linkedin_capacity")

    def test_promotion_candidate_flag(self):
        fakefs.reset(clients={"acme": {}})
        # 30+ claims med snitt < 2.5 → promotion_candidate=True
        fakefs.STATE["output_quality_logs"] = {
            "log1": _shadow_log(per_connector={
                "linkedin_capacity": {"claim_count": 35, "avg_score": 2.0,
                                       "action_counts": {"drop": 25, "transform": 5, "publish": 5},
                                       "origins": {}},
                "website": {"claim_count": 35, "avg_score": 4.0,
                            "action_counts": {"publish": 35, "drop": 0, "transform": 0},
                            "origins": {}},
            }),
        }
        r = agg.aggregate_connector_scores()
        by_conn = {c["connector"]: c for c in r["connectors"]}
        self.assertTrue(by_conn["linkedin_capacity"]["promotion_candidate"])
        self.assertFalse(by_conn["website"]["promotion_candidate"])

    def test_promotion_requires_enough_claims(self):
        """Låg snittpoäng utan tillräckligt med data → INTE promotion-kandidat ännu."""
        fakefs.reset(clients={"acme": {}})
        fakefs.STATE["output_quality_logs"] = {
            "log1": _shadow_log(per_connector={
                "lite_data": {"claim_count": 5, "avg_score": 1.0,
                              "action_counts": {"drop": 5, "transform": 0, "publish": 0},
                              "origins": {}},
            }),
        }
        r = agg.aggregate_connector_scores()
        self.assertFalse(r["connectors"][0]["promotion_candidate"])

    def test_window_filter_excludes_old_logs(self):
        fakefs.reset(clients={"acme": {}})
        fakefs.STATE["output_quality_logs"] = {
            "recent": _shadow_log(
                per_connector={"a": {"claim_count": 5, "avg_score": 3.0,
                                      "action_counts": {"publish": 5, "drop": 0, "transform": 0},
                                      "origins": {}}},
                logged_at=_now_iso(-2),
            ),
            "old": _shadow_log(
                per_connector={"b": {"claim_count": 5, "avg_score": 1.0,
                                      "action_counts": {"drop": 5, "transform": 0, "publish": 0},
                                      "origins": {}}},
                logged_at=_now_iso(-30),
            ),
        }
        r = agg.aggregate_connector_scores(window_days=14)
        connectors = {c["connector"] for c in r["connectors"]}
        self.assertIn("a", connectors)
        self.assertNotIn("b", connectors)

    def test_gate_logs_included(self):
        """Gate-loggar bidrar till linkedin_capacity:s claim_count och action-mix."""
        fakefs.reset(clients={"acme": {}})
        fakefs.STATE["output_quality_logs"] = {
            "g1": _gate_log(actions=[
                {"claim_id": "d1", "action": "drop", "score": 1.0, "dimension_hint": "geography",
                 "redundant": True, "mutated": True},
                {"claim_id": "d2", "action": "transform", "score": 2.0, "dimension_hint": "industry",
                 "redundant": False, "mutated": True},
                {"claim_id": "d3", "action": "publish", "score": 4.0, "dimension_hint": "seniority",
                 "redundant": False, "mutated": False},
            ]),
        }
        r = agg.aggregate_connector_scores()
        linkedin = next(c for c in r["connectors"] if c["connector"] == "linkedin_capacity")
        self.assertEqual(linkedin["claim_count"], 3)
        self.assertAlmostEqual(linkedin["avg_score"], (1.0 + 2.0 + 4.0) / 3, places=2)
        self.assertAlmostEqual(linkedin["drop_rate"], 1/3, places=2)

    def test_origin_breakdown_top_n(self):
        fakefs.reset(clients={"acme": {}})
        fakefs.STATE["output_quality_logs"] = {
            "log1": _shadow_log(per_connector={
                "linkedin_capacity": {
                    "claim_count": 100, "avg_score": 2.0,
                    "action_counts": {"drop": 40, "transform": 30, "publish": 30},
                    "origins": {
                        "attested:linkedin_follower_demographics": 60,
                        "attested:linkedin_visitor_demographics": 30,
                        "attested:linkedin_posts": 8,
                        "attested:linkedin_other": 2,
                    },
                },
            }),
        }
        r = agg.aggregate_connector_scores()
        top = r["connectors"][0]["top_origins"]
        self.assertEqual(len(top), agg.TOP_ORIGINS)
        # Sorterat på count desc
        self.assertEqual(top[0]["origin"], "attested:linkedin_follower_demographics")
        self.assertEqual(top[0]["count"], 60)

    def test_per_client_filter(self):
        """När client_id sätts ska bara den kundens loggar räknas."""
        fakefs.reset(clients={"acme": {}, "beta": {}})
        fakefs.STATE["output_quality_logs"] = {
            "log1": _shadow_log(per_connector={
                "linkedin_capacity": {"claim_count": 10, "avg_score": 2.0,
                                       "action_counts": {"drop": 10, "transform": 0, "publish": 0},
                                       "origins": {}},
            }),
        }
        # fakefs.iter_output_quality_logs returnerar samma bucket oavsett client_id,
        # men aggregator anropar bara en kund → en log räknas
        r = agg.aggregate_connector_scores(client_id="acme")
        self.assertEqual(r["client_id"], "acme")
        self.assertEqual(len(r["connectors"]), 1)
        self.assertEqual(r["log_count"], 1)


if __name__ == "__main__":
    unittest.main()
