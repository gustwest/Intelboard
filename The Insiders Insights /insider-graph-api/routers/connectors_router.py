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

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


class ConnectorsUpdate(BaseModel):
    active_connectors: list[str] | None = None
    rss_feeds: list[dict[str, str]] | None = None


@router.get("")
def list_connectors() -> dict[str, Any]:
    return {"connectors": connectors.all_metadata()}


@router.get("/{client_id}")
def get_client_connectors(client_id: str) -> dict[str, Any]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, "client not found")
    data = snap.to_dict() or {}
    return {
        "client_id": client_id,
        "available": connectors.all_metadata(),
        "active_connectors": data.get("active_connectors", []),
        "rss_feeds": (data.get("settings") or {}).get("rss_feeds", []),
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

    if update:
        ref.update(update)
    return {"status": "ok", **update}
