"""LLM-kostnadsspårning för insiders-api.

Bunden till google-genai-SDK:n (skild från Geogiraphs LangChain-baserade
token_meter). Två lagringssömmar:

  * Chat-svar       → kolumner på `ai_chat_messages` (per assistant-tur)
                      → använd `usage_from_response(model, response)` och sätt
                        fälten direkt på AIChatMessage före commit.
  * Allt annat      → rad i `ai_usage_log` (dataset-summarizer, framtida AI)
                      → använd `log_surface_usage(db, surface=..., ...)`.

Alla skrivningar är best-effort: en saknad/trasig `usage_metadata` får aldrig
fälla chatten — då sätts tokens till None och raden räknas som "okänd kostnad"
i rapporten. Saknad pris-rad ger cost_usd=None men tokens bevaras.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

import models
from logging_config import log


# Priser per 1M tokens i USD. Speglar insider-graph-api/services/cost_estimator.py
# för de modeller insiders-api faktiskt kallar. Lägg till nya modeller här när
# backend börjar använda dem — saknad modell ger cost_usd=None (synlig i rapporten).
PRICE_TABLE: dict[str, tuple[float, float]] = {
    # (input_per_million_usd, output_per_million_usd)
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 5.00),
    "gemini-3.5-flash": (0.35, 2.80),
    "gemini-3.5-pro": (1.40, 5.50),
    "gemini-1.5-pro": (1.25, 5.00),
}


@dataclass(frozen=True)
class Usage:
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    cost_usd: Optional[float]


def _extract(response: Any) -> tuple[Optional[int], Optional[int]]:
    """Plocka ut (input_tokens, output_tokens) från en genai-respons.
    Returnerar (None, None) om usage_metadata saknas — vi blockerar inte chatten."""
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return None, None
    i = getattr(meta, "prompt_token_count", None)
    o = getattr(meta, "candidates_token_count", None)
    return (int(i) if i is not None else None,
            int(o) if o is not None else None)


def _cost(model: str, input_tokens: Optional[int], output_tokens: Optional[int]) -> Optional[float]:
    """USD-uppskattning. None om priset saknas — då rapporteras kostnaden som okänd
    (men tokens räknas ändå)."""
    if input_tokens is None and output_tokens is None:
        return None
    price = PRICE_TABLE.get(model)
    if price is None:
        log.warn("cost_tracking.unknown_model", model=model,
                 input=input_tokens, output=output_tokens)
        return None
    pi, po = price
    return round(
        (input_tokens or 0) / 1_000_000 * pi
        + (output_tokens or 0) / 1_000_000 * po,
        6,
    )


def usage_from_response(model: str, response: Any) -> Usage:
    """Plocka tokens + räkna USD. Säker att kalla med vad som helst — None vid trasig respons."""
    try:
        i, o = _extract(response)
    except Exception as exc:  # noqa: BLE001 — mätning får aldrig fälla anropet
        log.warn("cost_tracking.extract_failed", model=model, error=str(exc)[:200])
        return Usage(None, None, None)
    return Usage(input_tokens=i, output_tokens=o, cost_usd=_cost(model, i, o))


def log_surface_usage(
    db: Session,
    *,
    surface: str,
    model: str,
    response: Any,
    customer_id: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    """Spara ett AI-anrop i ai_usage_log. För surfaces som INTE är chat-turer —
    chat-turen sätter kostnadskolumnerna direkt på AIChatMessage.

    Best-effort: rollback + warn vid fel, fortsätter aldrig kasta uppåt."""
    u = usage_from_response(model, response)
    try:
        row = models.AIUsageLog(
            surface=surface,
            customer_id=customer_id,
            model=model,
            input_tokens=u.input_tokens or 0,
            output_tokens=u.output_tokens or 0,
            cost_usd=u.cost_usd or 0.0,
            detail_json=detail or {},
        )
        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        log.warn("cost_tracking.log_failed", surface=surface, model=model, error=str(exc)[:200])
        db.rollback()
