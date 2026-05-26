"""Riskloopens ESG-spår, skiva 3 — AI ESG Risk Score + rapport.

Aggregerar ESG-findings (services/esg_scanner) till ett "AI ESG Risk Score" (0–100 %,
HÖGRE = HÖGRE RISK) uppdelat på E, S och G, samt en render-modell för dashboarden.
Samma read-modell-/persistensmönster som services/monthly_report.py: bygg modell ur det
redan persisterade, persistera i clients/{id}/esg_reports/{YYYY-MM}, rendera HTML för påsyn.

Riskandelen kräver en denominator (körningens svar per pelare, esg_runs/latest). Saknas
den för en pelare redovisas score=None ("ej mätt") i stället för en falsk nolla.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

import firestore_client as fs

log = logging.getLogger(__name__)

PILLARS = ("E", "S", "G")
PILLAR_LABELS = {"E": "Miljö (E)", "S": "Socialt (S)", "G": "Styrning (G)"}
SEVERITY_WEIGHTS = {"high": 3, "medium": 2, "low": 1}
_MAX_SEVERITY = 3  # normaliserare: "high" på varje svar = 100 % risk
_MONTHS_SV = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
]


def current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# --- AI ESG Risk Score --------------------------------------------------------


def compute_risk_score(open_findings: list[dict], answers_by_pillar: dict[str, int]) -> dict[str, Any]:
    """0–100 % risk per pelare + overall (severity-vägd andel skadade svar). Högre=sämre."""
    per_pillar: dict[str, Any] = {}
    measured_scores: list[float] = []
    for p in PILLARS:
        denom = int(answers_by_pillar.get(p, 0) or 0)
        weighted = sum(SEVERITY_WEIGHTS.get(d.get("severity"), 1) for d in open_findings if d.get("pillar") == p)
        omissions = sum(1 for d in open_findings if d.get("pillar") == p and d.get("status") == "CRITICAL_OMISSION_RISK")
        reputation = sum(1 for d in open_findings if d.get("pillar") == p and d.get("status") == "HIGH_REPUTATION_RISK")
        if denom:
            score = round(min(100.0, 100.0 * weighted / (denom * _MAX_SEVERITY)), 1)
            measured_scores.append(score)
        else:
            score = None
        per_pillar[p] = {
            "score": score,
            "answers": denom,
            "weighted": weighted,
            "critical_omission": omissions,
            "high_reputation": reputation,
        }
    overall = round(sum(measured_scores) / len(measured_scores), 1) if measured_scores else None
    return {"per_pillar": per_pillar, "overall": overall}


# --- Render-modell ------------------------------------------------------------


def build_report_model(client_id: str, month: str | None = None) -> dict[str, Any] | None:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("ESG-rapport: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}
    month = month or current_month()

    findings = list(fs.iter_esg_findings(client_id))
    open_f = [d for _i, d in findings if d.get("review_status") in (None, "open")]
    actioned_f = [d for _i, d in findings if d.get("review_status") == "actioned"]

    summary_snap = fs.esg_run_summary_doc(client_id).get()
    summary = summary_snap.to_dict() if summary_snap.exists else {}
    answers_by_pillar = (summary or {}).get("answers_by_pillar") or {}

    risk_score = compute_risk_score(open_f, answers_by_pillar)
    detected = sorted(
        (_finding_row(d) for d in open_f + actioned_f),
        key=lambda r: SEVERITY_WEIGHTS.get(r["severity"], 0), reverse=True,
    )
    return {
        "month": month,
        "client_id": client_id,
        "company_name": client.get("company_name") or client_id,
        "is_draft": True,  # internt utkast — färdigställs utanför verktyget
        "risk_score": risk_score,
        "detected": detected,
        "actioned_count": len(actioned_f),
        "improvement_opportunities": _improvements(open_f, answers_by_pillar),
    }


def _finding_row(d: dict) -> dict[str, Any]:
    return {
        "pillar": d.get("pillar"),
        "question": d.get("question"),
        "engine": d.get("engine"),
        "status": d.get("status"),
        "severity": d.get("severity") or "",
        "sentiment": d.get("sentiment"),
        "engine_excerpt": d.get("engine_excerpt"),
        "review_status": d.get("review_status") or "open",
    }


def _improvements(open_findings: list[dict], answers_by_pillar: dict[str, int]) -> list[str]:
    """Förbättringsmöjligheter — INVARIANT icke-tom (aldrig 'allt perfekt')."""
    out: list[str] = []
    omissions = sum(1 for d in open_findings if d.get("status") == "CRITICAL_OMISSION_RISK")
    if omissions:
        out.append(
            f"{omissions} kritiska informationsgap där AI-motorerna saknar bolagsspecifik ESG-data "
            "— möt dem via 'Borde svaret varit annorlunda?'."
        )
    reputation = sum(1 for d in open_findings if d.get("status") == "HIGH_REPUTATION_RISK")
    if reputation:
        out.append(f"{reputation} svar med förhöjd reputationsrisk (föråldrad eller orättvist negativ bild).")
    for p in PILLARS:
        if not answers_by_pillar.get(p):
            out.append(f"Pelaren {PILLAR_LABELS[p]} är ännu omätt — generera och godkänn ESG-frågor.")
    out.append(
        "AI-motorerna uppdateras kontinuerligt — fortsatt månatlig ESG-bevakning krävs för att "
        "hålla bilden korrekt över tid."
    )
    return out


# --- Persistens + jobb --------------------------------------------------------


def run(client_id: str, month: str | None = None) -> dict[str, Any] | None:
    """Bygg + persistera ESG-rapporten. Idempotent per (kund, månad)."""
    model = build_report_model(client_id, month)
    if model is None:
        return None
    stored = dict(model)
    stored["generated_at"] = firestore.SERVER_TIMESTAMP
    fs.esg_report_doc(client_id, model["month"]).set(stored)
    log.info("ESG-rapport %s/%s persisterad (overall risk: %s)",
             client_id, model["month"], (model["risk_score"] or {}).get("overall"))
    return model


# --- HTML-vy (för påsyn) ------------------------------------------------------


def render_report_html(report: dict[str, Any]) -> str:
    name = html.escape(report.get("company_name") or "")
    month = report.get("month") or ""
    score = report.get("risk_score") or {}
    overall = score.get("overall")

    pillar_rows = "".join(
        f"<tr><td>{PILLAR_LABELS.get(p, p)}</td>"
        f"<td class='num'>{_fmt_pct(v.get('score'))}</td>"
        f"<td class='num'>{v.get('critical_omission', 0)}</td>"
        f"<td class='num'>{v.get('high_reputation', 0)}</td>"
        f"<td class='num'>{v.get('answers', 0)}</td></tr>"
        for p, v in (score.get("per_pillar") or {}).items()
    )
    detected_rows = "".join(
        f"<tr><td>{PILLAR_LABELS.get(r.get('pillar'), r.get('pillar') or '')}</td>"
        f"<td>{html.escape(r.get('question') or '')}</td>"
        f"<td>{html.escape(r.get('engine') or '')}</td>"
        f"<td>{html.escape(r.get('status') or '')}</td>"
        f"<td>{html.escape(r.get('severity') or '')}</td>"
        f"<td>{html.escape((r.get('engine_excerpt') or '')[:240])}</td>"
        f"<td>{html.escape(r.get('review_status') or '')}</td></tr>"
        for r in (report.get("detected") or [])
    ) or "<tr><td colspan='7'>Inga detekterade ESG-risker.</td></tr>"
    improvements = "".join(f"<li>{html.escape(str(i))}</li>" for i in (report.get("improvement_opportunities") or []))

    return f"""<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<title>AI ESG Risk Score (utkast) — {name} {html.escape(month)}</title>
