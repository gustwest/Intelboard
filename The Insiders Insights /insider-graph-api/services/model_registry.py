"""Modellregister — auktoritativ källa för vilka AI-modeller systemet använder.

POLICY: **alltid senaste stabla modellen i varje provider/roll.** När `latest_known`
uppdateras → uppdatera samtidigt `model_id`, `checked_at` och (vid faktiskt byte)
`effective_since` i samma commit. Drift-scannen flaggar varje avvikelse.

EU-residens hanteras PER ENTRY via `vertex_location`:
  * Resonemangsroller (geo_*, esg_*) ligger kvar i EU (settings.vertex_location).
  * Probe-roller använder "global" — payloaden är publik (bolagsnamn + generisk
    fråga), ingen kunddata, och global endpoint ger bästa modelltillgänglighet +
    minst latens (dynamisk routing).

`effective_since` (ISO-datum) markerar när nuvarande `model_id` började användas.
Polling/AI-synlighet ritar en brytlinje där så jämförelser över bytet inte tolkas
som äkta trend (kalibreringsskydd).
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable


@dataclass(frozen=True)
class ModelEntry:
    role: str
    model_id: str
    provider: str
    purpose: str
    latest_known: str
    checked_at: str
    effective_since: str
    # Vertex-region per roll. Tomt = använd settings.vertex_location (default EU).
    # Sätt "global" för dynamisk routing (probe-roller), "europe-west1" / etc för
    # explicit pinning. Endast meningsfullt för Vertex-providers.
    vertex_location: str = ""
    # Var modellens svar kommer ifrån. Driver UI-grupperingen i AI-synlighet och
    # håller statistiken sane (man medeltalar inte över olika fördelningar).
    #   * "training" — RLHF, svar från träningsdata + safety-tuning. Default för
    #     bas-LLM:er (Claude, GPT, Gemini, Mistral).
    #   * "web_rag"  — Live web-RAG, svaret bygger på vad som hittas på webben NU
    #     (Perplexity Sonar, Google AI Overviews, Bing Chat).
    #   * "hybrid"   — Modeller som blandar (t.ex. ChatGPT med browsing aktiverat —
    #     vi mäter ändå "vanliga" ChatGPT som "training").
    knowledge_source: str = "training"


_CHECKED = "2026-06-02"
_EFFECTIVE = "2026-06-02"

_REGISTRY: tuple[ModelEntry, ...] = (
    # --- GEO-claims-pipelinen (Vertex EU — kunddata) ----------------------
    ModelEntry(
        role="geo_generator",
        model_id="gemini-3.5-flash",
        provider="vertex_gemini",
        purpose="Generering + relevansgrindning för claims-pipelinen (services/llm.make_generator)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    ModelEntry(
        role="geo_validator",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="Precisionskritisk validator i claims-pipelinen (senaste stabla pro; 3.x-pro är preview)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    # --- ESG-loopens resonemangsmodell (Vertex EU) ------------------------
    ModelEntry(
        role="esg_reasoner",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="ESG-frågegenerering + svarsklassning (services/llm.make_esg_reasoner)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    # --- Probe-motorer (publika AI-assistenter VI MÄTER) -------------------
    # Payloaden är publik (bolagsnamn + generisk fråga). EU-låsningen är inaktuell
    # här — vi vill istället ha bästa möjliga mätvaliditet och tillgänglighet:
    #   * Vertex-probarna kör global endpoint → dynamisk routing, ny modell-release
    #     når oss direkt utan region-glapp.
    #   * OpenAI-proben är direktanslutning eftersom GPT inte finns i Vertex.
    ModelEntry(
        role="probe_claude",
        model_id="claude-sonnet-4-6",
        provider="vertex_anthropic",
        purpose="Claude-probe i polling + risk_detector (Vertex Model Garden, global)",
        latest_known="claude-sonnet-4-6",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
        vertex_location="global",
    ),
    ModelEntry(
        role="probe_gemini",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="Gemini-probe i polling + risk_detector (Vertex AI EU)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
        effective_since="2026-06-03",
        # gemini-2.5-pro finns inte på global endpoint (501→404). europe-west1 fungerar
        # och stannar i EU för konsistens med resonemangs-modellerna.
        vertex_location="europe-west1",
    ),
    ModelEntry(
        role="probe_openai",
        model_id="gpt-5.5",
        provider="openai",
        purpose="ChatGPT-probe i polling + risk_detector (OpenAI direkt — finns inte i Vertex)",
        latest_known="gpt-5.5",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    ModelEntry(
        role="probe_mistral",
        model_id="mistral-medium-3",
        provider="vertex_mistral",
        purpose="Mistral Le Chat-probe (Vertex MaaS, OpenAI-kompatibel endpoint, EU)",
        latest_known="mistral-medium-3",
        checked_at=_CHECKED,
        effective_since="2026-06-03",
        # Mistral MaaS finns inte på global endpoint (HTML 404). europe-west4 fungerar
        # (us-central1 är fallback). Wrappern lägger till "mistralai/"-publisher-prefix.
        vertex_location="europe-west4",
    ),
    ModelEntry(
        role="probe_perplexity",
        model_id="sonar",
        provider="perplexity",
        purpose="Perplexity-probe (Sonar, web-RAG) — mäter AI-discoverability live på webben",
        latest_known="sonar",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
        knowledge_source="web_rag",
    ),
    # --- E-postextraktion (services/email_extraction._pick_llm) -----------
    ModelEntry(
        role="email_extractor_openai",
        model_id="gpt-5.5",
        provider="openai",
        purpose="Strukturera fritext-mail till Schema.org Event (primär)",
        latest_known="gpt-5.5",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    ModelEntry(
        role="email_extractor_gemini",
        model_id="gemini-3.5-flash",
        provider="google_genai",
        purpose="Strukturera fritext-mail till Schema.org Event (fallback)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    # --- Claude Code admin-agent (backend/) -------------------------------
    ModelEntry(
        role="agent_default",
        model_id="claude-opus-4-8",
        provider="claude_code_cli",
        purpose="Default-modell för admin-agenten",
        latest_known="claude-opus-4-8",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    ModelEntry(
        role="agent_sonnet",
        model_id="claude-sonnet-4-6",
        provider="claude_code_cli",
        purpose="Sonnet-alternativ i admin-dropdown (snabbare/billigare)",
        latest_known="claude-sonnet-4-6",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    ModelEntry(
        role="agent_haiku",
        model_id="claude-haiku-4-5-20251001",
        provider="claude_code_cli",
        purpose="Haiku-alternativ i admin-dropdown (lägst latens)",
        latest_known="claude-haiku-4-5-20251001",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
    # --- backend/ai.py dataset-summarizer ---------------------------------
    ModelEntry(
        role="dataset_summarizer",
        model_id="gemini-3.5-flash",
        provider="google_genai_vertex",
        purpose="Skriver kort sammanfattning vid nytt dataset (backend/ai.py)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
        effective_since=_EFFECTIVE,
    ),
)


# Historiska model-ID som fortfarande får dyka upp i koden — typiskt lookup-
# nycklar i historiska Firestore-payloads (trust_gap_report.ENGINE_SV mappar
# t.ex. legacy "gpt-4o"-engine-strängar till visningsnamnet "ChatGPT").
LEGACY_ALIASES: frozenset[str] = frozenset({
    "gpt-4o",            # tidigare probe_openai (ersatt av gpt-5.5)
    "gemini-1.5-pro",    # tidigare probe_gemini & email_extractor_gemini
    "claude-sonnet-4-5", # tidigare probe_claude EU-pinnad (ersatt av sonnet-4-6 via global)
    # Pricing-katalog (services/cost_estimator) listar BÅDE aktiva och historiska
    # modeller för att kunna prissätta gamla job_runs.summary.tokens-poster. Dessa
    # är inte runtime-konfig men dyker upp i grep-passet.
    "claude-opus-4-7",   # legacy agent_default + historiska prissatta anrop
    "gemini-2.5-flash",  # legacy geo_generator (ersatt av 3.5-flash)
    "gemini-3.5-pro",    # spekulativ pricing-entry (modellen finns inte stable ännu)
})


def get(role: str) -> ModelEntry:
    """Slå upp en roll. Kastar om rollen saknas — vill inte tysta typos."""
    for entry in _REGISTRY:
        if entry.role == role:
            return entry
    raise KeyError(f"Okänd modell-roll: {role!r}. Lägg till i services/model_registry.")


def get_id(role: str) -> str:
    return get(role).model_id


def all_entries() -> tuple[ModelEntry, ...]:
    return _REGISTRY


def location_for(role: str) -> str:
    """Returnera Vertex-region för en roll. Tom string → använd settings.vertex_location.
    Anropare ska normalt göra: ``entry.vertex_location or settings.vertex_location``."""
    return get(role).vertex_location


# --- Knowledge-source-mappning (probe-engines → "training" / "web_rag") -------
# Anropas av trust_gap_report._perception_by_engine för att gruppera AI-motorerna
# i AI Base Knowledge vs AI Live Signal — UI:t medeltalar aldrig över dessa.
# Legacy kort-namn ("perplexity", "sonar") tas med eftersom historiska polling-
# veckor sparades med dem före model_registry-flytten.
_LEGACY_KNOWLEDGE_SOURCE: dict[str, str] = {
    "perplexity": "web_rag",
    "sonar": "web_rag",
    "gpt-4o": "training",
    "gemini-1.5-pro": "training",
    "claude-sonnet-4-5": "training",
}


def knowledge_source_for(engine_id: str) -> str:
    """Slå upp knowledge_source ("training" / "web_rag" / "hybrid") för ett engine-id.

    Default är "training" om id:t inte finns i registret eller bland legacy-aliaserna —
    det är den säkraste defaulten för bas-LLM:er och har varit Antagandet historiskt.
    """
    for entry in _REGISTRY:
        if entry.role.startswith("probe_") and entry.model_id == engine_id:
            return entry.knowledge_source
    return _LEGACY_KNOWLEDGE_SOURCE.get(engine_id, "training")


def authorized_model_ids() -> set[str]:
    """Alla model-ID som registret känner till — aktiva + legacy-aliases — så
    drift-scannens grep-jämförelse inte flaggar historiska lookup-nycklar."""
    ids: set[str] = set(LEGACY_ALIASES)
    for entry in _REGISTRY:
        ids.add(entry.model_id)
        ids.add(entry.latest_known)
    return ids


def as_dicts() -> list[dict]:
    """Serialiserbar form för /api/model-registry."""
    return [asdict(e) for e in _REGISTRY]


def stale_entries(today_iso: str, max_age_days: int = 90) -> Iterable[ModelEntry]:
    """Entries där `checked_at` är äldre än max_age_days — providerns katalog kan
    ha hunnit dra ifrån. Yieldar bara, drift-scannen bestämmer vad som händer."""
    from datetime import date

    today = date.fromisoformat(today_iso)
    for entry in _REGISTRY:
        try:
            checked = date.fromisoformat(entry.checked_at)
        except ValueError:
            yield entry
            continue
        if (today - checked).days > max_age_days:
            yield entry


def behind_latest() -> Iterable[ModelEntry]:
    """Entries där model_id != latest_known. Vid strikt "alltid senaste"-policy
    SKA detta vara tom uppsättning — varje träff är ett bugg-läge."""
    for entry in _REGISTRY:
        if entry.model_id != entry.latest_known:
            yield entry
