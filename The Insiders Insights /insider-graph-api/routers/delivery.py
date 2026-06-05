"""Endpoint för leverans-artefakterna ops lämnar till kunden.

Samlar det kunden behöver installera: profilsidans URL och den stabila
identitets-snutten (statisk JSON-LD för `<head>`). Badge-snutten genereras
separat via /api/badge.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

import firestore_client as fs
from schema_org.badge import profile_url
from schema_org.delivery import render_identity_snippet
from schema_org.install_kit import render_install_kit, render_install_kit_email
from services import notifications

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


@router.get("/{client_id}/install-kit", response_class=HTMLResponse)
def get_install_kit(client_id: str) -> HTMLResponse:
    """Installationskitet som självständig HTML-sida (B1) — utskrivbar till PDF."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    return HTMLResponse(render_install_kit(client_id))


@router.post("/{client_id}/install-kit/send")
def send_install_kit(client_id: str) -> dict[str, object]:
    """Mejla installationskitet till kundkontakten (B1). Self-no-op om kontakt/SendGrid
    saknas — returnerar då bara {sent: False, reason: ...} (inget fel kastas)."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}
    subject, html_body, text_body = render_install_kit_email(client_id)
    result = notifications.send_customer_email(
        data.get("contact_email"), subject, html_body, text_body,
    )
    return {"client_id": client_id, **result}
