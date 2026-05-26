"""Delad LLM-fabrik för claims-pipelinen (hybrid-setup).

Två roller, två modeller (docs/website-connector-spec.md, rekommendation):

  * generator  — generering + relevansgrindning. Stort kontextfönster (Gemini)
                 sväljer hela korpusen i ett anrop.
  * validator  — det precisionskritiska steget (klassning/validering/narrativ).
                 Gemini 2.5 Pro (Claude är inte EU-resident i projektets region). Oberoendet
                 bärs av den deterministiska källgrinden + adversariell prompt + självkonsistens.

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
import os
import re
from typing import Any

from config import settings

log = logging.getLogger(__name__)

# ESG-loopens egen resonemangsmodell (riskloopens ESG-spår). Avsiktligt SKILD från
# make_validator: Claude opus serveras inte EU-resident i projektets region, och ESG-loopen
# behöver ingen leverantörs-oberoende granskare (den bedömer EXTERNA probe-motorers svar,
# inte sin egen output — så ingen självvalidering). Gemini 2.5 Pro körs EU-resident via
# Vertex i `vertex_location`. Env-överstyrbart utan kodändring; rör ej config.py.
ESG_MODEL = os.environ.get("ESG_MODEL", "gemini-2.5-pro")

# GEO-claims-pipelinen (generator/validator). Claude serveras inte EU-resident i projektets
# region (404), så BÅDA rollerna körs på Gemini i EU. Oberoendet upprätthålls inte längre av
# en annan leverantör utan av (a) en deterministisk källgrind (services/claim_grounding) som
# AVGÖR, och (b) ett vassare validator-steg (pro) + adversariell prompt + självkonsistens.
# Vill man återinföra cross-vendor-oberoende EU-lagligt: Claude via AWS Bedrock EU.
GEO_GENERATOR_MODEL = os.environ.get("GEO_GENERATOR_MODEL", "gemini-2.5-flash")
GEO_VALIDATOR_MODEL = os.environ.get("GEO_VALIDATOR_MODEL", "gemini-2.5-pro")


def make_generator():
    """Generering/relevans (Gemini Flash) — snabb och billig, via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — generator otillgänglig (ingen US-fallback)")
        return None
    return _vertex_gemini(GEO_GENERATOR_MODEL)


def make_validator():
    """Vasst resonemang (Gemini Pro) för det precisionskritiska steget, via Vertex AI EU.
    Claude är inte EU-resident i projektets region; oberoendet bärs nu av den deterministiska
    källgrinden (claim_grounding) som avgör, inte av en annan leverantör."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — validator otillgänglig (ingen US-fallback)")
        return None
    return _vertex_gemini(GEO_VALIDATOR_MODEL)


def make_claim_validator():
    """Validator för claims-extraktionen, med temperatur för SJÄLVKONSISTENS (flera pass där
    samstämmighet krävs). Gemini Pro via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — claim-validator otillgänglig")
        return None
    return _vertex_gemini(GEO_VALIDATOR_MODEL, temperature=0.4)


def make_esg_reasoner():
    """ESG-loopens resonemangsmodell (Gemini), via Vertex AI EU. Genererar ESG-frågor och
    klassar probe-motorernas svar. Skild från make_validator — se ESG_MODEL ovan."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — ESG-reasoner otillgänglig (ingen US-fallback)")
        return None
    return _vertex_gemini(ESG_MODEL)


# Konstruktions-sömmar (lazy import → modulen kan importeras utan SDK; patchas i tester).
def _vertex_gemini(model: str, temperature: float = 0):
    from langchain_google_vertexai import ChatVertexAI

    return ChatVertexAI(
        model=model, project=settings.gcp_project, location=settings.vertex_location,
        temperature=temperature,
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
