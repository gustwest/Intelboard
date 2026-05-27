"""Humaniseringstäckning — rapport ovanpå trust_gap (spec §10, §10.1, §5.6).

Rapporten ÄR översättningslagret (grundprincip 7): inga interna facktermer eller råa
0–1-tal når mottagaren. Varje rad blir klartext + vad man kan GÖRA; låg konfidens →
"vi flaggar, inte bedömer"; låg salience → "AI vet ännu nästan inget" (ej dåligt betyg).
Råvärden bevaras i `raw` för den som vill gräva (appendix), aldrig i huvudtexten.

Snapshot (§5.6): run() fryser en daterad, immutabel kopia → ger trendlinjen.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from schema_org import humanization_config as hc

log = logging.getLogger(__name__)

_GAP = hc.GAP_MAGNITUDE_MIN  # tröskel för "varmare/svalare än underlaget"


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# --- Begriplighetslager (§10.1) ----------------------------------------------

def _evidence_plain(e: dict[str, Any]) -> str:
    declared, demo = e.get("declared", 0), e.get("demonstrated", 0)
    if demo >= 0.5:
        return "Det här kan ni belägga med starkt, verifierat underlag."
    if demo > 0:
        return "Ni har visst belagt underlag, men mer finns att verifiera."
    if declared:
        return "Det här säger ni om er själva, men det är ännu inte belagt med underlag."
    return "Här saknas både utsaga och underlag."


def _perception_plain(e: dict[str, Any]) -> str:
    p = e.get("perceived") or {}
    if p.get("status") == "not_visible":
        return "AI vet ännu nästan inget om er här — det handlar om synlighet, inte dåligt omdöme."
    cred = e.get("credibility_gap")
    if cred is None:
        return "AI känner till er, men vi har inget tydligt omdöme att tolka än."
    if cred > _GAP:
        return "AI beskriver er varmare än ert underlag styrker — en risk om någon synar det."
    if cred < -_GAP:
        return "Ni gör mer än vad som syns utåt — en möjlighet att berätta tydligare."
    return "AI:s bild och ert underlag ligger ungefär i linje."


def _action_plain(label: str, e: dict[str, Any]) -> str:
    declared, demo = e.get("declared", 0), e.get("demonstrated", 0)
    cred = e.get("credibility_gap")
    if demo == 0 and declared:
        return f"Skaffa verifierbart underlag för {label} — i dag är det bara er egen utsaga."
    if demo == 0 and not declared:
        return f"Börja med att synliggöra vad ni faktiskt gör inom {label}."
    if cred is not None and cred > _GAP:
        return f"Säkra mer bevis för {label} så att bilden håller om någon synar den."
    if cred is not None and cred < -_GAP:
        return f"Berätta tydligare om {label} — ni gör mer än som syns utåt."
    return f"Fortsätt belägga {label} med färska, oberoende underlag."


def _confidence_note(e: dict[str, Any]) -> str | None:
    p = e.get("perceived") or {}
    if p.get("status") == "not_visible":
        return None
    conf = p.get("confidence")
    if conf is not None and conf < hc.FLAG_CONFIDENCE_MIN:
        return "För osäkert underlag för att dra slutsats — vi flaggar, inte bedömer."
    return None


def _flag_plain(flag: dict[str, Any]) -> str:
    label = hc.DIMENSIONS.get(flag.get("dimension"), flag.get("dimension"))
    if flag.get("kind") == "over_claim":
        return f"{label}: AI beskriver er varmare än ni kan belägga — en trovärdighetsrisk att täppa."
    return f"{label}: ni gör mer än som syns utåt — en möjlighet att berätta."


# --- Modell -------------------------------------------------------------------

def build_report_model(client_id: str) -> dict[str, Any] | None:
    """Översätt trust_gap till en begriplig modell. None om trust_gap ej beräknad än."""
    snap = fs.trust_gap_doc(client_id).get()
    if not getattr(snap, "exists", False):
        log.info("ingen trust_gap för %s — kör compute_trust_gap först", client_id)
        return None
    data = snap.to_dict() or {}
    client = fs.client_doc(client_id).get().to_dict() or {}

    dimensions = []
    for d, label in hc.DIMENSIONS.items():
        e = (data.get("dimensions") or {}).get(d, {})
        dimensions.append({
            "dimension": d,
            "label": label,
            "evidence_plain": _evidence_plain(e),
            "perception_plain": _perception_plain(e),
            "action": _action_plain(label, e),
            "confidence_note": _confidence_note(e),
            "raw": {  # appendix — för den som vill gräva, aldrig i huvudtexten
                "declared": e.get("declared"), "demonstrated": e.get("demonstrated"),
                "score": e.get("score"), "credibility_gap": e.get("credibility_gap"),
                "perceived": e.get("perceived"),
            },
        })

    cov = data.get("coverage") or {}
    coverage_plain = (
        f"Ni har satt ord på {cov.get('declared', 0)} av {cov.get('of', 6)} områden, "
        f"och kan belägga {cov.get('demonstrated', 0)} av {cov.get('of', 6)} med verifierat underlag."
    )
    return {
        "date": today(),
        "client_id": client_id,
        "company_name": client.get("company_name") or client_id,
        "is_draft": True,
        "coverage_plain": coverage_plain,
        "dimensions": dimensions,
        "opportunities_and_risks": [_flag_plain(f) for f in (data.get("flags") or [])],
        "trend": _trend(client_id, data),
        "raw": {  # appendix
            "overall_score": data.get("overall_score"),
            "coverage": cov,
            "computed_at": data.get("computed_at"),
        },
    }


def _trend(client_id: str, current: dict[str, Any]) -> dict[str, Any]:
    """Diff mot senaste tidigare snapshot — täckningen är trenden (ej ett kausalitetspåstående)."""
    prev_id, prev = "", None
    for sid, data in fs.iter_trust_gap_snapshots(client_id):
        if sid > prev_id:
            prev_id, prev = sid, data
    if not prev:
        return {"previous_date": None, "note": "Första rapporten — trend visas från nästa körning."}
    pcov = (prev.get("raw") or {}).get("coverage") or (prev.get("coverage") or {})
    ccov = current.get("coverage") or {}
    return {
        "previous_date": prev_id,
        "demonstrated_delta": (ccov.get("demonstrated", 0) - (pcov.get("demonstrated", 0))),
        "declared_delta": (ccov.get("declared", 0) - (pcov.get("declared", 0))),
    }


# --- Snapshot + jobb ----------------------------------------------------------

def run(client_id: str, date: str | None = None) -> dict[str, Any] | None:
    """Frys en daterad, immutabel snapshot (§5.6): trust_gap + den begripliga modellen."""
    model = build_report_model(client_id)
    if model is None:
        return None
    date = date or model["date"]
    tg = fs.trust_gap_doc(client_id).get().to_dict() or {}
    fs.trust_gap_snapshot_doc(client_id, date).set({
        "date": date,
        "trust_gap": tg,          # rådata-kopia (revisionsspår/trend)
        "report": model,          # den begripliga renderingen
        "coverage": tg.get("coverage"),
    })
    log.info("trust_gap-snapshot %s/%s sparad", client_id, date)
    return model


# --- HTML-vy (för påsyn) ------------------------------------------------------

def render_report_html(model: dict[str, Any]) -> str:
    name = html.escape(model.get("company_name") or "")
    rows = ""
    for d in model["dimensions"]:
        note = f"<p class='note'>{html.escape(d['confidence_note'])}</p>" if d.get("confidence_note") else ""
        rows += (
            f"<div class='dim'><h3>{html.escape(d['label'])}</h3>"
            f"<p>{html.escape(d['evidence_plain'])}</p>"
            f"<p>{html.escape(d['perception_plain'])}</p>"
            f"<p class='act'><strong>Att göra:</strong> {html.escape(d['action'])}</p>{note}</div>"
        )
    flags = "".join(f"<li>{html.escape(x)}</li>" for x in model.get("opportunities_and_risks") or [])
    flags_html = f"<ul>{flags}</ul>" if flags else "<p class='note'>Inga särskilda möjligheter eller risker att lyfta.</p>"
    return f"""<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>Humaniseringstäckning (utkast) — {name}</title>
<style>body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}}
h1{{font-size:1.5rem}} h3{{margin:.2rem 0;font-size:1.05rem}} .dim{{border-bottom:1px solid #eee;padding:.8rem 0}}
.act{{color:#1a5}} .note{{color:#777;font-size:.85rem}}
.banner{{background:#fff6e0;border:1px solid #f0d990;border-radius:6px;padding:.6rem .8rem;font-size:.9rem}}</style></head><body>
<p class="banner"><strong>Internt utkast.</strong> Färdigställs som ledningsgruppsrapport utanför verktyget.</p>
<h1>Humaniseringstäckning — {name}</h1>
<p>{html.escape(model.get('coverage_plain') or '')}</p>
<h2>Möjligheter & risker</h2>{flags_html}
<h2>Per område</h2>{rows}
</body></html>"""
