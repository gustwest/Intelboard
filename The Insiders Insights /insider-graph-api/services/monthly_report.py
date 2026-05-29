"""GEO-riskloop, skiva 3 — månadsrapporten (värdebeviset).

Se docs/hallucination-loop-spec.md §10–§11. Bygger en render-modell ur det skiva 1–2
redan persisterat (findings, korrigeringar) plus polling-parity, persisterar den i
clients/{cid}/monthly_reports/{YYYY-MM} (rapportens fysiska plats i systemet), och
renderar en HTML-vy för påsyn. Read-modell-mönstret speglar schema_org/profile_page.

Skiva 3 mäter nuläget; *effekt över tid* (resolved-detektering, full trend) är skiva 4.
Vi tar ändå med föregående månads Risk Exposure som en lätt trend-ingång.
"""
from __future__ import annotations

import html
import json
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

import firestore_client as fs
from services import llm as llm_factory
from services import trust_gap_report

log = logging.getLogger(__name__)

# Severity → vikt i Risk Exposure (§6: severity-vägd andel svar med en skademodell).
SEVERITY_WEIGHTS = {"high": 3, "medium": 2, "low": 1}

# Beslutssäkerhet är en GRADERAD resa, inte binärt bra/dåligt. Stegen är namngivna
# och har INGEN slutpunkt "Perfekt/Klar" — den högsta nivån implicerar fortsatt arbete.
GEO_STAGES = [(0, "Tidigt läge"), (40, "På väg"), (60, "God grund"), (75, "Stark"), (90, "Mycket stark")]
# Taket hålls medvetet under 100: GEO är aldrig "klart" (motorerna ändras), så gapet
# till idealet ska alltid vara synligt — aldrig "helt i mål".
CONFIDENCE_CEILING = 95
# Tunn mätning ≠ stark: utan svar från alla tre personas kan man inte nå över "God grund".
COVERAGE_CEILING = 74
PERSONAS = ("buyer", "candidate", "investor")
PERSONA_SV = {"buyer": "Köpare", "candidate": "Kandidat", "investor": "Investerare"}
HARM_SV = {
    "#1": "Förväxling", "#2": "Inaktuellt negativ", "#3": "Hallucinerat negativ",
    "#4": "Konkurrentförskjutning", "#5": "Skadlig tystnad", "#6": "Negativ inramning",
}
_MONTHS_SV = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
]


def current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# --- Render-modell ------------------------------------------------------------


