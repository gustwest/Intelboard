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
from services import contacts, delivery_health, notifications

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


@router.get("/{client_id}/health")
def get_delivery_health(client_id: str) -> dict[str, object]:
    """P2 — verifiera att leveransen faktiskt är live. Två nivåer:
      * den hostade profilsidan (200 + JSON-LD för rätt entitet + färsk), och
      * `snippet`: att identitets-snutten faktiskt ligger på KUNDENS EGNA sajt (inte
        bara överlämnad). Stänger gapet audit #1 flaggade. Best-effort: nätverksfel →
        verdict 'missing'/'unreachable'."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}
    result = delivery_health.check_live(client_id, data)
    result["snippet"] = delivery_health.check_snippet_on_site(client_id, data)
    return result


@router.get("/{client_id}/crawl-health")
def get_crawl_health(client_id: str) -> dict[str, object]:
    """P2 passivt lager — hämtar AI-motorernas crawlers den hostade profilsidan? Läser
    det persisterade aggregatet (jobs/crawl_health ur GCS usage-loggar). Saknas doket
    ännu (jobbet ej kört / inga loggar) → 0-svar så frontend kan visa 'Inväntar första
    crawl' i stället för ett fel."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    snap = fs.crawl_health_doc(client_id).get()
    if snap.exists:
        return {"client_id": client_id, "measured": True, **(snap.to_dict() or {})}
    return {"client_id": client_id, "measured": False, "total_hits": 0,
            "bots_seen": 0, "per_bot": {}, "last_crawl_at": None}


@router.get("/{client_id}/install-kit", response_class=HTMLResponse)
def get_install_kit(client_id: str) -> HTMLResponse:
    """Installationskitet som självständig HTML-sida (B1) — utskrivbar till PDF."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    return HTMLResponse(render_install_kit(client_id))


@router.post("/{client_id}/install-kit/send")
def send_install_kit(client_id: str) -> dict[str, object]:
    """Mejla installationskitet till kundkontakten (B1). Self-no-op om kontakt/Brevo
    saknas — returnerar då bara {sent: False, reason: ...} (inget fel kastas)."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}
    subject, html_body, text_body = render_install_kit_email(client_id)
    result = notifications.send_customer_email(
        contacts.primary_email(data), subject, html_body, text_body,
        cc=contacts.secondary_emails(data),  # N2: cc sekundärkontakter (t.ex. webbansvarig)
    )
    return {"client_id": client_id, **result}
