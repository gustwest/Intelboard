"""Endpoint för leverans-artefakterna ops lämnar till kunden.

Samlar det kunden behöver installera: profilsidans URL och den stabila
identitets-snutten (statisk JSON-LD för `<head>`). Badge-snutten genereras
separat via /api/badge.
"""
from fastapi import APIRouter, HTTPException

import firestore_client as fs
from schema_org.badge import profile_url
from schema_org.delivery import render_identity_snippet

router = APIRouter(prefix="/api/delivery", tags=["delivery"])


@router.get("/{client_id}")
def get_delivery(client_id: str) -> dict[str, str | None]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}
    return {
        "client_id": client_id,
        "profile_url": profile_url(client_id),
        "compiled_url": data.get("profile_url"),  # satt av compile-schema vid uppladdning
        "identity_snippet": render_identity_snippet(client_id),
    }
