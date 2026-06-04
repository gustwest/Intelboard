"""Wikipedia/Wikidata-connector — högauktoritativ faktabas + entity-reconciliation.

Wikidata är AI-motorernas strukturerade identitetsnav; en Wikipedia-artikel är en
hög-citerbar training-källa. En `sameAs`-länk till Wikidata/Wikipedia stärker
motorernas entitetsupplösning kraftigt — de korsrefererar Wikidata tungt.

SANNING, INTE SMINK (samma etik som övriga connectors): en FELMATCHAD entitet
injicerar falska fakta. Därför tar connectorn ett EXPLICIT `wikidata_id` (Q-nummer)
— exakt som GLEIF tar en LEI. Ingen luddig namn-auto-matchning i fetch(); det
skulle riskera att hämta fel bolags fakta. `search_wikidata()` finns för onboarding
(namn → kandidat-Q-id) men operatören väljer/bekräftar.

Producerar OPERATIONELLA property-claims (founding, säte, bransch, LEI) + en
Wikipedia-baserad beskrivning + sameAs. INGA värme-/culture-claims (Wikipedia bär
sällan wellbeing/etik-sentiment) — den stärker den faktiska Organization-stommen.

Kör på bolagsnivå, månadsvis. Saknat fält (vanligt) är inget fel — vi tar det vi
hittar och returnerar ändå ett item om grunddata finns.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem

log = logging.getLogger(__name__)

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
TIMEOUT = 20
# Wikidata-egenskaper vi läser. Datum/sträng-värdade läses direkt; entity-värdade
# (HQ, bransch) bär ett Q-id som måste slås upp till en läsbar etikett.
P_INCEPTION = "P571"      # grundat (tid)
P_HQ = "P159"             # huvudkontor (entity → ort)
P_INDUSTRY = "P452"       # bransch (entity)
P_WEBSITE = "P856"        # officiell webbplats (URL)
P_LEI = "P1278"           # LEI-kod (sträng)
_LANG = "sv"              # föredragen Wikipedia-språkversion (fallback en)


class WikipediaConnector(BaseConnector):
    id = "wikipedia"
    fetch_method = "api"
    output_types = ("Organization",)
    frequency = "monthly"
    tier = "standard"
    input_fields = (
        InputField(
            "wikidata_id",
            "Wikidata-ID (Q-nummer)",
            type="text",
            required=True,
            placeholder="Q95",
            help="Bolagets Wikidata-entitet, t.ex. Q95. Slå upp på wikidata.org — "
                 "vi matchar ALDRIG på namn automatiskt (risk att hämta fel bolags fakta).",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        qid = (config.params.get("wikidata_id") or "").strip().upper()
        if not qid or not qid.startswith("Q") or not qid[1:].isdigit():
            return []

        entity = _get_entity(qid)
        if entity is None:
            return []  # okänt Q-id eller temporärt fel → inget item

        claims = entity.get("claims") or {}
        labels = entity.get("labels") or {}
        sitelinks = entity.get("sitelinks") or {}

        name = _label(labels)
        extra: dict[str, Any] = {"wikidata_id": qid}
        if name:
            extra["name"] = name

        # Datum/sträng-värdade egenskaper — läses direkt.
        founded = _inception_year(claims.get(P_INCEPTION))
        if founded:
            extra["founded"] = founded
        lei = _string_value(claims.get(P_LEI))
        if lei:
            extra["lei"] = lei
        website = _string_value(claims.get(P_WEBSITE))
        if website:
            extra["official_website"] = website

        # Entity-värdade egenskaper (HQ, bransch) → samla Q-id, slå upp etiketter batchat.
        hq_qid = _entity_value(claims.get(P_HQ))
        industry_qid = _entity_value(claims.get(P_INDUSTRY))
        ref_labels = _get_labels([q for q in (hq_qid, industry_qid) if q])
        if hq_qid and ref_labels.get(hq_qid):
            extra["address"] = ref_labels[hq_qid]
        if industry_qid and ref_labels.get(industry_qid):
            extra["industry"] = ref_labels[industry_qid]

        # Wikipedia-artikel: kanonisk URL (→ sameAs) + extract (→ beskrivning).
        article_url, summary = _wikipedia_article(sitelinks)
        url = article_url or f"https://www.wikidata.org/wiki/{qid}"

        return [
            RawItem(
                source="wikipedia",
                schema_type="Organization",
                content=summary or "",  # extract → beskrivnings-claim; tom = bara properties
                url=url,                 # citerbar källa → flödar till sameAs
                published_at=datetime.now(timezone.utc),
                extra=extra,
                item_id=f"wikipedia-{qid}",  # idempotent persist
            )
        ]


# --- Wikidata/Wikipedia-anrop -----------------------------------------------


def _get_json(url: str, params: dict) -> dict | None:
    """GET med JSON. Temporära fel/icke-200/ogiltig JSON → None (kastar aldrig)."""
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "Geogiraph/1.0 (entity-reconciliation)"}) as c:
            resp = c.get(url, params=params)
    except httpx.HTTPError as exc:
        log.warning("wikipedia GET %s failed: %s", url, exc)
        return None
    if resp.status_code != 200:
        log.warning("wikipedia GET %s → %s", url, resp.status_code)
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def _get_entity(qid: str) -> dict | None:
    """Hämta full Wikidata-entitet (claims + labels + sitelinks)."""
    data = _get_json(WIKIDATA_API, {
        "action": "wbgetentities", "ids": qid, "format": "json",
        "props": "claims|labels|sitelinks",
    })
    if not data:
        return None
    return (data.get("entities") or {}).get(qid)


def _get_labels(qids: list[str]) -> dict[str, str]:
    """Batchad etikett-uppslagning för entity-värdade egenskaper (HQ, bransch)."""
    if not qids:
        return {}
    data = _get_json(WIKIDATA_API, {
        "action": "wbgetentities", "ids": "|".join(qids), "format": "json",
        "props": "labels", "languages": f"{_LANG}|en",
    })
    if not data:
        return {}
    out: dict[str, str] = {}
    for q, ent in (data.get("entities") or {}).items():
        lbl = _label(ent.get("labels") or {})
        if lbl:
            out[q] = lbl
    return out


def _wikipedia_article(sitelinks: dict) -> tuple[str | None, str | None]:
    """Hitta Wikipedia-artikel (sv föredraget, en fallback) → (kanonisk URL, extract)."""
    sitelink = sitelinks.get(f"{_LANG}wiki") or sitelinks.get("enwiki")
    if not sitelink:
        return None, None
    lang = _LANG if sitelinks.get(f"{_LANG}wiki") else "en"
    title = sitelink.get("title")
    if not title:
        return None, None
    summary = _get_json(
        f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title.replace(' ', '_')}",
        {},
    )
    if not summary:
        return f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}", None
    url = (summary.get("content_urls") or {}).get("desktop", {}).get("page")
    extract = summary.get("extract")
    return url or f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}", extract


# --- Parsning av Wikidata-snaks --------------------------------------------


def _label(labels: dict) -> str | None:
    for lang in (_LANG, "en"):
        node = labels.get(lang)
        if isinstance(node, dict) and node.get("value"):
            return node["value"]
    # Annars första bästa.
    for node in labels.values():
        if isinstance(node, dict) and node.get("value"):
            return node["value"]
    return None


def _first_mainsnak(statements: list | None) -> dict | None:
    if not statements:
        return None
    snak = (statements[0] or {}).get("mainsnak") or {}
    return snak.get("datavalue") or None


def _string_value(statements: list | None) -> str | None:
    dv = _first_mainsnak(statements)
    if dv and isinstance(dv.get("value"), str):
        return dv["value"].strip() or None
    return None


def _entity_value(statements: list | None) -> str | None:
    """Q-id ur en entity-värdad egenskap (HQ, bransch)."""
    dv = _first_mainsnak(statements)
    val = dv.get("value") if dv else None
    if isinstance(val, dict) and val.get("id"):
        return val["id"]
    return None


def _inception_year(statements: list | None) -> str | None:
    """Grundat-år ur P571 (Wikidata-tid: '+1998-00-00T00:00:00Z')."""
    dv = _first_mainsnak(statements)
    val = dv.get("value") if dv else None
    t = val.get("time") if isinstance(val, dict) else None
    if isinstance(t, str) and len(t) >= 5:
        year = t[1:5]  # hoppa över ledande +/-
        return year if year.isdigit() else None
    return None


def search_wikidata(query: str, limit: int = 5) -> list[dict]:
    """Sök Wikidata på namn — för onboarding (företagsnamn → kandidat-Q-id).
    Operatören väljer/bekräftar; vi auto-matchar aldrig. Returnerar [{id, name, description}]."""
    if not query.strip():
        return []
    data = _get_json(WIKIDATA_API, {
        "action": "wbsearchentities", "search": query, "language": _LANG,
        "uselang": _LANG, "format": "json", "type": "item", "limit": limit,
    })
    if not data:
        return []
    out: list[dict] = []
    for hit in data.get("search") or []:
        out.append({
            "id": hit.get("id"),
            "name": hit.get("label"),
            "description": hit.get("description"),
        })
    return out
