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
        # Returneras som lista av {engine, text} så frontend kan gruppera per knowledge-source
        # (training vs web_rag) — aldrig medelvärda över olika source-typer.
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
        entries = wb["perception_by_engine"]
        # Engine-ID bevaras i varje rad så frontend kan slå upp knowledge-source.
        engines = {row["engine"] for row in entries}
        self.assertEqual(engines, {"perplexity", "gemini"})
        # Klartexten håller motorerna åtskilda — ingen kollaps eller medelvärde.
        by_engine = {row["engine"]: row["text"] for row in entries}
        self.assertIn("Perplexity", by_engine["perplexity"])
        self.assertIn("svalt", by_engine["perplexity"])              # hög salience, låg valens
        self.assertIn("Gemini vet ännu nästan inget", by_engine["gemini"])  # under salience-golvet
        # Knowledge-source-fältet är inställt så frontend kan gruppera utan att slå upp
        # själv — Perplexity är web_rag (live-signal), Gemini är training (bas-kunskap).
        source_by_engine = {row["engine"]: row["knowledge_source"] for row in entries}
        self.assertEqual(source_by_engine["perplexity"], "web_rag")
        self.assertEqual(source_by_engine["gemini"], "training")

    def test_fragment_groups_engines_by_knowledge_source(self):
        # HTML-fragmentet ska visa AI Base Knowledge och AI Live Signal som separata
        # rubriker när motorer av båda typerna finns — aldrig blanda dem i en lista.
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_tg({"wellbeing": {
                "declared": 1.0, "demonstrated": 0.0, "score": 0.3,
                "perceived": {
                    "salience": 0.6, "valence": 0.5,
                    "by_engine": {
                        "perplexity": {"salience": 0.8, "valence": 0.3},
                        "gemini": {"salience": 0.7, "valence": 0.65},
                    },
                },
            }}),
        )
        frag = tgr.render_fragment(tgr.build_report_model("acme"))
        self.assertIn("AI Base Knowledge", frag)
        self.assertIn("AI Live Signal", frag)
        # Gemini-raden ska komma i Base Knowledge-blocket (training),
        # Perplexity i Live Signal-blocket (web_rag). Verifiera ordningen.
        base_idx = frag.index("AI Base Knowledge")
        live_idx = frag.index("AI Live Signal")
        gem_idx = frag.index("Gemini")
        per_idx = frag.index("Perplexity")
        self.assertLess(base_idx, gem_idx)
        self.assertLess(gem_idx, live_idx)
        self.assertLess(live_idx, per_idx)

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

    def test_persona_mismatch_flag_renders_with_persona_labels(self):
        # Fas 2.1g: persona_mismatch ska renderas med svenska persona-labels,
        # inte fallback-texten "flagga av typ X".
        fakefs.reset(
            client={"company_name": "Acme AB"},
            trust_gap=_tg(
                {"wellbeing": {"declared": 1.0, "demonstrated": 0.5, "score": 0.65}},
                flags=[{
                    "kind": "persona_mismatch", "dimension": "wellbeing",
                    "warmest_persona": "customer", "coolest_persona": "talent",
                    "spread": 0.5,
                }],
            ),
        )
        model = tgr.build_report_model("acme")
        flags_text = " ".join(model["opportunities_and_risks"])
        # Svenska labels, inte råa id:n eller fallback-text
        self.assertIn("kund", flags_text.lower())
        self.assertIn("talang", flags_text.lower())
        self.assertNotIn("flagga av typ", flags_text)
        # Och den ska finnas i den rankade handlingslistan
        ranked = model["ranked_actions"]
        wb = next((a for a in ranked if "välmående" in a["label"].lower()), None)
        self.assertIsNotNone(wb)
        self.assertIn("målgrupp", wb["why"])


class ConfidenceNoteTest(unittest.TestCase):
    """F5: riktningsinstabilitet surfas som konfidensnot per dimension."""

    def test_direction_unstable_adds_note(self):
        note = tgr._confidence_note({"perceived": {"confidence": 0.9, "direction_stable": False}})
        self.assertIsNotNone(note)
        self.assertIn("skiftade riktning", note)

    def test_direction_stable_no_note(self):
        note = tgr._confidence_note({"perceived": {"confidence": 0.9, "direction_stable": True}})
        self.assertIsNone(note)

    def test_not_visible_never_notes(self):
        note = tgr._confidence_note({"perceived": {"status": "not_visible", "direction_stable": False}})
        self.assertIsNone(note)

    def test_low_conf_and_direction_combine(self):
        note = tgr._confidence_note({"perceived": {"confidence": 0.0, "direction_stable": False}})
        self.assertIn("osäkert underlag", note)
        self.assertIn("skiftade riktning", note)


if __name__ == "__main__":
    unittest.main()
