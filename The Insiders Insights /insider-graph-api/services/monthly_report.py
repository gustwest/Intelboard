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
import os
from typing import Any

# P1: minsta beslutssäkerhets-delta som renderas som ▲/▼ — under detta visas "oförändrad"
# (brusband). Default 1 = oförändrat beteende; höj i ops när poängens run-to-run-varians
# är uppmätt (noise-floor-experimentet). Till skillnad från SoV (binomialt SE, P0) saknar
# beslutssäkerhets-poängen ännu en mätt varians, så detta är en konfigurerbar tröskel.
MONTHLY_TREND_MIN_DELTA = int(os.environ.get("MONTHLY_TREND_MIN_DELTA", "1"))

from google.cloud import firestore

import firestore_client as fs
from config import settings
from services import audience_personas
from services import clock
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
PERSONAS = audience_personas.CANONICAL  # customer / employee / investor
PERSONA_SV = audience_personas.LABEL_SV
HARM_SV = {
    "#1": "Förväxling", "#2": "Inaktuellt negativ", "#3": "Hallucinerat negativ",
    "#4": "Konkurrentförskjutning", "#5": "Skadlig tystnad", "#6": "Negativ inramning",
}
_MONTHS_SV = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
]

# Kund-mejlets strängar per språk (B2, A1). Bara mejlet lokaliseras här — den interna
# rapportmodellen är fortsatt svensk. `en` faller tillbaka till `sv` vid okänt språk.
_EMAIL_I18N: dict[str, dict[str, Any]] = {
    "sv": {
        "months": _MONTHS_SV,
        "subject": "Er AI-synlighet i {month} — {name}",
        "heading": "Er AI-synlighet — {name}",
        "confidence": "Beslutssäkerhet: {score}/100 ({stage})",
        "confidence_unmeasured": "Beslutssäkerhet: ännu inte mätt",
        "trend": "Sedan förra månaden: {prev} → {score} ({word}).",
        "trend_unchanged": "oförändrad",
        "trend_up": "förbättrad",
        "trend_down": "försämrad",
        "resolved": " {n} tidigare risk(er) är lösta.",
        # TP5/N3 — insiktsbeats istället för punktlistor: fokus (vad vi arbetar med) + ett bevis.
        "focus_open": "Vi arbetar nu med att stänga {n} {area} med källförsedd, verifierad kontext i er AI-profil.",
        "focus_clean": "Bilden är ren den här månaden — vi fortsätter bevaka den löpande.",
        "area_one": "kvarvarande lucka",
        "area_many": "kvarvarande luckor",
        "proof_lead": "Det här fungerar redan:",
        "next_step": "Nästa steg:",
        "profile_cta": "Se din AI-profil",
        # Frivillig alignment-sektion: frågor AI-motorer ställer som profilen inte svarar
        # på. Kunden informeras + får ett förslag och svarar via mejl-svarsloopen (laddar
        # inte upp något, ops skriver inget eget). Coexisterar med footern "behöver inte
        # göra något" genom att vara uttryckligen frivillig.
        "align_title": "Frivilligt: stärk er profil",
        "align_intro": "AI-assistenter får de här frågorna om er, men profilen svarar inte "
                       "på dem ännu. Vill ni stärka bilden — svara på det här mejlet med svaret, "
                       "så lägger vi in det källförsett. Ni behöver inte göra något om ni inte vill.",
        "align_q": "Frågan AI får: ”{q}”",
        "align_s": "Förslag på svar: {s}",
        "align_more": "…och {n} till — svara så går vi igenom dem tillsammans.",
        "greeting": "Hej {name},",
        "greeting_generic": "Hej,",
        "confidence_def": "Beslutssäkerhet = hur säkert AI-motorerna idag svarar korrekt och "
                          "rättvist om er när någon frågar inför ett beslut.",
        "footer": "Profilen uppdaterar vi åt er löpande — ni behöver inte göra något. "
                  f"Frågor? Kontakta {settings.support_contact_email}.",
        # N2 — bekräftelse när en (ny) huvudkontakt registreras.
        "confirm_subject": "Ni är nu kontakt för {name}:s AI-rapporter",
        "confirm_lead": "Den här adressen är nu registrerad som kontakt för {name}:s "
                        "AI-synlighetsrapporter.",
        "confirm_detail": "Ni får installationskitet och det löpande månadsmejlet hit. "
                          "Ni behöver inte göra något — vi sköter mätningen åt er.",
        "method_title": "Så läser du siffran",
        "method": "Siffran visar hur ofta dagens AI nämner er när någon frågar — mätt över "
                  "flera körningar, med en felmarginal. Den speglar vad AI:n kan om er från "
                  "sin träning; det AI:n hittar live på webben redovisas separat. Förändringar "
                  "mindre än felmarginalen är normalt brus, inte en verklig rörelse.",
    },
    "en": {
        "months": ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"],
        "subject": "Your AI visibility in {month} — {name}",
        "heading": "Your AI visibility — {name}",
        "confidence": "Decision confidence: {score}/100 ({stage})",
        "confidence_unmeasured": "Decision confidence: not measured yet",
        "trend": "Since last month: {prev} → {score} ({word}).",
        "trend_unchanged": "unchanged",
        "trend_up": "improved",
        "trend_down": "declined",
        "resolved": " {n} earlier risk(s) resolved.",
        "focus_open": "We're now working to close {n} {area} with sourced, verified context in your AI profile.",
        "focus_clean": "The picture is clean this month — we'll keep monitoring it.",
        "area_one": "remaining gap",
        "area_many": "remaining gaps",
        "proof_lead": "Already working in your favour:",
        "next_step": "Next step:",
        "profile_cta": "View your AI profile",
        "align_title": "Optional: strengthen your profile",
        "align_intro": "AI assistants get these questions about you, but your profile doesn't "
                       "answer them yet. To strengthen the picture, reply to this email with the "
                       "answer and we'll add it with a source. No obligation.",
        "align_q": "Question AI gets: “{q}”",
        "align_s": "Suggested answer: {s}",
        "align_more": "…and {n} more — reply and we'll go through them together.",
        "greeting": "Hi {name},",
        "greeting_generic": "Hi,",
        "confidence_def": "Decision confidence = how reliably today's AI answers correctly and "
                          "fairly about you when someone asks ahead of a decision.",
        "footer": "We keep your profile updated for you — nothing you need to do. "
                  f"Questions? Contact {settings.support_contact_email}.",
        "confirm_subject": "You're now a contact for {name}'s AI reports",
        "confirm_lead": "This address is now registered as a contact for {name}'s "
                        "AI visibility reports.",
        "confirm_detail": "You'll receive the installation kit and the recurring monthly "
                          "email here. Nothing for you to do — we handle the measurement for you.",
        "method_title": "How to read this number",
        "method": "The number shows how often today's AI mentions you when asked — measured "
                  "across several runs, with a margin of error. It reflects what AI knows about "
                  "you from its training; what AI finds live on the web is reported separately. "
                  "Changes smaller than the margin of error are normally noise, not real movement.",
    },
}


