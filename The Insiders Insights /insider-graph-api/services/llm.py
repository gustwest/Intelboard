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


def _location_for(role: str) -> str:
    """Vertex-region för en roll. Registret bestämmer per entry; tom string i registret
    fallar tillbaka till settings (EU). Probe-rollerna sätter "global"; resonemang
    lämnas tomma så de följer EU-defaultet."""
    return model_registry.location_for(role) or settings.vertex_location


def make_generator():
    """Generering/relevans (Gemini Flash) — snabb och billig, via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — generator otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(
        _vertex_gemini(GEO_GENERATOR_MODEL, location=_location_for("geo_generator")),
        GEO_GENERATOR_MODEL,
    )


def make_validator():
    """Vasst resonemang (Gemini Pro), via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — validator otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(
        _vertex_gemini(GEO_VALIDATOR_MODEL, location=_location_for("geo_validator")),
        GEO_VALIDATOR_MODEL,
    )


def make_claim_validator():
    """Validator för claims-extraktionen, med temperatur för SJÄLVKONSISTENS."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — claim-validator otillgänglig")
        return None
    return token_meter.track(
        _vertex_gemini(GEO_VALIDATOR_MODEL, temperature=0.4, location=_location_for("geo_validator")),
        GEO_VALIDATOR_MODEL,
    )


def make_esg_reasoner():
    """ESG-loopens resonemangsmodell (Gemini), via Vertex AI EU."""
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — ESG-reasoner otillgänglig (ingen US-fallback)")
        return None
    return token_meter.track(
        _vertex_gemini(ESG_MODEL, location=_location_for("esg_reasoner")),
        ESG_MODEL,
    )


# Konstruktions-sömmar (lazy import → modulen kan importeras utan SDK; patchas i tester).
def _vertex_gemini(model: str, temperature: float = 0, location: str | None = None):
    from langchain_google_vertexai import ChatVertexAI

    return ChatVertexAI(
        model=model, project=settings.gcp_project,
        location=location or settings.vertex_location,
        temperature=temperature,
    )


def _vertex_anthropic(model: str, location: str | None = None):
    from langchain_google_vertexai.model_garden import ChatAnthropicVertex

    return ChatAnthropicVertex(
        model_name=model, project=settings.gcp_project,
        location=location or settings.vertex_location,
        temperature=0,
    )


def _openai_chat(model: str):
    """OpenAI direktanslutning — GPT-modeller finns inte i Vertex Model Garden."""
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=settings.openai_api_key, model=model, temperature=0, timeout=60,
    )


# --- Probe-motorer (de publika AI-assistenterna vi MÄTER) ---------------------


def make_probe_engines() -> dict[str, Any]:
    """Probarna (Claude + Gemini + ChatGPT) mäter de publika AI-assistenter användare
    träffar. Sedan 2026-06-02 kör Vertex-probarna `vertex_location="global"` — payloaden
    är publik (bolagsnamn + generisk fråga), EU-residens behövs inte, och global endpoint
    ger dynamisk routing + snabbast modelluppgradering. ChatGPT-proben går direkt mot
    OpenAI eftersom GPT inte finns i Vertex Model Garden.

    Per-probe-isolering: en motors init-fel ska inte slå ut de andra (polling kör hellre
    med en motor mindre än ingen alls)."""
    engines: dict[str, Any] = {}

    if settings.gcp_project:
        try:
            gid = model_registry.get_id("probe_gemini")
            engines[gid] = token_meter.track(
                _vertex_gemini(gid, location=_location_for("probe_gemini")), gid,
            )
        except Exception as exc:
            log.warning("Gemini probe (Vertex) init failed: %s", exc)

        try:
            cid = model_registry.get_id("probe_claude")
            engines[cid] = token_meter.track(
                _vertex_anthropic(cid, location=_location_for("probe_claude")), cid,
            )
        except Exception as exc:
            log.warning("Claude probe (Vertex) init failed: %s", exc)
    else:
        log.warning("GCP-projekt ej satt — Vertex-probar otillgängliga (ChatGPT-proben kan ändå köra)")

    if settings.openai_api_key:
        try:
            oid = model_registry.get_id("probe_openai")
            engines[oid] = token_meter.track(_openai_chat(oid), oid)
        except Exception as exc:
            log.warning("OpenAI probe init failed: %s", exc)
    else:
        log.warning("OPENAI_API_KEY ej satt — ChatGPT-probe inte tillgänglig")

    return engines


# Auktoritativ lista över ALLA probe-motorer vi vill mäta — live ELLER planerade.
# Driver health-statusraden i AI-synlighet-fliken: UI:t visar samma 6 motorer oavsett
# vilka som faktiskt är inkopplade, så att roadmap-bredden är synlig. När en motor
# kopplas in: flippa "status" till "live" och säkerställ att make_probe_engines()
# returnerar en klient under samma `id`. Modell-id för live-motorer kommer från
# services/model_registry — uppdatera DÄR, inte här.
PROBE_ENGINE_REGISTRY: list[dict[str, Any]] = [
    {"id": model_registry.get_id("probe_claude"), "label": "Claude",
     "vendor": "Anthropic (Vertex global)", "status": "live", "note": None},
    {"id": model_registry.get_id("probe_gemini"), "label": "Gemini",
     "vendor": "Google (Vertex global)", "status": "live", "note": None},
    {"id": model_registry.get_id("probe_openai"), "label": "ChatGPT",
     "vendor": "OpenAI (direkt)", "status": "live", "note": None},
    {"id": "perplexity", "label": "Perplexity", "vendor": "Perplexity AI", "status": "planned",
     "note": "Ren AI-sökmotor — planerad nästa fas (REST-API)"},
    {"id": "copilot", "label": "Copilot", "vendor": "Microsoft", "status": "planned",
     "note": "Retrieval-augmenterad sök — planerad"},
    {"id": "mistral", "label": "Mistral", "vendor": "Mistral AI (Vertex Model Garden)",
     "status": "planned", "note": "EU-baserad — planerad nästa fas"},
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
