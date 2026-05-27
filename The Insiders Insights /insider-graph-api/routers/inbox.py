"""Att göra-inkorg — aggregerar allt som väntar på en människa, över alla kunder.

Samma "öppet"-villkor som review.py och esg.py använder för sina list-endpoints,
så att inkorgens siffror matchar vad ops faktiskt ser på respektive sida:

- claims          → needs_review och review_status ej approved/rejected (review.py)
- items           → raw_items med needs_review och review_status ej approved/rejected
- linkedin        → snapshots med status PENDING (intern verifiering)
- risk_findings   → findings med status open
- risk_questions  → genererade frågor med status open (review-grind)
- esg_questions   → ESG-frågor open (bara om ESG-tillägget är på)
- esg_findings    → ESG-findings open (bara om ESG-tillägget är på)

Endast en summering (inga dokument) — billig nog att hämta i headern.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

import firestore_client as fs
import ttl_cache
from schemas import LinkedInStatus

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

CATEGORY_KEYS = (
    "claims",
    "items",
    "linkedin",
    "risk_findings",
    "risk_questions",
    "esg_questions",
    "esg_findings",
)


def _count_client(client_id: str, data: dict[str, Any]) -> dict[str, int]:
    counts = {k: 0 for k in CATEGORY_KEYS}

    for _cid, claim in fs.iter_claims(client_id):
        if claim.get("needs_review") and claim.get("review_status") not in ("approved", "rejected"):
            counts["claims"] += 1

    for emp_id, _emp in fs.iter_employees(client_id):
        for snap in fs.raw_items_col(client_id, emp_id).where("needs_review", "==", True).stream():
            item = snap.to_dict() or {}
            if item.get("review_status") not in ("approved", "rejected"):
                counts["items"] += 1

    for _sid, snap in fs.iter_linkedin_snapshots(client_id):
        if snap.get("status") == LinkedInStatus.PENDING:
            counts["linkedin"] += 1

    for _fid, finding in fs.iter_risk_findings(client_id):
        if finding.get("status") in (None, "open"):
            counts["risk_findings"] += 1

    for _qid, q in fs.iter_risk_questions(client_id):
        if q.get("status") in (None, "open"):
            counts["risk_questions"] += 1

    if data.get("esg_audit_enabled"):
        for _qid, q in fs.iter_esg_questions(client_id):
            if q.get("status") in (None, "open"):
                counts["esg_questions"] += 1
        for _fid, finding in fs.iter_esg_findings(client_id):
            if finding.get("review_status") in (None, "open"):
                counts["esg_findings"] += 1

    return counts


@router.get("")
def get_inbox() -> dict[str, Any]:
    """Summera mänskliga åtgärder per kund + totalt per kategori. Cachas kort
    (headern hämtar den vid varje sidladdning)."""
    return ttl_cache.cached("inbox", 20, _build_inbox)


def _build_inbox() -> dict[str, Any]:
    clients: list[dict[str, Any]] = []
    totals = {k: 0 for k in CATEGORY_KEYS}

    for client_id, data in fs.iter_clients():
        counts = _count_client(client_id, data)
        client_total = sum(counts.values())
        for k, v in counts.items():
            totals[k] += v
        if client_total:
            clients.append(
                {
                    "client_id": client_id,
                    "company_name": data.get("company_name"),
                    "total": client_total,
                    "counts": counts,
                }
            )

    clients.sort(key=lambda c: c["total"], reverse=True)
    return {
        "total": sum(totals.values()),
        "categories": totals,
        "clients": clients,
    }
