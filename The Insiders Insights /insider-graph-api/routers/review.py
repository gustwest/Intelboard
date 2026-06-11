"""Review-flow för items som plockats in med låg confidence.

Items från `services/email_extraction.py` med confidence < 0.7 hamnar i
`needs_review=true, included_in_output=false`. Ops-användaren ser dem i UI
och godkänner eller avvisar. Godkända items flippar `included_in_output=true`
och tas med vid nästa schema-kompilering.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from google.cloud import firestore
from pydantic import BaseModel

import firestore_client as fs
from schemas import LinkedInStatus
from services import audience_personas, question_quality

router = APIRouter(prefix="/api/review", tags=["review"])


class ReviewAction(BaseModel):
    # "reset" = ångra ett tidigare beslut → tillbaka till needs_review (AR1: undo-toast).
    decision: Literal["approve", "reject", "reset"]
    note: str | None = None


@router.get("/{client_id}/risks")
def list_risk_findings(client_id: str) -> dict[str, Any]:
    """GEO-riskloop skiva 1: öppna findings (read-only) för granskning."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for fid, data in fs.iter_risk_findings(client_id):
        if data.get("status") not in (None, "open"):
            continue
        items.append(
            {
                "id": fid,
                "persona": data.get("persona"),
                "track": data.get("track"),
                "question": data.get("question"),
                "engine": data.get("engine"),
                "harm": data.get("harm"),
                "severity": data.get("severity"),
                "sourcing": data.get("sourcing"),
                "engine_excerpt": data.get("engine_excerpt"),
                # P6: hur konsekvent skadan uppträder över sampling-körningarna (k/N).
                # 5/5 = robust skada; 1/5 = intermittent (fortfarande verklig — en
                # användare kan träffa just det draget — men lägre prioritet).
                "detection_rate": data.get("detection_rate"),
                "n_runs": data.get("n_runs"),
                "detected_at": _iso(data.get("detected_at")),
            }
        )
    order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: order.get(x.get("severity"), 3))
    return {"client_id": client_id, "findings": items}