def _email_strings(lang: str | None) -> dict[str, Any]:
    return _EMAIL_I18N.get((lang or "sv").lower(), _EMAIL_I18N["sv"])


def current_month() -> str:
    # Svensk kalender: rapporten ska tillhöra den månad det är i Stockholm, inte i
    # UTC. Vid månadsskifte (1:a 00:00–02:00 svensk tid) skiljer de sig. Se clock.py.
    return clock.stockholm_month()


# --- Render-modell ------------------------------------------------------------


def _alignment_actions(client_id: str, limit: int = 3) -> dict[str, Any]:
    """Kund-säkra åtgärdsförslag ur senaste alignment-auditen: frågor AI-motorer
    ställer som profilen inte svarar på, + ett konkret förslag på svar. Exponerar
    BARA neutrala frågan + förslaget — den adversariella vinkeln, rationale och
    probe-jargongen stannar internt (samma princip som att kundmejlet aldrig visar
    motor-citat/harm-koder). Tom lista om auditen aldrig körts → sektionen utelämnas
    helt. `total` räknar alla gap-ordrar så mejlet kan säga '…och N till'."""
    from services import alignment_audit
    doc = alignment_audit.read_latest(client_id) or {}
    orders = [
        o for o in (doc.get("claim_orders") or [])
        if (o.get("probe_neutral_q") or "").strip() and (o.get("suggested_statement") or "").strip()
    ]
    actions = [
        {"question": o["probe_neutral_q"].strip(), "suggestion": o["suggested_statement"].strip()}
        for o in orders[:limit]
    ]
    return {"actions": actions, "total": len(orders)}


