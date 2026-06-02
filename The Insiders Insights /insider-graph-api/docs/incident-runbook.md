# Incident-runbook

Hur du reagerar när något inte är som det ska. Varje sektion: **symtom →
diagnos → åtgärd**. Indelad efter signal — inte efter delsystem.

## Var hittar du signalerna?

- **Inboxen** (`/insider-graph` headern) — `ops_alerts`-kategorin samlar alla
  drift-larm: job-failures (auto-öppnas av `_run_tracker`), budget-trösklar
  (via Pub/Sub från Cloud Billing), och generiska larm postade till webhooken.
  Lyckade körningar auto-stänger sina motsvarande larm; en alert som ligger
  kvar i en vecka är något ingen kommit till. Se `services/ops_alerts.py`.
- **Email** — bara för uptime-failures (Cloud Monitoring alert policy via
  `NOTIFY_EMAIL` i `bootstrap.sh`). Allt annat hanteras in-app.
- **Cloud Logging** — alltid sista anhalten för rotorsak när alerten inte räcker.

## 1. Uptime-check failar (alert kommer in)

**Symtom:** Cloud Monitoring `insider-graph-api-up` larmar (skapas av
`bootstrap.sh` §7e). `/health` svarar inte 200.

**Diagnos:**
```
gcloud run services describe insider-graph-api --region=europe-north1 --format='value(status.url, status.conditions)'
gcloud run revisions list --service=insider-graph-api --region=europe-north1 --limit=5
```
- Senaste revision misslyckades vid deploy → den föregående är fortfarande live;
  uptime-felet beror på något annat (CDN, network).
- Senaste revision rullade ut → titta på Cloud Run logs för crash-loop.

**Åtgärd:**
- Crash-loop på senaste revision: rulla tillbaka till föregående med
  `gcloud run services update-traffic --to-revisions=PREV_REVISION=100`.
- Health-endpoint svarar 5xx: titta på `routers/health.py` — det är en hårdkodad
  200, så fel där är extremt ovanligt; troligen är hela revisionen död.

## 2. Ett jobb failar för en kund 3 dagar i rad

**Symtom:** En `ops_alerts`-rad med kind=`job_failed` står kvar i inboxen med
`occurrence_count >= 3`. Lyckade körningar auto-stänger alerten — så att den
fortfarande är öppen betyder att problemet inte gick över av sig självt.

För djupare detalj:
```
gcloud firestore documents query \
  --collection-group=job_runs \
  --filter="status=failed AND client_id=CLIENT_ID" \
  --order-by="started_at desc"
```

**Diagnos:** Läs `error_message` på senaste failed-doc. Vanliga klasser:
- **LLM-timeout** (`risk-ask[gemini] timed out`) — leverantörsproblem, brukar
  gå över.
- **`KeyError: client_id`** — kund har raderats men en task försökte fortfarande
  läsa den (sharding-task som inte fick uppdaterad ID-lista).
- **Connector 4xx/5xx** — extern källa nere eller rate-limitar.

**Åtgärd:**
- Engångsfel → ignorera, nästa cron tar det. Lägg en kommentar i kundens
  todos-collection om kunden är pilot/POC.
- Konsekvent fel >7 dagar → öppna riktad utredning, börja med att köra jobbet
  manuellt på den kunden (`gcloud run jobs execute risk-detect-all --update-env-vars=CLOUD_RUN_TASK_COUNT=1`)
  och läs INFO-loggarna direkt.

## 3. LLM-leverantör nere (OpenAI/Gemini/Vertex)

**Symtom:** Många jobb failar samtidigt med timeout/`5xx`/`auth`-meddelanden.

**Diagnos:**
- Vertex EU: `gcloud ai-platform models list --region=europe-west1` (auth-test).
- OpenAI/Gemini: kontrollera leverantörens statuspage först.

**Åtgärd:**
- Vänta ut det. Pipelinen är timeout-skyddad (`risk_detector._call_with_timeout`,
  `polling._safe_ask`) så ingen körning hänger.
- Om >2h: pausa cron-jobben tillfälligt så vi inte bränner Cloud Run-minuter:
  ```
  gcloud scheduler jobs pause risk-detect-weekly-tue --location=europe-west1
  gcloud scheduler jobs pause polling-weekly-tue --location=europe-west1
  ```
- Glöm INTE att `resume`:a när läget är OK.

## 4. Risk-detect-jobbet hinner inte klart i sitt fönster

