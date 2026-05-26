"""Semantisk berikning av platsannonser (spec §2) — ontologisk översättning + filtrering.

Slice 2 gav en deterministisk kompetens-baslinje (services/skill_extractor.py).
Den här modulen lägger det precisionskritiska LLM-steget ovanpå, via Vertex AI EU
(samma EU-only-regel och no-op-degradering som claim_extraction):

  1. Ontologisk översättning: lokal/intern titel → global industristandard
     ("Uppdragsledare inom digitalisering" → "Digital Transformation Manager"),
     så att globala AI-modeller förstår kapaciteten exakt.
  2. Kompetensextraktion: strategiska kompetenser (tech stack, ramverk,
     certifieringar, ledarskap, ESG) — generiskt brus bortsorterat.
  3. Kvalitativ filtrering: generiska roller (reception, allmän administration)
     klassas `strategic=false` och bidrar inte till kapabilitetsprofilen (§2.2).

Berikningen skrivs på TOPP-nivå i raw_item-dokumentet (global_title,
skills_enriched, strategic, enriched_at) — inte i `extra` — så att jobfeed-
connectorns dagliga merge-skrivning av `extra` inte råkar nolla den. Redan berikade
annonser (`enriched_at` satt) hoppas över → vi betalar för LLM:en en gång per annons.

No-op (0 berikade) om ingen validator-LLM är konfigurerad — allt ovanpå (decay,
kompilering) fungerar ändå på den deterministiska baslinjen.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from services import llm as llm_factory

log = logging.getLogger(__name__)

ENRICH_PROMPT = """Du normaliserar en platsannons för en kunskapsgraf om ett företags kapacitet.

Du får en jobbtitel och annonstext (svensk eller engelsk). Returnera ENDAST ett JSON-objekt:
{
  "global_title": "titeln översatt till global industristandard på engelska",
  "skills": ["strategiska kompetenser: tech stack, ramverk, certifieringar, ledarskap, ESG"],
  "strategic": true | false
}

Regler:
- global_title: översätt lokala/interna titlar till den vedertagna globala standarden
  (t.ex. "Uppdragsledare inom digitalisering" -> "Digital Transformation Manager").
- skills: bara spetskompetens som beskriver företagets kapacitet. Sortera bort
  generiskt brus (t.ex. "teamspelare", "noggrann", "körkort"). Max 12 st.
- strategic=false för generiska roller utan strategiskt värde (reception, allmän
  administration, vaktmästeri). strategic=true för spetskompetens, styrning och ESG.
- Hitta inte på. Returnera bara JSON, ingen annan text."""


def enrich_jobs_for_client(client_id: str, llm: Any | None = None) -> dict[str, Any]:
    """Berika ej tidigare berikade platsannonser för EN kund. Returnerar räknare."""
    llm = llm or _pick_validator()
    if llm is None:
        log.warning("no validator LLM — job enrichment skipped (baseline skills kept)")
        return {"client_id": client_id, "enriched": 0, "reason": "no_llm"}

    col = fs.raw_items_company_col(client_id)
    enriched = 0
    for snap in col.stream():
        raw = snap.to_dict() or {}
        if raw.get("schema_type") != "JobPosting":
            continue
        if raw.get("enriched_at"):
            continue  # redan berikad → betala inte igen
        extra = raw.get("extra") or {}
        result = enrich_one(llm, extra.get("name"), raw.get("content"))
        if result is None:
            continue  # LLM-fel/ogiltigt → lämna baslinjen orörd, försök nästa körning
        col.document(snap.id).set(_writeback(result), merge=True)
        enriched += 1

    if enriched:
        log.info("job enrichment %s: enriched %d job postings", client_id, enriched)
    return {"client_id": client_id, "enriched": enriched}


def enrich_one(llm, title: str | None, content: str | None) -> dict[str, Any] | None:
    """Ett LLM-anrop för en annons → normaliserad {global_title, skills, strategic}."""
    payload = f"TITEL: {title or ''}\n\nTEXT:\n{(content or '')[:6000]}"
    data = llm_factory.invoke_json(llm, ENRICH_PROMPT, payload)
    if not isinstance(data, dict):
        return None
    skills = data.get("skills")
    return {
        "global_title": (data.get("global_title") or None),
        "skills": [s for s in skills if s] if isinstance(skills, list) else [],
        # default strategic=True: hellre ta med än tappa en kompetens på ett tvetydigt svar
        "strategic": data.get("strategic") is not False,
    }


def _writeback(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "global_title": result["global_title"],
        "skills_enriched": result["skills"],
        "strategic": result["strategic"],
        "enriched_at": datetime.now(timezone.utc).isoformat(),
    }


# Module-level seam (patchas i tester).
def _pick_validator():
    return llm_factory.make_validator()
