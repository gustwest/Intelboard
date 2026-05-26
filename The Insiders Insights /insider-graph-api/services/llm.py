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

Probe-motorerna vi *mäter* (gpt-4o/gemini i polling.py + risk_detector._build_engines) är
en separat yta som avsiktligt är **första-parts**: payloaden är publik (bolagsnamn +
generisk fråga) och poängen är att mäta de motorer användare faktiskt träffar. EU-skyddet
ligger där den fulla kunddatan behandlas — våra resonemangsmodeller, inte probarna.
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
    """De externa motorerna polling + risk_detector ställer frågor till. Avsiktligt
    första-parts: vi mäter de motorer användare faktiskt träffar, och payloaden är
    publik (bolagsnamn + generisk fråga). EU-skyddet ligger på våra resonemangsmodeller
    (make_generator/make_validator via Vertex EU), inte här."""
    engines: dict[str, Any] = {}
    if settings.openai_api_key:
        engines["gpt-4o"] = _openai_probe()
    if settings.gemini_api_key:
        engines["gemini-1.5-pro"] = _gemini_probe()
    return engines


def _openai_probe():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(api_key=settings.openai_api_key, model="gpt-4o", temperature=0, timeout=60)


def _gemini_probe():
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        google_api_key=settings.gemini_api_key, model="gemini-1.5-pro", temperature=0, timeout=60
    )


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
