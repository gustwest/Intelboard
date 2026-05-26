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

router = APIRouter(prefix="/api/review", tags=["review"])


class ReviewAction(BaseModel):
    decision: Literal["approve", "reject"]
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
                "detected_at": _iso(data.get("detected_at")),
            }
        )
    order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: order.get(x.get("severity"), 3))
    return {"client_id": client_id, "findings": items}


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
def list_pending_risk_questions(client_id: str) -> dict[str, Any]:
    """Genererade frågebatterier som väntar på godkännande (review-grind, spec §5.1).
    Endast godkända frågor körs skarpt av risk-detect."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for qid, q in fs.iter_risk_questions(client_id):
        if q.get("status") not in (None, "open"):
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
                "generated_at": _iso(q.get("generated_at")),
            }
        )
    items.sort(key=lambda x: (x.get("persona") or "", x.get("track") or ""))
    return {"client_id": client_id, "questions": items}


class RiskQuestionAction(BaseModel):
    decision: Literal["approve", "reject"]
    text: str | None = None  # valfri redigering av frågan före godkännande
    note: str | None = None


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

    decision: Literal["approve", "reject"]
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
    decision: Literal["approve", "reject"]
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

    update: dict[str, Any] = {
        "review_status": "approved" if action.decision == "approve" else "rejected",
        "review_note": action.note,
        "reviewed_at": firestore.SERVER_TIMESTAMP,
        "included_in_output": action.decision == "approve",
        "needs_review": False,
    }
    if action.decision == "approve":
        # Godkännandet är i sig en validering. Behåll maskin-stämpeln om den finns
        # (narrative-claims validerade av Claude); annars stämpla den mänskliga
        # granskningen så även property/manuella claims bär en validerings-notis.
        update["validated_at"] = existing.get("validated_at") or firestore.SERVER_TIMESTAMP
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