def build_report_model(client_id: str, month: str | None = None) -> dict[str, Any] | None:
    """Bygg månadsrapportens render-modell (utan generated_at — den sätts vid persist)."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("månadsrapport: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}
    month = month or current_month()

    findings = []
    for fid, d in fs.iter_risk_findings(client_id):
        d["_id"] = fid  # behåll doc-id så what-if (project_confidence) kan peka ut findings
        findings.append(d)
    # Normalisera ev. gammalt persona-id (buyer/candidate) på findings → kanoniskt.
    for d in findings:
        d["persona"] = audience_personas.normalize(d.get("persona"))
    open_f = [d for d in findings if d.get("status") in (None, "open")]
    actioned_f = [d for d in findings if d.get("status") == "actioned"]
    resolved_f = [d for d in findings if d.get("status") == "resolved"]

    summary_snap = fs.risk_run_summary_doc(client_id).get()
    summary = summary_snap.to_dict() if summary_snap.exists else {}
    answers_by_persona = audience_personas.normalize_keys((summary or {}).get("answers_by_persona"))

    risk_exposure = _exposure(open_f, answers_by_persona)
    detected = sorted(
        (_finding_row(d) for d in open_f + actioned_f),
        key=lambda r: SEVERITY_WEIGHTS.get(r["severity"], 0), reverse=True,
    )
    actions = [_action_row(d) for d in actioned_f]
    confidence = _decision_confidence(open_f, answers_by_persona)
    trend = _trend(client_id, month, confidence.get("score"), len(resolved_f),
                   confidence.get("score_se"))
    parity = _latest_parity(client_id)

    return {
        "month": month,
        "client_id": client_id,
        "company_name": client.get("company_name") or client_id,
        "is_draft": True,  # internt utkast — färdigställs utanför verktyget
        "decision_confidence": confidence,
        "verdict": _verdict(confidence, open_f, answers_by_persona),
        "risk_exposure": risk_exposure,
        # Legacy-alias (frontendens Report.parity_index + äldre läsare): porträtterat tal.
        "parity_index": (parity or {}).get("portrayed"),
        # Parity v2: hela objektet (portrayed/baseline/gap/osäkerhet) — gap är insikten.
        "parity": parity,
        "strengths": _strengths(open_f, actioned_f, resolved_f, answers_by_persona, parity),
        "improvement_opportunities": _improvements(open_f, answers_by_persona, parity),
        "detected": detected,
        "actions": actions,
        "resolved": {"count": len(resolved_f), "items": [_finding_row(d) for d in resolved_f]},
        # M1 (beslut B3): EN kanonisk risklista med statuskolumn — ersätter
        # detected/actions/resolved som tre separata renderingar i rapporten.
        # detected/actions/resolved behålls i modellen för bakåtkompatibilitet
        # (frontendens what-if-koppling och äldre läsare).
        "risk_block": _risk_block(open_f, actioned_f, resolved_f),
        "trend": trend,
        # Humaniseringstäckning som SEKTION i samma rapport (spec §10). None om trust_gap
        # ej beräknad än — sektionen visar då en upplysning, inte tomhet.
        "humanization": trust_gap_report.build_report_model(client_id),
        # Frivilliga, kund-säkra åtgärdsförslag ur alignment-auditen (frågor profilen inte
        # svarar på). Tom om auditen aldrig körts → kundmejlets sektion utelämnas.
        "alignment": _alignment_actions(client_id),
    }


def _confidence_score_se(open_findings: list[dict], total: int) -> float | None:
    """Brusband (SE) för beslutssäkerhets-poängen, propagerat ur findings detection_rate.

    Poängen = 100·(1 − F/total). Det enda brusiga är F = antal öppna findings: varje
    finding är "öppen" med sannolikhet dr_i (P6:s detection_rate, k/N). F är då en summa
    av oberoende Bernoulli → Var(F) = Σ dr_i(1−dr_i), och SE(score) = (100/total)·√Var(F).
    Robusta fynd (dr=1, syns varje körning) bidrar 0; vingliga (dr≈0.5) dominerar bandet —
    poängens osäkerhet kommer från de vacklande fynden (samma princip som _runtorun_se).

    Findings utan detection_rate (historik före P6) antas robusta (dr=1) → 0 bidrag;
    deras månadsjämförelse faller tillbaka på MONTHLY_TREND_MIN_DELTA-golvet i _trend."""
    if not total:
        return None
    var = 0.0
    for f in open_findings:
        dr = float(f.get("detection_rate", 1.0) or 1.0)
        dr = min(1.0, max(0.0, dr))
        var += dr * (1.0 - dr)
    return round((100.0 / total) * (var ** 0.5), 2)


def _decision_confidence(open_findings: list[dict], answers_by_persona: dict[str, int]) -> dict[str, Any]:
    """Graderad beslutssäkerhet (högre=bättre) på en 0–100-resa med namngivna nivåer.
    Inte binärt bra/dåligt: taket hålls under 100 (GEO blir aldrig 'klart') och tunn
    täckning kan inte nå toppskiktet. Risk Exposure (lägre=bättre) kvar som undermått."""
    total = sum(int(v or 0) for v in answers_by_persona.values())
    if not total:
        return {"score": None, "score_se": None, "stage": "Ej mätt", "headroom": None,
                "answers": 0, "safe": 0,
                "covered_personas": 0, "ceiling": CONFIDENCE_CEILING,
                "next_step": "Generera och godkänn ett frågebatteri för att mäta bilden."}
    safe = max(0, total - len(open_findings))
    raw = 100 * safe / total
    covered = sum(1 for p in PERSONAS if answers_by_persona.get(p))
    ceiling = CONFIDENCE_CEILING if covered == len(PERSONAS) else min(CONFIDENCE_CEILING, COVERAGE_CEILING)
    score = round(min(raw, ceiling))
    return {
        "score": score,
        "score_se": _confidence_score_se(open_findings, total),
        "stage": _stage(score),
        "headroom": ceiling - score,
        "answers": total,
        "safe": safe,
        "covered_personas": covered,
        "ceiling": ceiling,
        "next_step": _next_step(score, ceiling),
    }


def project_confidence(
    open_findings: list[dict],
    answers_by_persona: dict[str, int],
    *,
    resolve_ids: set[str] | None = None,
    simulate_persona_answers: dict[str, int] | None = None,
) -> dict[str, Any]:
    """What-if: hur rör sig beslutssäkerheten OM vissa findings löses och/eller
    täckningen breddas — INNAN åtgärd (prediktion ovanpå receptmotorn).

    Återanvänder _decision_confidence rakt av (ingen parallell formel → ingen drift):
    'after' = exakt samma formel med de hypotetiskt lösta findingsen borttagna och ev.
    simulerade persona-svar inräknade (vilket kan lyfta taket 74→95).

    Matvaliditets-grind: poängen är en deterministisk projektion av formeln, inte en
    empirisk prognos. 'exceeds_band' säger om rörelsen är större än NUVARANDE brusband
    (1.96·SE) — annars ska UI:t läsa den som brus, inte som en trovärdig rörelse."""
    resolve_ids = resolve_ids or set()
    before = _decision_confidence(open_findings, answers_by_persona)
    kept = [f for f in open_findings if f.get("_id") not in resolve_ids]
    abp = dict(answers_by_persona)
    for p, n in (simulate_persona_answers or {}).items():
        abp[p] = abp.get(p, 0) + int(n or 0)
    after = _decision_confidence(kept, abp)

    b_score, a_score = before.get("score"), after.get("score")
    delta = (a_score - b_score) if (a_score is not None and b_score is not None) else None
    band = before.get("score_se")
    return {
        "before": before,
        "after": after,
        "delta": delta,
        "exceeds_band": bool(
            delta is not None and band is not None and abs(delta) >= 1.96 * band
        ),
        "ceiling_unlocked": (after.get("ceiling") or 0) - (before.get("ceiling") or 0),
        "resolved_count": len(open_findings) - len(kept),
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
    # Parity v2: styrka ENDAST när gapet är litet OCH underlaget bär (reliable-grind).
    # Språket markerar alltid kohort-skillnaden: AI:s urval ≠ den formella ledningen.
    gap = (parity or {}).get("gap")
    if parity and parity.get("reliable") and gap is not None and abs(gap) <= PARITY_GAP_THRESHOLD:
        out.append(
            f"AI:s framlyfta personer speglar er formella ledning väl — porträtterad andel "
            f"kvinnor {_pct_sv(parity['portrayed'])} mot ledningens "
            f"{_pct_sv((parity.get('baseline') or {}).get('value'))} "
            f"(gap {_gap_pe(gap)} procentenheter, {parity['n']} namngivna personer)."
        )
    if actioned:
        out.append(f"{len(actioned)} risk(er) har redan mötts med källförsedda korrigeringar.")
    return out


def _improvements(open_findings, answers_by_persona, parity=None) -> list[str]:
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
    # Parity v2 — tre lägen, alla grindade och med kohort-brasklappen i klartext:
    gap = (parity or {}).get("gap")
    if parity and parity.get("reliable") and gap is not None and abs(gap) > PARITY_GAP_THRESHOLD:
        riktning = "underrepresenterar" if gap < 0 else "överrepresenterar"
        out.append(
            f"AI:s framlyfta personer {riktning} kvinnor jämfört med er formella ledning — "
            f"porträtterat {_pct_sv(parity['portrayed'])} mot ledningens "
            f"{_pct_sv((parity.get('baseline') or {}).get('value'))} "
            f"(gap {_gap_pe(gap)} procentenheter, {parity['n']} namngivna personer). "
            "Obs: AI:s urval av personer är inte samma kohort som den formella ledningen — "
            "gapet visar vilka motorerna väljer att lyfta fram."
        )
    elif parity and parity.get("portrayed") is not None and parity.get("baseline") is None:
        out.append(
            "Paritets-baseline saknas — ange ledningens kvinnoandel (officiell källa) i "
            "kundkortet för att aktivera gap-analysen AI:s framlyfta personer vs formell ledning."
        )
    elif parity and parity.get("portrayed") is not None and not parity.get("reliable"):
        out.append(
            f"Paritetsunderlaget är för tunt för slutsatser ({parity['n']} namngivna personer"
            + (f", {_pct_sv(parity['unknown_share'])} utan könsestimat" if parity.get("unknown_share") else "")
            + ") — talet redovisas men ska inte tolkas som trend."
        )
    # Alltid sist: håller sektionen icke-tom även när allt annat ser bra ut.
    out.append(
        "AI-motorerna uppdateras kontinuerligt — fortsatt månatlig bevakning krävs för att "
        "hålla bilden korrekt över tid."
    )
    return out


# --- Exponerings-band (E1, utvecklingsplan 2026-06-11, beslut B2) -------------
#
# Kvoten poäng/svar är obegränsad (kan bli 14+) och lästes som procent. Den
# klassas därför i BAND med en insiktsmening i klartext — kvoten exponeras
# aldrig som siffra mot användare. Trösklarna nedan är dokumenterade start-
# värden på poäng-per-svar (en (1) hög-risk per 4 svar ≈ "Hög"); kalibrering
# mot historisk fördelning över kunder är planerad uppföljning (E1-kalibrering).
EXPOSURE_MIN_ANSWERS = 5  # färre svar → "insufficient": klassa aldrig på tunt underlag
EXPOSURE_BANDS: tuple[tuple[float, str, str], ...] = (
    (0.25, "low", "Låg"),
    (0.75, "elevated", "Förhöjd"),
    (1.50, "high", "Hög"),
    (float("inf"), "critical", "Kritisk"),
)


def _exposure_band(ratio: float) -> tuple[str, str]:
    for limit, band, label in EXPOSURE_BANDS:
        if ratio < limit:
            return band, label
    return "critical", "Kritisk"  # pragma: no cover — inf-gränsen täcker allt


def _sev_phrase(sev: dict[str, int]) -> str:
    parts = []
    if sev["high"]:
        parts.append(f"{sev['high']} allvarlig{'a' if sev['high'] != 1 else ''}")
    if sev["medium"]:
        parts.append(f"{sev['medium']} medel")
    if sev["low"]:
        parts.append(f"{sev['low']} låg{'a' if sev['low'] != 1 else ''}")
    return " och ".join([", ".join(parts[:-1]), parts[-1]]) if len(parts) > 1 else (parts[0] if parts else "")


def _persona_exposure_entry(weighted: int, answers: int, sev: dict[str, int]) -> dict[str, Any]:
    """Ett per-persona-block: rådatat (bakåtkompatibelt) + band + insikt (E1)."""
    entry: dict[str, Any] = {
        "weighted": weighted,
        "answers": answers,
        "score": round(weighted / answers, 3) if answers else None,
        "severities": sev,
    }
    if answers == 0:
        entry.update(band="unmeasured", band_label="Ej mätt",
                     insight="Ingen mätning än — personan har inga uppmätta svar.")
        return entry
    if answers < EXPOSURE_MIN_ANSWERS:
        entry.update(band="insufficient", band_label="Otillräckligt mätt",
                     insight=f"Bara {answers} svar uppmätt{'a' if answers != 1 else ''} — för tunt underlag "
                             "för att klassa exponeringen. Godkänn fler frågor eller kör fler mätcykler.")
        return entry
    ratio = weighted / answers
    band, label = _exposure_band(ratio)
    entry.update(band=band, band_label=label)
    n_open = sum(sev.values())
    if n_open == 0:
        entry["insight"] = f"Inga öppna risker på {answers} svar."
        return entry
    insight = f"{_sev_phrase(sev)} öppen risk{'er' if n_open != 1 else ''} på {answers} svar."
    # Projektion: vart tar bandet vägen om de allvarliga riskerna löses?
    if sev["high"]:
        projected_band, projected_label = _exposure_band(
            (weighted - SEVERITY_WEIGHTS["high"] * sev["high"]) / answers
        )
        if projected_band != band:
            insight += f" Att lösa de allvarliga tar exponeringen till {projected_label}."
    entry["insight"] = insight
    return entry


def _exposure(open_findings: list[dict], answers_by_persona: dict[str, int]) -> dict[str, Any]:
    """Severity-vägd exponering per persona och totalt: rådata (weighted/answers/score,
    bakåtkompatibelt) + band och insiktsmening (E1) — UI och rapport visar bandet och
    insikten, aldrig den obegränsade kvoten."""
    weighted = {p: 0 for p in PERSONAS}
    severities = {p: {"high": 0, "medium": 0, "low": 0} for p in PERSONAS}
    for d in open_findings:
        p = d.get("persona")
        if p in weighted:
            sev = d.get("severity") if d.get("severity") in ("high", "medium", "low") else "low"
            weighted[p] += SEVERITY_WEIGHTS.get(d.get("severity"), 1)
            severities[p][sev] += 1

    per_persona = {
        p: _persona_exposure_entry(weighted[p], int(answers_by_persona.get(p, 0) or 0), severities[p])
        for p in PERSONAS
    }
    total_weighted = sum(weighted.values())
    total_sev = {
        k: sum(severities[p][k] for p in PERSONAS) for k in ("high", "medium", "low")
    }
    total_answers = sum(int(v or 0) for v in answers_by_persona.values())
    total = _persona_exposure_entry(total_weighted, total_answers, total_sev)
    # Koncentrations-insikt på totalen: pekar ut personan som bär huvuddelen av vikten.
    if total_weighted > 0:
        dominant = max(PERSONAS, key=lambda p: weighted[p])
        if weighted[dominant] / total_weighted > 0.6:
            total["insight"] = (
                f"Exponeringen är koncentrerad till {PERSONA_SV.get(dominant, dominant)}: "
                f"{weighted[dominant]} av {total_weighted} riskpoäng. " + (total.get("insight") or "")
            ).strip()
    return {"per_persona": per_persona, "total": total}


RISK_BLOCK_STATUS_SV = {"open": "Öppen", "actioned": "Åtgärdad", "resolved": "Löst"}


def _risk_block(open_f: list[dict], actioned_f: list[dict], resolved_f: list[dict]) -> list[dict[str, Any]]:
    """M1: rapportens kanoniska riskblock — en rad per risk med status och "vad vi
    gjorde", oavsett var i livscykeln den är. Avfärdade (sanna negativ) ingår inte;
    de är ett internt beslut, inte en kundleverans. Sortering: öppna först (efter
    allvar), sedan åtgärdade, sist lösta — läsordningen är att-göra → gjort → bevis."""
    rows = []
    for d in open_f + actioned_f + resolved_f:
        status = d.get("status") if d.get("status") in ("actioned", "resolved") else "open"
        if status == "actioned":
            when = _iso(d.get("action_at"))
            what = "Källförsedd korrigering publicerad" + (f" {when[:10]}" if when else "")
        elif status == "resolved":
            what = "Löst — motorn svarar nu säkert (två rena mätcykler i rad)"
        else:
            what = "Ännu ej åtgärdad"
        rows.append({
            "id": d.get("_id"),
            "question": d.get("question"),
            "persona": d.get("persona"),
            "severity": d.get("severity"),
            "harm": d.get("harm"),
            "status": status,
            "what_we_did": what,
        })
    order = {"open": 0, "actioned": 1, "resolved": 2}
    rows.sort(key=lambda r: (order[r["status"]], -SEVERITY_WEIGHTS.get(r["severity"], 0)))
    return rows


def _finding_row(d: dict) -> dict[str, Any]:
    return {
        "id": d.get("_id"),  # låter UI:t peka ut en specifik risk att simulera (what-if)
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


# Parity v2-grindning (spec Fas 5): under MIN_N namn är talet anekdot, inte mätning;
# över MAX_UNKNOWN andel oestimerbara namn är täckningen för svag. Ogrindad data
# redovisas som tal men får ALDRIG driva styrke-/förbättringsnarrativ.
PARITY_MIN_N = 3
PARITY_MAX_UNKNOWN = 0.5
# |gap| ≤ tröskeln läses som "speglar ledningen väl"; större gap blir en
# förbättringsmöjlighet. I andel (0.10 = 10 procentenheter).
PARITY_GAP_THRESHOLD = 0.10


def _latest_parity(client_id: str) -> dict[str, Any] | None:
    """Parity v2 ur senaste polling-veckan — separat mätvärde, ej i scoren (§7).

    {portrayed, n, unknown_share, ci95, baseline, gap, week_id, reliable} | None.
    Äldre veckor (pre-v2) har bara parity_index → portrayed med n=0 → reliable=False,
    så gamla tal visas men genererar inga narrativa slutsatser."""
    data, latest_week = None, ""
    for snap in fs.polling_results_col(client_id).stream():
        if snap.id > latest_week:
            data, latest_week = (snap.to_dict() or {}), snap.id
    if data is None:
        return None
    portrayed = data.get("parity_portrayed", data.get("parity_index"))
    if portrayed is None:
        return None
    n = int(data.get("parity_n") or 0)
    unknown = data.get("parity_unknown_share")
    reliable = n >= PARITY_MIN_N and (unknown is None or unknown <= PARITY_MAX_UNKNOWN)
    return {
        "portrayed": portrayed,
        "n": n,
        "unknown_share": unknown,
        "ci95": data.get("parity_ci95"),
        "baseline": data.get("parity_baseline"),
        "gap": data.get("parity_gap"),
        "week_id": latest_week,
        "reliable": reliable,
    }


def _pct_sv(x: float | None) -> str:
    """0.45 → '45 %' (svensk rapporttext)."""
    return f"{round(x * 100)} %" if x is not None else "—"


def _gap_pe(gap: float) -> str:
    """Gap i procentenheter med tecken: -0.13 → '−13'."""
    pe = round(gap * 100)
    return f"−{abs(pe)}" if pe < 0 else f"+{pe}"


def _trend(client_id: str, month: str, current_score: int | None, resolved_count: int,
           current_score_se: float | None = None) -> dict[str, Any]:
    """Effekt över tid (§8.4): beslutssäkerhet månad-för-månad (serie + delta mot närmast
    föregående) plus antal lösta risker. Trenden — inte ett kausalitetspåstående — är beviset.

    P1-förfining: `significant` avgör om månadens rörelse är åtskild från samplingsbruset
    (findings detection_rate, propagerat till score_se). Olika från SoV: SE=0 betyder att
    alla öppna fynd är robusta → poängen är deterministisk → varje rörelse ÄR verklig (inte
    brus). Då — och för historik utan score_se — faller vi tillbaka på MONTHLY_TREND_MIN_DELTA
    som golv. Med uppmätt brus krävs |Δ| ≥ max(1.96·SE_diff, golv)."""
    history = []
    prev_id, prev_score, prev_se = "", None, None
    for rid, data in fs.iter_monthly_reports(client_id):
        if rid >= month:  # hoppa över ev. redan persisterad körning för samma månad
            continue
        conf = data.get("decision_confidence") or {}
        score = conf.get("score")
        history.append({"month": rid, "score": score})
        if rid > prev_id:
            prev_id, prev_score, prev_se = rid, score, conf.get("score_se")
    series = sorted(history, key=lambda x: x["month"]) + [{"month": month, "score": current_score}]
    delta = None
    significant = False
    if current_score is not None and prev_score is not None:
        delta = current_score - prev_score
        se_diff = ((current_score_se or 0.0) ** 2 + (prev_se or 0.0) ** 2) ** 0.5
        floor = MONTHLY_TREND_MIN_DELTA
        threshold = max(1.96 * se_diff, floor) if se_diff > 0 else floor
        significant = abs(delta) >= threshold
    return {
        "previous_month": prev_id or None,
        "previous_score": prev_score,
        "previous_score_se": prev_se,
        "delta": delta,
        "significant": significant,
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
- När du nämner en risk: REFERERA den med dess fråga (citerad eller lätt förkortad) så
  att läsaren hittar samma rad i rapportens risktabell — beskriv aldrig en risk i andra
  ordalag än tabellens. Räkna inte upp alla risker i prosa; tabellen är inventariet,
  narrativet förklarar de viktigaste.
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
        # Klartext (grundprincip 7) — aldrig råa 0–1-tal in i narrativ-prompten.
        "paritet": _parity_context(model.get("parity")),
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


def _parity_context(p: dict[str, Any] | None) -> dict[str, Any] | None:
    """Klartext-paritet till narrativ-prompten. Ogrindad data märks uttryckligen så
    LLM:en inte spinner slutsatser av tunt underlag; kohort-brasklappen följer alltid med."""
    if not p or p.get("portrayed") is None:
        return None
    baseline = p.get("baseline") or {}
    return {
        "porträtterad_andel_kvinnor": _pct_sv(p["portrayed"]),
        "formell_ledning": (
            f"{_pct_sv(baseline.get('value'))} ({baseline.get('source')})"
            if baseline.get("value") is not None else "baseline saknas"
        ),
        "gap_procentenheter": _gap_pe(p["gap"]) if p.get("gap") is not None else None,
        "underlag": f"{p.get('n', 0)} namngivna personer",
        "tillförlitligt": bool(p.get("reliable")),
        "läsanvisning": (
            "AI:s urval av framlyfta personer är inte samma kohort som den formella "
            "ledningen — gapet beskriver vilka motorerna väljer att lyfta fram."
        ),
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
    # M2 steg 2 (E1): exponering som band + insikt i klartext — aldrig den
    # obegränsade kvoten. Äldre rapporter utan band-fält får ingen sektion alls.
    exp = report.get("risk_exposure") or {}
    exposure_rows = "".join(
        f"<li><strong>{PERSONA_SV.get(p, p)}: {html.escape(v.get('band_label') or '—')}</strong>"
        f"{' — ' + html.escape(v['insight']) if v.get('insight') else ''}</li>"
        for p, v in (exp.get("per_persona") or {}).items()
        if v.get("band")
    )
    exposure_html = (
        "<h2>Risk-exponering</h2>"
        "<p class='note'>Öppna riskers allvarlighet vägd mot mätunderlaget, klassad "
        "Låg–Kritisk. Klassas inte alls på tunt underlag.</p>"
        f"<ul>{exposure_rows}</ul>"
    ) if exposure_rows else ""
    # Parity v2: gap-rad när baseline finns; annars porträtterat tal; annars —.
    par = report.get("parity") or {}
    if par.get("gap") is not None:
        baseline = par.get("baseline") or {}
        src = f" — {baseline.get('source')}" if baseline.get("source") else ""
        parity_line = (
            f"AI:s framlyfta personer {_pct_sv(par.get('portrayed'))} kvinnor "
            f"({par.get('n', 0)} namngivna) vs formell ledning {_pct_sv(baseline.get('value'))}{html.escape(src)} "
            f"→ gap {_gap_pe(par['gap'])} procentenheter."
            + ("" if par.get("reliable") else " Tunt underlag — tolka inte som trend.")
        )
    elif par.get("portrayed") is not None:
        parity_line = (
            f"{_pct_sv(par.get('portrayed'))} kvinnor bland AI:s framlyfta personer "
            f"({par.get('n', 0)} namngivna; baseline saknas — gap-analys ej aktiverad)."
        )
    else:
        parity_line = "—."

    # M1 (beslut B3): ETT riskblock — Risk · Persona · Allvar · Status · Vad vi
    # gjorde — istället för separata tabeller för detekterat/åtgärdat/löst.
    # Äldre persisterade rapporter utan risk_block faller tillbaka på de gamla.
    sev_sv = {"high": "Hög", "medium": "Medel", "low": "Låg"}
    risk_block = report.get("risk_block")
    if risk_block is not None:
        block_rows = "".join(
            f"<tr><td>{html.escape(r.get('question') or '')}"
            f"<br><span class='note'>{_harm_label(r.get('harm'))}</span></td>"
            f"<td>{PERSONA_SV.get(r.get('persona'), r.get('persona') or '')}</td>"
            f"<td>{sev_sv.get(r.get('severity'), r.get('severity') or '—')}</td>"
            f"<td>{RISK_BLOCK_STATUS_SV.get(r.get('status'), r.get('status') or '')}</td>"
            f"<td>{html.escape(r.get('what_we_did') or '')}</td></tr>"
            for r in risk_block
        ) or "<tr><td colspan='5'>Inga risker den här månaden — motorerna svarade säkert på alla godkända frågor.</td></tr>"
        risk_section = (
            "<h2>Risker &amp; åtgärder</h2>"
            "<p class='note'>Samtliga risker i rapporten — öppna, åtgärdade och lösta — i ett block. "
            "Narrativet ovan refererar riskerna med deras fråga.</p>"
            "<table><thead><tr><th>Risk (frågan motorn fick)</th><th>Persona</th><th>Allvar</th>"
            "<th>Status</th><th>Vad vi gjorde</th></tr></thead>"
            f"<tbody>{block_rows}</tbody></table>"
        )
    else:
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
        risk_section = (
            "<h2>Detekterade risker</h2>"
            "<table><thead><tr><th>Persona</th><th>Fråga</th><th>Motor</th><th>Skademodell</th>"
            "<th>Allvar</th><th>Motorn sa</th><th>Status</th></tr></thead>"
            f"<tbody>{detected_rows}</tbody></table>"
            "<h2>Vad vår mjukvara gjorde</h2>"
            "<table><thead><tr><th>Persona</th><th>Fråga</th><th>Skademodell</th><th>Åtgärd</th>"
            "<th>Ammunition (claims)</th><th>Datum</th></tr></thead>"
            f"<tbody>{action_rows}</tbody></table>"
        )

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
        # P1-förfining: rendera pil bara när rörelsen är statistiskt åtskild från
        # samplingsbruset (trend.significant, propagerat ur findings detection_rate) —
        # annars läses brus som rörelse.
        # Default True = bakåtkompatibelt: modeller utan significant-fält (äldre/fixtures)
        # beter sig som förr; build_report_model sätter alltid fältet i produktion.
        if d is not None and trend.get("significant", True):
            arrow = f"▲ +{d} (förbättrad)" if d > 0 else f"▼ {d} (försämrad)"
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
GEO är aldrig "klart" eftersom AI-motorerna ständigt uppdateras.
GEO Parity Index (separat): {parity_line}</p>

{exposure_html}

<h2>Styrkor (uppsida)</h2>
{strengths_html}

{narrative_html}

{risk_section}

<h2>Förbättringsmöjligheter</h2>
{improvements_html}

<h2>Effekt över tid</h2>
{trend_html}

<h2>Humaniseringstäckning</h2>
<p class="note">Hur mänskligt och värdedrivet ni framstår för AI — men bara i den mån det går att belägga.
Påstått och bevisat hålls isär; perception vägs aldrig in i poängen.</p>
{trust_gap_report.render_fragment(report.get("humanization"))}
</body></html>"""


