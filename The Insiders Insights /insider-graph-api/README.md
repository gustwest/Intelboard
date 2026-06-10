# Insider Graph — API

Fristående GEO-motor (Generative Engine Optimization). Lever bredvid `backend/` och `frontend/` i samma git-repo men har egen runtime, egen databas (Firestore) och egen deploy-pipeline.

## Struktur

```
insider-graph-api/
├── main.py                 FastAPI-app (webhooks, admin-API, auth-middleware)
├── auth.py                 API-key middleware (X-API-Key)
├── config.py               env-config via pydantic-settings
├── firestore_client.py     Firestore-klient + collection-paths
├── schemas.py              Pydantic-modeller för API:t
├── connectors/             pluggbara datakällor
│   ├── base.py             BaseConnector (interface)
│   ├── linkedin.py         LinkedIn (Bright Data)
│   └── rss.py              Generisk RSS (pressrum, podcast, careers)
├── schema_org/             claims → JSON-LD + profilsida (se docs/claims-provenance-spec.md)
│   ├── compiler.py         render-modell → JSON-LD-graf (proveniens via claims)
│   ├── claims.py           deterministisk connector-extra → property-claims
│   ├── profile_page.py     statisk profilsida (lager 2) ur render-modellen
│   └── badge.py            badge-snutt (lager 3): statisk HTML / JS
├── routers/
│   ├── badge.py            /api/badge/{client_id} (genererar badge-snutt)
│   ├── clients.py          GET /api/clients
│   ├── connectors_router.py /api/connectors (catalog + per-kund toggles)
│   ├── health.py
│   ├── jobs.py             Manuella triggers + Eventarc-target
│   ├── onboard.py          /api/onboard (CSV → Firestore)
│   ├── polling.py          /api/polling/{client_id}
│   ├── review.py           /api/review/{client_id} (godkänn/avvisa items)
│   └── webhooks.py         /api/webhooks/inbound (inbound mail)
├── services/
│   ├── brightdata.py       Bright Data Datasets API
│   ├── claim_extraction.py LLM-extraktion: fritext → narrative-claims + validering
│   ├── discovery.py        Onboarding-agent
│   ├── email_extraction.py LLM-extraktion av Event/NewsArticle ur mail
│   └── polling.py          AI-synlighet (SoV / Sentiment / Parity)
├── jobs/                   Cloud Run Jobs (cron-styrda)
│   ├── scrape_active.py
│   ├── scrape_website.py    veckovis domän-crawl per kund
│   ├── extract_claims.py    narrativ claims-extraktion per kund (--client-id)
│   ├── extract_all_claims.py  fan-out över alla kunder (cron-bar)
│   ├── compile_schema.py   JSON-LD + profilsida → GCS/CDN
│   ├── compile_all_schemas.py
│   └── polling_weekly.py
└── scripts/
    └── bootstrap.sh        Engångs-setup på GCP (bucket, jobs, scheduler, eventarc)
```

## Två deploys, ett repo

| Tjänst | Trigger | Cloud Run |
|---|---|---|
| `insider-graph-api` | webhooks + admin-API | service (always-on) |
| `scrape-website` | Cloud Scheduler måndagar 03:45 | job |
| `scrape-active` | Cloud Scheduler dagligen 04:00 | job |
| `extract-all-claims` | Cloud Scheduler dagligen 04:45 | job |
| `compile-all-schemas` | Cloud Scheduler dagligen 05:00 + Eventarc | job |
| `polling-weekly` | Cloud Scheduler tisdagar 06:00 | job |
| `xml-sync` | Cloud Scheduler dagligen 03:30 | job |
| `sunset-skills` | Cloud Scheduler måndagar 02:00 | job |
| `quarterly-linkedin-todo` | Cloud Scheduler dagligen 07:00 | job |

Alla bygger från samma image. Service och jobs kör olika `command` (uvicorn vs `python -m jobs.<namn>`).

### Jobfeed- + LinkedIn-pipelinen (platsannonser → kunskapsgraf)

- **`xml-sync`** hämtar kundens ATS-XML (jobfeed-connectorn), diffar mot gårdagens
  annons-id och markerar försvunna jobb som stängda. Berikar nya annonser via Vertex
  AI EU (ontologisk titel + filtrering av generiska roller).
- Stängda jobbs kompetenser klingar av (1.0 → 0.7 → 0.4) och `sunset-skills`
  hard-deletar noden efter 24 mån — om den inte re-verifierats.
- Vi samlar in kundens kvartalsvisa LinkedIn-kapacitetsdata själva och laddar upp den
  internt (`/insider-graph/linkedin`); en admin verifierar den under **Granska → LinkedIn**.
  Kompetenser som matchas i BÅDE XML och LinkedIn lyfts till confidence 1.0
  ("Dual-Source Truth"). `quarterly-linkedin-todo` påminner ops-teamet var ~90:e dag.

Valfri config (alla self-no-op om de saknas): `NOTIFY_FROM_EMAIL` + `OPS_NOTIFY_EMAIL`
+ `BREVO_API_KEY` för utgående mejl (Brevo, EU — kund-kit/månadsmejl + den **interna**
kvartals-påminnelsen), `UPLOAD_BUCKET` (privat GCS-bucket, **ej** publika CDN-bucketen)
för uppladdat verifieringsunderlag.

## Lokal körning

```bash
cd insider-graph-api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export FIRESTORE_PROJECT_ID=...
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
uvicorn main:app --reload --port 8081
```

Port 8081 så det inte krockar med befintliga `backend/` (8080) och `frontend/` (3000).

