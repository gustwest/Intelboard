"""Bolagsverket-connector — årsredovisningar (iXBRL) → finansiella claims (A6, paket 3).

STATUS: SCAFFOLD — MEDVETET EJ REGISTRERAD i connectors/__init__.py REGISTRY ännu.
Den är därför 100% inert (anropas aldrig av connector-loopen) tills den är klar och
verifierad. Skälet: den faktiska API-autentiseringen och iXBRL-parsningen kan inte
skrivas korrekt förrän (1) Bolagsverkets API-nyckel kommit (den låser upp de exakta
endpoint-/auth-dokumenten) och (2) vi har en RIKTIG exempel-iXBRL att skriva parsern
mot. Att gissa K2/K3-strukturen blint = fel parser. Registrera FÖRST när båda finns.

Designbeslut (genomlysning 2026-06-12, master-tracker A4/A5/A6):
  * Källa: Bolagsverkets GRATIS "Värdefulla datamängder"-API (kostnadsfritt sedan
    feb 2025, EU:s open-data-direktiv; kommersiellt vidaredistribuerbart med
    attribution). INTE det betalda Företagsinformations-API:et (~5000 kr/mån).
  * Varje digitalt inlämnad årsredovisning levereras som iXBRL (K2/K3-taxonomi) →
    strukturerad parsning (py-xbrl/Arelle mot de fria taxonomierna på taxonomier.se)
    ger ~100% sifferprecision. LLM används ALDRIG för siffrorna (A1-guardrail:
    syntetisera aldrig tal; bind det verbatim-källförsedda talet som citat).
  * Claim-form (A5/A6): durabla rubrik-fakta → claims med VERBATIM-siffran som citat.
    numberOfEmployees → property-claim (schema.org-egenskap). Omsättning/resultat →
    narrative-claim med verbatim-citat (ingen ren schema.org-egenskap finns). PDF/
    rapporten länkas som källnod. Persona-taggning sker redan automatiskt i
    derive_property_claims (revenue/numberOfEmployees/foundingDate → investor).
  * Attribution: "Källa: Bolagsverket" krävs av återanvändningsvillkoren.

Kvarstår (KAN EJ byggas korrekt utan nyckel + exempel-iXBRL):
  * _fetch_token / _list_reports / _fetch_ixbrl — exakta endpoints + OAuth-flöde.
  * parse_ixbrl — fältmappning mot K2/K3-taxonomin, koncern-vs-moder, tusental-skala,
    teckenhantering (resultat inom parentes = negativt).
  * Styrelseledamöter saknas i gratis-datasetet (ligger i betal-API:et) → tas från
    kundens egen uppladdade rapport om de behövs.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem

log = logging.getLogger(__name__)

# Endpoints fylls i från de officiella API-dokumenten som följer med nyckeln.
# Bas-URL bekräftad ur researchen; de exakta sökvägarna verifieras mot dokumenten.
API_BASE = "https://gw.api.bolagsverket.se"  # PLACEHOLDER — verifiera mot API-doc
# Nyckeln bor som hemlighet (Secret Manager), inte per-kund-fält. Sätts i cloudbuild
# --update-secrets när connectorn aktiveras (jfr BREVO_API_KEY-mönstret).
_CLIENT_ID_ENV = "BOLAGSVERKET_CLIENT_ID"
_CLIENT_SECRET_ENV = "BOLAGSVERKET_CLIENT_SECRET"
TIMEOUT = 30


class BolagsverketConnector(BaseConnector):
    """Hämtar en kunds senaste årsredovisning (iXBRL) och härleder finansiella fakta.

    EJ registrerad ännu — se modul-docstring. Body:n är strukturen vi fyller i när
    nyckeln + ett exempel-iXBRL finns; tills dess returnerar fetch() tomt (dubbel
    säkerhet: även om den av misstag registreras gör den ingenting utan nyckel)."""

    id = "bolagsverket"
    fetch_method = "api"
    output_types = ("Organization",)
    frequency = "yearly"  # ny årsredovisning kommer ungefär årligen per bolag
    tier = "standard"
    input_fields = (
        InputField(
            "org_number",
            "Organisationsnummer",
            type="text",
            required=True,
            placeholder="5566778899",
            help="Svenskt org.nr (10 siffror). Används för att hämta bolagets "
                 "inlämnade årsredovisningar ur Bolagsverkets öppna data.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        org_number = (config.params.get("org_number") or "").strip()
        if not org_number:
            return []

        token = _fetch_token()
        if token is None:
            # Nyckel ej konfigurerad (eller temporärt fel) → inget item. Det här är
            # också det som gör scaffolden säker innan nyckeln finns.
            log.info("bolagsverket: ingen API-nyckel konfigurerad — hoppar över")
            return []

        # TODO(nyckel): hämta senaste årsredovisnings-dokumentet (iXBRL) för org_number.
        report = _fetch_latest_report(token, org_number)
        if report is None:
            return []

        # TODO(exempel-iXBRL): parsa till durabla rubrik-fakta. Tills parsern finns
        # kastar parse_ixbrl NotImplementedError — men vi når aldrig hit utan nyckel.
        figures = parse_ixbrl(report["ixbrl"])

        extra: dict[str, Any] = {"org_number": org_number, **figures}
        return [
            RawItem(
                source="bolagsverket",
                schema_type="Organization",
                # Verbatim-utdrag för A2.1-citat (de exakta siffrorna ur rapporten).
                content=report.get("excerpt", ""),
                url=report.get("url", ""),
                published_at=report["published_at"],
                extra=extra,
                item_id=f"bv-arsredovisning-{org_number}-{report['fiscal_year']}",
            )
        ]


# --- API-anrop (fylls i när nyckel + dokument finns) -------------------------


def _fetch_token() -> str | None:
    """OAuth2 client-credentials → access token. None om nyckel saknas/fel.

    TODO(nyckel): exakt token-endpoint + scope ur API-dokumenten. Returnerar None
    så länge BOLAGSVERKET_CLIENT_ID/SECRET inte är satta (= alltid, i scaffold-läge)."""
    client_id = os.environ.get(_CLIENT_ID_ENV)
    client_secret = os.environ.get(_CLIENT_SECRET_ENV)
    if not (client_id and client_secret):
        return None
    # TODO: POST token-endpoint med client_credentials, returnera access_token.
    raise NotImplementedError(
        "Bolagsverket OAuth-flöde: fyll i token-endpoint ur API-dokumenten (kräver nyckeln)."
    )


def _fetch_latest_report(token: str, org_number: str) -> dict | None:
    """Senaste inlämnade årsredovisningen som iXBRL för org_number.

    TODO(nyckel): exakt endpoint i "Värdefulla datamängder"-API:et (lista dokument
    per org.nr → hämta iXBRL-zip → packa upp). → {ixbrl, url, published_at,
    fiscal_year, excerpt}."""
    raise NotImplementedError(
        "Bolagsverket dokument-hämtning: fyll i endpoint ur API-dokumenten (kräver nyckeln)."
    )


def parse_ixbrl(ixbrl: bytes | str) -> dict[str, Any]:
    """iXBRL (K2/K3) → durabla rubrik-fakta: {revenue, profit, numberOfEmployees,
    founding_year}. Strukturerad parsning (py-xbrl/Arelle mot fria taxonomier), ALDRIG LLM.

    TODO(exempel-iXBRL): fältmappning mot K2/K3-taxonomin. Måste skrivas mot en RIKTIG
    exempel-iXBRL — koncern-vs-moder, tusental-skala och teckenhantering (negativt
    resultat inom parentes) är de kända fallgroparna. Mänsklig verifiering av siffrorna
    innan de publiceras som källförsedda claims."""
    raise NotImplementedError(
        "iXBRL-parser: skriv mot ett riktigt K2/K3-exempel (taxonomier.se) innan den aktiveras."
    )
