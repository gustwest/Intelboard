"""Kundkort-ops-flöde för manuell Geogiraph-verifiering (spec §7.4–7.5).

INGEN kundyta i MVP — underlag kommer in ur systemet (mejl/fil) och allt sker som en
ops-handling på kundkortet, skyddat av admin-API-nyckeln (auth.py). Två grindar:
**roll-valet** (källa/bevis/internt) och **checklistan** (förtjänar stämpeln + nivå).

    POST /api/verification/{client_id}
        multipart: role=<källa|bevis|internt>, payload=<VerificationSubmission-JSON>, file=<valfri>

Uppladdning ≠ verifiering: bara role="bevis" kör verifieringsrutinen och kan bära en
assurance-nivå. Artefakten sparas alltid privat (revisionsspår).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

import firestore_client as fs
from schemas import Claim, ClaimSource, VerificationSubmission
from services import blob_storage, verification as verif
from services.verification_profiles import PROFILES

router = APIRouter(prefix="/api/verification", tags=["verification"])

ROLE_SOURCE, ROLE_EVIDENCE, ROLE_INTERNAL = "källa", "bevis", "internt"


@router.get("/evidence-types")
def list_evidence_types() -> dict[str, Any]:
    """Profiler för ops-UI:t: krävda fält, föreslagen nivå, läge."""
    return {
        "evidence_types": [
            {
                "evidence_type": p.evidence_type,
                "verification_mode": p.verification_mode,
                "required_fields": list(p.required_fields),
                "threshold": p.threshold,
                "suggested_assurance_level": p.suggested_assurance_level,
            }
            for p in PROFILES.values()
        ]
    }


@router.get("/{client_id}")
def list_verifications(client_id: str) -> dict[str, Any]:
    """Verifieringar på kundkortet (revisionsspår + status för UI)."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    items = [{"id": vid, **data} for vid, data in fs.iter_verifications(client_id)]
    items.sort(key=lambda x: x.get("verified_at") or "", reverse=True)
    return {"client_id": client_id, "verifications": items}


@router.post("/{client_id}")
async def add_upload(
    client_id: str,
    background: BackgroundTasks,
    role: str = Form(ROLE_EVIDENCE),
    payload: str | None = Form(None),
    file: UploadFile | None = File(None),
) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    # Artefakten sparas privat oavsett roll (revisionsspår). Self-no-op utan upload-bucket.
    artifact_ref = None
    if file is not None:
        content = await file.read()
        upload_id = hashlib.sha1(
            f"{file.filename}|{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
        ).hexdigest()[:12]
        artifact_ref = blob_storage.store(
            client_id, upload_id, file.filename or "underlag", content,
            file.content_type, prefix="verifications",
        )

    # Roll: internt → bara lagra, inget claim.
    if role == ROLE_INTERNAL:
        return {"status": "ok", "role": role, "artifact_ref": artifact_ref}

    if not payload:
        raise HTTPException(422, "payload (VerificationSubmission-JSON) krävs för roll källa/bevis")
    try:
        submission = VerificationSubmission.model_validate_json(payload)
    except ValueError as exc:
        raise HTTPException(422, f"ogiltig payload: {exc}") from exc
    submission = submission.model_copy(update={"artifact_ref": artifact_ref or submission.artifact_ref})

    # Roll: källa → vanligt sourcat claim utan stämpel (bolagets ord / proveniens).
    if role == ROLE_SOURCE:
        claim_id = _persist_source_claim(client_id, submission)
        background.add_task(_recompile, client_id)
        return {"status": "ok", "role": role, "claim_id": claim_id, "artifact_ref": artifact_ref}

    # Roll: bevis → verifieringsrutinen (kan bära assurance-nivå).
    if role != ROLE_EVIDENCE:
        raise HTTPException(422, f"okänd roll: {role}")
    try:
        v = verif.run_verification(submission)
    except ValueError as exc:  # okänd bevistyp eller otillåten nivå (checklistan)
        raise HTTPException(400, str(exc)) from exc

    vid = verif.persist_verification(client_id, v)
    result: dict[str, Any] = {
        "status": "ok", "role": role, "verification_id": vid,
        "verdict": v.verdict, "assurance_level": v.assurance_level,
        "verification_text": v.verification_text, "expires_at": v.expires_at,
        "artifact_ref": artifact_ref,
    }
    source = verif.to_claim_source(v, vid)
    if source is not None:
        claim = verif.build_verified_claim(v, source)
        cid = verif.verified_claim_id(v)
        fs.claim_doc(client_id, cid).set({**claim.model_dump(), "origin": f"verified:{v.evidence_type}"})
        result["claim_id"] = cid
        background.add_task(_recompile, client_id)
    return result


def _persist_source_claim(client_id: str, submission: VerificationSubmission) -> str:
    """Källa-roll: bygg ett vanligt sourcat claim (manual, ingen stämpel/assurance)."""
    s = submission.subject
    is_culture = s.domain == "culture"
    claim = Claim(
        claim_kind="property" if s.predicate else "narrative",
        subject_ref="org", predicate=s.predicate, value=s.value,
        statement=(s.statement[:200] if s.statement else None),
        source=[ClaimSource(kind="manual", label="uppgift från bolaget")],
        confidence=1.0, included_in_output=True, needs_review=False, review_status="approved",
        facet="culture" if is_culture else "operational",
        warmth_mode="declared" if is_culture else None,
        dimension=s.dimension if is_culture else None,
    )
    cid = "src-" + hashlib.sha1(
        f"{s.domain}|{s.dimension}|{s.metric}|{s.predicate}".encode("utf-8")
    ).hexdigest()[:14]
    fs.claim_doc(client_id, cid).set({**claim.model_dump(), "origin": "source:upload"})
    return cid


def _recompile(client_id: str) -> None:
    from jobs import compile_schema

    compile_schema.run(client_id)
