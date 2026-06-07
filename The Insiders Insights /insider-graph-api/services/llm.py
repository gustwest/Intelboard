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


def make_email_extractor_gemini():
    """Email-fritext → Schema.org Event. PRIMÄR sedan 2026-06-03 (flippat från OpenAI).

    Via Vertex AI EU så mail-innehållet (kunddata: personnamn, kontakter, kalender-
    detaljer) stannar i europe-west1. None om Vertex inte är konfigurerat — då
    faller email_extraction tillbaka till OpenAI-versionen.
    """
    if not settings.gcp_project:
        log.warning("EU-only: GCP-projekt ej satt — email_extractor_gemini otillgänglig")
        return None
    mid = model_registry.get_id("email_extractor_gemini")
    return token_meter.track(
        _vertex_gemini(mid, location=_location_for("email_extractor_gemini")),
        mid,
    )


def make_email_extractor_openai():
    """Email-fritext → Schema.org Event. FALLBACK sedan 2026-06-03.

    Används när Gemini-primären faller (Vertex-fel, kvot, etc). Direkt mot OpenAI
    — bryter mot EU-residenskravet men acceptabelt som tillfällig fallback medan
    den primära Vertex-vägen är nere; alternativet vore att tappa email-event-
    flödet helt. None om OPENAI_API_KEY saknas.
    """
    if not settings.openai_api_key:
        return None
    from langchain_openai import ChatOpenAI
    mid = model_registry.get_id("email_extractor_openai")
    return token_meter.track(
        ChatOpenAI(api_key=settings.openai_api_key, model=mid, temperature=0, timeout=30),
        mid,
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


def _openai_chat(model: str, temperature: float | None = None):
    """OpenAI direktanslutning — GPT-modeller finns inte i Vertex Model Garden.

    GPT-5-modeller stöder ENDAST temperature=1 (default). Värden < 1 returnerar
    400 "Only the default is supported". ChatOpenAI:s internt default är 0.7 →
    måste sättas explicit till 1 för gpt-5*. Tidigare modeller (gpt-4*) får
    fortsatt 0 för polling-konsistens.

    `temperature`-override (None = produktionsdefault) används av brusgolv-
    experimentet för att köra samma motor vid temp=0 och temp>0. GPT-5 kan inte
    hedra en override — API:t tillåter bara default 1, så den klampas dit."""
    from langchain_openai import ChatOpenAI

    if temperature is None:
        temperature = 1 if model.startswith("gpt-5") else 0
    elif model.startswith("gpt-5"):
        temperature = 1  # gpt-5 stöder bara default — override ignoreras
    return ChatOpenAI(
        api_key=settings.openai_api_key, model=model, temperature=temperature, timeout=60,
    )


def _perplexity_chat(model: str, temperature: float | None = None):
    """Perplexity-probe via deras direkta API (OpenAI-kompatibel). Mäter web-RAG-
    signal — vad AI hittar om bolaget LIVE på webben, distinkt från training-data-
    baserade probarna. Finns inte i Vertex Model Garden, så separat auth-väg.

    `temperature`-override (None = produktionsdefault 0) för brusgolv-experimentet."""
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=settings.perplexity_api_key,
        base_url="https://api.perplexity.ai",
        model=model,
        temperature=0 if temperature is None else temperature,
        timeout=60,
    )


def _anthropic_chat(model: str, temperature: float | None = None):
    """Claude-probe via första-parts Anthropic API (api.anthropic.com). 2026-06-04
    bytte vi från Vertex Model Garden (quota=0 på global endpoint + hostname-bugg) till
    direkt-API — samma mönster som ChatGPT/Perplexity. Publik probe-payload, ingen
    kunddata, så ingen EU-residens-konflikt.

    `temperature`-override (None = produktionsdefault 0) för brusgolv-experimentet."""
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        api_key=settings.anthropic_api_key,
        model=model,
        temperature=0 if temperature is None else temperature,
        max_tokens=1024,
        timeout=60,
    )


def _vertex_mistral(model: str, location: str | None = None):
    """Mistral via Vertex Model Garden MaaS — OpenAI-kompatibel chat-completions-endpoint.
    Auth görs med en kortlivad gcloud-access-token (service account), inte med en separat
    Mistral-API-nyckel. Vertex förnyar tokenen, men vi får inte cache:a klienten över längre
    tid eftersom tokenen löper ut (~60 min) — byggs nytt per make_probe_engines()-anrop.

    Två format-krav som inte är uppenbara:
      1. Vertex MaaS för Mistral kräver `<publisher>/<model>` i model-strängen (annars 400
         "Malformed publisher model"). Vi prefixar `mistralai/` här om det saknas.
      2. global endpoint stöder INTE Mistral (HTML 404) — använd regional location
         (europe-west4 / us-central1)."""
    from google.auth import default as _gauth_default
    from google.auth.transport.requests import Request as _GAuthRequest
    from langchain_openai import ChatOpenAI

    loc = location or settings.vertex_location
    credentials, _ = _gauth_default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(_GAuthRequest())

    base_url = (
        f"https://{loc}-aiplatform.googleapis.com/v1beta1/projects/{settings.gcp_project}/"
        f"locations/{loc}/endpoints/openapi"
    )
    model_id = model if "/" in model else f"mistralai/{model}"
    return ChatOpenAI(
        model=model_id,
        base_url=base_url,
        api_key=credentials.token,
        temperature=0,
        timeout=60,
    )


# --- Probe-motorer (de publika AI-assistenterna vi MÄTER) ---------------------


