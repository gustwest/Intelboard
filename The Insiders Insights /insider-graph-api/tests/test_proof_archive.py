"""Enhetstester för bevisarkivet (Spår D3).

Kärnan: arkivet får ALDRIG läcka något vi inte går i god för (needs_review, rejected,
aggregated, ej-publicerat, eller utan bevis-grad proveniens). Plus tier-klassning,
verifierings-join (fyra kontroller), filter och summary.
"""
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client före routers/services
from services import proof_archive as pa


def _source(**kw):
    base = {
        "kind": "item", "item_id": None, "employee_id": None, "label": None,
        "attested_at": None, "url": None, "quote": None,
        "assurance_level": None, "verification_id": None,
    }
    base.update(kw)
    return base


def _claim(**kw):
    base = {
        "claim_kind": "narrative", "subject_ref": "org", "predicate": None, "value": None,
        "statement": "Ett påstående.", "source": [], "confidence": 1.0,
        "included_in_output": True, "needs_review": False, "review_status": "approved",
        "validated_at": None, "validated_by": None, "facet": "operational",
        "warmth_mode": None, "dimension": None, "audience": [],
    }
    base.update(kw)
    return base


# En attesterad källa + dess verifieringsrecord (fyra kontroller).
_ASSURED_SRC = _source(
    kind="attested", label="EcoVadis, verifierad av Geogiraph",
    attested_at="2024-04-01", assurance_level="independently_assured",
    verification_id="ver-1",
)
_VERIFICATIONS = {
    "ver-1": {
        "evidence_type": "ecovadis", "verdict": "verified",
        "verification_text": "Verifierad mot EcoVadis-intyg (2024-03-01).",
        "checks": {"independence": True, "methodology": True, "freshness": True, "traceability": True},
        "instrument_or_issuer": "EcoVadis", "document_date": "2024-03-01",
        "verified_at": "2024-04-01T09:00:00", "verified_by": "ops", "expires_at": "2025-03-01",
    }
}


class BuildArchiveInclusionTest(unittest.TestCase):
    def test_assured_claim_joins_verification(self):
        claims = [("c-assured", _claim(source=[_ASSURED_SRC], facet="operational"))]
        out = pa.build_archive(claims, _VERIFICATIONS)
        self.assertEqual(len(out["entries"]), 1)
        e = out["entries"][0]
        self.assertEqual(e["proof_tier"], "assured")
        self.assertEqual(e["assurance_level"], "independently_assured")
        self.assertEqual(e["verification"]["checks"]["independence"], True)
        self.assertEqual(e["verification"]["evidence_type"], "ecovadis")
        # as_of = underlagets datum (det revisorn bryr sig om), inte attesteringsdatum.
        self.assertEqual(e["as_of"], "2024-03-01")

    def test_grounded_claim_with_quote_included_without_assurance(self):
        src = _source(label="Företagets webbplats", quote="vi grundades 2014 i Stockholm")
        out = pa.build_archive([("c-grounded", _claim(source=[src]))], {})
        self.assertEqual(len(out["entries"]), 1)
        e = out["entries"][0]
        self.assertEqual(e["proof_tier"], "grounded")
        self.assertIsNone(e["assurance_level"])
        self.assertIsNone(e["verification"])
        self.assertEqual(e["source"]["quote"], "vi grundades 2014 i Stockholm")

    def test_self_declared_included_but_labeled(self):
        src = _source(kind="manual", assurance_level="self_declared", verification_id="ver-sd")
        out = pa.build_archive([("c-sd", _claim(source=[src]))], {})
        self.assertEqual(len(out["entries"]), 1)
        self.assertEqual(out["entries"][0]["assurance_level"], "self_declared")
        self.assertEqual(out["entries"][0]["proof_tier"], "assured")

    def test_excludes_needs_review(self):
        out = pa.build_archive([("c", _claim(source=[_ASSURED_SRC], needs_review=True))], _VERIFICATIONS)
        self.assertEqual(out["entries"], [])

    def test_excludes_rejected_and_aggregated(self):
        for status in ("rejected", "aggregated"):
            out = pa.build_archive(
                [("c", _claim(source=[_ASSURED_SRC], review_status=status))], _VERIFICATIONS
            )
            self.assertEqual(out["entries"], [], f"status={status} ska uteslutas")

    def test_excludes_not_included_in_output(self):
        out = pa.build_archive(
            [("c", _claim(source=[_ASSURED_SRC], included_in_output=False))], _VERIFICATIONS
        )
        self.assertEqual(out["entries"], [])

    def test_excludes_claim_without_provenance(self):
        # Källa utan assurance OCH utan tillräckligt citat → ingen bevis-grad → utesluts.
        weak = _source(label="bara en etikett", quote="kort")  # < MIN_QUOTE_CHARS
        out = pa.build_archive([("c", _claim(source=[weak]))], {})
        self.assertEqual(out["entries"], [])

    def test_excludes_claim_with_no_sources(self):
        out = pa.build_archive([("c", _claim(source=[]))], {})
        self.assertEqual(out["entries"], [])


