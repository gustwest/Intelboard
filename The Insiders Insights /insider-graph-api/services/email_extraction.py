"""LLM-driven extraktion av Schema.org Event från fritext-mail.

Episodiska noder får en unik adress `{client_id}.{employee_id}@inbox.insidergraph.io`.
När personen mailar dit används denna modul för att tolka brödtexten och skapa
ett strukturerat Event-objekt.

Returnerar None om ingen LLM är konfigurerad eller om svaret saknar minimum-fält.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from services import llm as llm_factory

log = logging.getLogger(__name__)


@dataclass
class ExtractedEvent:
    name: str
    schema_type: str = "Event"
    start_date: str | None = None
    organizer: str | None = None
    about: str | None = None
    confidence: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)


SYSTEM_PROMPT = """Du extraherar strukturerad data från en fritext-e-post.
Avsändaren beskriver något som hänt eller ska hända — t.ex. en konferens där de talat,
ett pris de fått, en podcastinspelning, eller liknande.

Returnera ENDAST ett JSON-objekt med dessa fält:
{
  "schema_type": "Event" | "NewsArticle" | "Award" | "PodcastEpisode",
  "name": kort titel (max 80 tecken),
  "start_date": ISO 8601-datum (YYYY-MM-DD) eller null,
  "organizer": arrangör/utgivare eller null,
  "about": ämnesbeskrivning (max 200 tecken) eller null,
  "confidence": 0.0 - 1.0
}

Var konservativ med confidence. Sätt < 0.7 om något viktigt fält saknas eller är otydligt.
Returnera bara JSON, ingen annan text."""


def extract(text: str) -> ExtractedEvent | None:
    if not text.strip():
        return None
    llm = _pick_llm()
    if llm is None:
        log.warning("no LLM configured — email extraction skipped")
        return None

    try:
        resp = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=text)])
        raw = resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:
        log.warning("email extraction LLM call failed: %s", exc)
        return None

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        log.info("no JSON in LLM response")
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        log.info("invalid JSON in LLM response")
        return None

    name = (data.get("name") or "").strip()
    if not name:
        return None

    return ExtractedEvent(
        name=name[:80],
        schema_type=data.get("schema_type", "Event"),
        start_date=_validate_date(data.get("start_date")),
        organizer=(data.get("organizer") or None),
        about=(data.get("about") or None),
        confidence=float(data.get("confidence", 0.0)),
        raw=data,
    )


def _pick_llm():
    """Gemini via Vertex EU — enda vägen. Ingen US-fallback (EU-residens, DPA §6.1).

    Mailen innehåller ofta personnamn, kontaktuppgifter och kalenderdetaljer som
    räknas som kunddata. Därför körs extraktionen uteslutande på Vertex EU; den
    tidigare OpenAI-fallbacken (US) togs bort 2026-06-10 eftersom den hade skickat
    personuppgifter utanför EU/EES. Faller Vertex-vägen returneras None → email-
    extraktionen hoppas över (loggas i extract()), aldrig en tredjelandsöverföring.

    Instansen är token_meter.track-omsluten så cost_budget-enforcement (Fas 1.6)
    gäller även email-extraktionen.
    """
    try:
        return llm_factory.make_email_extractor_gemini()
    except Exception as exc:  # noqa: BLE001 — Vertex-strul ska inte stoppa email-flödet
        log.warning("Vertex Gemini email-extractor init failed: %s — hoppar över (ingen US-fallback)", exc)
        return None


def _validate_date(value: Any) -> str | None:
    if not value:
        return None
    try:
        datetime.fromisoformat(str(value))
        return str(value)
    except (ValueError, TypeError):
        return None
