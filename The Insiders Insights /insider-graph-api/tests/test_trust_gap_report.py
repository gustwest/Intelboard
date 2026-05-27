"""Begriplighetslager + Humaniseringstäckning-rapporten (services/trust_gap_report.py, spec §10/§10.1).

Verifierar att INGA råa 0–1-tal eller facktermer når huvudtexten, att perception hålls per
motor, att handlingslistan rankas efter gap (mest akut först), och att en saknad trust_gap
ger None (ej krasch).
"""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from services import trust_gap_report as tgr


def _tg(dimensions, *, flags=None, coverage=None):
    return {
        "overall_score": 0.2,
        "coverage": coverage or {"declared": 1, "demonstrated": 0, "of": 6},
        "dimensions": dimensions,
        "flags": flags or [],
        "computed_at": "2026-05-27T00:00:00+00:00",
    }


class TrustGapReportTest(unittest.TestCase):
    def test_no_trust_gap_returns_none(self):
        fakefs.reset(client={"company_name": "Acme AB"}, trust_gap=None)
        self.assertIsNone(tgr.build_report_model("acme"))

    def test_plain_language_no_raw_numbers_in_maintext(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_tg({"ethics": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3}}),
        )
        m = tgr.build_report_model("acme")
        eth = next(d for d in m["dimensions"] if d["dimension"] == "ethics")
        # klartext, inte siffror
        self.assertIn("säger ni om er själva", eth["evidence_plain"])
        # råvärdena finns BARA i appendix-rawen
        self.assertEqual(eth["raw"]["declared"], 1.0)
        self.assertNotIn("0.3", eth["evidence_plain"])

    def test_perception_per_engine_kept_separate(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_tg({"wellbeing": {
                "declared": 1.0, "demonstrated": 0.0, "score": 0.3,
                "perceived": {
                    "salience": 0.6, "valence": 0.3,
                    "by_engine": {
                        "perplexity": {"salience": 0.8, "valence": 0.3},
                        "gemini": {"salience": 0.1, "valence": None},
                    },
                },
            }}),
        )
        wb = next(d for d in tgr.build_report_model("acme")["dimensions"] if d["dimension"] == "wellbeing")
        lines = " ".join(wb["perception_by_engine"])
        self.assertIn("Perplexity", lines)
        self.assertIn("svalt", lines)              # perplexity: hög salience, låg valens
        self.assertIn("Gemini vet ännu nästan inget", lines)  # gemini: under salience-golvet

    def test_ranked_actions_risk_first(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_tg(
                {
                    "ethics": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3},          # prio 3
                    "transparency": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3,
                                     "credibility_gap": 0.4},                                  # over_claim → prio 1
                },
                flags=[{"kind": "over_claim", "dimension": "transparency", "confidence": 0.8}],
            ),
        )
        actions = tgr.build_report_model("acme")["ranked_actions"]
        self.assertTrue(actions)
        # anseenderisken (transparency) ska ligga först
        self.assertEqual(actions[0]["label"], "transparens, kollektivavtal, likalön")
        self.assertIn("Trovärdighetsrisk", actions[0]["why"])

    def test_fragment_renders_and_escapes(self):
        fakefs.reset(
            client={"company_name": "Acme & Co"},
            trust_gap=_tg({"ethics": {"declared": 1.0, "demonstrated": 0.0, "score": 0.3}}),
        )
        frag = tgr.render_fragment(tgr.build_report_model("acme"))
        self.assertIn("Att göra", frag)
        self.assertNotIn("<!doctype", frag)  # fragment, ingen doc-ram

    def test_fragment_handles_missing_section(self):
        # None (trust_gap ej beräknad) → upplysning, ingen krasch
        self.assertIn("beräknas", tgr.render_fragment(None))


if __name__ == "__main__":
    unittest.main()
