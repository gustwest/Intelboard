"""TED-connector — offentliga kontraktstilldelningar (EU) → social proof (A4, must-tier).

TED (Tenders Electronic Daily, ted.europa.eu) publicerar alla EU-annonserade
offentliga upphandlingar. Sök-API:t (api.ted.europa.eu/v3) är GRATIS, kräver ingen
nyckel och ingen auth. Vi hämtar de kontrakt en kund VUNNIT — tredjepartsverifierad
social proof ("offentlig köpare valde detta bolag") som AI-motorer kan citera med
källa, till skillnad från självdeklarerade påståenden.

Entitetsupplösning (det svåra i externa register) löses rent av TED självt: fältet
`winner-identifier` bär de tilldelade leverantörernas org.nr. Vi frågar API:t direkt
på `winner-identifier=<kundens org.nr>` → träffarna ÄR per definition kund-vunna
kontrakt. Ingen fuzzy namnmatchning behövs. Svenska org.nr i TED har streckformat
(NNNNNN-NNNN); vi normaliserar kundens lagrade org.nr till det formatet inför frågan.

Kör på bolagsnivå, kvartalsvis (offentlig upphandlingsdata rör sig långsamt). Varje
notis → ett RawItem (source="ted"); derive_contract_claims (schema_org/claims.py) gör
dem till narrative social-proof-claims med TED-notisen som källnod (kind="item" → fotnot).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem

log = logging.getLogger(__name__)

SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"
TIMEOUT = 30
# Tak mot runaway: de senaste N vunna kontrakten räcker som social proof.
MAX_NOTICES = 25
# Hur långt bak vi hämtar (social proof äldre än så känns inaktuell). Heltalsår.
LOOKBACK_YEARS = 6
# Fält vi begär ur sök-API:t (eForms business-terms). Verifierade mot live-API:t.
FIELDS = [
    "publication-number",
    "publication-date",
    "notice-title",
    "buyer-name",
    "winner-identifier",
    "links",
]


class TedConnector(BaseConnector):
    id = "ted"
    fetch_method = "api"
    output_types = ("Organization",)
    frequency = "quarterly"
    tier = "standard"
    input_fields = (
        InputField(
            "org_number",
            "Organisationsnummer",
            type="text",
            required=True,
            placeholder="5566778899",
            help="Svenskt org.nr (10 siffror). Används för att hitta offentliga "
                 "upphandlingar bolaget vunnit (TED/EU). Härleds oftast automatiskt.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        org = _normalize_org(config.params.get("org_number"))
        if not org:
            return []

        # winner-identifier stöder bara exakt matchning (ingen contains-operator), och
        # TED lagrar svenska vinnare i olika former: streck-org.nr (556569-3792),
        # VAT (SE556569379201) och rentsiffrigt. OR:a de troliga formerna.
        forms = [f'winner-identifier="{f}"' for f in (_dashed(org), f"SE{org}01", org)]
        query = (
            f'({" OR ".join(forms)}) AND publication-date>={_cutoff_yyyymmdd()} '
            f"SORT BY publication-date DESC"
        )
        notices = _search(query)
        if not notices:
            return []

        items: list[RawItem] = []
        for n in notices:
            pub = (n.get("publication-number") or "").strip()
            if not pub:
                continue
            # Servern filtrerar redan på winner-identifier, men dubbelkolla att vårt
            # org.nr verkligen står som vinnare. Vinnarsträngen kan vara streck-org.nr,
            # rentsiffrig eller VAT (SE+org+01) → matcha org.nr som delsträng av siffrorna.
            winner_digits = [re.sub(r"\D", "", w) for w in (n.get("winner-identifier") or []) if isinstance(w, str)]
            if winner_digits and not any(org in wd for wd in winner_digits):
                continue
            buyer = _lang_value(n.get("buyer-name"))
            if not buyer:
                continue
            title = _lang_value(n.get("notice-title"))
            url = _notice_url(n.get("links")) or f"https://ted.europa.eu/sv/notice/-/detail/{pub}"
            year = _year(n.get("publication-date"), pub)
            items.append(
                RawItem(
                    source="ted",
                    schema_type="Organization",
                    content=title or "",  # verbatim notistitel — ingen LLM
                    url=url,
                    published_at=datetime.now(timezone.utc),
                    extra={
                        "org_number": org,
                        "buyer": buyer,
                        "publication_number": pub,
                        "notice_year": year,
                        "notice_title": title or "",
                        "multiple_winners": len(winner_digits) > 1,
                    },
                    item_id=f"ted-{org}-{pub}",  # idempotent persist
                )
            )
        return items


# --- TED-anrop -------------------------------------------------------------


def _search(query: str) -> list[dict]:
    """POST mot TED sök-API:t. Temporära fel / 4xx → [] (logga, kasta inget)."""
    body = {
        "query": query,  # sortering uttrycks som "SORT BY ..." i query-strängen
        "fields": FIELDS,
        "limit": MAX_NOTICES,
        "page": 1,
        "paginationMode": "PAGE_NUMBER",
    }
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.post(SEARCH_URL, json=body)
    except httpx.HTTPError as exc:
        log.warning("ted search failed: %s", exc)
        return []
    if resp.status_code != 200:
        log.warning("ted search → %s: %s", resp.status_code, resp.text[:200])
        return []
    try:
        payload = resp.json()
    except ValueError:
        log.warning("ted search → invalid JSON")
        return []
    notices = payload.get("notices")
    return notices if isinstance(notices, list) else []


# --- Parsning --------------------------------------------------------------


def _normalize_org(raw: Any) -> str | None:
    """Org.nr → 10 rena siffror. Annat (None/för kort/för långt) → None."""
    digits = re.sub(r"\D", "", str(raw or ""))
    return digits if len(digits) == 10 else None


def _dashed(org10: str) -> str:
    """10 siffror → svenskt streckformat NNNNNN-NNNN (TED:s representation)."""
    return f"{org10[:6]}-{org10[6:]}"


def _lang_value(value: Any) -> str | None:
    """TED-textfält är språk-mappar ({"swe": [...], "eng": [...]}) eller listor/strängar.
    Föredra svenska, sedan engelska, annars första icke-tomma värdet."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        for v in value:
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None
    if isinstance(value, dict):
        for lang in ("swe", "eng"):
            got = _lang_value(value.get(lang))
            if got:
                return got
        for v in value.values():
            got = _lang_value(v)
            if got:
                return got
    return None


def _notice_url(links: Any) -> str | None:
    """Ren, läsbar notis-URL ur links-trädet. Föredra svensk HTML-detaljsida."""
    if not isinstance(links, dict):
        return None
    for section in ("html", "htmlDirect", "pdf"):
        block = links.get(section)
        if isinstance(block, dict):
            for lang in ("SWE", "ENG", "MUL"):
                url = block.get(lang)
                if isinstance(url, str) and url.strip():
                    return url.strip()
    return None


def _year(pub_date: Any, pub_number: str) -> str | None:
    """Publiceringsår. Helst ur publication-date (ISO), annars suffix i 'NNNN-YYYY'."""
    if isinstance(pub_date, str) and len(pub_date) >= 4 and pub_date[:4].isdigit():
        return pub_date[:4]
    m = re.search(r"-(\d{4})$", pub_number or "")
    return m.group(1) if m else None


def _cutoff_yyyymmdd() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year - LOOKBACK_YEARS}0101"
