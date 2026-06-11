"""Enhetstester för alignment-auditen (services/alignment_audit.py).

Loopen probe → gap → riktad claim-beställning. Matchern injiceras (fake) så
testerna är deterministiska och LLM-fria — samma mönster som warmth_probes-testen.
"""
import unittest
from datetime import datetime, timezone
from unittest import mock

import fakefs  # installerar fake firestore_client — måste importeras först
from services import alignment_audit as aa


def _setup(claims=None):
    fakefs.reset(
        client={"company_name": "Acme AB", "website": "https://acme.se"},
        company_items={
            "bv1": {
                "schema_type": "Organization",
                "url": "https://www.allabolag.se/x",
                "published_at": datetime(2024, 3, 1, tzinfo=timezone.utc),
                "included_in_output": True,
                "extra": {"name": "Allabolag"},
            }
        },
        claims=claims or {
            "c1": {
                "claim_kind": "narrative", "subject_ref": "org",
                "statement": "Erbjuder sex månaders föräldralön utöver lag",
                "facet": "culture", "dimension": "wellbeing", "audience": ["talent"],
                "source": [{"kind": "item", "item_id": "bv1"}], "included_in_output": True,
            }
        },
    )


def _covers(*, dimension, needle):
    """Fake-matcher: 'covered' bara om needle finns i sidinnehållet för rätt dimension."""
    def _match(battery, page_content, company):
        if battery.dimension == dimension and needle in page_content:
            return {"covered": True, "evidence": needle, "confidence": 0.9, "reason": "svar finns"}
        return {"covered": False, "confidence": 0.6, "reason": "inget svar",
                "suggested_answer": f"[utkast] konkret påstående om {battery.dimension}"}
    return _match


_DEFAULTS = ["customer", "talent", "investor"]


class BatteryEnumerationTest(unittest.TestCase):
    def test_only_active_personas_and_both_angles(self):
        batteries = aa.build_batteries(_DEFAULTS, "Acme AB")
        # 3 personor × 6 dimensioner = 18 batterier, var och en med Spår A + B.
        self.assertEqual(len(batteries), 18)
        self.assertEqual({b.persona_id for b in batteries}, set(_DEFAULTS))
        self.assertEqual(len({b.dimension for b in batteries}), 6)
        for b in batteries:
            self.assertTrue(b.neutral_q and b.adversarial_q)
            self.assertNotEqual(b.neutral_q, b.adversarial_q)  # två skilda vinklar
            self.assertIn("Acme AB", b.neutral_q)              # {company} substituerat
            self.assertNotIn("{company}", b.adversarial_q)

    def test_unknown_persona_skipped(self):
        batteries = aa.build_batteries(["customer", "nonsense"], "Acme AB")
        self.assertEqual({b.persona_id for b in batteries}, {"customer"})


class PageContentTest(unittest.TestCase):
    def test_page_content_includes_claims_and_faq(self):
        _setup()
        from schema_org.compiler import build_render_model
        content = aa.build_page_content(build_render_model("acme"))
        self.assertIn("föräldralön", content)          # prosa-claim
        # FAQ-rader (fråga + svar) ska ingå — sidan crawlas inklusive FAQ.
        self.assertIn("Acme AB", content)


class CoverageAndGapsTest(unittest.TestCase):
    def test_covered_battery_yields_no_gap(self):
        _setup()
        audit = aa.run_alignment_audit(
            "acme", matcher=_covers(dimension="wellbeing", needle="föräldralön"),
            active_persona_ids=_DEFAULTS,
        )
        self.assertEqual(len(audit.results), 18)
        # wellbeing täckt för alla tre personor (samma sidinnehåll) → 3 covered.
        wellbeing = [r for r in audit.results if r.dimension == "wellbeing"]
        self.assertTrue(all(r.covered for r in wellbeing))
        self.assertEqual(audit.coverage["covered"], 3)
        self.assertEqual(audit.coverage["by_dimension"]["wellbeing"]["coverage"], 1.0)
        # Inga claim-orders för täckta batterier.
        self.assertFalse(any(c.dimension == "wellbeing" for c in audit.claim_orders))

    def test_uncovered_battery_becomes_claim_order(self):
        _setup()
        audit = aa.run_alignment_audit(
            "acme", matcher=_covers(dimension="wellbeing", needle="föräldralön"),
            active_persona_ids=_DEFAULTS,
        )
        self.assertEqual(len(audit.gaps), 15)
        self.assertEqual(len(audit.claim_orders), 15)
        co = audit.claim_orders[0]
        # Claim-order mappar mot culture-claim-modellen: facet + riktad audience.
        self.assertEqual(co.facet, "culture")
        self.assertEqual(co.audience, [co.persona_id])
        self.assertTrue(co.suggested_statement)        # ett utkast finns
        self.assertTrue(co.probe_neutral_q)            # spårbart till frågan

    def test_coverage_summary_math(self):
        _setup()
        audit = aa.run_alignment_audit(
            "acme", matcher=_covers(dimension="wellbeing", needle="föräldralön"),
            active_persona_ids=_DEFAULTS,
        )
        cov = audit.coverage
        self.assertEqual(cov["total"], 18)
        self.assertEqual(cov["gaps"], 15)
        self.assertAlmostEqual(cov["coverage"], round(3 / 18, 3))
        # Varje persona prövas på 6 dimensioner.
        for pid in _DEFAULTS:
            self.assertEqual(cov["by_persona"][pid]["total"], 6)


