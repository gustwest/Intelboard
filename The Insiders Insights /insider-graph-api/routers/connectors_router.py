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

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


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
    return {
        "client_id": client_id,
        "available": connectors.all_metadata(),
        "active_connectors": data.get("active_connectors", []),
        "rss_feeds": (data.get("settings") or {}).get("rss_feeds", []),
        "job_feeds": (data.get("settings") or {}).get("job_feeds", []),
        "connector_params": connector_params,
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
