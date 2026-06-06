"""Kvitto på sanning (Spår D2) — månadens bevisföring, kundvänd yta.

Tunn HTTP-yta ovanpå services/proof_receipt (ren sammanställning) + bevisarkivet.
Visar EN månads faktiska aktivitet: upptäckt / rekommenderat / stängt + arkiv-
tillväxt. Inga perceptionstal (guardrail). Drivs av "Månadens kvitto"-fliken i
AI-synlighet-cockpiten.

    GET /api/proof-receipt/{client_id}            → innevarande månad
    GET /api/proof-receipt/{client_id}/{month}    → specifik månad (YYYY-MM)
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

import firestore_client as fs
from services import proof_archive, proof_receipt
from services.monthly_report import current_month

router = APIRouter(prefix="/api/proof-receipt", tags=["proof-receipt"])


def _load(client_id: str, month: str) -> dict[str, Any]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    company_name = (snap.to_dict() or {}).get("company_name") or client_id

    verifications_by_id = {vid: data for vid, data in fs.iter_verifications(client_id)}
    archive = proof_archive.build_archive(fs.iter_claims(client_id), verifications_by_id)

    return proof_receipt.build_receipt(
        month,
        company_name,
        findings=fs.iter_risk_findings(client_id),
        recipes=fs.iter_recipes(client_id),
        archive_entries=archive["entries"],
    )


@router.get("/{client_id}")
def get_current(client_id: str) -> dict[str, Any]:
    return {"client_id": client_id, **_load(client_id, current_month())}


@router.get("/{client_id}/{month}")
def get_month(client_id: str, month: str) -> dict[str, Any]:
    return {"client_id": client_id, **_load(client_id, month)}
