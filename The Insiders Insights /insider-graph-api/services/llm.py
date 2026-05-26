"""Delad LLM-fabrik för claims-pipelinen (hybrid-setup).

Två roller, två modeller (docs/website-connector-spec.md, rekommendation):

  * generator  — generering + relevansgrindning. Stort kontextfönster (Gemini)
                 sväljer hela korpusen i ett anrop.
  * validator  — det precisionskritiska steget (klassning/validering/narrativ).
                 Vassaste resonemanget (Claude Opus); korta anrop → låg kostnad.

**EU-only (hårt krav):** dessa modeller behandlar kunddata och körs därför via
**Vertex AI i EU-region** (`settings.gcp_project` + `settings.vertex_location`) med
service-account-auth (ADC) — INGEN första-parts US-väg och ingen US-fallback. Saknas
GCP-projekt returnerar fabriken None → pipelinen blir no-op men kraschar inte (och
läcker inget till US). SDK:n importeras lazy. Se projektminnet om dataresidens.

OBS: probe-motorerna vi *mäter* (gpt-4o/gemini i polling.py + risk_detector._build_engines)
är en separat yta — EU-kompatibel routning av dem är ett öppet produkt/compliance-beslut.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from config import settings

log = logging.getLogger(__name__)


def make_generator():
    """Stort-kontext-modell (Gemini) för generering/relevans, via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — generator otillgänglig (ingen US-fallback)")
        return None
    return _vertex_gemini(settings.generator_model)


def make_validator():
    """Vasst resonemang (Claude) för det precisionskritiska steget, via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — validator otillgänglig (ingen US-fallback)")
        return None
    return _vertex_anthropic(settings.validator_model)


# Konstruktions-sömmar (lazy import → modulen kan importeras utan SDK; patchas i tester).
def _vertex_gemini(model: str):
    from langchain_google_vertexai import ChatVertexAI

    return ChatVertexAI(
        model=model, project=settings.gcp_project, location=settings.vertex_location,
        temperature=0,
    )


def _vertex_anthropic(model: str):
    from langchain_google_vertexai.model_garden import ChatAnthropicVertex

    return ChatAnthropicVertex(
        model_name=model, project=settings.gcp_project, location=settings.vertex_location,
        temperature=0,
    )


# --- Probe-motorer (de publika AI-assistenterna vi MÄTER) ---------------------


def make_probe_engines() -> dict[str, Any]:
    """De externa motorerna polling + risk_detector ställer frågor till. EU-only routar
    samma modeller via EU-region (mätneutralt): Gemini→Vertex EU, GPT-4o→Azure OpenAI EU.
    GPT är fail-closed: utan Azure OpenAI EU stängs den av i eu_only-läge (ingen US-läcka).
    """
    engines: dict[str, Any] = {}

    if settings.gcp_project:
        engines[settings.probe_gemini_model] = _vertex_gemini(settings.probe_gemini_model)
    else:
        log.warning("probe-Gemini otillgänglig — GCP-projekt ej satt")

    if settings.azure_openai_endpoint and settings.azure_openai_api_key and settings.azure_openai_deployment:
        engines["gpt-4o"] = _azure_openai()
    elif not settings.eu_only and settings.openai_api_key:
        engines["gpt-4o"] = _openai_us()  # escape hatch (ej EU) — endast när eu_only=False
    else:
        log.warning("probe-GPT avstängd (EU-only): Azure OpenAI EU ej konfigurerad — fail-closed")

    return engines


def _azure_openai():
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        azure_deployment=settings.azure_openai_deployment,
        api_version=settings.azure_openai_api_version,
        temperature=0,
        timeout=60,
    )


def _openai_us():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(api_key=settings.openai_api_key, model="gpt-4o", temperature=0, timeout=60)


def invoke_json(llm, system: str, user: str) -> dict[str, Any] | None:
    """Anropa LLM och plocka ut det första JSON-objektet. None vid fel."""
    from langchain_core.messages import HumanMessage, SystemMessage

    try:
        resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        raw = resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:  # blockering / timeout: logga, hoppa över
        log.warning("LLM call failed: %s", exc)
        return None
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