class MatcherFailureTest(unittest.TestCase):
    def test_matcher_none_verdict_treated_as_uncovered(self):
        _setup()
        audit = aa.run_alignment_audit(
            "acme", matcher=lambda b, p, c: None, active_persona_ids=["customer"],
        )
        self.assertEqual(audit.coverage["covered"], 0)
        self.assertEqual(len(audit.claim_orders), 6)
        # Konservativ markering syns i motiveringen.
        self.assertIn("otillgänglig", audit.results[0].reason)

    def test_matcher_exception_does_not_crash_audit(self):
        _setup()
        def _boom(b, p, c):
            raise RuntimeError("nätverksfel")
        audit = aa.run_alignment_audit("acme", matcher=_boom, active_persona_ids=["customer"])
        self.assertEqual(len(audit.results), 6)
        self.assertTrue(all(not r.covered for r in audit.results))

    def test_no_judge_means_no_op(self):
        _setup()
        with mock.patch("services.llm.make_validator", return_value=None):
            self.assertIsNone(aa.run_alignment_audit("acme"))


class LlmMatcherTest(unittest.TestCase):
    def test_llm_matcher_parses_json_verdict(self):
        """Prod-matchern: bygger payload, kör llm.invoke_json, returnerar verdict."""
        class _Resp:
            content = '{"covered": true, "evidence": "x", "confidence": 0.8, "reason": "ok", "suggested_answer": null}'

        class _LLM:
            def invoke(self, msgs):
                return _Resp()

        matcher = aa.llm_matcher(_LLM())
        battery = aa.ProbeBattery("customer", "wellbeing", "Neutral?", "Adversariell?")
        verdict = matcher(battery, "sidinnehåll", "Acme AB")
        self.assertTrue(verdict["covered"])
        self.assertEqual(verdict["confidence"], 0.8)


class RunAndStoreTest(unittest.TestCase):
    def test_persists_result_doc_with_captured_at(self):
        """run_and_store skriver gap + claim-orders + tidsstämpel till
        polling_results/alignment-latest (default-vägen, mot fakefs)."""
        _setup()
        doc = aa.run_and_store(
            "acme", matcher=lambda b, p, c: None, active_persona_ids=["customer"]
        )
        self.assertIsNotNone(doc)
        self.assertEqual(doc["coverage"]["gaps"], 6)
        self.assertIn("captured_at", doc)
        # Skriven till rätt polling_results-dokument och återläsbar.
        from schema_org import humanization_config as hc
        stored = fakefs.STATE["polling_results"][hc.ALIGNMENT_AUDIT_DOC]
        self.assertEqual(stored["client_id"], "acme")
        self.assertEqual(len(stored["claim_orders"]), 6)

    def test_injected_store_receives_doc(self):
        """`store` är injicerbar — jobbet/test kan fånga doc utan Firestore."""
        _setup()
        captured: dict = {}
        doc = aa.run_and_store(
            "acme",
            matcher=_covers(dimension="wellbeing", needle="föräldralön"),
            active_persona_ids=["talent"],
            store=lambda cid, d: captured.update({"cid": cid, "doc": d}),
        )
        self.assertEqual(captured["cid"], "acme")
        self.assertIs(captured["doc"], doc)
        # Minst wellbeing-dimensionen täcks → färre än alla 6 är gap.
        self.assertLess(doc["coverage"]["gaps"], 6)

    def test_no_op_returns_none_and_does_not_store(self):
        """Ingen domarmodell → run_alignment_audit None → run_and_store no-op."""
        _setup()
        called: list = []
        with mock.patch("services.llm.make_validator", return_value=None):
            doc = aa.run_and_store("acme", store=lambda cid, d: called.append(cid))
        self.assertIsNone(doc)
        self.assertEqual(called, [])


class ReadLatestTest(unittest.TestCase):
    def test_returns_none_when_never_run(self):
        _setup()
        self.assertIsNone(aa.read_latest("acme"))

    def test_returns_persisted_doc(self):
        _setup()
        aa.run_and_store("acme", matcher=lambda b, p, c: None, active_persona_ids=["customer"])
        doc = aa.read_latest("acme")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["client_id"], "acme")
        self.assertIn("coverage", doc)


class FulfillOrderTest(unittest.TestCase):
    def test_builds_sourced_culture_claim_with_dimension_and_audience(self):
        _setup()
        cid = aa.fulfill_order(
            "acme",
            "Erbjuder 6 mån föräldralön utöver lag",
            dimension="wellbeing",
            audience=["talent"],
            source_label="HR-policy 2026",
            source_url="https://acme.se/policy",
        )
        written = fakefs.STATE["writes"][cid]
        self.assertEqual(written["facet"], "culture")
        self.assertEqual(written["dimension"], "wellbeing")
        self.assertEqual(written["audience"], ["talent"])
        self.assertEqual(written["warmth_mode"], "declared")
        # Ops-belagt → publiceras direkt (samma som risk-åtgärden).
        self.assertTrue(written["included_in_output"])
        self.assertEqual(written["review_status"], "approved")
        # Källan bevarad.
        self.assertEqual(written["source"][0]["label"], "HR-policy 2026")
        self.assertEqual(written["source"][0]["url"], "https://acme.se/policy")
        self.assertTrue(cid.startswith("align-"))

    def test_idempotent_id_for_same_statement(self):
        _setup()
        a = aa.fulfill_order("acme", "Samma påstående", dimension="wellbeing")
        b = aa.fulfill_order("acme", "Samma påstående", dimension="wellbeing")
        self.assertEqual(a, b)  # deterministiskt id → ingen dubblett

    def test_default_source_label_when_missing(self):
        _setup()
        cid = aa.fulfill_order("acme", "Utan källetikett")
        written = fakefs.STATE["writes"][cid]
        self.assertEqual(written["source"][0]["label"], "uppgift från bolaget")


if __name__ == "__main__":
    unittest.main()
