"""Receptmotorns REST-yta (Fas 1.3c, spec §10 punkt 5).

Tre operationer:
  * GET  /api/recipes/{client_id}                    — lista alla recept (filter på status)
  * POST /api/recipes/{client_id}/generate           — kör Lager A+B mot aktuell trust_gap
  * POST /api/recipes/{client_id}/{recipe_id}/status — operatörens lifecycle-transition

Lifecycle-transitions:
  pending → agreed (operatören vill agera)
  agreed  → acted   (operatören har publicerat externt)
  acted   → verified (Fas 1.4 stänger loopen — UI får inte sätta detta)
  *       → dismissed (operatören avfärdar — terminal)

verified sätts av Fas 1.4 intervention-spårning, ej från detta API. UI:t får
försöka och se 409 i så fall — som en säkerhetsspärr mot felklick.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firestore_client as fs
from services import recipes as svc

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


# UI:t får sätta dessa fyra; verified är Fas 1.4-domän (autosätts av
# intervention-spårningen, ej från detta API).
OperatorStatus = Literal["agreed", "acted", "dismissed"]


class StatusUpdate(BaseModel):
    status: OperatorStatus
    note: str | None = None


@router.get("/{client_id}")
def list_recipes(
    client_id: str, status: str | None = None, gap_type: str | None = None,
) -> dict[str, Any]:
    """Lista alla recept för en kund. Filter på status/gap_type (queryparametrar)."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for rid, data in fs.iter_recipes(client_id):
        if status and data.get("status") != status:
            continue
        if gap_type and (data.get("skeleton") or {}).get("gap_type") != gap_type:
            continue
        items.append({"recipe_id": rid, **data})

    # Sortera: pending först (operatörens kö), sen agreed/acted, sen avslutade.
    status_order = {"pending": 0, "agreed": 1, "acted": 2, "verified": 3, "dismissed": 4}
    items.sort(key=lambda it: (
        status_order.get(it.get("status", "pending"), 5),
        it.get("updated_at") or "",
    ))

    counts: dict[str, int] = {"pending": 0, "agreed": 0, "acted": 0, "verified": 0, "dismissed": 0}
    for it in items:
        s = it.get("status") or "pending"
        counts[s] = counts.get(s, 0) + 1

    return {"client_id": client_id, "recipes": items, "counts": counts}


@router.post("/{client_id}/generate")
def generate_recipes(client_id: str) -> dict[str, Any]:
    """Kör Lager A+B mot aktuell trust_gap och persistera resultatet.

    Synkront idag — receptmotorn är liten (max ~5–10 flaggor per kund) och
    LLM-anropet tar några sekunder. Vid skalning kan vi flytta till en
    BackgroundTask eller cron, men då är detta endpoint en bra fallback.
    """
    try:
        return svc.generate_for_client(client_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{client_id}/{recipe_id}/status")
def transition_status(client_id: str, recipe_id: str, body: StatusUpdate) -> dict[str, Any]:
    """Operatörens lifecycle-transition. Validerar mot tillåtna övergångar."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    try:
        updated = svc.update_status(client_id, recipe_id, body.status, note=body.note)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except svc.StatusTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"client_id": client_id, "recipe_id": recipe_id, "status": updated.get("status"),
            "updated_at": updated.get("updated_at")}