def build_report_model(client_id: str, month: str | None = None) -> dict[str, Any] | None:
    """Bygg månadsrapportens render-modell (utan generated_at — den sätts vid persist)."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("månadsrapport: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}
    month = month or current_month()

    findings = list(fs.iter_risk_findings(client_id))
    open_f = [d for _i, d in findings if d.get("status") in (None, "open")]
    actioned_f = [d for _i, d in findings if d.get("status") == "actioned"]
    resolved_f = [d for _i, d in findings if d.get("status") == "resolved"]

    summary_snap = fs.risk_run_summary_doc(client_id).get()
    summary = summary_snap.to_dict() if summary_snap.exists else {}
    answers_by_persona = (summary or {}).get("answers_by_persona") or {}

    risk_exposure = _exposure(open_f, answers_by_persona)
    detected = sorted(
        (_finding_row(d) for d in open_f + actioned_f),
        key=lambda r: SEVERITY_WEIGHTS.get(r["severity"], 0), reverse=True,
    )
    actions = [_action_row(d) for d in actioned_f]
    confidence = _decision_confidence(open_f, answers_by_persona)
    trend = _trend(client_id, month, confidence.get("score"), len(resolved_f))
    parity = _latest_parity(client_id)

    return {
        "month": month,
        "client_id": client_id,
        "company_name": client.get("company_name") or client_id,
        "is_draft": True,  # internt utkast — färdigställs utanför verktyget
        "decision_confidence": confidence,
        "verdict": _verdict(confidence, open_f, answers_by_persona),
        "risk_exposure": risk_exposure,
        "parity_index": parity,
        "strengths": _strengths(open_f, actioned_f, resolved_f, answers_by_persona, parity),
        "improvement_opportunities": _improvements(open_f, answers_by_persona),
        "detected": detected,
        "actions": actions,
        "resolved": {"count": len(resolved_f), "items": [_finding_row(d) for d in resolved_f]},
        "trend": trend,
        # Humaniseringstäckning som SEKTION i samma rapport (spec §10). None om trust_gap
        # ej beräknad än — sektionen visar då en upplysning, inte tomhet.
        "humanization": trust_gap_report.build_report_model(client_id),
    }


def _decision_confidence(open_findings: list[dict], answers_by_persona: dict[str, int]) -> dict[str, Any]:
    """Graderad beslutssäkerhet (högre=bättre) på en 0–100-resa med namngivna nivåer.
    Inte binärt bra/dåligt: taket hålls under 100 (GEO blir aldrig 'klart') och tunn
    täckning kan inte nå toppskiktet. Risk Exposure (lägre=bättre) kvar som undermått."""
    total = sum(int(v or 0) for v in answers_by_persona.values())
    if not total:
        return {"score": None, "stage": "Ej mätt", "headroom": None, "answers": 0, "safe": 0,
                "covered_personas": 0, "ceiling": CONFIDENCE_CEILING,
                "next_step": "Generera och godkänn ett frågebatteri för att mäta bilden."}
    safe = max(0, total - len(open_findings))
    raw = 100 * safe / total
    covered = sum(1 for p in PERSONAS if answers_by_persona.get(p))
    ceiling = CONFIDENCE_CEILING if covered == len(PERSONAS) else min(CONFIDENCE_CEILING, COVERAGE_CEILING)
    score = round(min(raw, ceiling))
    return {
        "score": score,
        "stage": _stage(score),
        "headroom": ceiling - score,
        "answers": total,
        "safe": safe,
        "covered_personas": covered,
        "ceiling": ceiling,
        "next_step": _next_step(score, ceiling),
    }


def _stage(score: int) -> str:
    name = GEO_STAGES[0][1]
    for threshold, label in GEO_STAGES:
        if score >= threshold:
            name = label
    return name


def _next_step(score: int, ceiling: int) -> str:
    """Alltid en framåtblick — aldrig 'i mål'. Pekar på närmaste nivå, på täckning som
    blockerar, eller (i toppskiktet) på att bevaka/försvara."""
    for threshold, name in GEO_STAGES:
        if threshold > score:
            if threshold > ceiling:
                return f"Bredda mätningen över alla tre personas för att kunna nå nivån {name}."
            return f"{threshold - score} enheter till nivån {name}."
    if score < ceiling:
        return (f"{ceiling - score} enheter kvar i toppskiktet — och fortsatt bevakning, "
                "eftersom AI-motorerna ständigt ändras.")
    return ("Toppskiktet är nått för stunden — fokus skiftar till att bevaka och försvara, "
            "eftersom AI-motorerna ständigt ändras (aldrig helt 'i mål').")


def _verdict(confidence: dict, open_findings: list[dict], answers_by_persona: dict[str, int]) -> str:
    if not confidence.get("answers"):
        return "Inga beslutskritiska frågor har körts ännu — generera och godkänn ett frågebatteri för att mäta bilden."
    base = (
        f"I {confidence['safe']} av {confidence['answers']} beslutskritiska frågor ger "
        "AI-motorerna idag en korrekt och rättvis bild av er."
    )
    worst = _worst_persona(open_findings)
    if worst:
        base += f" Den största kvarvarande risken ligger mot {PERSONA_SV.get(worst, worst).lower()}."
    return base


def _worst_persona(open_findings: list[dict]) -> str | None:
    weighted: dict[str, int] = {}
    for d in open_findings:
        p = d.get("persona")
        if p:
            weighted[p] = weighted.get(p, 0) + SEVERITY_WEIGHTS.get(d.get("severity"), 1)
    return max(weighted, key=weighted.get) if weighted else None


def _strengths(open_findings, actioned, resolved, answers_by_persona, parity) -> list[str]:
    """Uppsidan — vad som faktiskt fungerar. Ärligt, bara där data stödjer det."""
    out: list[str] = []
    if resolved:
        out.append(f"{len(resolved)} tidigare risk(er) är lösta — motorerna svarar nu säkert på dem.")
    total = sum(int(v or 0) for v in answers_by_persona.values())
    safe = max(0, total - len(open_findings))
    if total and safe:
        out.append(f"I {safe} av {total} beslutskritiska frågor svarar motorerna redan korrekt och rättvist.")
    open_personas = {d.get("persona") for d in open_findings}
    for p in PERSONAS:
        if answers_by_persona.get(p) and p not in open_personas:
            out.append(f"Mot {PERSONA_SV[p].lower()} surfar ni korrekt — inga öppna risker den här månaden.")
    if parity is not None and parity >= 0.8:
        out.append(f"Könsbalansen i porträtteringen är god (Parity Index {parity}).")
    if actioned:
        out.append(f"{len(actioned)} risk(er) har redan mötts med källförsedda korrigeringar.")
    return out


def _improvements(open_findings, answers_by_persona) -> list[str]:
    """Förbättringsmöjligheter — INVARIANT icke-tom (aldrig 'allt perfekt')."""
    out: list[str] = []
    if open_findings:
        high = sum(1 for d in open_findings if d.get("severity") == "high")
        msg = f"{len(open_findings)} öppna risker att möta med källförsedd kontext"
        out.append(msg + (f", varav {high} med hög allvarlighetsgrad." if high else "."))
    for p in PERSONAS:
        if not answers_by_persona.get(p):
            out.append(
                f"Spåret mot {PERSONA_SV[p].lower()} är ännu otäckt — generera och godkänn "
                "frågor för att mäta den risken."
            )
    # Alltid sist: håller sektionen icke-tom även när allt annat ser bra ut.
    out.append(
        "AI-motorerna uppdateras kontinuerligt — fortsatt månatlig bevakning krävs för att "
        "hålla bilden korrekt över tid."
    )
    return out


def _exposure(open_findings: list[dict], answers_by_persona: dict[str, int]) -> dict[str, Any]:
    """Severity-vägd andel svar med skademodell, per persona och totalt. Andel kräver
    en denominator (körningens svar); saknas den redovisas vikten utan andel (score=None)."""
    weighted = {p: 0 for p in PERSONAS}
    for d in open_findings:
        p = d.get("persona")
        if p in weighted:
            weighted[p] += SEVERITY_WEIGHTS.get(d.get("severity"), 1)

    per_persona = {}
    for p in PERSONAS:
        denom = int(answers_by_persona.get(p, 0) or 0)
        per_persona[p] = {
            "weighted": weighted[p],
            "answers": denom,
            "score": round(weighted[p] / denom, 3) if denom else None,
        }
    total_weighted = sum(weighted.values())
    total_answers = sum(int(v or 0) for v in answers_by_persona.values())
    return {
        "per_persona": per_persona,
        "total": {
            "weighted": total_weighted,
            "answers": total_answers,
            "score": round(total_weighted / total_answers, 3) if total_answers else None,
        },
    }


def _finding_row(d: dict) -> dict[str, Any]:
    return {
        "persona": d.get("persona"),
        "question": d.get("question"),
        "engine": d.get("engine"),
        "harm": d.get("harm"),
        "severity": d.get("severity"),
        "engine_excerpt": d.get("engine_excerpt"),
        "status": d.get("status") or "open",
        "via_follow_up": bool(d.get("via_follow_up")),
    }


def _action_row(d: dict) -> dict[str, Any]:
    return {
        "persona": d.get("persona"),
        "question": d.get("question"),
        "harm": d.get("harm"),
        "action_taken": d.get("action_taken"),
        "ammo_claim_ids": d.get("ammo_claim_ids") or [],
        "action_at": _iso(d.get("action_at")),
    }


def _latest_parity(client_id: str) -> float | None:
    """GEO Parity Index ur senaste polling-veckan — redovisas separat, ej i scoren (§7)."""
    latest, latest_week = None, ""
    for snap in fs.polling_results_col(client_id).stream():
        if snap.id > latest_week:
            data = snap.to_dict() or {}
            latest, latest_week = data.get("parity_index"), snap.id
    return latest


def _trend(client_id: str, month: str, current_score: int | None, resolved_count: int) -> dict[str, Any]:
    """Effekt över tid (§8.4): beslutssäkerhet månad-för-månad (serie + delta mot närmast
    föregående) plus antal lösta risker. Trenden — inte ett kausalitetspåstående — är beviset."""
    history = []
    prev_id, prev_score = "", None
    for rid, data in fs.iter_monthly_reports(client_id):
        if rid >= month:  # hoppa över ev. redan persisterad körning för samma månad
            continue
        score = (data.get("decision_confidence") or {}).get("score")
        history.append({"month": rid, "score": score})
        if rid > prev_id:
            prev_id, prev_score = rid, score
    series = sorted(history, key=lambda x: x["month"]) + [{"month": month, "score": current_score}]
    delta = None
    if current_score is not None and prev_score is not None:
        delta = current_score - prev_score
    return {
        "previous_month": prev_id or None,
        "previous_score": prev_score,
        "delta": delta,
        "resolved_count": resolved_count,
        "series": series,
    }


# --- Persistens + jobb --------------------------------------------------------


def run(client_id: str, month: str | None = None) -> dict[str, Any] | None:
    """Bygg + persistera månadsrapporten. Idempotent per (kund, månad). Lägger på ett
    opus-genererat narrativt utkast (om LLM finns) ovanpå den strukturerade modellen."""
    model = build_report_model(client_id, month)
    if model is None:
        return None
    model["draft_narrative"] = generate_narrative_draft(model)
    stored = dict(model)
    stored["generated_at"] = firestore.SERVER_TIMESTAMP
    fs.monthly_report_doc(client_id, model["month"]).set(stored)
    log.info("månadsrapport %s/%s persisterad (narrativ: %s)",
             client_id, model["month"], "ja" if model["draft_narrative"] else "nej")
    # Affärshändelse → kund-tidslinjen (lazy import: undvik jobs↔services-cykel).
    try:
        from jobs._run_tracker import log_event

        log_event("report_generated", client_id, {
            "month": model["month"],
            "score": (model.get("decision_confidence") or {}).get("score"),
        })
    except Exception:  # noqa: BLE001
        log.debug("kunde inte logga report_generated-händelse", exc_info=True)
    return model


# --- Narrativt utkast (opus, för påsyn) ---------------------------------------

_NARRATIVE_SYSTEM = """Du är en senior GEO-analytiker som skriver ett INTERNT UTKAST till
ditt eget team. Teamet synar utkastet och skriver sedan den färdiga rapporten till
kundens LEDNINGSGRUPP (icke-tekniska personer) utanför verktyget. Skriv på svenska, i
klartext en ledningsgrupp förstår — undvik jargong och interna koder.