## Tester

Enhetstester för claims/kompilator/extraktion mot en fake Firestore (stdlib
`unittest`, inga extra beroenden):

```bash
cd insider-graph-api
PYTHONPATH=. python -m unittest discover -s tests -p "test_*.py"
```

`tests/fakefs.py` installeras som `firestore_client` så ingen riktig Firestore
eller GCP-credential behövs.

## Auth

Admin-endpoints kräver `X-API-Key: <ADMIN_API_KEY>`. Lokalt utan key — middleware släpper igenom allt och loggar en startup-varning. Skarpa miljöer ska alltid ha `ADMIN_API_KEY` satt via Secret Manager.

Webhooks (`/api/webhooks/*`), `/health` och Eventarc-targets (`/api/jobs/compile-via-eventarc`) är undantagna API-key-checken.

## Secrets (Secret Manager)

Namnen i parentes är de Secret Manager-secrets som `bootstrap.sh` binder in:

Secret-namnen har prefixet `insider-graph-` (matchar Secret Manager + de bindningar
servicen faktiskt kör).

> **Resonemangsmodellerna kräver ingen secret.** Generator (Gemini) och validator
> (Claude) — som behandlar full kunddata — går via **Vertex AI EU** med
> service-account-auth (ADC), inte förstaparts-API. EU-only-beslut 2026-05-26. Styrs
> av env `GCP_PROJECT` + `VERTEX_LOCATION` (sätts av `bootstrap.sh`), inte Secret Manager.
> Secret-nycklarna nedan är enbart för **probe-motorerna** vi mäter + connectors.

| Env | Secret | Krävs av |
|---|---|---|
| `GEMINI_API_KEY` | `insider-graph-gemini-api-key` | probe-motor (gemini) i polling + riskloopens detektering |
| `OPENAI_API_KEY` | `insider-graph-openai-api-key` | probe-motor (gpt-4o) i polling, email-extraktion |
| `BRIGHTDATA_API_KEY` | `insider-graph-brightdata-api-key` | LinkedIn-connector |
| `BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID` | `insider-graph-brightdata-linkedin-profile-dataset-id` | LinkedIn person |
| `BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID` | `insider-graph-brightdata-linkedin-company-dataset-id` | LinkedIn företag |

Ej bundna på körande service idag: LinkedIn-posts-datasetet. Lägg till det i
`bootstrap.sh` igen vid behov.

Skapa secrets så här:

```bash
echo -n "<value>" | gcloud secrets create insider-graph-openai-api-key --data-file=-
# ...etc (samma prefix för alla, se tabellen ovan)
```

## Engångs-bootstrap

```bash
cd insider-graph-api
PROJECT_ID=$(gcloud config get-value project) ./scripts/bootstrap.sh
```

Det skapar:
- Artifact Registry-repo + GCS-bucket bakom Cloud CDN
- Service-account `insider-graph-sa@…` med rätt IAM-roller
- Cloud Run Jobs (7 st) + Cloud Scheduler-triggers
- Eventarc-trigger för `compile-all-schemas` vid Firestore-writes (best-effort)

## Loopen "deploy"

Efter bootstrap räcker det att pusha kod — `cloudbuild.yaml` bygger image,
deployar servicen och uppdaterar alla 4 jobs till samma SHA.

```bash
gcloud builds submit --config cloudbuild.yaml .
```

## Manuella prereqs som inte automatiseras

1. **DNS**
   - `cdn.insidergraph.io` → CNAME till `c.storage.googleapis.com` (alt. egen Cloud CDN-LB med managed cert).
   - `inbox.insidergraph.io` → MX-record till inbound-providerns MX (prio 10).
2. **Inbound Parse** (inbound-providerns UI — t.ex. Brevo):
   - Add Host: `inbox.insidergraph.io`
   - Destination URL: `https://insider-graph-api-…run.app/api/webhooks/inbound`
   - POST raw MIME = av (vi använder fält-form-data).
   - Sätt `INBOUND_WEBHOOK_SECRET` + låt providern POSTa med `?token=` (annars avvisas allt).
3. **Bright Data**: skapa konto, generera API-key, hämta dataset-IDs för
   LinkedIn person/company/posts. Lägg in i Secret Manager (se ovan).
4. **OpenAI + Gemini-keys** i Secret Manager.

## Pilot-test (efter bootstrap)

1. Generera `ADMIN_API_KEY` (t.ex. `openssl rand -hex 32`), lägg i Secret Manager.
2. Sätt `NEXT_PUBLIC_GRAPH_API_KEY` i frontendens env och redeploya frontend.
3. Öppna `/insider-graph/kunder` → "Importera CSV" → skapa pilotkund.
4. Öppna `/insider-graph/connectors` → välj kunden, aktivera `linkedin` + ev. `rss`, lägg till feeds, klicka **Spara**.
5. Klicka **Kör scrape-active** (kör jobb i background på servicen).
6. Klicka **Kompilera** → schema läggs i `gs://insider-graph-cdn-<project>/clients/<id>/schema.json`.
7. Öppna `/insider-graph/schema` → välj kunden → JSON-LD och GTM-snippet visas.

## Kopplingar till befintligt system

- **Kundidentitet**: `client_id` i Firestore = `customers.slug` i Postgres. En Insider Graph-kund existerar alltid som en Insiders Insights-kund först.
- **Auth**: separat API-key för MVP. Långsiktigt: validera samma JWT som `frontend/` använder.
- **Databas**: helt separat (Firestore). Ingen koppling till Cloud SQL.
