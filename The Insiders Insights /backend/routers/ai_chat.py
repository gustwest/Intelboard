"""AI Assistant chat — context-aware Gemini-powered chat for platform users.

Builds dynamic context from the database (customer data, datasets, modules,
goals, notes) and sends it to Gemini alongside the user's question.
"""
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import os
import shutil
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
import sources as src_engine
import routers.datasets as datasets_router
from db import get_db
from logging_config import log

router = APIRouter(tags=["ai_chat"])


# ------------------------------------------------------------------
# Request / response schemas
# ------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    customer_id: Optional[str] = None
    page_context: Optional[str] = None  # e.g. "customer_detail", "sources", "modules"
    temp_file_id: Optional[str] = None
    file_analysis: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    context_used: List[str]  # what context was injected


# ------------------------------------------------------------------
# Temp File Storage
# ------------------------------------------------------------------
TEMP_UPLOAD_DIR = "/tmp/insiders_temp"
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)


@router.post("/api/ai/upload-temp")
async def ai_upload_temp(customer_id: Optional[str] = None, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a file temporarily for AI analysis."""
    if customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()
        if not c:
            raise HTTPException(404, "Customer not found")

    temp_id = str(uuid.uuid4())
    temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{temp_id}.csv")
    
    raw = await file.read()
    with open(temp_path, "wb") as f:
        f.write(raw)
        
    df = src_engine.parse_file(raw, file.filename or "upload.csv")
    if df is None:
        os.remove(temp_path)
        raise HTTPException(422, "Kunde inte läsa filen. Stöd: CSV, TSV, XLS, XLSX.")

    status, source, version, detail = src_engine.detect_source(db, df, file.filename or "")
    
    # Build a simple summary for the AI
    summary_lines = [
        f"Filnamn: {file.filename}",
        f"Antal rader: {len(df)}",
        f"Kolumner: {len(df.columns)} st",
    ]
    if source:
        summary_lines.append(f"Matchad källa: {source.name} (v{version.version if version else 'ny'})")
    else:
        summary_lines.append("Matchad källa: INGEN (Ny källa kommer skapas automatiskt)")
        
    if "overlap" in detail:
        summary_lines.append("Det finns en överlappande period i existerande data.")
        
    return {
        "temp_file_id": temp_id,
        "analysis": "\n".join(summary_lines)
    }


# ------------------------------------------------------------------
# Platform knowledge — baked into system prompt
# ------------------------------------------------------------------
# The knowledge is split per product. Only the ACTIVE product (derived from
# page_context) is injected as primary knowledge; the other product is demoted
# to a short reference so Gemini can answer cross-product questions without
# blending concepts (LinkedIn-mätvärden vs SoV, PostgreSQL vs Firestore, osv.).

INSIDERS_KNOWLEDGE = """
## Om The Insiders Insights

The Insiders Insights är en SaaS-plattform byggd för LinkedIn-marknadsföringsbyråer.
Plattformen hjälper byråer att samla in, analysera och rapportera på sina kunders
LinkedIn-kampanjer och organiska aktivitet.

### Nyckelbegrepp

**Kund (Customer)**: Ett företag som byrån arbetar med. Varje kund har egna datasets,
moduler, mål och anteckningar.

**Källa (Source)**: En typ av rapport/data, t.ex. "LinkedIn Campaign Manager" eller
"LinkedIn Page Analytics". Varje källa har definierade fält (kolumner) och versioner.

**Dataset**: En uppladdad datafil kopplad till en kund och källa. Varje dataset har:
- **Granularitet**: Hur finfördelad datan är (daglig, veckovis, månatlig, kvartalsvis, årsvis, aggregerad)
- **Period**: Vilken tidsperiod datan täcker (period_start → period_end)
- **AI-sammanfattning**: En automatgenererad kort analys av datasetet

**Modul**: En KPI-definition med formel, tröskelvärden (röd/gul/grön) och visualisering.
Moduler kan vara globala (gäller alla kunder) eller kundspecifika.
Moduler beräknar KPI:er baserat på data från datasets.

**Mål (Goal)**: Ett konkret mål kopplat till en KPI-modul, med målvärde och måldatum.

**Granularitet & Överlappning**: När en kund har flera rapporter med olika detaljnivåer
(t.ex. daglig + månadsrapport) för samma period, väljer dashboarden automatiskt
den finaste granulariteten för att undvika dubbelräkning.

### Plattformens sidor

- **Kunder** (/kunder): Lista alla kunder. På kundsidan (/kunder/[id]) finns:
  - Översikt-flik med dashboard-charts, uppladdningszon, **källkort** (grupperade per källa) och moduler
  - Anteckningar-flik (CustomerNote)
  - Mål-flik (CustomerGoal)
- **Källdetaljsida** (/kunder/[id]/kalla/[sourceKey]): Visualiserar all data för en specifik
  källa hos en kund. Innehåller:
  - KPI-puckar med summa (för heltal) eller senaste värde (för decimaltal) per fält
  - Interaktiv tidsserie-graf (Recharts) med fält-väljare och Daglig/Månatlig-växling
  - Lista över uppladdade filer med AI-summaries och rådata-modal
  - Dedup-logik: vid överlappande perioder vinner den nyaste uppladdade filen
- **Sources** (/sources): Hantera datakällor, deras kolumndefinitioner och versioner
- **Moduler** (/moduler): Skapa och hantera KPI-moduler med formler
- **Rapporter** (/rapporter): Generera PDF-rapporter för kunder
- **Dashboard**: Aggregerad vy med diagram, trender och KPI:er per kund
- **Loggar** (/loggar): Systemloggar för felsökning
- **Admin** (/admin): Adminpanel med agentverktyg, filhantering och Insiders AI Agent-chat
  (Claude Sonnet/Opus via Claude Agent SDK; varje meddelande visar tidsstämpel + körtid)

### Datavisualisering & rapportering

**Källkort på kundsidan**: Datasets visas inte längre som en flat tabell utan grupperade
per källa. Varje kort visar källnamn, period, kornighet, antal rader och filer, och
navigerar till källdetaljsidan vid klick. Pilen (▼) expanderar listan med enskilda filer.

**Backend-endpoints för källvisualisering**:
- `GET /api/customers/{id}/sources` — alla källor en kund har data för (med aggregat)
- `GET /api/customers/{id}/sources/{source_key}/timeseries?fields=...&bucket=daily|monthly`
  — tidsserie med dedup vid överlappande datum (heltal summeras, decimaltal medelvärdesberäknas
  inom samma datum-bucket; vid överlappande perioder vinner nyaste filen)

### Vanliga LinkedIn-mätvärden

- **Impressions**: Antal gånger innehåll visats
- **Clicks**: Antal klick på innehåll
- **CTR (Click-Through Rate)**: Klick / Visningar i procent
- **Engagement Rate**: Totalt engagemang / Visningar
- **Follows**: Nya följare
- **Reactions**: Gilla, fira, stöd etc.
- **Shares**: Antal delningar
- **Video Views**: Antal videovisningar
- **Spend / Total Spent**: Annonskostnad
- **CPC (Cost Per Click)**: Kostnad per klick
- **CPM (Cost Per Mille)**: Kostnad per 1000 visningar
"""


GEOGIRAPH_KNOWLEDGE = """
## Om Geogiraph

Geogiraph är en **separat tjänst** som lever bredvid The Insiders Insights i samma
plattform. Användare växlar mellan produkterna via en ProductSwitcher högst upp i sidebar
("THE INSIDERS." ↔ "GEOGIRAPH"). När pathname börjar med `/insider-graph/` är användaren
i Graph-läget och sidebarens nav-länkar ändras.

**Kunder är samma bolag** i båda produkterna — `client_id` i Geogiraph är samma slug
som `customer.slug` i Insiders Insights. Inloggning är delad via NextAuth.

### Vad Geogiraph gör (Generative Engine Optimization)

Geogiraph gör en kunds organisation **maskinläsbar för AI-sökmotorer** (ChatGPT,
Perplexity, Gemini, Google AI Overviews). I stället för att optimera annonsering mot
LinkedIn (vilket är Insiders Insights fokus) optimerar Geogiraph kundens *närvaro*
i de AI-svar som ges till frågor som "Vilka är de ledande bolagen inom X i Sverige?"

Pipeline i fem steg:
1. **Samla** rådata om kundens medarbetare och företag från LinkedIn (via Bright Data),
   pressrum, e-post m.fl.
2. **Lagra** i Firestore (NB: separat databas — *inte* PostgreSQL som resten av plattformen).
3. **Kompilera** all data till en JSON-LD-graf enligt Schema.org-standarden (Organization
   som rotnod, Person/JobPosting/SocialMediaPosting/Event som barn).
4. **Distribuera** filen via Google Cloud Storage publik URL (CDN). Kunden installerar en
   liten Google Tag Manager-snippet en gång — den hämtar JSON-LD och injicerar i `<head>`.
5. **Mäta** AI-synlighet veckovis genom att ställa frågor till GPT-4o + Gemini 1.5 Pro.

### Sidor under /insider-graph/

- **Översikt** (`/insider-graph`): Pipeline-status (insamling, lagring, schema-kompilator,
  CDN-deploy, GTM-brygga, polling) och förklaring av mätningsdimensioner.
- **Kunder** (`/insider-graph/kunder`): Onboarding-vy. Klicka "Importera CSV" för att
  skapa en ny Graph-kund. CSV-format: `name,linkedin_url,title,node_type,gender`.
- **Connectors** (`/insider-graph/connectors`): Live-katalog över alla datakällor. Per kund
  kan man slå på/av aktiva connectors, lägga till RSS-feeds (pressrum/karriär/podcast),
  och manuellt trigga **Kör scrape-active** eller **Kompilera**. Implementerade connectors
  visas med grön status; övriga visas som "Ej implementerad". (Den AKTUELLA listan över
  implementerade connectors injiceras separat nedan — utgå alltid från den, inte från minnet.)
- **Granska** (`/insider-graph/review`): Items som LLM-extraktionen plockat in från
  inkommande mail med confidence < 0,7. Ops-användaren godkänner eller avvisar.
- **JSON-LD** (`/insider-graph/schema`): Förhandsvisning av den kompilerade Schema.org-grafen.
  Visar också CDN-URL per kund och GTM-snippet att kopiera.
- **AI-synlighet** (`/insider-graph/polling`): Veckodata för Share of Voice, Sentiment och
  Parity Index per kategori (Affär, Finans, Innovation, HR).

### Nyckelkoncept i Geogiraph

**Nodtyp** — varje medarbetare klassas som en av tre:
- **Aktiv nod**: publicerar regelbundet. Scrapeas dagligen, fullt coachningsspår, högst pris-tier.
- **Episodisk nod**: aktiv med jämna mellanrum. Scrapeas veckovis. Har en unik inkommande
  e-postadress (`{client_id}.{employee_id}@inbox.insidergraph.io`) — när personen mailar
  dit extraheras innehållet av en LLM till strukturerade Event-objekt.
- **Passiv nod**: djup engångsstrukturering. Scrapeas månadsvis, ytligt.

**Connector** — en pluggbar datakälla som implementerar `BaseConnector` (`fetch(config)
→ list[RawItem]`). Exempel på hur de fungerar: `linkedin` hämtar via Bright Data, `rss` är
generisk (konfigurera feeds per kund för pressrum/karriär/podcast), `email` är webhook-baserad
(SendGrid Inbound Parse → LLM-extraktion). **Vilka connectors som faktiskt är implementerade
just nu står i den live-injicerade listan nedan — räkna aldrig upp implementerade connectors
ur minnet.**

**Mätningsdimensioner**:
- **Share of Voice (SoV)**: Andel AI-frågor (av 4 kategorier × 3 frågor × 2 modeller = 24)
  där kundens namn eller en medarbetares namn nämns. Värde 0–1.
- **Sentiment**: -1 till 1. För varje svar med omnämnande ber Polling-agenten en LLM-domare
  bedöma tonalitet.
- **Parity Index**: Andel kvinnliga personer av alla personer som rekommenderas av AI.
  Använder `gender`-fältet på medarbetaren.
- **Baseline-disciplinen**: Företagets och medarbetarnas följarantal sparas i Firestore
  som baseline men **exponeras aldrig i JSON-LD-output** — de används bara internt för
  att bevisa att AI-synlighet ökat oberoende av nätverkstillväxt.

### Teknisk arkitektur (skiljer sig från Insiders Insights)

| | Insiders Insights | Geogiraph |
|---|---|---|
| Databas | PostgreSQL (Cloud SQL) | Firestore (eur3, native) |
| Backend | `backend/` FastAPI | `insider-graph-api/` FastAPI |
| Scheduling | Manuell poller | Cloud Run Jobs + Cloud Scheduler |
| Agentkörning | Claude CLI via `agent-poll.mjs` | Cloud Run Jobs |
| LLM-bruk | Claude (admin agent) | OpenAI GPT-4o + Gemini 1.5 Pro (polling) |
| Scrape | — | Bright Data Datasets API |

Cron-jobb (Cloud Scheduler, tidszon Europe/Stockholm):
- `scrape-active-daily` 04:00 dagligen
- `scrape-episodic-weekly` 04:30 måndagar
- `compile-all-daily` 05:00 dagligen + Eventarc-trigger på Firestore-writes
- `polling-weekly-tue` 06:00 tisdagar

**Auth**: Geogiraph-API:t kräver `X-API-Key` (Secret Manager: `insider-graph-admin-key`).
Frontend skickar key via `NEXT_PUBLIC_GRAPH_API_KEY`. Webhooks och Eventarc-targets är
undantagna och autentiseras separat.

**Bootstrap**: `insider-graph-api/scripts/bootstrap.sh` skapar bucket, jobs, scheduler och
Eventarc-trigger på GCP. `cloudbuild.yaml` bygger image + uppdaterar service och alla jobs
till samma SHA vid varje deploy.
"""


# Short summaries of the *other* product — injected only as a cross-reference so
# the AI can answer "vad är skillnaden?" utan att blanda ihop begreppen.
INSIDERS_SUMMARY = """
**The Insiders Insights** (den ANDRA produkten): SaaS för LinkedIn-marknadsföringsbyråer.
Samlar in, analyserar och rapporterar kunders LinkedIn-kampanjer/organiska aktivitet.
Begrepp: Kund, Källa, Dataset, Modul (KPI), Mål. Data i PostgreSQL. Mätvärden: Impressions,
Clicks, CTR, Engagement Rate, CPC, CPM m.fl. Sidor: /kunder, /sources, /moduler, /rapporter.
"""

GEOGIRAPH_SUMMARY = """
**Geogiraph** (den ANDRA produkten): separat tjänst för Generative Engine Optimization (GEO).
Gör en kunds organisation maskinläsbar för AI-sökmotorer (ChatGPT, Perplexity, Gemini) via en
JSON-LD-graf (Schema.org) som distribueras över CDN och injiceras med GTM. Data i Firestore.
Begrepp: Nodtyp (aktiv/episodisk/passiv), Connector, Share of Voice, Sentiment, Parity Index.
Sidor: /insider-graph/*.
"""


def _select_product_knowledge(page_context: Optional[str]) -> Tuple[str, str, str]:
    """Pick which product is active based on page_context.

    Returns (active_product_name, primary_knowledge, other_product_summary).
    Only the active product's full knowledge is injected; the other product is
    demoted to a one-paragraph summary so the AI never conflates the two.
    """
    in_graph = bool(page_context and page_context.startswith("graph_"))
    if in_graph:
        return "Geogiraph", GEOGIRAPH_KNOWLEDGE, INSIDERS_SUMMARY
    return "The Insiders Insights", INSIDERS_KNOWLEDGE, GEOGIRAPH_SUMMARY


# ------------------------------------------------------------------
# Live connector list — single source of truth is Geogiraphs REGISTRY,
# exponerad via dess API (GET /api/connectors). Vi hämtar listan i stället för
# att hårdkoda den i prompten, så att agenten aldrig kan hitta på eller missa
# en connector. Faller tillbaka på en säker inbyggd lista om API:t saknar
# konfiguration eller inte svarar — då går chatten aldrig sönder.
# ------------------------------------------------------------------
_CONNECTOR_CACHE: Dict[str, object] = {"ts": 0.0, "ids": None}
_CONNECTOR_CACHE_TTL = 300  # sekunder
_CONNECTOR_FALLBACK = ["linkedin", "rss", "gleif", "website"]


def _get_live_connectors() -> Tuple[List[str], bool]:
    """Hämta listan av implementerade Geogiraph-connectors.

    Returnerar (connector_ids, is_live). is_live=False betyder att vi använde
    fallback-listan (API ej konfigurerat eller onåbart).
    """
    import time

    now = time.time()
    cached = _CONNECTOR_CACHE.get("ids")
    if cached is not None and now - float(_CONNECTOR_CACHE["ts"]) < _CONNECTOR_CACHE_TTL:
        return list(cached), True  # type: ignore[arg-type]

    base = os.environ.get("GRAPH_API_URL")
    key = os.environ.get("GRAPH_API_KEY")  # valfri — graph-API:t kör open-mode om ADMIN_API_KEY ej satt
    if base:
        try:
            import json as _json
            import urllib.request

            headers = {"x-api-key": key} if key else {}
            request = urllib.request.Request(
                f"{base.rstrip('/')}/api/connectors",
                headers=headers,
            )
            with urllib.request.urlopen(request, timeout=3) as resp:
                payload = _json.loads(resp.read().decode("utf-8"))
            ids = [c["id"] for c in payload.get("connectors", []) if c.get("id")]
            if ids:
                _CONNECTOR_CACHE["ids"] = ids
                _CONNECTOR_CACHE["ts"] = now
                return list(ids), True
        except Exception as e:  # nätverk, auth, parsing — falla tillbaka tyst
            log.warn("ai_chat.connectors_fetch_failed", error=str(e)[:200])

    return list(_CONNECTOR_FALLBACK), False


# ------------------------------------------------------------------
# Live Geogiraph-klienter — sanningskällan är Firestore, exponerad via
# Geogiraphs GET /api/clients. I graph-läge får agenten ALDRIG se Insiders
# PostgreSQL-kunder (det är en annan datamängd) — den ska bara känna till
# riktiga Geogiraph-klienter, annars hittar den på status.
# ------------------------------------------------------------------
_GRAPH_CLIENTS_CACHE: Dict[str, object] = {"ts": 0.0, "data": None}
_GRAPH_CLIENTS_CACHE_TTL = 300  # sekunder


def _get_live_graph_clients() -> Tuple[List[Dict], bool]:
    """Hämta riktiga Geogiraph-klienter (Firestore via API).

    Returnerar (klientlista, is_live). is_live=False betyder att API:t saknar
    konfiguration eller inte svarade — då injicerar vi INGA klienter (hellre
    tomt än Insiders-kunder).
    """
    import time

    now = time.time()
    cached = _GRAPH_CLIENTS_CACHE.get("data")
    if cached is not None and now - float(_GRAPH_CLIENTS_CACHE["ts"]) < _GRAPH_CLIENTS_CACHE_TTL:
        return list(cached), True  # type: ignore[arg-type]

    base = os.environ.get("GRAPH_API_URL")
    key = os.environ.get("GRAPH_API_KEY")  # valfri (open-mode)
    if base:
        try:
            import json as _json
            import urllib.request

            headers = {"x-api-key": key} if key else {}
            request = urllib.request.Request(
                f"{base.rstrip('/')}/api/clients",
                headers=headers,
            )
            with urllib.request.urlopen(request, timeout=3) as resp:
                payload = _json.loads(resp.read().decode("utf-8"))
            clients = payload.get("clients", [])
            _GRAPH_CLIENTS_CACHE["data"] = clients
            _GRAPH_CLIENTS_CACHE["ts"] = now
            return list(clients), True
        except Exception as e:
            log.warn("ai_chat.graph_clients_fetch_failed", error=str(e)[:200])

    return [], False


# ------------------------------------------------------------------
# Context builder — assembles relevant data from DB
# ------------------------------------------------------------------
def _build_context(db: Session, customer_id: Optional[str], page_context: Optional[str]) -> Tuple[str, List[str]]:
    """Build contextual information for the AI based on current page and customer."""
    sections = []
    context_labels = []
    in_graph = bool(page_context and page_context.startswith("graph_"))

    # Customer-specific context
    if customer_id:
        customer = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()

        if customer:
            context_labels.append(f"customer:{customer.name}")
            sections.append(f"\n## Aktuell kund: {customer.name}")
            sections.append(f"- ID: {customer.id}")
            sections.append(f"- Slug: {customer.slug}")

            # Datasets
            datasets = (
                db.query(models.Dataset)
                .options(joinedload(models.Dataset.source))
                .filter_by(customer_id=customer.id)
                .order_by(models.Dataset.uploaded_at.desc())
                .limit(20)
                .all()
            )
            if datasets:
                context_labels.append(f"datasets:{len(datasets)}")
                sections.append(f"\n### Datasets ({len(datasets)} st)")
                for d in datasets:
                    line = f"- **{d.original_filename}** ({d.source.name}) — {d.row_count} rader"
                    if d.granularity:
                        line += f", granularitet: {d.granularity}"
                    if d.period_start and d.period_end:
                        line += f", period: {d.period_start} → {d.period_end}"
                    if d.ai_summary:
                        line += f"\n  AI-sammanfattning: {d.ai_summary[:200]}"
                    sections.append(line)

            # Modules
            modules = (
                db.query(models.Module)
                .filter(
                    (models.Module.customer_id == customer.id) |
                    (models.Module.customer_id == None)  # noqa: E711
                )
                .all()
            )
            if modules:
                context_labels.append(f"modules:{len(modules)}")
                sections.append(f"\n### Moduler ({len(modules)} st)")
                for m in modules:
                    scope = "Global" if not m.customer_id else "Kundspecifik"
                    sections.append(f"- **{m.name}** ({m.abbr}) — {scope}")
                    if m.description:
                        sections.append(f"  Beskrivning: {m.description[:150]}")
                    if m.formula_json:
                        sections.append(f"  Formel: {str(m.formula_json)[:150]}")
                    if m.thresholds_json:
                        sections.append(f"  Tröskelvärden: {str(m.thresholds_json)[:100]}")

            # Goals
            goals = db.query(models.CustomerGoal).filter_by(customer_id=customer.id).all()
            if goals:
                context_labels.append(f"goals:{len(goals)}")
                sections.append(f"\n### Mål ({len(goals)} st)")
                for g in goals:
                    mod = db.query(models.Module).filter_by(id=g.module_id).first()
                    mod_name = mod.name if mod else "Okänd"
                    sections.append(f"- **{g.label}** ({mod_name}): mål={g.target_value}, nuvarande={g.current_value}, status={g.status}")

            # Notes
            notes = db.query(models.CustomerNote).filter_by(customer_id=customer.id).order_by(models.CustomerNote.created_at.desc()).limit(10).all()
            if notes:
                context_labels.append(f"notes:{len(notes)}")
                sections.append(f"\n### Anteckningar ({len(notes)} st)")
                for n in notes:
                    sections.append(f"- **{n.title}**: {(n.body or '')[:150]}")
    elif not in_graph:
        # Not in a specific customer context — lista Insiders-kunder.
        # ALDRIG i graph-läge: Insiders PostgreSQL-kunder är en annan datamängd
        # än Geogiraph-klienterna och får inte läcka in där.
        all_customers = db.query(models.Customer).all()
        if all_customers:
            context_labels.append("all_customers")
            sections.append(f"\n## Tillgängliga Kunder ({len(all_customers)} st)")
            sections.append("Eftersom du inte är på en specifik kundsida just nu, här är de tillgängliga kunderna:")
            for c in all_customers:
                sections.append(f"- **{c.name}** (ID: {c.id})")

    # Page-specific context
    if page_context == "sources":
        sources = db.query(models.Source).all()
        if sources:
            context_labels.append(f"sources:{len(sources)}")
            sections.append(f"\n## Tillgängliga källor ({len(sources)} st)")
            for s in sources:
                sections.append(f"- **{s.name}** (key: {s.key}, plattform: {s.platform or 'ej angiven'})")

    elif page_context == "modules" and not customer_id:
        modules = db.query(models.Module).all()
        if modules:
            context_labels.append(f"all_modules:{len(modules)}")
            sections.append(f"\n## Alla moduler ({len(modules)} st)")
            for m in modules:
                scope = "Global" if not m.customer_id else f"Kund: {m.customer_id[:8]}"
                sections.append(f"- **{m.name}** ({m.abbr}) — {scope}")

    elif page_context and page_context.startswith("graph_"):
        context_labels.append(page_context)
        sections.append("\n## Användaren är i Geogiraph-produkten")

        # Live-injicerad sanningskälla för implementerade connectors.
        conn_ids, is_live = _get_live_connectors()
        context_labels.append("connectors:live" if is_live else "connectors:fallback")
        sections.append(
            "\n### Implementerade connectors (AKTUELL lista)\n"
            + ", ".join(f"`{c}`" for c in conn_ids)
            + "\n_Detta är den enda korrekta listan över implementerade connectors. "
            "Räkna aldrig upp andra som implementerade, och nämn inte connectors som inte står här._"
        )

        # Live-injicerade RIKTIGA Geogiraph-klienter (Firestore). Ersätter helt
        # Insiders-kundlistan, som inte får synas i graph-läge.
        clients, clients_live = _get_live_graph_clients()
        if clients_live:
            context_labels.append(f"graph_clients:{len(clients)}")
            if clients:
                sections.append(f"\n### Geogiraph-klienter (AKTUELL data från Firestore, {len(clients)} st)")
                for c in clients[:25]:
                    nt = c.get("node_types") or {}
                    parts = []
                    if c.get("employee_count") is not None:
                        parts.append(f"{c['employee_count']} medarbetare")
                    if nt:
                        parts.append("noder: " + ", ".join(f"{k} {v}" for k, v in nt.items()))
                    if c.get("active_connectors"):
                        parts.append("aktiva connectors: " + ", ".join(c["active_connectors"]))
                    parts.append("senast kompilerad: " + (c.get("last_compiled") or "aldrig"))
                    name = c.get("company_name") or c.get("client_id") or "Okänd"
                    sections.append(f"- **{name}** (client_id: {c.get('client_id')}) — " + "; ".join(parts))
            else:
                sections.append("\n### Geogiraph-klienter\nInga klienter finns ännu i Geogiraph (Firestore är tom).")
            sections.append(
                "_Ovanstående är den ENDA korrekta källan till vilka klienter som finns i Geogiraph och deras status. "
                "Använd ALDRIG kundlistan från The Insiders här. Hitta aldrig på klienter, medarbetare/noder, "
                "pipeline-, kompilerings-, GTM- eller polling-status — håll dig till datan ovan, och hänvisa till "
                "rätt sida (t.ex. /insider-graph/polling, /insider-graph/schema) för det som inte står här._"
            )
        else:
            context_labels.append("graph_clients:unavailable")
            sections.append(
                "\n### Geogiraph-klienter\n_Live-data om Geogiraph-klienter är inte tillgänglig just nu. "
                "Lista INTE några klienter och hitta inte på status — hänvisa användaren till /insider-graph/kunder "
                "och /insider-graph/polling. Använd ALDRIG kundlistan från The Insiders som om de vore Geogiraph-klienter._"
            )

        graph_page_hints = {
            "graph_home": "På översiktssidan — pipeline-status och förklaring av tjänsten.",
            "graph_customers": (
                "På kundsidan i Graph — onboarding via CSV-import. Hjälp användaren förstå "
                "CSV-formatet (name,linkedin_url,title,node_type,gender) och nodtyper "
                "(aktiv/episodisk/passiv)."
            ),
            "graph_connectors": (
                "På connectors-sidan — översikt över datakällor (LinkedIn, RSS/pressrum, "
                "e-post, m.fl.) och deras tier/frekvens."
            ),
            "graph_schema": (
                "På JSON-LD-sidan — förhandsvisning av Schema.org-grafen som distribueras "
                "via CDN och injiceras på kundens sajt via GTM-snippet."
            ),
            "graph_polling": (
                "På AI-synlighet-sidan — Share of Voice, Sentiment och Parity Index per "
                "vecka. Mäter hur kunden framträder i GPT-4o och Gemini 1.5 Pro."
            ),
        }
        sections.append(graph_page_hints.get(page_context, ""))

    return "\n".join(sections), context_labels


# ------------------------------------------------------------------
# Build conversation history for Gemini
# ------------------------------------------------------------------
def _get_history(db: Session, session_id: str, page_context: Optional[str], limit: int = 20) -> List[Dict]:
    """Load recent messages from this session for multi-turn context.

    History is scoped to the ACTIVE product: a session that spans both products
    (sessionStorage survives the ProductSwitcher) must not feed Insiders-turer in
    i ett Geogiraph-anrop, eller tvärtom — det skulle dra tillbaka sammanblandningen
    trots den produkt-scopade systemprompten.
    """
    q = db.query(models.AIChatMessage).filter_by(session_id=session_id)
    in_graph = bool(page_context and page_context.startswith("graph_"))
    if in_graph:
        q = q.filter(models.AIChatMessage.page_context.like("graph_%"))
    else:
        q = q.filter(
            (models.AIChatMessage.page_context == None)  # noqa: E711
            | (models.AIChatMessage.page_context.notlike("graph_%"))
        )
    msgs = q.order_by(models.AIChatMessage.created_at.desc()).limit(limit).all()
    # Reverse to chronological order
    msgs.reverse()
    return [{"role": m.role, "content": m.content} for m in msgs]


# ------------------------------------------------------------------
# Main endpoint
# ------------------------------------------------------------------
@router.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    """Send a message to the AI assistant with dynamic platform context."""
    from ai import _get_client, MODEL

    session_id = req.session_id or str(uuid.uuid4())

    # Build dynamic context
    dynamic_context, context_labels = _build_context(db, req.customer_id, req.page_context)

    # If there's a file attached, append the system analysis to the message for the AI
    actual_message_for_ai = req.message
    if req.temp_file_id and req.file_analysis:
        actual_message_for_ai += f"\n\n[SYSTEM_FILE_ANALYSIS: temp_id={req.temp_file_id}]\nAnalys:\n{req.file_analysis}\nFråga användaren om de vill spara detta dataset."

    active_product, primary_knowledge, other_summary = _select_product_knowledge(req.page_context)

    system_prompt = f"""## AKTIV PRODUKT: {active_product}

Användaren befinner sig just nu i produkten **{active_product}**. Plattformen rymmer två
separata produkter — **The Insiders Insights** (LinkedIn-analys) och **Geogiraph** (AI-synlighet/GEO).
Det är två HELT olika produkter med olika begrepp, databaser och mätvärden. Blanda ALDRIG ihop dem.

Nedan följer den fullständiga kunskapen om den AKTIVA produkten. Förankra alla svar i den.

{primary_knowledge}

---

## Den andra produkten (endast som referens)

{other_summary}

---

{dynamic_context}

---

## Instruktioner

Du är "Insiders AI", en hjälpsam assistent för plattformen. Just nu hjälper du användaren
inom produkten **{active_product}**.

Regler:
1. Svara alltid på SVENSKA
2. Var koncis men informativ (max 300 ord om möjligt)
3. Använd markdown-formatering (fetstil, listor, rubriker) för läsbarhet
4. Om du refererar till data, ange källa (dataset-namn, modulnamn etc.)
5. Om användaren frågar om att skapa något (modul, mål etc.) — förklara vad du föreslår och be om bekräftelse
6. Om du inte vet svaret — var ärlig och föreslå var användaren kan hitta informationen
7. Du kan svara på frågor om alla aspekter av plattformen, inklusive tekniska detaljer
8. **Håll produkterna åtskilda**: förankra svaret i den aktiva produkten ({active_product}).
   Använd ALDRIG begrepp, mätvärden eller arkitektur från den andra produkten som om de hörde
   till den aktiva. Insiders Insights = LinkedIn-mätvärden (Impressions, CTR, CPC...), PostgreSQL,
   Kund/Källa/Dataset/Modul/Mål. Geogiraph = AI-synlighet (Share of Voice, Sentiment, Parity Index),
   Firestore, Nodtyp/Connector/JSON-LD. Om dessa krockar i ett svar har du blandat ihop dem.
9. Om frågan tydligt gäller den ANDRA produkten: svara gärna, men säg uttryckligen vilken produkt
   du beskriver. Om det är oklart vilken produkt användaren menar — fråga innan du svarar.
10. **HITTA ALDRIG PÅ DATA.** Ange bara konkreta siffror, status, datum, antal, namn, klienter,
    kunder, mätvärden (t.ex. Share of Voice, Sentiment), kompilerings-/GTM-/pipeline-/polling-status
    eller review-kö som FAKTISKT förekommer i kontexten ovan. Har du inte uppgiften: säg rakt ut
    "jag har inte den datan här" och hänvisa till rätt sida i verktyget (t.ex. /insider-graph/polling,
    /insider-graph/schema, /insider-graph/review). Presentera ALDRIG exempel, antaganden eller
    "så här brukar det se ut" som om det vore verklig status. Beskriv gärna HUR något fungerar
    (process/begrepp), men uppfinn aldrig konkreta värden eller lägesbilder. Hellre "jag vet inte"
    än en kvalificerad gissning.

## Hantering av Uppladdade Filer
När en användare laddar upp en fil i chatten kommer systemet att infoga intern information i meddelandet, t.ex. "[SYSTEM_FILE_ANALYSIS: temp_id=... ...]".
- När du ser denna information, sammanfatta kort för användaren vad du ser (t.ex. "Jag ser att du har laddat upp en fil som matchar LinkedIn Campaign Manager...").
- Om du vet vilken kund vi befinner oss på, fråga om användaren vill spara den. Om du INTE vet vilken kund filen tillhör (för att vi inte är på en kundsida), be användaren specificera vilken kund filen tillhör från listan av tillgängliga kunder.
- NÄR användaren svarar "Ja" (om kund redan är känd) ELLER har angett vilken kund de vill spara på, MÅSTE du svara med den exakta strängen `[EXECUTE_SAVE:temp_id:customer_id]` (byt ut temp_id mot det id du fick tidigare, och customer_id mot kundens ID. Om kunden redan var angiven i kontexten "Aktuell kund" kan du lämna customer_id tomt, t.ex. `[EXECUTE_SAVE:temp_id]`). Systemet kommer då att spara filen automatiskt. Skriv ingen annan text i det svaret.

## Skapande och Uppdatering av Moduler och Mål
Om en användare bekräftar att de vill att du ska skapa en KPI/Modul, använd följande syntax exakt:
`[EXECUTE_CREATE_MODULE: {{"name": "...", "abbr": "...", "description": "...", "category": "custom", "formula": {{"expression": "...", "metrics": ["..."]}}}}]`

Om användaren vill *uppdatera* en befintlig modul (t.ex. lägga till en formel), använd:
`[EXECUTE_UPDATE_MODULE: {{"abbr": "...", "formula": {{"expression": "...", "metrics": ["..."]}}}}]`

Om användaren vill skapa ett nytt mål för kunden, använd:
`[EXECUTE_CREATE_GOAL: {{"title": "...", "description": "..."}}]`

(byt ut med relevant JSON). Om kunden är vald läggs de in på kunden automatiskt. Formel (formula) är frivilligt, men expression är själva matten (t.ex. "(Reactions + Comments) / Impressions") och metrics är de exakta kolumnnamnen som behövs. Skriv ingen annan text i svaret om du använder en tagg.
"""

    # Get conversation history (scoped to the active product)
    history = _get_history(db, session_id, req.page_context)

    # Save user message
    user_msg = models.AIChatMessage(
        session_id=session_id,
        role="user",
        content=req.message,  # Save clean message in DB
        customer_id=req.customer_id,
        page_context=req.page_context,
    )
    db.add(user_msg)
    db.flush()

    # Call Gemini
    client = _get_client()
    usage = None  # sätts av cost_tracking efter ett lyckat genai-anrop
    if client is None:
        reply = "⚠️ AI-tjänsten är inte tillgänglig just nu. Kontrollera att Gemini-konfigurationen är korrekt."
    else:
        try:
            from google.genai import types
            import cost_tracking

            # Build conversation contents for multi-turn
            contents = []
            for h in history[-16:]:  # Last 16 messages for context window
                contents.append(types.Content(
                    role=h["role"] if h["role"] != "assistant" else "model",
                    parts=[types.Part.from_text(text=h["content"])],
                ))
            # Add current message (with internal system file info if any)
            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=actual_message_for_ai)],
            ))

            response = client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=1.0,
                    max_output_tokens=1500,
                    thinking_config=types.ThinkingConfig(thinking_level="low"),
                ),
            )
            reply = response.text.strip() if response.text else "Jag kunde tyvärr inte generera ett svar. Försök igen!"
            usage = cost_tracking.usage_from_response(MODEL, response)
            
            # --- AGENT INTERCEPTION FOR EXECUTE_SAVE ---
            if "[EXECUTE_SAVE:" in reply:
                import re
                match = re.search(r"\[EXECUTE_SAVE:([^\]]+)\]", reply)
                if match:
                    parts = match.group(1).split(":")
                    temp_id = parts[0].strip()
                    target_customer_id = parts[1].strip() if len(parts) > 1 else req.customer_id
                    
                    temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{temp_id}.csv")
                    
                    if os.path.exists(temp_path) and target_customer_id:
                        c = db.query(models.Customer).filter_by(id=target_customer_id).first()
                        if c:
                            # Run the ingestion
                            with open(temp_path, "rb") as f:
                                raw = f.read()
                            df = src_engine.parse_file(raw, f"{temp_id}.csv")
                            if df is not None:
                                status, source, version, _ = src_engine.detect_source(db, df, f"{temp_id}.csv")
                                
                                if status == "no_match":
                                    source, version = src_engine.auto_create_source(db, df, f"{temp_id}.csv")
                                elif status == "drift":
                                    version = src_engine.auto_create_version(db, source, version, df, f"{temp_id}.csv")
                                    
                                dataset = src_engine.ingest_dataset(db, c, source, version, df, "Bifogad_via_AI.csv", raw)
                                datasets_router._generate_and_save_summary(db, dataset, df, "Bifogad_via_AI.csv", source.name)
                                
                                reply = f"✅ Klart! Datasetet är uppladdat och sparat under kunden **{c.name}** och källan {source.name} med {dataset.row_count} rader. AI-sammanfattningen är också klar och datan är nu tillgänglig i dina moduler."
                                os.remove(temp_path)
                            else:
                                reply = "⚠️ Jag försökte spara filen, men kunde inte tolka innehållet."
                        else:
                            reply = "⚠️ Jag kunde inte hitta den angivna kunden i systemet."
                    else:
                        reply = "⚠️ Det verkar som att filen har försvunnit eller att vi saknar kund-kontext."
            
            elif "[EXECUTE_CREATE_MODULE:" in reply:
                import re
                import json
                match = re.search(r"\[EXECUTE_CREATE_MODULE:\s*({.*?})\s*\]", reply, re.DOTALL)
                if match:
                    try:
                        mod_data = json.loads(match.group(1))
                        new_mod = models.Module(
                            customer_id=req.customer_id, # Can be None for global
                            name=mod_data.get("name", "Ny Modul"),
                            abbr=mod_data.get("abbr", "MOD"),
                            description=mod_data.get("description", ""),
                            category=mod_data.get("category", "custom"),
                            formula_json=mod_data.get("formula", {})
                        )
                        db.add(new_mod)
                        db.commit()
                        reply = f"✅ Jag har nu skapat modulen **{new_mod.name}** ({new_mod.abbr}). Du kan hitta den under Moduler-fliken!"
                    except Exception as mod_err:
                        reply = f"⚠️ Jag försökte skapa modulen men något gick snett med formatet: {mod_err}"

            elif "[EXECUTE_UPDATE_MODULE:" in reply:
                import re
                import json
                match = re.search(r"\[EXECUTE_UPDATE_MODULE:\s*({.*?})\s*\]", reply, re.DOTALL)
                if match:
                    try:
                        mod_data = json.loads(match.group(1))
                        abbr = mod_data.get("abbr")
                        if not abbr:
                            reply = "⚠️ Jag kunde inte uppdatera modulen eftersom förkortningen (abbr) saknades."
                        else:
                            # Try to find the module by abbr
                            # If customer_id is provided, check for that customer's module or a global module
                            query = db.query(models.Module).filter(models.Module.abbr == abbr)
                            if req.customer_id:
                                query = query.filter((models.Module.customer_id == req.customer_id) | (models.Module.customer_id == None))
                            else:
                                query = query.filter(models.Module.customer_id == None)
                                
                            mod = query.first()
                            
                            if mod:
                                if "formula" in mod_data:
                                    mod.formula_json = mod_data["formula"]
                                db.commit()
                                reply = f"✅ Jag har nu uppdaterat modulen **{mod.name}** ({mod.abbr}) med de nya inställningarna!"
                            else:
                                reply = f"⚠️ Jag kunde inte hitta någon modul med förkortningen {abbr} för att uppdatera."
                    except Exception as mod_err:
                        reply = f"⚠️ Jag försökte uppdatera modulen men något gick snett med formatet: {mod_err}"

            elif "[EXECUTE_CREATE_GOAL:" in reply:
                import re
                import json
                match = re.search(r"\[EXECUTE_CREATE_GOAL:\s*({.*?})\s*\]", reply, re.DOTALL)
                if match:
                    if not req.customer_id:
                        reply = "⚠️ Jag kan tyvärr inte skapa ett mål utan att vi befinner oss på en specifik kund."
                    else:
                        try:
                            goal_data = json.loads(match.group(1))
                            new_goal = models.CustomerGoal(
                                customer_id=req.customer_id,
                                title=goal_data.get("title", "Nytt mål"),
                                description=goal_data.get("description", "")
                            )
                            db.add(new_goal)
                            db.commit()
                            reply = f"✅ Jag har nu lagt till målet **{new_goal.title}** för kunden. Du ser det under fliken 'Mål & Anteckningar'."
                        except Exception as goal_err:
                            reply = f"⚠️ Jag försökte skapa målet men något gick snett med formatet: {goal_err}"

            log.info("ai_chat.response", session_id=session_id, length=len(reply), context=context_labels)

        except Exception as e:
            log.warn("ai_chat.error", session_id=session_id, error=str(e))
            reply = f"⚠️ Ett fel uppstod: {str(e)[:200]}"

    # Save assistant reply (med kostnadsspårning om vi fick usage från Gemini)
    ai_msg = models.AIChatMessage(
        session_id=session_id,
        role="assistant",
        content=reply,
        customer_id=req.customer_id,
        page_context=req.page_context,
        model=MODEL if usage is not None else None,
        input_tokens=usage.input_tokens if usage else None,
        output_tokens=usage.output_tokens if usage else None,
        cost_usd=usage.cost_usd if usage else None,
    )
    db.add(ai_msg)
    db.commit()

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        context_used=context_labels,
    )


# ------------------------------------------------------------------
# Session history endpoint
# ------------------------------------------------------------------
@router.get("/api/ai/chat/{session_id}")
def get_chat_history(session_id: str, page_context: Optional[str] = None, db: Session = Depends(get_db)):
    """Get messages for a chat session, scoped to the active product.

    When ``page_context`` anges visas bara den produktens transkript, så att
    chatfönstret inte blandar Insiders- och Geogiraph-turer vid produktbyte.
    Utelämnas parametern returneras allt (bakåtkompatibelt).
    """
    q = db.query(models.AIChatMessage).filter_by(session_id=session_id)
    if page_context is not None:
        if page_context.startswith("graph_"):
            q = q.filter(models.AIChatMessage.page_context.like("graph_%"))
        else:
            q = q.filter(
                (models.AIChatMessage.page_context == None)  # noqa: E711
                | (models.AIChatMessage.page_context.notlike("graph_%"))
            )
    msgs = q.order_by(models.AIChatMessage.created_at.asc()).all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]
