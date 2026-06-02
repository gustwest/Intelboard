"""Modellregister — auktoritativ källa för vilka AI-modeller systemet använder.

POLICY: **alltid senaste stabla modellen i varje provider/roll.** Inga "medvetna
pinningar" finns. När `latest_known` uppdateras → uppdatera samtidigt `model_id`
och `checked_at` i samma commit. Drift-scannen flaggar varje avvikelse.

Driver:
  * services/llm.py (resonemang + probe-motorer)
  * services/email_extraction.py (event-extraktion)
  * /api/model-registry (frontend speglar)
  * jobs/model_drift_scan (veckovis: model_id != latest_known → warning,
    checked_at >90 dagar → påminnelse, hårdkodning utanför registret → warning)

Verifiering: `latest_known` sätts genom att läsa providerns modell-doc-sida.
`checked_at` markerar när det senast verifierades. När 90 dagar gått flaggar
scannen i inboxen så ops kör om verifieringen.

Lägg ALDRIG till nya hårdkodade model-ID utanför detta register — scannen
flaggar det automatiskt.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable


@dataclass(frozen=True)
class ModelEntry:
    role: str                # stabil nyckel, t.ex. "geo_validator"
    model_id: str            # det vi faktiskt skickar till leverantören (= latest_known)
    provider: str            # "vertex_gemini" | "openai" | "google_genai" | "vertex_anthropic" | "claude_code_cli"
    purpose: str             # kort beskrivning på svenska
    latest_known: str        # senaste stabla modell-ID hos providern (verifierat)
    checked_at: str          # ISO-datum då latest_known senast verifierades


# CHECKED_AT delas av alla entries vid en samlad verifiering — varje rad får dock
# sätta sitt eget värde om endast en provider verifierats vid ett tillfälle.
_CHECKED = "2026-06-02"

_REGISTRY: tuple[ModelEntry, ...] = (
    # --- GEO-claims-pipelinen (Vertex EU) ---------------------------------
    # 2026-06-02: gemini-3.5-flash är senaste stabla flash (Gemini 3.1-pro
    # är fortfarande preview, så validatorn håller 2.5-pro tills 3.x-pro stabiliseras).
    ModelEntry(
        role="geo_generator",
        model_id="gemini-3.5-flash",
        provider="vertex_gemini",
        purpose="Generering + relevansgrindning för claims-pipelinen (services/llm.make_generator)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
    ),
    ModelEntry(
        role="geo_validator",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="Precisionskritisk validator i claims-pipelinen (services/llm.make_validator)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
    ),
    # --- ESG-loopens resonemangsmodell (Vertex EU) ------------------------
    ModelEntry(
        role="esg_reasoner",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="ESG-frågegenerering + svarsklassning (services/llm.make_esg_reasoner)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
    ),
    # --- Probe-motorer (de AI-assistenter VI MÄTER) ----------------------
    # Sedan 2026-06-02 körs båda probes via Vertex AI (samma EU-projekt som
    # validator). Vertex Gemini = identiska modell-weights som AI Studio och
    # publika Gemini-API:t (Google: "same models, different platforms").
    # Claude på Vertex Model Garden = samma Claude-modell som Claude.ai (Anthropic).
    # Vinster: en auth-väg (service account/ADC), EU-residency för all probe-trafik,
    # ingen separat API-nyckel-hantering, ingen risk för whitespace-förorenade headers.
    # Mätsignal-not: byte från OpenAI-direkt → Claude-Vertex skiftar serien — logga
    # datumet 2026-06-02 och tolka pre/post separat tills nya baseline är låst.
    ModelEntry(
        role="probe_claude",
        model_id="claude-sonnet-4-5",
        provider="vertex_anthropic",
        purpose="Claude-probe i polling + risk_detector (services/llm._vertex_anthropic)",
        latest_known="claude-sonnet-4-5",
        checked_at=_CHECKED,
    ),
    ModelEntry(
        role="probe_gemini",
        model_id="gemini-2.5-pro",
        provider="vertex_gemini",
        purpose="Gemini-probe i polling + risk_detector (via Vertex AI EU)",
        latest_known="gemini-2.5-pro",
        checked_at=_CHECKED,
    ),
    # --- E-postextraktion (services/email_extraction._pick_llm) -----------
    ModelEntry(
        role="email_extractor_openai",
        model_id="gpt-5.5",
        provider="openai",
        purpose="Strukturera fritext-mail till Schema.org Event (primär)",
        latest_known="gpt-5.5",
        checked_at=_CHECKED,
    ),
    ModelEntry(
        role="email_extractor_gemini",
        model_id="gemini-3.5-flash",
        provider="google_genai",
        purpose="Strukturera fritext-mail till Schema.org Event (fallback)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
    ),
    # --- Claude Code admin-agent (backend/) -------------------------------
    ModelEntry(
        role="agent_default",
        model_id="claude-opus-4-8",
        provider="claude_code_cli",
        purpose="Default-modell för admin-agenten (backend/routers/agent.py, frontend dropdown)",
        latest_known="claude-opus-4-8",
        checked_at=_CHECKED,
    ),
    ModelEntry(
        role="agent_sonnet",
        model_id="claude-sonnet-4-6",
        provider="claude_code_cli",
        purpose="Sonnet-alternativ i admin-dropdown (snabbare/billigare)",
        latest_known="claude-sonnet-4-6",
        checked_at=_CHECKED,
    ),
    ModelEntry(
        role="agent_haiku",
        model_id="claude-haiku-4-5-20251001",
        provider="claude_code_cli",
        purpose="Haiku-alternativ i admin-dropdown (lägst latens)",
        latest_known="claude-haiku-4-5-20251001",
        checked_at=_CHECKED,
    ),
    # --- backend/ai.py dataset-summarizer ---------------------------------
    ModelEntry(
        role="dataset_summarizer",
        model_id="gemini-3.5-flash",
        provider="google_genai_vertex",
        purpose="Skriver kort sammanfattning vid nytt dataset (backend/ai.py)",
        latest_known="gemini-3.5-flash",
        checked_at=_CHECKED,
    ),
)


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


# Historiska model-ID som fortfarande får dyka upp i koden — typiskt som lookup-
# nycklar för historiska Firestore-payloads (trust_gap_report.ENGINE_SV mappar
# t.ex. legacy "gpt-4o"-engine-strängar till visningsnamnet "ChatGPT"). De är
# inte aktiv runtime-konfig — men drift-scannen får inte flagga dem som
# "unauthorized_hardcode". Rensa bort raden när den sista historiska posten
# i Firestore har sin TTL passerat.
LEGACY_ALIASES: frozenset[str] = frozenset({
    "gpt-4o",          # tidigare probe_openai (direkt OpenAI), ersatt 2026-06-02 av Claude-Vertex
    "gpt-5.5",         # kort interimsversion som probe_openai före Vertex-flytten
    "gemini-1.5-pro",  # tidigare probe_gemini (direkt google_genai)
    "gemini-3.5-flash", # tidigare probe_gemini-version före vertex-flytten
})


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