@router.get("/{client_id}/risks/timeline")
def list_risk_timeline(client_id: str) -> dict[str, Any]:
    """Closed-loop-tidslinje: ALLA findings (öppna + åtgärdade + lösta + avfärdade)
    med lifecycle-tidsstämplar och kopplade korrigeringar (ammo_claim_ids). Driver
    "vår mjukvara funkar"-vyn — detektion → åtgärd → resolved per risk."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for fid, data in fs.iter_risk_findings(client_id):
        items.append(
            {
                "id": fid,
                "persona": data.get("persona"),
                "track": data.get("track"),
                "question": data.get("question"),
                "engine": data.get("engine"),
                "harm": data.get("harm"),
                "severity": data.get("severity"),
                "engine_excerpt": data.get("engine_excerpt"),
                "detection_rate": data.get("detection_rate"),  # P6: k/N konsistens
                "n_runs": data.get("n_runs"),
                "status": data.get("status") or "open",
                "detected_at": _iso(data.get("detected_at")),
                "action_at": _iso(data.get("action_at")),
                "resolved_at": _iso(data.get("resolved_at")),
                "action_taken": data.get("action_taken"),
                "ammo_claim_ids": data.get("ammo_claim_ids") or [],
                "clean_streak": data.get("clean_streak") or 0,
            }
        )
    # Sortera efter senaste händelse (resolved/action/detected) — nyaste först.
    def _recency(it: dict[str, Any]) -> str:
        return it.get("resolved_at") or it.get("action_at") or it.get("detected_at") or ""
    items.sort(key=_recency, reverse=True)

    counts: dict[str, int] = {"open": 0, "actioned": 0, "resolved": 0, "dismissed": 0}
    for it in items:
        s = it.get("status") or "open"
        counts[s] = counts.get(s, 0) + 1
    return {"client_id": client_id, "findings": items, "counts": counts}


class RiskAction(BaseModel):
    """Beslut på en risk-finding (GEO-riskloop skiva 2).

    decision="action": möt risken med ett källförsett korrigerande claim. `statement`
    krävs (ingen källa/innehåll → inget claim, spec §2.1). `source_label`/`source_url`
    anger proveniensen; ops är människan i loopen som godkänner publicering.
    decision="dismiss": stäng findingen utan att publicera (t.ex. ett sant negativ vi
    inte ska möta med kontext, spec §2.2).
    """

    decision: Literal["action", "dismiss"]
    statement: str | None = None
    source_label: str | None = None
    source_url: str | None = None
    note: str | None = None


@router.post("/{client_id}/risks/{finding_id}")
def decide_risk(
    client_id: str, finding_id: str, action: RiskAction, background: BackgroundTasks
) -> dict[str, Any]:
    """Agera på en finding: korrigera med källförsett claim, eller avfärda."""
    doc_ref = fs.risk_finding_doc(client_id, finding_id)
    if not doc_ref.get().exists:
        raise HTTPException(404, "risk finding not found")

    if action.decision == "dismiss":
        doc_ref.update(
            {
                "status": "dismissed",
                "needs_review": False,
                "review_note": action.note,
                "action_at": firestore.SERVER_TIMESTAMP,
            }
        )
        return {"status": "ok", "decision": "dismiss"}

    statement = (action.statement or "").strip()
    if not statement:
        raise HTTPException(422, "statement krävs för decision=action (ingen källa → inget claim)")

    from services import risk_corrector

    claim_id = risk_corrector.reinforce(
        client_id, statement, action.source_label, action.source_url
    )
    doc_ref.update(
        {
            "status": "actioned",
            "needs_review": False,
            "review_note": action.note,
            "action_taken": "reinforced_claim",
            "ammo_claim_ids": [claim_id],
            "action_at": firestore.SERVER_TIMESTAMP,
        }
    )
    # Publicera korrigeringen vid nästa kompilering (JSON-LD/FAQ/profil/llms.txt).
    from jobs import compile_schema

    background.add_task(compile_schema.run, client_id)
    return {"status": "ok", "decision": "action", "claim_id": claim_id}


@router.get("/{client_id}/risk-questions")
def list_pending_risk_questions(client_id: str, status: str = "open") -> dict[str, Any]:
    """Genererade frågebatterier som väntar på godkännande (review-grind, spec §5.1).
    Endast godkända frågor körs skarpt av risk-detect.

    `status`: "open" (default), "approved", "rejected" eller "all".
    Svaret innehåller `counts` med totaler per status oavsett filter — driver
    riskloop-statuspanelen i AI-synlighet-fliken."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    counts: dict[str, int] = {"open": 0, "approved": 0, "rejected": 0}
    for qid, q in fs.iter_risk_questions(client_id):
        s = q.get("status") or "open"
        counts[s] = counts.get(s, 0) + 1
        if status != "all" and s != status:
            continue
        items.append(
            {
                "id": qid,
                "persona": q.get("persona"),
                "track": q.get("track"),
                "text": q.get("text"),
                "language": q.get("language"),
                "decision_criterion": q.get("decision_criterion"),
                "harm_modes": q.get("harm_modes"),
                "type": q.get("type"),
                "status": s,
                "custom": bool(q.get("custom")),
                "quality_flags": q.get("quality_flags") or [],
                "generated_at": _iso(q.get("generated_at")),
            }
        )
    items.sort(key=lambda x: (x.get("persona") or "", x.get("track") or ""))
    return {"client_id": client_id, "questions": items, "counts": counts}


class RiskQuestionAction(BaseModel):
    decision: Literal["approve", "reject"]
    text: str | None = None  # valfri redigering av frågan före godkännande
    note: str | None = None