Strukturera narrativet så att det för varje viktig risk förklarar: VAD AI-motorn svarar,
VARFÖR det skadar just den personan (köpare/kandidat/investerare), VILKEN konsekvens det
kan få för ett beslut, och VAD som sannolikt förbättrar det. Lyft även STYRKORNA (det som
fungerar). Avsluta ALLTID med förbättringsmöjligheter — påstå aldrig att allt är perfekt.

Regler:
- Hävda ALDRIG kausalitet ("vi fick ChatGPT att ändra sig"). Skriv "ökar sannolikheten",
  aldrig garanti.
- Exponera inget känsligt om kund eller tredje part.
- Bygg ENBART på underlaget nedan — hitta inte på fakta.
Returnera ENDAST JSON: {"narrative":"...text i markdown..."}"""


def generate_narrative_draft(model: dict[str, Any], llm=None) -> str | None:
    """Ett aggregerat opus-anrop → narrativt utkast ur den strukturerade modellen.
    No-op (None) utan LLM. Module-seam → patchas i tester."""
    llm = llm or llm_factory.make_validator()
    if llm is None:
        return None
    payload = json.dumps(_narrative_context(model), ensure_ascii=False)
    data = llm_factory.invoke_json(llm, _NARRATIVE_SYSTEM, payload)
    narrative = (data or {}).get("narrative")
    return narrative.strip() if isinstance(narrative, str) and narrative.strip() else None


def _narrative_context(model: dict[str, Any]) -> dict[str, Any]:
    """Trimmat, klartext-märkt underlag till narrativ-prompten (skademodeller i ord)."""
    return {
        "företag": model.get("company_name"),
        "månad": model.get("month"),
        "beslutssäkerhet": model.get("decision_confidence"),
        "sammanfattning": model.get("verdict"),
        "parity_index": model.get("parity_index"),
        "styrkor": model.get("strengths"),
        "förbättringsmöjligheter": model.get("improvement_opportunities"),
        "detekterade_risker": [
            {
                "persona": PERSONA_SV.get(r.get("persona"), r.get("persona")),
                "fråga": r.get("question"),
                "motor": r.get("engine"),
                "skademodell": _harm_label(r.get("harm")),
                "allvarlighetsgrad": r.get("severity"),
                "motorn_sa": r.get("engine_excerpt"),
                "status": r.get("status"),
            }
            for r in (model.get("detected") or [])
        ],
        "åtgärder": model.get("actions"),
        "lösta_risker": (model.get("resolved") or {}).get("count", 0),
        "trend": model.get("trend"),
        "humaniseringstäckning": _humanization_context(model.get("humanization")),
    }


def _humanization_context(h: dict[str, Any] | None) -> dict[str, Any] | None:
    """Trimmat humaniserings-underlag till narrativet — bara den redan översatta klartexten,
    aldrig råa 0–1-tal (grundprincip 7)."""
    if not h:
        return None
    return {
        "täckning": h.get("coverage_plain"),
        "att_göra": [f"{a['label']}: {a['why']} {a['action']}" for a in h.get("ranked_actions") or []],
        "möjligheter_och_risker": h.get("opportunities_and_risks"),
    }


# --- HTML-vy (för påsyn) ------------------------------------------------------


def render_report_html(report: dict[str, Any]) -> str:
    name = html.escape(report.get("company_name") or "")
    month = report.get("month") or ""
    exp = report.get("risk_exposure") or {}
    total = (exp.get("total") or {})
    parity = report.get("parity_index")

    persona_rows = "".join(
        f"<tr><td>{PERSONA_SV.get(p, p)}</td><td class='num'>{_fmt_score(v.get('score'))}</td>"
        f"<td class='num'>{v.get('weighted', 0)}</td><td class='num'>{v.get('answers', 0)}</td></tr>"
        for p, v in (exp.get("per_persona") or {}).items()
    )
    detected_rows = "".join(
        f"<tr><td>{PERSONA_SV.get(r.get('persona'), r.get('persona') or '')}</td>"
        f"<td>{html.escape(r.get('question') or '')}</td>"
        f"<td>{html.escape(r.get('engine') or '')}</td>"
        f"<td>{_harm_label(r.get('harm'))}{' ↻' if r.get('via_follow_up') else ''}</td>"
        f"<td>{html.escape(r.get('severity') or '')}</td>"
        f"<td>{html.escape((r.get('engine_excerpt') or '')[:240])}</td>"
        f"<td>{html.escape(r.get('status') or '')}</td></tr>"
        for r in (report.get("detected") or [])
    ) or "<tr><td colspan='7'>Inga detekterade risker.</td></tr>"
    action_rows = "".join(
        f"<tr><td>{PERSONA_SV.get(a.get('persona'), a.get('persona') or '')}</td>"
        f"<td>{html.escape(a.get('question') or '')}</td>"
        f"<td>{_harm_label(a.get('harm'))}</td>"
        f"<td>{html.escape(a.get('action_taken') or '')}</td>"
        f"<td>{html.escape(', '.join(a.get('ammo_claim_ids') or []))}</td>"
        f"<td>{html.escape(a.get('action_at') or '')}</td></tr>"
        for a in (report.get("actions") or [])
    ) or "<tr><td colspan='6'>Inga åtgärder ännu.</td></tr>"

    trend = report.get("trend") or {}
    resolved_count = trend.get("resolved_count", 0)
    resolved_line = (
        f"<p><strong>{resolved_count} risk(er) lösta</strong> — motorerna svarar nu säkert "
        "på frågor som tidigare gav fel. Det (inte ett kausalitetspåstående) är beviset.</p>"
        if resolved_count else ""
    )
    if trend.get("previous_month"):
        d = trend.get("delta")
        arrow = "→ oförändrad"
        if d is not None:
            arrow = f"▲ +{d} (förbättrad)" if d > 0 else (f"▼ {d} (försämrad)" if d < 0 else "→ oförändrad")
        series_txt = " → ".join(
            f"{html.escape(s['month'])}: {_fmt_int(s.get('score'))}" for s in (trend.get("series") or [])
        )
        trend_html = (
            f"<p>Beslutssäkerhet {html.escape(trend.get('previous_month') or '')} "
            f"→ {html.escape(month)}: {_fmt_int(trend.get('previous_score'))} → "
            f"{_fmt_int((report.get('decision_confidence') or {}).get('score'))} <strong>{arrow}</strong></p>"
            f"{resolved_line}"
            f"<p class='note'>Serie: {series_txt}</p>"
            "<p class='note'>Ökar sannolikheten att motorerna svarar rätt — ingen garanti.</p>"
        )
    else:
        trend_html = (
            resolved_line
            + "<p class='note'>Första rapporten — månad-för-månad-trend visas från och med nästa körning.</p>"
        )

    conf = report.get("decision_confidence") or {}
    verdict = html.escape(report.get("verdict") or "")
    narrative = report.get("draft_narrative")
    narrative_html = (
        f"<h2>Övergripande utkast (AI-genererat, oredigerat)</h2>"
        f"<pre class='draft'>{html.escape(narrative)}</pre>"
        if narrative
        else "<p class='note'>Narrativt utkast genereras vid körning (kräver LLM).</p>"
    )
    strengths_html = _ul(report.get("strengths"), "Inga utmärkande styrkor uppmätta ännu.")
    improvements_html = _ul(report.get("improvement_opportunities"), "")
    resolved_items = (report.get("resolved") or {}).get("items") or []
    if resolved_items:
        trend_html += _ul(
            [f"{PERSONA_SV.get(r.get('persona'), r.get('persona') or '')}: {r.get('question')}"
             for r in resolved_items],
            "",
        )

    return f"""<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<title>GEO-riskrapport (utkast) — {name} {html.escape(month)}</title>
