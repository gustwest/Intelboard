import logging
import re

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_cfg_log = logging.getLogger(__name__)

# Osynliga tecken som smugit in via copy-paste från Slack/Notion/Google Docs/echo.
# BOM, zero-width space/joiner/non-joiner, object replacement char m.fl.
_INVISIBLE_JUNK = re.compile(r"[\ufeff\u200b\u200c\u200d\ufffc\r]")


# Sentinels som vi medvetet använder för "secret skapad men nyckel inte ifylld
# ännu" (t.ex. Perplexity-secreten skapas av bootstrap med en placeholder så
# Cloud Run kan binda den; riktig nyckel sätts som ny version senare). Sanitering
# nedan returnerar tom string för dessa → make_probe_engines skippar proben tyst
# istället för att försöka anropa providern med ett ogiltigt värde.
_PLACEHOLDER_PREFIXES = ("placeholder", "REPLACE_ME", "your-", "TODO")


def _sanitize_api_key(raw: str, field_name: str) -> str:
    """Strip whitespace, newlines, BOM och zero-width-tecken från en API-nyckel.
    Tystar även placeholder-värden (se _PLACEHOLDER_PREFIXES) genom att returnera
    tom string — då hoppar konsumenten tyst över proben tills en riktig nyckel
    läggs in.

    Loggar en WARNING om kontaminering eller placeholder hittades — synligt i prod-
    loggar utan att tjänsten kraschar. Kallas av Pydantic-validatorn vid Settings-
    konstruktion, dvs vid import — alla konsumenter (llm.py, polling.py) får ett
    rent värde.
    """
    if not raw:
        return raw
    clean = _INVISIBLE_JUNK.sub("", raw).strip()
    if clean != raw:
        _cfg_log.warning(
            "%s var kontaminerad (raw %d bytes → clean %d bytes, diff: whitespace/newline/"
            "BOM/zero-width). Auto-rensad vid laddning — men rotera nyckeln för säkerhets skull.",
            field_name, len(raw), len(clean),
        )
    if any(clean.startswith(p) for p in _PLACEHOLDER_PREFIXES):
        _cfg_log.warning(
            "%s är en placeholder (börjar med %r) — returneras som tom så proben skippas "
            "tyst tills en riktig nyckel läggs in i Secret Manager.",
            field_name, clean[:24],
        )
        return ""
    return clean


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"
    # Clean-URL-läge: bakom HTTPS-LB med MainPageSuffix serveras profilsidorna på
    # egen domän med rena katalog-URL:er (…/<id>/) och innehåll utan clients/-prefix.
    # Default False = GCS path-style (explicit …/index.html). Flippas vid cutover
    # tillsammans med CDN_BASE_URL — se docs/clean-url-cutover.md.
    cdn_clean_urls: bool = False

    # Probe-motorer (de publika AI-assistenterna vi MÄTER, inte våra egna). Avsiktligt
    # första-parts US: probe-payloaden är publik (bolagsnamn + generisk fråga) och poängen
    # är att mäta de motorer användare faktiskt träffar. Se services/llm.py + projektminne.
    openai_api_key: str = ""
    gemini_api_key: str = ""
    # Perplexity-probe: separat direkt-API (Perplexity finns inte i Vertex Model
    # Garden). Mäter AI-discoverability (web-RAG-signal) — distinkt från training-
    # data-baserade probarna. Saknas nyckeln → proben skippas tyst i make_probe_engines.
    perplexity_api_key: str = ""
    # Claude-probe: första-parts Anthropic API (api.anthropic.com). 2026-06-04 bytte vi
    # från Vertex Model Garden (quota=0-blockerad) till direkt-API — konsekvent med
    # ChatGPT/Perplexity som också är första-parts. Publik probe-payload, ingen kunddata.
    anthropic_api_key: str = ""
    # (Ingen anthropic_api_key: validatorn (Claude) går via Vertex AI EU, inte
    # förstaparts-API. EU-only-beslut 2026-05-26. Se services/llm.py.)

    # Defensiv sanitering: API-nycklar rensas från whitespace, newlines, BOM och
    # osynliga Unicode-tecken vid laddning. Förhindrar 'Illegal header value' (httpx)
    # och gRPC UNAUTHENTICATED-fel som orsakas av kontaminerade env-värden.
    # Se docs/api-key-rotation-runbook.md.
    @field_validator("openai_api_key", "gemini_api_key", "perplexity_api_key", "anthropic_api_key", "sendgrid_api_key", "admin_api_key", mode="before")
    @classmethod
    def _strip_api_keys(cls, v: str, info) -> str:
        return _sanitize_api_key(v, info.field_name) if isinstance(v, str) else v

    # EU-only där det betyder något: våra egna resonemangsmodeller (generator/validator)
    # behandlar full kunddata internt och körs via Vertex AI i EU-region — ingen
    # första-parts US-väg. Service-account-auth (ADC).
    gcp_project: str = ""
    vertex_location: str = "europe-west1"  # EU-region för Vertex AI (Gemini)
    # Region där Cloud Run-tjänsten + jobben körs. Används av manuella jobb-triggers
    # (routers/jobs.py) för att exekvera Cloud Run Jobs istället för in-process
    # BackgroundTasks (som dör när instansen skalar ner). Speglar REGION i bootstrap.sh.
    cloud_run_region: str = "europe-north1"
    # Cloud Scheduler ligger i europe-west1 (ej tillgängligt i europe-north1). Speglar
    # SCHEDULER_LOCATION i scripts/bootstrap.sh. Styr schema-status/paus-API:t.
    scheduler_location: str = "europe-west1"

    # Modellvalet för resonemangsmodellerna (generator/validator) bor i services/llm.py
    # (GEO_GENERATOR_MODEL / GEO_VALIDATOR_MODEL, env-överstyrbara). BÅDA rollerna körs på
    # Gemini via Vertex EU — Claude är inte EU-resident i regionen, så ingen Claude-väg.

    sendgrid_api_key: str = ""

    admin_api_key: str = ""
    sendgrid_webhook_secret: str = ""
    # Kvartals-påminnelsen (spec §4.1) är INTERN — vi samlar in LinkedIn-datan själva.
    # notify_from_email = avsändare, ops_notify_email = vårt interna mottagar-team.
    # Saknas någon → inget mejl skickas (To-Do:n i dashboarden skapas ändå).
    notify_from_email: str = ""
    ops_notify_email: str = ""
    # Privat GCS-bucket för kunduppladdat verifieringsunderlag (LinkedIn-skärmklipp,
    # spec §4.2). EU-only: ska INTE vara den publika CDN-bucketen. Tom → underlaget
    # lagras inte (endast filnamnet sparas, som tidigare).
    upload_bucket: str = ""

    # Shared secret för ops-alerts-webhooken (services/ops_alerts, routers/ops).
    # Verifieras som ?token=... query-param eftersom Pub/Sub push inte enkelt kan
    # sätta godtyckliga headers. OIDC-verifiering är en planerad förstärkning;
    # tills dess: rotera token:n minst kvartalsvis och håll den utanför loggar.
    ops_webhook_token: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