class CustomRiskQuestion(BaseModel):
    """Ops-skapad fråga som inte kommer från LLM-generationen. Hamnar direkt som
    `approved` (review-grinden är onödig — ops själv lade in den)."""
    # Plain str (inte Literal) så gammalt id (buyer/candidate) tas emot och
    # normaliseras i handlern under övergången; valideras mot CANONICAL där.
    persona: str
    text: str
    type: Literal["open", "comparative"] = "open"
    track: Literal["A", "B"] = "A"
    language: Literal["sv", "en"] = "sv"
    decision_criterion: str | None = None
    harm_modes: list[str] | None = None


@router.post("/{client_id}/risk-questions")
def create_custom_risk_question(client_id: str, q: CustomRiskQuestion) -> dict[str, Any]:
    """Skapa en manuellt skriven risk-fråga som körs av risk-detect varje vecka.
    Body: persona, text, ev. type/track/language/decision_criterion/harm_modes."""
    import hashlib

    client_snap = fs.client_doc(client_id).get()
    if not client_snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    text = q.text.strip()
    if not text:
        raise HTTPException(422, "text krävs")
    persona = audience_personas.normalize(q.persona)
    if persona not in audience_personas.CANONICAL:
        raise HTTPException(422, f"okänd persona: {q.persona}")
    # F1: kvalitetsflagga frågan (blockerar inte) — egna frågor skippar review-grinden,
    # så flaggan är enda kvalitetssignalen ops får på dem.
    quality_flags = question_quality.assess(
        text, (client_snap.to_dict() or {}).get("company_name")
    )

    # Samma id-pattern som services/risk_detector._persist_question — stabilt över tid.
    qid = "q-" + hashlib.sha1(f"{persona}|{q.track}|{text}".encode("utf-8")).hexdigest()[:16]
    ref = fs.risk_question_doc(client_id, qid)
    if ref.get().exists:
        raise HTTPException(409, "frågan finns redan (identisk persona+track+text)")

    ref.set(
        {
            "persona": persona,
            "track": q.track,
            "text": text,
            "language": q.language,
            "decision_criterion": q.decision_criterion or "",
            "harm_modes": q.harm_modes or [],
            "type": q.type,
            "status": "approved",
            "needs_review": False,
            "custom": True,
            "quality_flags": quality_flags,
            "generated_at": firestore.SERVER_TIMESTAMP,
            "reviewed_at": firestore.SERVER_TIMESTAMP,
        }
    )
    return {"status": "ok", "id": qid, "persona": persona, "text": text, "quality_flags": quality_flags}


@router.post("/{client_id}/risk-questions/{question_id}")
def decide_risk_question(client_id: str, question_id: str, action: RiskQuestionAction) -> dict[str, Any]:
    """Godkänn/avvisa en genererad fråga. Endast godkända körs skarpt mot motorerna."""
    doc_ref = fs.risk_question_doc(client_id, question_id)
    if not doc_ref.get().exists:
        raise HTTPException(404, "risk question not found")

    update: dict[str, Any] = {
        "status": "approved" if action.decision == "approve" else "rejected",
        "needs_review": False,
        "review_note": action.note,
        "reviewed_at": firestore.SERVER_TIMESTAMP,
    }
    if action.text is not None:  # ops finslipade frågan före godkännande
        update["text"] = action.text
    doc_ref.update(update)
    return {"status": "ok", "decision": action.decision}


