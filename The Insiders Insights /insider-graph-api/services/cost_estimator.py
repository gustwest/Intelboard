"""Cost estimation från token-usage (services/token_meter → job_runs.summary.tokens).

Priserna är publika listpriser per 1M tokens i USD, hämtade från respektive
leverantörs prislista 2026. Vertex AI debiterar samma takst som direkt-API:erna
för Gemini och Claude — vi anger en pris per modell, oavsett leveransväg.

ANSVAR: detta är vår BÄSTA INTERNA UPPSKATTNING — inte den faktiska fakturan.
Cloud Billing är fortfarande sanningen, men:
  - LLM-tokens står för 70-90% av kostnaden vid 50 kunder.
  - Vi får realtid + drilldown per kund/jobb/modell, vilket Billing inte ger.
  - Trösklar mot dygnstotal + per-kund-spend ger actionable signal innan
    Cloud Billing aggregerat klart.

Når en modell saknar pris (ny modell vi inte hunnit lägga i tabellen) räknas
den som $0 — den blir synlig i token-listan men inte i USD-summan. Saknade
priser loggas warning så vi upptäcker dem direkt.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelPrice:
    """USD per 1 000 000 tokens. Input = prompt, output = completion."""
    input_per_million: float
    output_per_million: float
    label: str = ""        # läsbar visningsetikett
    vendor: str = ""       # för UI-färgkodning


# Publika listpriser per 1M tokens (USD), uppdaterade 2026-06.
# Vertex AI Gemini = samma pris som AI Studio.
# Vertex Anthropic Claude = samma pris som Anthropic direct.
# OpenAI direkt-API listpriser.
PRICE_TABLE: dict[str, ModelPrice] = {
    # --- Gemini-familjen (Vertex EU) -------------------------------------
    "gemini-2.5-pro": ModelPrice(1.25, 5.00, "Gemini 2.5 Pro", "google"),
    "gemini-2.5-flash": ModelPrice(0.30, 2.50, "Gemini 2.5 Flash", "google"),
    "gemini-3.5-flash": ModelPrice(0.35, 2.80, "Gemini 3.5 Flash", "google"),
    "gemini-3.5-pro": ModelPrice(1.40, 5.50, "Gemini 3.5 Pro", "google"),
    "gemini-1.5-pro": ModelPrice(1.25, 5.00, "Gemini 1.5 Pro", "google"),
    # --- Claude på Vertex Anthropic --------------------------------------
    "claude-sonnet-4-5": ModelPrice(3.00, 15.00, "Claude Sonnet 4.5", "anthropic"),
    "claude-sonnet-4-6": ModelPrice(3.00, 15.00, "Claude Sonnet 4.6", "anthropic"),
    "claude-opus-4-7": ModelPrice(15.00, 75.00, "Claude Opus 4.7", "anthropic"),
    "claude-opus-4-8": ModelPrice(15.00, 75.00, "Claude Opus 4.8", "anthropic"),
    "claude-haiku-4-5-20251001": ModelPrice(0.80, 4.00, "Claude Haiku 4.5", "anthropic"),
    # --- OpenAI (legacy / planned-spår) ----------------------------------
    "gpt-4o": ModelPrice(2.50, 10.00, "GPT-4o", "openai"),
    "gpt-4.1": ModelPrice(2.00, 8.00, "GPT-4.1", "openai"),
    "gpt-5.5": ModelPrice(2.50, 10.00, "GPT-5.5", "openai"),
    # --- Övriga --------------------------------------------------------
    "mistral-medium-3": ModelPrice(0.40, 2.00, "Mistral Medium 3", "mistral"),
    "sonar": ModelPrice(0.20, 0.80, "Perplexity Sonar", "perplexity"),
}


def usd_for(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Beräkna USD för ett enskilt LLM-anrop. 0.0 om priset saknas."""
    price = PRICE_TABLE.get(model_id)
    if price is None:
        log.warning("cost: saknar pris för modell %s (input=%d output=%d)",
                    model_id, input_tokens, output_tokens)
        return 0.0
    return (
        (input_tokens / 1_000_000.0) * price.input_per_million
        + (output_tokens / 1_000_000.0) * price.output_per_million
    )


def estimate_summary(summary_tokens: dict[str, Any]) -> dict[str, Any]:
    """Översätt en `job_runs.summary.tokens`-payload till en kostnadsuppskattning.

    Input-format (från services/token_meter.TokenMeter.to_dict):
        {
            "by_model": {"<model_id>": {"input": N, "output": N, "calls": N}, ...},
            "total_input": N, "total_output": N, "total_calls": N,
        }

    Output:
        {
            "by_model": {"<model_id>": {"input", "output", "calls", "usd"}, ...},
            "total_usd": N.NN,
            "unknown_models": [<model_id>, ...],  # priser saknas — flagga i UI
        }
    """
    out_by_model: dict[str, dict[str, Any]] = {}
    unknown: list[str] = []
    total_usd = 0.0
    for mid, u in (summary_tokens.get("by_model") or {}).items():
        i, o = int(u.get("input") or 0), int(u.get("output") or 0)
        usd = usd_for(mid, i, o)
        out_by_model[mid] = {
            "input": i,
            "output": o,
            "calls": int(u.get("calls") or 0),
            "usd": round(usd, 6),
        }
        total_usd += usd
        if usd == 0 and (i or o) and mid not in PRICE_TABLE:
            unknown.append(mid)
    return {
        "by_model": out_by_model,
        "total_usd": round(total_usd, 4),
        "unknown_models": unknown,
    }


def prices_for_ui() -> list[dict[str, Any]]:
    """Pris-tabellen exponerad för UI:t — bredvid kostnadsbilden visar vi vilka
    modeller som är prissatta och vad vi räknar dem som."""
    return [
        {
            "model_id": mid,
            "label": p.label,
            "vendor": p.vendor,
            "input_per_million_usd": p.input_per_million,
            "output_per_million_usd": p.output_per_million,
        }
        for mid, p in sorted(PRICE_TABLE.items())
    ]