**Symtom:** `gcloud run jobs executions list --job=risk-detect-all` visar
`TaskTimeout` på en eller flera tasks.

**Diagnos:** Kundvolym har vuxit. Vid tasks=5 parallelism=5 räcker fönstret för
~50 kunder. Bortom det börjar enstaka tasks bita 1h-taket.

**Åtgärd:** Höj TASKS i `bootstrap.sh` (`create_or_update_job risk-detect-all
... TASKS PARALLELISM ...`) och kör om scriptet. Tumregel: 1 task per 10 kunder.
Parallelism kan vara lägre om vi börjar träffa LLM rate-limits — slå upp 429:or
i loggarna.

## 5. Data-läcka misstänkt / kund vill bli raderad (GDPR Art. 17)

**Symtom:** Kund begär radering, eller säkerhetsincident kräver bortröjning av
en kunds data.

**Åtgärd:**
1. Kör `DELETE /api/clients/{client_id}` (kräver admin_api_key).
2. Verifiera i Firestore-konsolen att `clients/{id}` är borta.
3. Verifiera att CDN-objekten (`schema.json`, `index.html`, `llms.txt`) också är
   borta (`gsutil ls gs://insider-graph-cdn-...id../clients/{id}/`).
4. Verifiera `job_runs` är rensade: `gcloud firestore documents query` med
   `client_id=...`. Bör vara 0.
5. **PITR-perioden** (7 dagar) ligger fortfarande kvar med kundens data — efter
   7 dagar är den verkligt borta. Kommunicera detta till kunden om de frågar.
6. **Backup-bucket** (`insider-graph-backups-...`) har export-snapshots från
   tidigare veckor med kundens data. Lifecycle raderar dessa efter
   `BACKUP_RETENTION_DAYS` (default 60). För omedelbar radering: manuell
   `gsutil rm -r gs://...`-på de exportkataloger som innehåller kundens collections.

`tests/test_delete_client_coverage.py` säkerställer att nya collections
inte glöms — kör testsuiten innan release.

## 6. job_runs eller annan collection växer obegränsat

**Symtom:** Firestore-faktura ökar oväntat; jobb tar längre tid att lista runs.

**Diagnos:** TTL-policyn på `expire_at` är inte aktiv. Verifiera:
```
gcloud firestore fields ttls describe --field=expire_at --collection-group=job_runs
```

**Åtgärd:** Aktivera enligt `bootstrap.sh` §7b, eller kör direkt:
```
gcloud firestore fields ttls update expire_at --collection-group=job_runs --enable-ttl
```

## 7. Token-spend skenar (budget-alert 80%)

**Symtom:** En `ops_alerts`-rad med kind=`budget_threshold` har dykt upp i
inboxen (postad av Cloud Billing → Pub/Sub → `/api/webhooks/ops-alerts`).
Severity = warning vid 80%, critical vid 100% eller forecasted-overrun.

**Diagnos:** Vilken kund / vilket jobb driver det? Sök `job_runs.summary.tokens`:
```
gcloud firestore documents query --collection-group=job_runs \
  --order-by='summary.tokens.total_output desc' --limit=20
```
Top-10-listan brukar avslöja antingen en kund med extremt många approved
risk-questions eller ett jobb i en retry-loop.

**Åtgärd:**
- Patologisk kund: pausa deras risk-detect via `routers/schedules` (per-kund
  pause finns).
- Buggig prompt: rulla tillbaka senaste deploy om vi nyligen släppt en
  prompt-ändring som drar 2-3x tokens.
- Allmän volymtillväxt: höj budget och skala parallelism (uppåt, för fortare
  klar och därmed billigare i Cloud Run-tid).

## 8. PITR / disaster recovery — återställ enstaka kund

**Symtom:** Korrupt data för en kund (felaktig manuell ändring, buggig migrering).

**Åtgärd:** Skapa en read-replikering via PITR (gratis upp till 7 dagar):
```
gcloud firestore databases export gs://insider-graph-backups-PROJECT/pitr-recovery \
  --snapshot-time=2026-XX-XXTHH:MM:SSZ \
  --collection-ids=clients
```
Importera till en separat databas:
```
gcloud firestore databases create --database=recovery-temp --location=eur3
gcloud firestore databases import gs://.../pitr-recovery --database=recovery-temp
```
Inspektera, exportera den ena kunden, importera den tillbaka i `(default)`.

Längre tillbaka än 7 dagar → använd schemalagd export i backup-bucketen
(`firestore-export-weekly`, varje söndag, retention 60 dagar default).