@router.get("/{client_id}/linkedin")
def list_pending_linkedin(client_id: str) -> dict[str, Any]:
    """Kvartals-LinkedIn-snapshots som väntar på intern verifiering (spec §4.2)."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for sid, s in fs.iter_linkedin_snapshots(client_id):
        if s.get("status") != LinkedInStatus.PENDING:
            continue
        items.append(
            {
                "id": sid,
                "skills": s.get("skills", []),
                "followers": s.get("followers"),
                "quarter": s.get("quarter"),
                "filename": s.get("filename"),
                "has_file": bool(s.get("file_path")),
                "uploaded_at": _iso(s.get("uploaded_at")),
            }
        )
    items.sort(key=lambda x: x.get("uploaded_at") or "", reverse=True)
    return {"client_id": client_id, "snapshots": items}


class LinkedInVerifyAction(BaseModel):
    """Beslut på ett LinkedIn-snapshot (spec §4.2–4.3).

    decision="approve": admin har kontrollerat att filen/skärmklippet matchar bolaget.
    Status → VERIFIED, snapshottet blir aktivt och ersätter det gamla; `skills` kan
    finslipas före godkännande. decision="reject": snapshottet förkastas.
    """

    decision: Literal["approve", "reject", "reset"]  # reset = ångra → PENDING (AR1)
    skills: list[str] | None = None  # valfri finslipning av kompetenslistan
    note: str | None = None


@router.post("/{client_id}/linkedin/{snapshot_id}")
def verify_linkedin(
    client_id: str, snapshot_id: str, action: LinkedInVerifyAction, background: BackgroundTasks
) -> dict[str, Any]:
    """Godkänn/avvisa ett snapshot. Godkänt → korsvalidering aktiveras vid nästa kompilering."""
    doc_ref = fs.linkedin_snapshot_doc(client_id, snapshot_id)
    if not doc_ref.get().exists:
        raise HTTPException(404, "linkedin snapshot not found")

    if action.decision == "reset":
        # Ångra: tillbaka till PENDING. (Återaktiverar inte ev. tidigare aktivt
        # snapshot — re-godkänn gör det igen; acceptabelt för en omedelbar ångring.)
        doc_ref.update({
            "status": LinkedInStatus.PENDING,
            "is_active": False,
            "review_note": None,
            "verified_at": None,
        })
        return {"status": "ok", "decision": "reset"}

    if action.decision == "reject":
        doc_ref.update(
            {"status": LinkedInStatus.REJECTED, "is_active": False, "review_note": action.note,
             "verified_at": firestore.SERVER_TIMESTAMP}
        )
        return {"status": "ok", "decision": "reject"}

    # Godkännande: det nya snapshottet ersätter det gamla (spec §4.3) — avaktivera alla
    # tidigare aktiva först, aktivera sedan detta.
    for sid, s in fs.iter_linkedin_snapshots(client_id):
        if sid != snapshot_id and s.get("is_active"):
            fs.linkedin_snapshot_doc(client_id, sid).update({"is_active": False})

    update: dict[str, Any] = {
        "status": LinkedInStatus.VERIFIED,
        "is_active": True,
        "review_note": action.note,
        "verified_at": firestore.SERVER_TIMESTAMP,
        "verified_by": "granskare (manuellt godkänd)",
    }
    if action.skills is not None:
        update["skills"] = action.skills
    doc_ref.update(update)

    # Korsvalideringen (confidence 1.0 vid dual-source) slår igenom vid omkompilering.
    from jobs import compile_schema

    background.add_task(compile_schema.run, client_id)
    return {"status": "ok", "decision": "approve"}


@router.get("/{client_id}")
def list_pending(client_id: str) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for emp_id, emp in fs.iter_employees(client_id):
        for snap in fs.raw_items_col(client_id, emp_id).where("needs_review", "==", True).stream():
            data = snap.to_dict() or {}
            if data.get("review_status") in ("approved", "rejected"):
                continue
            items.append(
                {
                    "id": snap.id,
                    "employee_id": emp_id,
                    "employee_name": emp.get("name"),
                    "schema_type": data.get("schema_type"),
                    "name": data.get("name"),
                    "content": data.get("content"),
                    "url": data.get("url"),
                    "from_email": data.get("from_email"),
                    "subject": data.get("subject"),
                    "confidence": data.get("confidence"),
                    "start_date": data.get("start_date"),
                    "organizer": data.get("organizer"),
                    "published_at": _iso(data.get("published_at")),
                    "created_at": _iso(data.get("created_at")),
                }
            )
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"client_id": client_id, "items": items}


class ClaimReviewAction(BaseModel):
    decision: Literal["approve", "reject", "reset"]  # reset = ångra → needs_review (AR1)
    statement: str | None = None  # valfri redigering av påståendet före godkännande
    note: str | None = None


@router.get("/{client_id}/claims")
def list_pending_claims(client_id: str) -> dict[str, Any]:
    """Narrative-claims med låg confidence (needs_review) som väntar på beslut."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for claim_id, data in fs.iter_claims(client_id):
        if not data.get("needs_review"):
            continue
        if data.get("review_status") in ("approved", "rejected"):
            continue
        items.append(
            {
                "id": claim_id,
                "claim_kind": data.get("claim_kind"),
                "statement": data.get("statement"),
                "predicate": data.get("predicate"),
                "value": data.get("value"),
                "confidence": data.get("confidence"),
                "source": data.get("source", []),
                "created_at": _iso(data.get("created_at")),
                "validated_at": _iso(data.get("validated_at")),
                "validated_by": data.get("validated_by"),
            }
        )
    items.sort(key=lambda x: x.get("confidence") if x.get("confidence") is not None else 1.0)
    return {"client_id": client_id, "items": items}