def _planned_probe_ids() -> set[str]:
    """Probarna som är markerade "planned" i PROBE_ENGINE_REGISTRY — dessa ska INTE
    returneras av make_probe_engines() (polling/risk_detector skulle annars retry:a
    404/timeout dem för varje fråga och hänga). Single source of truth: status-fältet
    i PROBE_ENGINE_REGISTRY längre ner."""
    return {row["id"] for row in PROBE_ENGINE_REGISTRY if row.get("status") == "planned"}


def make_probe_engines(temperature: float | None = None) -> dict[str, Any]:
    """Probarna (Claude + Gemini + ChatGPT + ev. Mistral + Perplexity) mäter de publika
    AI-assistenter användare träffar. Vertex-probarna kör typiskt `vertex_location="global"`
    eller en EU-region — payloaden är publik (bolagsnamn + generisk fråga), EU-residens
    behövs inte. ChatGPT-proben går direkt mot OpenAI eftersom GPT inte finns i Vertex
    Model Garden. Perplexity-proben går direkt mot api.perplexity.ai (web-RAG-signal).

    Per-probe-isolering: en motors init-fel ska inte slå ut de andra.

    Filtrering: motorer som är markerade "planned" i PROBE_ENGINE_REGISTRY SKIPPAS HELT.
    De skulle annars förbruka polling-jobbets retries och timeouts utan att ge data.

    `temperature` (None = produktionsdefault, dvs temp=0 för alla utom gpt-5) används av
    brusgolv-experimentet (services/noise_floor) för att köra samma motoruppsättning vid
    temp=0 och temp>0 och mäta hur mycket run-to-run-variansen växer. Produktionsanropen
    skickar inget → exakt oförändrat beteende."""
    engines: dict[str, Any] = {}
    planned = _planned_probe_ids()
    gemini_temp = 0 if temperature is None else temperature

    if settings.gcp_project:
        gid = model_registry.get_id("probe_gemini")
        if gid not in planned:
            try:
                engines[gid] = token_meter.track(
                    _vertex_gemini(gid, temperature=gemini_temp, location=_location_for("probe_gemini")), gid,
                )
            except Exception as exc:
                log.warning("Gemini probe (Vertex) init failed: %s", exc)

        mid = model_registry.get_id("probe_mistral")
        if mid not in planned:
            try:
                engines[mid] = token_meter.track(
                    _vertex_mistral(mid, location=_location_for("probe_mistral")), mid,
                )
            except Exception as exc:
                log.warning("Mistral probe (Vertex) init failed: %s", exc)
    else:
        log.warning("GCP-projekt ej satt — Vertex-probar otillgängliga (ChatGPT-proben kan ändå köra)")

    if settings.openai_api_key:
        oid = model_registry.get_id("probe_openai")
        if oid not in planned:
            try:
                engines[oid] = token_meter.track(_openai_chat(oid, temperature=temperature), oid)
            except Exception as exc:
                log.warning("OpenAI probe init failed: %s", exc)
    else:
        log.warning("OPENAI_API_KEY ej satt — ChatGPT-probe inte tillgänglig")

    if settings.anthropic_api_key:
        cid = model_registry.get_id("probe_claude")
        if cid not in planned:
            try:
                engines[cid] = token_meter.track(_anthropic_chat(cid, temperature=temperature), cid)
            except Exception as exc:
                log.warning("Claude probe (Anthropic direkt) init failed: %s", exc)
    else:
        log.warning("ANTHROPIC_API_KEY ej satt — Claude-probe inte tillgänglig")

    if settings.perplexity_api_key:
        pid = model_registry.get_id("probe_perplexity")
        if pid not in planned:
            try:
                engines[pid] = token_meter.track(_perplexity_chat(pid, temperature=temperature), pid)
            except Exception as exc:
                log.warning("Perplexity probe init failed: %s", exc)
    else:
        log.warning("PERPLEXITY_API_KEY ej satt — Perplexity-probe (web-RAG-signal) inte tillgänglig")

    return engines


# Auktoritativ lista över ALLA probe-motorer vi vill mäta — live ELLER planerade.
# Driver health-statusraden i AI-synlighet-fliken: UI:t visar samma 6 motorer oavsett
# vilka som faktiskt är inkopplade, så att roadmap-bredden är synlig. När en motor
# kopplas in: flippa "status" till "live" och säkerställ att make_probe_engines()
# returnerar en klient under samma `id`. Modell-id för live-motorer kommer från
# services/model_registry — uppdatera DÄR, inte här.
PROBE_ENGINE_REGISTRY: list[dict[str, Any]] = [
    {"id": model_registry.get_id("probe_claude"), "label": "Claude",
     "vendor": "Anthropic (direkt)", "status": "live", "note": None},
    {"id": model_registry.get_id("probe_gemini"), "label": "Gemini",
     "vendor": "Google (Vertex europe-west1)", "status": "live", "note": None},
    {"id": model_registry.get_id("probe_openai"), "label": "ChatGPT",
     "vendor": "OpenAI (direkt)", "status": "live", "note": None},
    {"id": model_registry.get_id("probe_mistral"), "label": "Mistral Le Chat",
     "vendor": "Mistral AI (Vertex MaaS)", "status": "planned",
     "note": "EULA accepterad programmatiskt 2026-06-04 men modellen returnerar "
             "fortfarande 404 — kräver INTERAKTIV Subscribe/Get-started i Cloud "
             "Console (Model Garden → Mistral Medium 3) kopplad till faktureringskonto. "
             "När Subscribe är klar + anrop ger 200: flippa denna 'planned' → 'live'."},
    {"id": model_registry.get_id("probe_perplexity"), "label": "Perplexity",
     "vendor": "Perplexity AI (web-RAG)", "status": "live", "note": None},
    # Copilot borttagen 2026-06-04: drivs av OpenAI/GPT i bakgrunden, så det är samma
    # signal som probe_openai mäter redan — ingen separat mätvärde att vinna.
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