def render_customer_email(model: dict[str, Any], lang: str | None = None, contact_name: str | None = None) -> tuple[str, str, str]:
    """Kund-säker månadssammanfattning (B2) → (subject, html, text).

    Återanvänder rapportmodellen men exponerar BARA ledningsgrupps-vänliga fält:
    beslutssäkerhet (steg + nästa steg), verdict, trend, styrkor och förbättrings-
    möjligheter. Lämnar avsiktligt UTANFÖR: detekterade risker, motor-citat, harm-
    koder, det interna narrativ-utkastet och humaniserings-detaljer. Ingen jargong,
    inga kausalitetspåståenden (modellen formulerar redan "ökar sannolikheten").

    `lang` (A1) väljer mejlets språk; faller till modellens `language`, sen sv.
    `contact_name` (TP7) personaliserar hälsningen; None → generisk "Hej,"."""
    t = _email_strings(lang or model.get("language"))
    name = model.get("company_name") or ""
    first = (contact_name or "").strip().split()
    greeting = t["greeting"].format(name=first[0]) if first else t["greeting_generic"]
    month_label = _month_label(model.get("month") or "", t["months"])
    conf = model.get("decision_confidence") or {}
    score, stage = conf.get("score"), conf.get("stage")
    verdict = model.get("verdict") or ""
    # Kundmejlet visar INTE conf["next_step"] — det är en operatörsåtgärd (t.ex.
    # "Generera och godkänn ett frågebatteri") som kunden inte kan utföra och som
    # dessutom motsäger footern "ni behöver inte göra något". Istället leder vi till
    # leverabeln: profilsidan. Kund-specifika frågor sköts via mejl-svarsloopen.
    trend = model.get("trend") or {}
    strengths = model.get("strengths") or []
    heading = t["heading"].format(name=name)

    # Lokal import för att undvika cykel på modulnivå (badge → schemas → …).
    from schema_org.badge import profile_url
    client_id = model.get("client_id")
    profile_link = profile_url(client_id) if client_id else ""

    subject = t["subject"].format(month=month_label, name=name)

    score_line = (
        t["confidence"].format(score=score, stage=stage or "")
        if score is not None else t["confidence_unmeasured"]
    )
    conf_def = t["confidence_def"] if score is not None else ""  # TP6: definiera talet i en rad
    trend_line = ""
    prev = trend.get("previous_score")
    if prev is not None and score is not None:
        d = score - prev
        # P1-förfining: kalla det "förbättrad/försämrad" bara när rörelsen är åtskild från
        # samplingsbruset — annars "oförändrad" (talet visas ändå, men inget falskt löfte).
        if d == 0 or not trend.get("significant", True):  # default True = bakåtkompatibelt
            word = t["trend_unchanged"]
        else:
            word = t["trend_up"] if d > 0 else t["trend_down"]
        trend_line = t["trend"].format(prev=prev, score=score, word=word)
    resolved = (trend.get("resolved_count") or 0)
    if resolved:
        trend_line += t["resolved"].format(n=resolved)

    # TP5/N3 — mejlet som ledd insikt, inte datadump: insikt → vad ändrats → fokus →
    # ett bevis → trygghet, inte två punktlistor. Fokus härleds kund-säkert ur ENBART
    # ANTALET öppna risker (aldrig deras innehåll — motor-citat/harm-koder/frågor stannar
    # internt). open_count räknar bara, läcker inget känsligt.
    open_count = sum(
        1 for r in (model.get("detected") or []) if (r.get("status") or "open") == "open"
    )
    if open_count:
        area = t["area_one"] if open_count == 1 else t["area_many"]
        focus_line = t["focus_open"].format(n=open_count, area=area)
    else:
        focus_line = t["focus_clean"]
    # Bevis: ETT konkret styrketecken (inte hela listan). Lösta-räkningen ligger redan i
    # "vad ändrats" ovan, så beviset lyfter en styrka för att inte upprepa samma sak.
    proof = strengths[0] if strengths else None

    # Frivillig alignment-sektion (N: kunddriven, ingen uppladdning). Utelämnas helt om
    # auditen aldrig körts/inga gap. Visar frågan + förslag; kunden svarar via mejl.
    align = model.get("alignment") or {}
    align_actions = align.get("actions") or []
    align_more = max(0, (align.get("total") or len(align_actions)) - len(align_actions))
    align_html, align_text = "", []
    if align_actions:
        items_html = "".join(
            '<li style="margin-bottom:.6rem">'
            f'<span style="color:#1a1a1a">{html.escape(t["align_q"].format(q=a["question"]))}</span><br>'
            f'<span style="color:#555">{html.escape(t["align_s"].format(s=a["suggestion"]))}</span></li>'
            for a in align_actions
        )
        more_html = (
            f'<p style="margin:.4rem 0 0;color:#777;font-size:.85rem">{html.escape(t["align_more"].format(n=align_more))}</p>'
            if align_more else ""
        )
        align_html = (
            '<div style="margin-top:1.4rem;padding:.9rem 1.1rem;background:#f0f6ff;border-left:3px solid #2563eb;border-radius:4px">'
            f'<p style="margin:0 0 .4rem;font-weight:600">{html.escape(t["align_title"])}</p>'
            f'<p style="margin:0 0 .6rem;color:#444;font-size:.9rem">{html.escape(t["align_intro"])}</p>'
            f'<ul style="margin:0;padding-left:1.1rem;font-size:.9rem">{items_html}</ul>{more_html}</div>'
        )
        align_text = ["", t["align_title"], t["align_intro"], ""]
        for a in align_actions:
            align_text += [t["align_q"].format(q=a["question"]), t["align_s"].format(s=a["suggestion"]), ""]
        if align_more:
            align_text.append(t["align_more"].format(n=align_more))

    html_body = f"""<!doctype html><html lang="{html.escape((lang or model.get("language") or "sv").lower())}"><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:620px;margin:0 auto;line-height:1.6">
<p>{html.escape(greeting)}</p>
<h2 style="font-size:1.2rem">{html.escape(heading)}</h2>
<p style="color:#666;margin-top:-.5rem">{html.escape(month_label)}</p>
{f'<p style="font-size:1.05rem;margin-bottom:.3rem">{html.escape(verdict)}</p>' if verdict else ''}
<p style="color:#444;margin-top:0"><strong>{html.escape(score_line)}</strong></p>
{f'<p style="color:#666;font-size:.85rem;margin-top:-.4rem">{html.escape(conf_def)}</p>' if conf_def else ''}
{f'<p style="color:#444">{html.escape(trend_line)}</p>' if trend_line else ''}
<p>{html.escape(focus_line)}</p>
{f'<p><strong>{html.escape(t["proof_lead"])}</strong> {html.escape(proof)}</p>' if proof else ''}
{f'<p style="margin:1.3rem 0"><a href="{html.escape(profile_link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:.6rem 1.1rem;border-radius:8px;font-weight:600">{html.escape(t["profile_cta"])} &rarr;</a></p>' if profile_link else ''}
{align_html}
<hr style="border:none;border-top:1px solid #eee;margin:1.5rem 0">
<p style="color:#666;font-size:.9rem">{html.escape(t["footer"])}</p>
<div style="margin-top:1rem;padding:.7rem .9rem;background:#f7f7f8;border-left:3px solid #ccc;border-radius:4px">
<p style="margin:0 0 .25rem;font-weight:600;color:#444;font-size:.85rem">{html.escape(t["method_title"])}</p>
<p style="margin:0;color:#666;font-size:.8rem">{html.escape(t["method"])}</p>
</div>
</body></html>"""

    text_lines = [greeting, "", f"{heading} ({month_label})", ""]
    if verdict:
        text_lines.append(verdict)
    text_lines.append(score_line)
    if conf_def:
        text_lines.append(conf_def)
    if trend_line:
        text_lines += ["", trend_line]
    text_lines += ["", focus_line]
    if proof:
        text_lines += ["", f"{t['proof_lead']} {proof}"]
    if profile_link:
        text_lines += ["", f"{t['profile_cta']}: {profile_link}"]
    text_lines += align_text
    text_lines += ["", t["footer"], "", f"{t['method_title']}: {t['method']}"]
    return subject, html_body, "\n".join(text_lines)