<style>
 body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}}
 h1{{font-size:1.5rem}} h2{{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #eee;padding-bottom:.3rem}}
 table{{border-collapse:collapse;width:100%;font-size:.9rem;margin-top:.5rem}}
 th,td{{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #eee;vertical-align:top}}
 th{{color:#555;font-weight:600}} .num{{text-align:right;font-variant-numeric:tabular-nums}}
 .score{{font-size:2rem;font-weight:700}} .note{{color:#777;font-size:.85rem}}
 .banner{{background:#fff6e0;border:1px solid #f0d990;border-radius:6px;padding:.6rem .8rem;font-size:.9rem}}
 .draft{{white-space:pre-wrap;background:#f7f7f8;border:1px solid #eee;border-radius:6px;padding:1rem;font-family:inherit;font-size:.92rem;line-height:1.5}}
 ul{{margin:.4rem 0;padding-left:1.2rem}} li{{margin:.2rem 0}}
 .bar{{position:relative;height:14px;background:#eee;border-radius:7px;margin:.4rem 0 .2rem}}
 .bar > i{{position:absolute;left:0;top:0;height:100%;border-radius:7px;background:linear-gradient(90deg,#e6a23c,#67c23a)}}
 .bar > b{{position:absolute;top:-3px;width:2px;height:20px;background:#c0392b}}
 .scale-labels{{display:flex;justify-content:space-between;font-size:.72rem;color:#999}}
 .toolbar{{display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin:0 0 1rem}}
 .toolbar button{{font:inherit;padding:.4rem .9rem;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:.85rem;color:#333}}
 .toolbar button:hover{{background:#f5f5f5}}
 @media print {{
   body{{max-width:none;margin:0;padding:1rem;color:#000;font-size:11pt}}
   .toolbar{{display:none}}
   .banner{{background:#fff;border:1px dashed #999;color:#444;font-size:.8rem}}
   h2{{break-after:avoid;page-break-after:avoid;margin-top:1.4rem}}
   table{{break-inside:auto;page-break-inside:auto}}
   tr{{break-inside:avoid;page-break-inside:avoid}}
   .draft{{break-inside:avoid;page-break-inside:avoid}}
   .note{{color:#555}}
   a{{color:#000;text-decoration:none}}
 }}
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()">Skriv ut / Spara som PDF</button>
</div>
<p class="banner"><strong>Internt utkast.</strong> Synas av teamet och färdigställs som
ledningsgruppsrapport utanför verktyget. Inga kausalitetspåståenden — formuleringen är
"ökar sannolikheten", inte garanti.</p>
<h1>GEO-riskrapport — {name}</h1>
<p class="note">{_month_label(month)}</p>

<h2>Beslutssäkerhet</h2>
<p class="score">{_fmt_int(conf.get('score'))}/100 <span class="note">· {html.escape(conf.get('stage') or '—')}</span></p>
{_scale_bar(conf)}
<p>{verdict}</p>
<p><strong>Nästa steg:</strong> {html.escape(conf.get('next_step') or '')}</p>
<p class="note">Graderad skala 0–100 (högre är bättre). Toppen (100) hålls medvetet öppen —
GEO är aldrig "klart" eftersom AI-motorerna ständigt uppdateras. Tekniskt undermått
Risk Exposure: {_fmt_score(total.get('score'))} (lägre är bättre).
GEO Parity Index (separat): {_fmt_score(parity)}.</p>
<table><thead><tr><th>Persona</th><th class="num">Risk Exposure</th><th class="num">Vägt</th><th class="num">Svar</th></tr></thead>
<tbody>{persona_rows}</tbody></table>

<h2>Styrkor (uppsida)</h2>
{strengths_html}

{narrative_html}

<h2>Detekterade risker</h2>
<table><thead><tr><th>Persona</th><th>Fråga</th><th>Motor</th><th>Skademodell</th><th>Allvar</th><th>Motorn sa</th><th>Status</th></tr></thead>
<tbody>{detected_rows}</tbody></table>

<h2>Vad vår mjukvara gjorde</h2>
<table><thead><tr><th>Persona</th><th>Fråga</th><th>Skademodell</th><th>Åtgärd</th><th>Ammunition (claims)</th><th>Datum</th></tr></thead>
<tbody>{action_rows}</tbody></table>

<h2>Förbättringsmöjligheter</h2>
{improvements_html}

<h2>Effekt över tid</h2>
{trend_html}

<h2>Humaniseringstäckning</h2>
<p class="note">Hur mänskligt och värdedrivet ni framstår för AI — men bara i den mån det går att belägga.
Påstått och bevisat hålls isär; perception vägs aldrig in i poängen.</p>
{trust_gap_report.render_fragment(report.get("humanization"))}
</body></html>"""


def _scale_bar(conf: dict) -> str:
    """Visuell graderad skala: fyllnad = score, röd markör = taket (aldrig 100)."""
    score = conf.get("score")
    if score is None:
        return ""
    ceiling = conf.get("ceiling") or CONFIDENCE_CEILING
    labels = "".join(f"<span>{html.escape(name)}</span>" for _t, name in GEO_STAGES)
    return (
        f"<div class='bar'><i style='width:{score}%'></i>"
        f"<b style='left:{ceiling}%' title='Tak — toppen hålls öppen'></b></div>"
        f"<div class='scale-labels'>{labels}<span>100</span></div>"
    )


def _ul(items: list | None, empty: str) -> str:
    items = items or []
    if not items:
        return f"<p class='note'>{html.escape(empty)}</p>" if empty else ""
    return "<ul>" + "".join(f"<li>{html.escape(str(i))}</li>" for i in items) + "</ul>"


def _fmt_int(v: Any) -> str:
    return "—" if v is None else str(v)


def _fmt_score(s: Any) -> str:
    return "—" if s is None else f"{s:.3f}".rstrip("0").rstrip(".")


def _harm_label(harm: Any) -> str:
    return f"{harm} {HARM_SV.get(harm, '')}".strip() if harm else ""


def _month_label(month: str) -> str:
    try:
        y, m = month.split("-")
        return f"{_MONTHS_SV[int(m) - 1]} {y}"
    except (ValueError, IndexError):
        return month


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
