# Insider Graph — API

Fristående GEO-motor (Generative Engine Optimization). Lever bredvid `backend/` och `frontend/` i samma git-repo men har egen runtime, egen databas (Firestore) och egen deploy-pipeline.

## Struktur

```
insider-graph-api/
├── main.py                 FastAPI-app (webhooks, admin-API)
├── config.py               env-config via pydantic-settings
├── firestore_client.py     Firestore-klient + collection-paths
├── connectors/             pluggbara datakällor
│   ├── base.py             BaseConnector (interface)
│   └── linkedin.py         LinkedIn-stub
├── schema_org/
│   └── compiler.py         RawItems → JSON-LD-graf
├── routers/
│   └── health.py
└── jobs/                   Cloud Run Jobs (cron-styrda)
    ├── scrape_active.py
    ├── scrape_episodic.py
    ├── scrape_passive.py
    ├── compile_schema.py
    └── polling_weekly.py
```

## Två deploys, ett repo

| Tjänst | Trigger | Cloud Run |
|---|---|---|
| `insider-graph-api` | webhooks + admin-API | service (always-on) |
| `insider-graph-jobs-*` | Cloud Scheduler | jobs (kör-och-stäng) |

Båda byggs från samma container-image. Service och jobs kör olika `CMD` (uvicorn vs `python -m jobs.<namn>`).

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

## Kopplingar till befintligt system

- **Kundidentitet**: `client_id` i Firestore = `customers.slug` i Postgres. En Insider Graph-kund existerar alltid som en Insiders Insights-kund först.
- **Auth**: admin-UI använder samma inloggning som `frontend/`. Validera JWT från befintlig auth-flow.
- **Databas**: helt separat (Firestore). Ingen koppling till Cloud SQL.