class BuildArchiveSelectionAndFilterTest(unittest.TestCase):
    def test_picks_strongest_source_among_many(self):
        sources = [
            _source(assurance_level="self_declared", verification_id="ver-sd"),
            _source(assurance_level="independently_assured", verification_id="ver-1"),
            _source(quote="ett tillräckligt långt citat"),
        ]
        out = pa.build_archive([("c", _claim(source=sources))], _VERIFICATIONS)
        self.assertEqual(out["entries"][0]["assurance_level"], "independently_assured")

    def test_property_claim_statement_fallback(self):
        c = _claim(claim_kind="property", predicate="foundingDate", value="2014",
                   statement=None, source=[_ASSURED_SRC])
        out = pa.build_archive([("c", c)], _VERIFICATIONS)
        self.assertEqual(out["entries"][0]["statement"], "foundingDate: 2014")

    def test_filter_by_assurance_level(self):
        claims = [
            ("a", _claim(source=[_ASSURED_SRC])),
            ("b", _claim(source=[_source(assurance_level="self_declared", verification_id="x")])),
        ]
        out = pa.build_archive(claims, _VERIFICATIONS, assurance_level="self_declared")
        self.assertEqual([e["claim_id"] for e in out["entries"]], ["b"])

    def test_filter_by_tier_and_facet(self):
        claims = [
            ("a", _claim(source=[_ASSURED_SRC], facet="operational")),
            ("b", _claim(source=[_source(quote="ett tillräckligt långt citat")], facet="culture")),
        ]
        self.assertEqual(
            [e["claim_id"] for e in pa.build_archive(claims, {}, tier="grounded")["entries"]], ["b"]
        )
        self.assertEqual(
            [e["claim_id"] for e in pa.build_archive(claims, _VERIFICATIONS, facet="operational")["entries"]],
            ["a"],
        )

    def test_filter_by_date_range(self):
        claims = [("a", _claim(source=[_ASSURED_SRC]))]  # as_of 2024-03-01
        self.assertEqual(len(pa.build_archive(claims, _VERIFICATIONS, date_from="2024-01-01")["entries"]), 1)
        self.assertEqual(len(pa.build_archive(claims, _VERIFICATIONS, date_from="2025-01-01")["entries"]), 0)
        self.assertEqual(len(pa.build_archive(claims, _VERIFICATIONS, date_to="2024-02-01")["entries"]), 0)
        self.assertEqual(len(pa.build_archive(claims, _VERIFICATIONS, date_to="2024-12-31")["entries"]), 1)

    def test_sorted_newest_first(self):
        old = _claim(source=[_source(assurance_level="self_declared", verification_id="vo")])
        new = _claim(source=[_source(assurance_level="self_declared", verification_id="vn")])
        vers = {
            "vo": {"verdict": "self_declared", "document_date": "2023-01-01", "checks": {}},
            "vn": {"verdict": "self_declared", "document_date": "2024-06-01", "checks": {}},
        }
        out = pa.build_archive([("old", old), ("new", new)], vers)
        self.assertEqual([e["claim_id"] for e in out["entries"]], ["new", "old"])

    def test_summary_counts(self):
        claims = [
            ("a", _claim(source=[_ASSURED_SRC])),
            ("b", _claim(source=[_source(quote="ett tillräckligt långt citat")], facet="culture")),
            ("c", _claim(source=[_source(assurance_level="self_declared", verification_id="x")])),
        ]
        s = pa.build_archive(claims, _VERIFICATIONS)["summary"]
        self.assertEqual(s["total"], 3)
        self.assertEqual(s["by_tier"], {"assured": 2, "grounded": 1})
        self.assertEqual(s["by_assurance_level"]["independently_assured"], 1)
        self.assertEqual(s["by_assurance_level"]["self_declared"], 1)
        self.assertEqual(s["by_facet"], {"operational": 2, "culture": 1})


class RouterTest(unittest.TestCase):
    def test_load_raises_404_when_client_missing(self):
        from fastapi import HTTPException
        from routers import proof_archive as router

        fakefs.reset(client=None)
        with self.assertRaises(HTTPException) as ctx:
            router._load("nope")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_export_includes_deterministic_hash(self):
        from routers import proof_archive as router

        fakefs.reset(
            client={"company_name": "Acme"},
            claims={"c-assured": _claim(source=[_ASSURED_SRC])},
            verifications=_VERIFICATIONS,
        )
        out = router.export_proof_archive("acme")
        self.assertTrue(out["content_hash"].startswith("sha256:"))
        self.assertEqual(len(out["entries"]), 1)
        self.assertIn("generated_at", out)


if __name__ == "__main__":
    unittest.main()
