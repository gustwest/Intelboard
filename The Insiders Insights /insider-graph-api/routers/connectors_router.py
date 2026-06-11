"""Connector-administration per kund.

Listar tillgängliga connectors, läser och uppdaterar `active_connectors` +
`settings.rss_feeds` på client-doc.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import connectors
import firestore_client as fs
from connectors.gleif import search_lei
from services.attested_ingest import attested_status

router = APIRouter(prefix="/api/connectors", tags=["connectors"])

# Connector → jobbtyp som bäst representerar "senaste hämtning" för kunden.
# website/jobfeed har egna per-kund-jobb; resten hämtas i bolagsnivå-rundan
# (scrape_active), så den körningens tidsstämpel är den ärliga signalen.
_CONNECTOR_JOB: dict[str, str] = {
    "website": "scrape_website",
    "jobfeed": "xml_sync",
    "rss": "scrape_active",
    "gleif": "scrape_active",
    "wikipedia": "scrape_active",
    "linkedin": "scrape_active",
}

# Connector → attesterade källtyper (operatör-uppladdad data) som hör till den.
# Starkare signal än en hämtningskörning: vi vet både "finns" och "i leverans".
_CONNECTOR_ATTESTED: dict[str, tuple[str, ...]] = {
    "linkedin": (
        "linkedin_follower_demographics",
        "linkedin_visitor_demographics",
        "linkedin_content",
    ),
}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _max_iso(values) -> str | None:
    present = [v for v in values if v]
    return max(present) if present else None


def _latest_runs(client_id: str) -> dict[str, dict[str, Any]]:
    """job_type → {'at': iso, 'status': str} för senaste körningen per typ (kund)."""
    latest: dict[str, dict[str, Any]] = {}
    try:
        for snap in fs.job_runs_col().where("client_id", "==", client_id).stream():
            d = snap.to_dict() or {}
            jt, raw = d.get("job_type"), d.get("started_at")
            if not jt or raw is None:
                continue
            cur = latest.get(jt)
            if cur is None or raw > cur["_raw"]:
                latest[jt] = {"_raw": raw, "at": _iso(raw), "status": d.get("status")}
    except Exception:  # noqa: BLE001 — status är best-effort, aldrig blockerande
        return {}
    return latest


def _connector_status(client_id: str, active: list[str]) -> dict[str, dict[str, Any]]:
    """Per aktiv connector: tri-state (live/staged/idle) + senaste datum, så kortet
    speglar VILKEN data vi faktiskt har och om den används i leveransen — inte bara
    att toggeln är på."""
    att = {s["key"]: s for s in attested_status(client_id)}
    runs = _latest_runs(client_id)
    out: dict[str, dict[str, Any]] = {}
    for cid in active:
        # 1) Uppladdad/attesterad data väger tyngst — vi vet om den är i leverans.
        keys = _CONNECTOR_ATTESTED.get(cid, ())
        included = sum(att.get(k, {}).get("included", 0) for k in keys)
        staged = sum(att.get(k, {}).get("staged", 0) for k in keys)
        last_att = _max_iso([att.get(k, {}).get("last_attested_at") for k in keys])
        if included:
            out[cid] = {"state": "live", "last_at": last_att, "detail": "Uppladdad data i leverans"}
            continue
        if staged:
            out[cid] = {"state": "staged", "last_at": last_att, "detail": "Uppladdad — väntar på inkludering"}
            continue
        # 2) Automatiska connectors — senaste per-kund-hämtning är en ärlig proxy.
        run = runs.get(_CONNECTOR_JOB.get(cid, ""))
        if run and run.get("status") == "success":
            out[cid] = {"state": "live", "last_at": run["at"], "detail": "Senaste hämtning lyckades"}
        elif run:
            out[cid] = {"state": "idle", "last_at": run["at"], "detail": "Senaste körning misslyckades", "ok": False}
        else:
            out[cid] = {"state": "idle", "last_at": None, "detail": "Ingen data ännu"}
    return out


class ConnectorsUpdate(BaseModel):
    active_connectors: list[str] | None = None
    rss_feeds: list[dict[str, str]] | None = None
    job_feeds: list[dict[str, str]] | None = None
    # Generiska connector-input-fält (text-typ) som kan sättas/ändras EFTER
    # onboarding — t.ex. wikidata_id (Wikipedia) eller lei (GLEIF). Nyckeln måste
    # matcha en registrerad connectors `InputField.name` med type="text"; värdet
    # lagras top-level på client-doc där scrape_active läser det (client.get(name)).
    connector_params: dict[str, str] | None = None


def _text_input_fields() -> dict[str, str]:
    """name → connector-id för alla text-typade input-fält i registret.

    Detta är fälten som mappar till ett enkelt top-level client-fält (wikidata_id,
    lei). feed_list (rss/job_feeds) och url (website) har egen lagringsform och
    hanteras separat — de ingår inte här.
    """
    out: dict[str, str] = {}
    for meta in connectors.all_metadata():
        for f in meta["input_fields"]:
            if f["type"] == "text":
                out[f["name"]] = str(meta["id"])
    return out


def _normalize_param(name: str, value: str) -> str | None:
    """Spegla onboarding-normaliseringen (discovery.onboard_client)."""
    value = (value or "").strip()
    if name == "wikidata_id":
        return value.upper() or None
    return value or None


@router.get("")
def list_connectors() -> dict[str, Any]:
    return {"connectors": connectors.all_metadata()}


@router.get("/gleif/search")
def gleif_search(q: str) -> dict[str, Any]:
    """Slå upp LEI-kod på företagsnamn (onboarding-hjälp för GLEIF-connectorn)."""
    return {"query": q, "results": search_lei(q)}


@router.get("/{client_id}")
def get_client_connectors(client_id: str) -> dict[str, Any]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, "client not found")
    data = snap.to_dict() or {}
    # Spegla nuvarande värden för text-input-fälten så UI:t kan förifylla.
    connector_params = {name: data.get(name) for name in _text_input_fields()}
    active = data.get("active_connectors", [])
    return {
        "client_id": client_id,
        "available": connectors.all_metadata(),
        "active_connectors": active,
        "rss_feeds": (data.get("settings") or {}).get("rss_feeds", []),
        "job_feeds": (data.get("settings") or {}).get("job_feeds", []),
        "connector_params": connector_params,
        # Datatillstånd per aktiv connector (tri-state + senaste datum) så kortet
        # blir en source of truth för VAD vi har, inte bara vad som är påslaget.
        "connector_status": _connector_status(client_id, active),
    }


@router.put("/{client_id}")
def update_client_connectors(client_id: str, payload: ConnectorsUpdate) -> dict[str, Any]:
    ref = fs.client_doc(client_id)
    if not ref.get().exists:
        raise HTTPException(404, "client not found")

    update: dict[str, Any] = {}
    if payload.active_connectors is not None:
        unknown = [c for c in payload.active_connectors if c not in connectors.REGISTRY]
        if unknown:
            raise HTTPException(400, f"unknown connectors: {unknown}")
        update["active_connectors"] = payload.active_connectors
    if payload.rss_feeds is not None:
        update["settings.rss_feeds"] = payload.rss_feeds
    if payload.job_feeds is not None:
        update["settings.job_feeds"] = payload.job_feeds
    if payload.connector_params is not None:
        allowed = _text_input_fields()
        unknown = [k for k in payload.connector_params if k not in allowed]
        if unknown:
            raise HTTPException(400, f"unknown connector params: {unknown}")
        for name, raw in payload.connector_params.items():
            update[name] = _normalize_param(name, raw)

    if update:
        ref.update(update)
    return {"status": "ok", **update}