def render_contact_confirmation_email(company_name: str | None, lang: str | None = None) -> tuple[str, str, str]:
    """N2: kort bekräftelse till en (ny) huvudkontakt → (subject, html, text). Skickas
    best-effort från config-spara när huvudkontaktens adress ändras, så fel-adresser
    fångas direkt. Innehåller inget känsligt — bara att adressen nu är mottagare."""
    t = _email_strings(lang)
    name = company_name or ""
    subject = t["confirm_subject"].format(name=name)
    greeting = t["greeting_generic"]
    lead = t["confirm_lead"].format(name=name)
    detail = t["confirm_detail"]
    lang_attr = html.escape((lang or "sv").lower())
    html_body = (
        f'<!doctype html><html lang="{lang_attr}"><head><meta charset="utf-8"></head>'
        '<body style="font-family:-apple-system,'
        'Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:620px;margin:0 auto;line-height:1.6">'
        f"<p>{html.escape(greeting)}</p>"
        f"<p>{html.escape(lead)}</p>"
        f"<p>{html.escape(detail)}</p>"
        '<hr style="border:none;border-top:1px solid #eee;margin:1.5rem 0">'
        f'<p style="color:#666;font-size:.9rem">{html.escape(t["footer"])}</p>'
        "</body></html>"
    )
    text = "\n".join([greeting, "", lead, "", detail, "", t["footer"]])
    return subject, html_body, text


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


def _harm_label(harm: Any) -> str:
    return f"{harm} {HARM_SV.get(harm, '')}".strip() if harm else ""


def _month_label(month: str, months: list[str] = _MONTHS_SV) -> str:
    try:
        y, m = month.split("-")
        return f"{months[int(m) - 1]} {y}"
    except (ValueError, IndexError):
        return month


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
