"""Kostnadsöversikt för insiders-api:s AI-anrop.

Aggregeras LIVE från ai_chat_messages + ai_usage_log — inga roll-up-jobb behövs
i denna skala (några tusen AI-anrop/månad). Om volymen växer kan vi spegla
Geogiraphs cost_summary-mönster (dagliga roll-ups → Firestore-doc).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from db import get_db

router = APIRouter(prefix="/api/ai/cost", tags=["cost"])


def _window_start(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/summary")
def cost_summary(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Total + per-kund + per-modell + per-surface USD/tokens inom fönstret.

    Sammanfogar två källor — chat-turer (ai_chat_messages) och övriga surfaces
    (ai_usage_log) — så att en kund vars chat-konsumtion är liten men dataset-
    summarizer-konsumtion stor inte göms.
    """
    since = _window_start(days)

    chat_rows = db.query(
        models.AIChatMessage.customer_id,
        models.AIChatMessage.model,
        func.coalesce(func.sum(models.AIChatMessage.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(models.AIChatMessage.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(models.AIChatMessage.cost_usd), 0.0).label("cost_usd"),
        func.count(models.AIChatMessage.id).label("calls"),
    ).filter(
        models.AIChatMessage.role == "assistant",
        models.AIChatMessage.created_at >= since,
        models.AIChatMessage.model.isnot(None),  # bara turer med faktisk mätning
    ).group_by(models.AIChatMessage.customer_id, models.AIChatMessage.model).all()

    log_rows = db.query(
        models.AIUsageLog.customer_id,
        models.AIUsageLog.model,
        models.AIUsageLog.surface,
        func.coalesce(func.sum(models.AIUsageLog.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(models.AIUsageLog.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(models.AIUsageLog.cost_usd), 0.0).label("cost_usd"),
        func.count(models.AIUsageLog.id).label("calls"),
    ).filter(
        models.AIUsageLog.created_at >= since,
    ).group_by(models.AIUsageLog.customer_id, models.AIUsageLog.model, models.AIUsageLog.surface).all()

    total_usd = 0.0
    total_input = 0
    total_output = 0
    by_customer: dict[str, dict[str, Any]] = {}
    by_model: dict[str, dict[str, Any]] = {}
    by_surface: dict[str, dict[str, Any]] = {"chat": {"usd": 0.0, "input": 0, "output": 0, "calls": 0}}

    def _bump(bucket: dict, key: str, i: int, o: int, c: float, calls: int) -> None:
        b = bucket.setdefault(key, {"usd": 0.0, "input": 0, "output": 0, "calls": 0})
        b["usd"] += float(c)
        b["input"] += int(i)
        b["output"] += int(o)
        b["calls"] += int(calls)

    for r in chat_rows:
        i, o, c, calls = int(r.input_tokens), int(r.output_tokens), float(r.cost_usd), int(r.calls)
        cust = r.customer_id or "anonymous"
        total_usd += c; total_input += i; total_output += o
        _bump(by_customer, cust, i, o, c, calls)
        _bump(by_model, r.model, i, o, c, calls)
        _bump(by_surface, "chat", i, o, c, calls)

    for r in log_rows:
        i, o, c, calls = int(r.input_tokens), int(r.output_tokens), float(r.cost_usd), int(r.calls)
        cust = r.customer_id or "anonymous"
        total_usd += c; total_input += i; total_output += o
        _bump(by_customer, cust, i, o, c, calls)
        _bump(by_model, r.model, i, o, c, calls)
        _bump(by_surface, r.surface, i, o, c, calls)

    return {
        "window_days": days,
        "since": since.isoformat(),
        "total_usd": round(total_usd, 6),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "by_customer": [{"customer_id": k, **v, "usd": round(v["usd"], 6)} for k, v in sorted(
            by_customer.items(), key=lambda kv: -kv[1]["usd"])],
        "by_model": [{"model": k, **v, "usd": round(v["usd"], 6)} for k, v in sorted(
            by_model.items(), key=lambda kv: -kv[1]["usd"])],
        "by_surface": [{"surface": k, **v, "usd": round(v["usd"], 6)} for k, v in sorted(
            by_surface.items(), key=lambda kv: -kv[1]["usd"])],
    }


@router.get("/customer/{customer_id}")
def cost_per_customer(
    customer_id: str,
    days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Detaljerad kostnad för en specifik kund inom fönstret — chat-turer +
    surface-anrop (dataset-summary etc.) med antal anrop och tokens."""
    since = _window_start(days)
    chat = db.query(
        models.AIChatMessage.model,
        func.coalesce(func.sum(models.AIChatMessage.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(models.AIChatMessage.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(models.AIChatMessage.cost_usd), 0.0).label("cost_usd"),
        func.count(models.AIChatMessage.id).label("calls"),
    ).filter(
        models.AIChatMessage.role == "assistant",
        models.AIChatMessage.created_at >= since,
        models.AIChatMessage.customer_id == customer_id,
        models.AIChatMessage.model.isnot(None),
    ).group_by(models.AIChatMessage.model).all()

    surfaces = db.query(
        models.AIUsageLog.surface,
        models.AIUsageLog.model,
        func.coalesce(func.sum(models.AIUsageLog.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(models.AIUsageLog.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(models.AIUsageLog.cost_usd), 0.0).label("cost_usd"),
        func.count(models.AIUsageLog.id).label("calls"),
    ).filter(
        models.AIUsageLog.created_at >= since,
        models.AIUsageLog.customer_id == customer_id,
    ).group_by(models.AIUsageLog.surface, models.AIUsageLog.model).all()

    chat_total = sum(float(r.cost_usd) for r in chat)
    surf_total = sum(float(r.cost_usd) for r in surfaces)
    return {
        "customer_id": customer_id,
        "window_days": days,
        "since": since.isoformat(),
        "total_usd": round(chat_total + surf_total, 6),
        "chat_usd": round(chat_total, 6),
        "surfaces_usd": round(surf_total, 6),
        "chat_by_model": [{
            "model": r.model, "input": int(r.input_tokens), "output": int(r.output_tokens),
            "calls": int(r.calls), "usd": round(float(r.cost_usd), 6),
        } for r in chat],
        "surfaces": [{
            "surface": r.surface, "model": r.model,
            "input": int(r.input_tokens), "output": int(r.output_tokens),
            "calls": int(r.calls), "usd": round(float(r.cost_usd), 6),
        } for r in surfaces],
    }