@router.post("/{client_id}/claims/{claim_id}")
def decide_claim(client_id: str, claim_id: str, action: ClaimReviewAction) -> dict[str, Any]:
    doc_ref = fs.claim_doc(client_id, claim_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(404, "claim not found")
    existing = snap.to_dict() or {}

    if action.decision == "reset":
        # Ångra: tillbaka i granskningskön. Lämnar validated_* som historik (påverkar
        # inte kön — list_claims filtrerar bara på needs_review).
        doc_ref.update({
            "review_status": None,
            "review_note": None,
            "reviewed_at": None,
            "included_in_output": False,
            "needs_review": True,
        })
        return {"status": "ok", "decision": "reset"}

    # VIKTIGT: reviewed_at/validated_at MÅSTE vara ISO-strängar. Claim-modellen
    # i schemas.py har `validated_at: str | None` och kraschar compile_client om
    # vi skriver firestore.SERVER_TIMESTAMP (blir DatetimeWithNanoseconds vid läsning).
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    update: dict[str, Any] = {
        "review_status": "approved" if action.decision == "approve" else "rejected",
        "review_note": action.note,
        "reviewed_at": now_iso,
        "included_in_output": action.decision == "approve",
        "needs_review": False,
    }
    if action.decision == "approve":
        # Godkännandet är i sig en validering. Behåll maskin-stämpeln om den finns
        # (narrative-claims validerade av Claude); annars stämpla den mänskliga
        # granskningen så även property/manuella claims bär en validerings-notis.
        prior = existing.get("validated_at")
        update["validated_at"] = prior if isinstance(prior, str) else now_iso
        update["validated_by"] = existing.get("validated_by") or "granskare (manuellt godkänd)"
    if action.statement is not None:  # ops redigerade påståendet före godkännande
        update["statement"] = action.statement
    doc_ref.update(update)
    return {"status": "ok", "decision": action.decision}


@router.post("/{client_id}/{employee_id}/{item_id}")
def decide(client_id: str, employee_id: str, item_id: str, action: ReviewAction) -> dict[str, Any]:
    doc_ref = fs.raw_items_col(client_id, employee_id).document(item_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(404, "item not found")

    if action.decision == "reset":
        doc_ref.update({
            "review_status": None,
            "review_note": None,
            "reviewed_at": None,
            "included_in_output": False,
            "needs_review": True,
        })
        return {"status": "ok", "decision": "reset"}

    doc_ref.update(
        {
            "review_status": action.decision + "d",
            "review_note": action.note,
            "reviewed_at": firestore.SERVER_TIMESTAMP,
            "included_in_output": action.decision == "approve",
            "needs_review": False,
        }
    )
    return {"status": "ok", "decision": action.decision}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
