"""Enhetstester för semantisk dedup (services/semantic_dedup.py) + aggregeringens
källetikett-fix. De LLM-drivna delarna testas via monkeypatch (offline)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
import services.claim_aggregation as ca
import services.semantic_dedup as sd


class ParseClustersTest(unittest.TestCase):
    def test_one_based_to_zero_based_disjoint(self):
        # 1-baserat in → 0-baserat ut; ett claim i max ett kluster (4 vinner i första).
        clusters = sd._parse_clusters([[1, 4], [4, 2, 7]], n=8)
        self.assertEqual(clusters, [[0, 3], [1, 6]])

    def test_drops_singletons_and_out_of_range(self):
        self.assertEqual(sd._parse_clusters([[1], [2, 99], [3, 5]], n=6), [[2, 4]])

    def test_ignores_garbage(self):
        self.assertEqual(sd._parse_clusters(["nope", None, [1, "x", 2]], n=4), [[0, 1]])


class StripSummaryPrefixTest(unittest.TestCase):
    def test_collapses_nested_summary_chain(self):
        nested = ("Sammanfattning av 6 datapunkter — Sammanfattning av 11 datapunkter — "
                  "LinkedIn-data, verifierad av Geogiraph")
        self.assertEqual(ca._strip_summary_prefix(nested), "LinkedIn-data, verifierad av Geogiraph")

    def test_leaves_plain_label(self):
        self.assertEqual(ca._strip_summary_prefix("LinkedIn-data, verifierad av Geogiraph"),
                         "LinkedIn-data, verifierad av Geogiraph")

    def test_aggregated_source_wraps_once(self):
        originals = [
            ("a", {"source": [{"kind": "attested", "attested_at": "2026-05-01",
                               "label": "Sammanfattning av 5 datapunkter — LinkedIn-data, verifierad av Geogiraph"}]}),
            ("b", {"source": [{"kind": "attested", "attested_at": "2026-04-01",
                               "label": "LinkedIn-data, verifierad av Geogiraph"}]}),
        ]
        src = ca._build_aggregated_source(originals)
        # EN summeringsnivå + baskällan, ingen kedja.
        self.assertEqual(src["label"], "Sammanfattning av 2 datapunkter — LinkedIn-data, verifierad av Geogiraph")
        self.assertEqual(src["attested_at"], "2026-05-01")  # färskast


def _setup_claims():
    fakefs.reset(
        client={"company_name": "Acme AB"},
        claims={
            "c1": {"claim_kind": "narrative", "subject_ref": "org",
                   "statement": "Grundades av Anna, Erik och Josefin.",
                   "source": [{"kind": "manual"}], "included_in_output": True},
            "c2": {"claim_kind": "narrative", "subject_ref": "org",
                   "statement": "Grundat av veteranerna Erik, Josefin och Anna.",
                   "source": [{"kind": "manual"}], "included_in_output": True},
            "c3": {"claim_kind": "narrative", "subject_ref": "org",
                   "statement": "Erbjuder strategisk rådgivning till tillväxtbolag.",
                   "source": [{"kind": "manual"}], "included_in_output": True},
            # exkluderas: rejected / aggregated / property / tom
            "c4": {"claim_kind": "narrative", "subject_ref": "org", "statement": "Avvisad.",
                   "review_status": "rejected", "source": [{"kind": "manual"}], "included_in_output": True},
            "p1": {"claim_kind": "property", "subject_ref": "org", "predicate": "slogan",
                   "value": "X", "source": [{"kind": "manual"}], "included_in_output": True},
        },
    )


class CandidateClaimsTest(unittest.TestCase):
    def test_only_renderable_org_narratives(self):
        _setup_claims()
        cands = sd._candidate_claims("acme")
        ids = {cid for cid, _ in cands}
        self.assertEqual(ids, {"c1", "c2", "c3"})  # rejected/property exkluderade


class DedupClientTest(unittest.TestCase):
    def test_llm_unavailable_is_noop(self):
        _setup_claims()
        orig = sd.make_validator
        sd.make_validator = lambda: None
        try:
            res = sd.dedup_client("acme", apply=True)
        finally:
            sd.make_validator = orig
        self.assertTrue(res["llm_unavailable"])
        self.assertFalse(res["applied"])
        self.assertEqual(res["clusters"], 0)

    def test_dispatches_clusters_to_aggregation(self):
        _setup_claims()
        captured = {}

        def fake_clusters(statements):
            return [[0, 1]]  # c1 + c2 är dubbletter

        def fake_aggregate(client_id, ids, dimension_hint, apply):
            captured["ids"] = ids
            captured["apply"] = apply
            captured["dim"] = dimension_hint
            return ca.AggregationResult(narratives=["Grundat av Anna, Erik och Josefin."],
                                        aggregated_claim_ids=ids, applied=apply)

        orig_c, orig_a = sd.find_redundant_clusters, sd.aggregate_claims
        sd.find_redundant_clusters, sd.aggregate_claims = fake_clusters, fake_aggregate
        try:
            res = sd.dedup_client("acme", apply=True)
        finally:
            sd.find_redundant_clusters, sd.aggregate_claims = orig_c, orig_a
        self.assertEqual(res["clusters"], 1)
        self.assertEqual(set(captured["ids"]), {"c1", "c2"})
        self.assertTrue(captured["apply"])
        self.assertEqual(captured["dim"], "redundans")


if __name__ == "__main__":
    unittest.main()
