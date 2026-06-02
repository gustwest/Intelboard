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

Probe-motorerna vi *mäter* (ChatGPT/Gemini i polling.py + risk_detector._build_engines) är
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
from services import model_registry, token_meter

log = logging.getLogger(__name__)

# Modell-ID kommer från services/model_registry (ett ställe att uppdatera). Env-
# override kvarstår för ops-akut: läggs nya defaults i registret.
ESG_MODEL = os.environ.get("ESG_MODEL", model_registry.get_id("esg_reasoner"))
GEO_GENERATOR_MODEL = os.environ.get("GEO_GENERATOR_MODEL", model_registry.get_id("geo_generator"))
GEO_VALIDATOR_MODEL = os.environ.get("GEO_VALIDATOR_MODEL", model_registry.get_id("geo_validator"))


def make_generator():
    """Generering/relevans (Gemini Flash) — snabb och billig, via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — generator otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(_vertex_gemini(GEO_GENERATOR_MODEL), GEO_GENERATOR_MODEL)


def make_validator():
    """Vasst resonemang (Gemini Pro) för det precisionskritiska steget, via Vertex AI EU.
    Claude är inte EU-resident i projektets region; oberoendet bärs nu av den deterministiska
    källgrinden (claim_grounding) som avgör, inte av en annan leverantör."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — validator otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(_vertex_gemini(GEO_VALIDATOR_MODEL), GEO_VALIDATOR_MODEL)


def make_claim_validator():
    """Validator för claims-extraktionen, med temperatur för SJÄLVKONSISTENS (flera pass där
    samstämmighet krävs). Gemini Pro via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — claim-validator otillgänglig")
        return None
    return token_meter.track(_vertex_gemini(GEO_VALIDATOR_MODEL, temperature=0.4), GEO_VALIDATOR_MODEL)


def make_esg_reasoner():
    """ESG-loopens resonemangsmodell (Gemini), via Vertex AI EU. Genererar ESG-frågor och
    klassar probe-motorernas svar. Skild från make_validator — se ESG_MODEL ovan."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — ESG-reasoner otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(_vertex_gemini(ESG_MODEL), ESG_MODEL)


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
    """Probe-motorerna (Claude + Gemini) körs via Vertex AI sedan 2026-06-02 — samma
    EU-projekt som validator. Modellerna är identiska med vad publika
    API:erna serverar (Vertex Gemini = AI Studio Gemini, Vertex Claude = Claude.ai).

    Vinster: en auth-väg (service account/ADC), EU-residency för all probe-trafik,
    ingen separat API-nyckel-hantering, ingen risk för whitespace-förorenade headers
    som tidigare gav "Connection error"/"Illegal header value".

    Kräver GCP_PROJECT satt och Claude-modellen enabled i Vertex Model Garden för
    projektet. No-op om GCP-projekt saknas → polling/risk_detector blir no-op men
    kraschar inte."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — probe-motorer otillgängliga (ingen US-fallback)")
        return {}

    engines: dict[str, Any] = {}
    try:
        gid = model_registry.get_id("probe_gemini")
        engines[gid] = token_meter.track(_vertex_gemini(gid), gid)
    except Exception as exc:
        log.warning("Gemini probe (Vertex) init failed: %s", exc)

    try:
        cid = model_registry.get_id("probe_claude")
        engines[cid] = token_meter.track(_vertex_anthropic(cid), cid)
    except Exception as exc:
        log.warning("Claude probe (Vertex) init failed: %s", exc)

    return engines


# Auktoritativ lista över ALLA probe-motorer vi vill mäta — live ELLER planerade.
# Driver health-statusraden i AI-synlighet-fliken: UI:t visar samma 6 motorer oavsett
# vilka som faktiskt är inkopplade, så att roadmap-bredden är synlig. När en motor
# kopplas in: flippa "status" till "live" och säkerställ att make_probe_engines()
# returnerar en klient under samma `id`. Modell-id för live-motorer kommer från
# services/model_registry — uppdatera DÄR, inte här.
PROBE_ENGINE_REGISTRY: list[dict[str, Any]] = [
    {"id": model_registry.get_id("probe_claude"), "label": "Claude", "vendor": "Anthropic (Vertex)",
     "status": "live", "note": None},
    {"id": model_registry.get_id("probe_gemini"), "label": "Gemini", "vendor": "Google (Vertex)",
     "status": "live", "note": None},
    {"id": "gpt", "label": "ChatGPT", "vendor": "OpenAI", "status": "planned",
     "note": "Direkt API parkerat 2026-06-02 (krediter/nyckelhantering). Kan återinföras när separat OpenAI-spår behövs."},
    {"id": "perplexity", "label": "Perplexity", "vendor": "Perplexity AI", "status": "planned",
     "note": "Ren AI-sökmotor — planerad nästa fas (REST-API)"},
    {"id": "copilot", "label": "Copilot", "vendor": "Microsoft", "status": "planned",
     "note": "Retrieval-augmenterad sök — planerad"},
    {"id": "mistral", "label": "Mistral", "vendor": "Mistral AI", "status": "planned",
     "note": "EU-baserad — planerad nästa fas"},
]


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