<style>
 body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}}
 h1{{font-size:1.5rem}} h2{{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #eee;padding-bottom:.3rem}}
 table{{border-collapse:collapse;width:100%;font-size:.9rem;margin-top:.5rem}}
 th,td{{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #eee;vertical-align:top}}
 th{{color:#555;font-weight:600}} .num{{text-align:right;font-variant-numeric:tabular-nums}}
 .score{{font-size:2rem;font-weight:700}} .note{{color:#777;font-size:.85rem}}
 .banner{{background:#fff6e0;border:1px solid #f0d990;border-radius:6px;padding:.6rem .8rem;font-size:.9rem}}
 ul{{margin:.4rem 0;padding-left:1.2rem}} li{{margin:.2rem 0}}
</style></head><body>
<p class="banner"><strong>Internt utkast.</strong> Synas av teamet och färdigställs som
ledningsgruppsrapport utanför verktyget. AI ESG Risk Score är en blind nollmätning av hur
AI-motorerna porträtterar bolagets hållbarhet — inte bolagets faktiska ESG-prestanda.</p>
<h1>AI ESG Risk Score — {name}</h1>
<p class="note">{_month_label(month)}</p>

<h2>Risk Score (0–100 %, högre = högre risk)</h2>
<p class="score">{_fmt_pct(overall)} <span class="note">· total risk</span></p>
<table><thead><tr><th>Pelare</th><th class="num">Risk</th><th class="num">Informationsgap</th>
<th class="num">Reputationsrisk</th><th class="num">Svar</th></tr></thead>
<tbody>{pillar_rows}</tbody></table>

<h2>Detekterade risker</h2>
<table><thead><tr><th>Pelare</th><th>Fråga</th><th>Motor</th><th>Status</th><th>Allvar</th>
<th>Motorn sa</th><th>Status</th></tr></thead>
<tbody>{detected_rows}</tbody></table>

<h2>Förbättringsmöjligheter</h2>
<ul>{improvements}</ul>
</body></html>"""


def _fmt_pct(v: Any) -> str:
    return "—" if v is None else f"{v}%"


def _month_label(month: str) -> str:
    try:
        y, m = month.split("-")
        return f"{_MONTHS_SV[int(m) - 1]} {y}"
    except (ValueError, IndexError):
        return month
