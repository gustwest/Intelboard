# TODO: Aktivera Claude + Mistral som probe-motorer i AI-synlighet

**Mottagare**: kollega/ops som har Console-access till GCP-projektet
**Verktyg**: Antigravity (eller manuellt via Console + gcloud)
**Beräknad tid**: ~30–60 min (varav mycket är väntan på Vertex-rollout om begäran behövs)

**Projekt**: `round-plating-480321-j7`
**Cloud Run-service**: `insider-graph-api` (region `europe-north1`)
**Service-account**: `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com`

---

## Bakgrund (vad som är verifierat i prod 2026-06-04)

5 probe-motorer är planerade. **3 körs live**: Gemini ✓, ChatGPT (gpt-4.1) ✓, Perplexity (Sonar) ✓.
Claude och Mistral är `"status": "planned"` i koden eftersom de failar i Cloud Run.

### Vad jag har kört och verifierat (inte gissningar)

**Claude Sonnet 4.6 (Vertex Anthropic)** — direkt curl-test 2026-06-04 inkl SA-impersonation:

| Endpoint | Auth | HTTP-svar |
|---|---|---|
| `global` | användar-ADC (`guswes@gmail.com`) | **429** "quota exceeded" → modellen finns och responderar |
| `us-east5` | användar-ADC | 404 "Publisher Model not found" |
| `europe-west1` | användar-ADC | 404 "Publisher Model not found" |
| `europe-west4` | användar-ADC | 404 "Publisher Model not found" |
| `asia-southeast1` | användar-ADC | 404 "Publisher Model not found" |
| `global` | service-account (impersonation) | **404 generic Google-page** (inte ens en Vertex-error!) |

**Mönsterskillnad är viktig**: med användar-ADC får vi en strukturerad Vertex-error
(`{"error":{"code":404,"message":"Publisher Model ... was not found"}}`). Med SA får
vi en **Google generic 404-HTML-page** — det betyder att SA:n inte ens kommer till
Vertex AI:s gateway, anropet routas bort innan dess. SA är blockerad på ett
ROUTING-lager, inte på ett model-access-lager. Detta är annorlunda från Mistral.

**Slutsats**: Modellen är registrerad ENDAST på `global` endpoint för vårt projekt.
Användar-ADC har access (men kvoten är slut). Service-account har INTE access trots
att `roles/aiplatform.user` är tilldelad. Detta är specifikt för Anthropic-publisher.

**Mistral Medium 3** — direkt curl-test 2026-06-04 med min användar-ADC:

| Region | Model-id-format | HTTP-svar |
|---|---|---|
| `us-central1` | `mistralai/mistral-medium-3` | 404 |
| `us-central1` | `mistralai/mistral-medium-3@001` | 404 |
| `europe-west4` | båda format | 404 |
| `europe-west1` | båda format | 404 |
| `us-east4` | båda format | 404 |

`gcloud ai model-garden models list` visar `mistralai/mistral-medium-3@001 No Yes`
(CAN_PREDICT: Yes), men anrop returnerar 404 överallt. EULA-status framgår inte
direkt — modellen kan vara "listad men inte subscribed" för vårt projekt.

**SA-test med impersonation** (`europe-west4`): strukturerad Vertex-error
`{"error":{"code":404,"status":"NOT_FOUND"...}}` — alltså annorlunda än Claude.
SA kommer till Vertex AI:s gateway men nekas själva modellen. Det betyder access
till AI Platform fungerar; det är modell-aktiveringen som saknas.

**Slutsats**: Mistral är genuint inte aktiverad för projektet. Något steg utöver
EULA-acceptans saknas (troligen Subscribe/Bind-knapp på modellsidan i Console).
Fix för Mistral är troligen ENKLARE än Claude (modell-nivå vs routing-nivå).

### Service-account-roller (verifierat 2026-06-04)
```
roles/aiplatform.user            ← finns redan
roles/cloudscheduler.admin
roles/datastore.importExportAdmin
roles/datastore.user
roles/logging.logWriter
roles/run.invoker
roles/secretmanager.secretAccessor
roles/storage.objectAdmin
```
`aiplatform.user` räcker uppenbarligen INTE för Vertex Anthropic på vårt SA.
**Vi vet inte vad som behövs istället** — det är en del av vad antigravity ska ta reda på.

---

## Uppgift 1 — Claude Sonnet 4.6

### Diagnostiskt steg 1.1 — bekräfta nuvarande beteende
```bash
# Med användar-ADC mot global → ska ge 429 (om quotan inte är återställd) eller 200:
gcloud auth login
TOKEN=$(gcloud auth print-access-token)
curl -s -X POST \
  "https://global-aiplatform.googleapis.com/v1/projects/round-plating-480321-j7/locations/global/publishers/anthropic/models/claude-sonnet-4-6:rawPredict" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anthropic_version":"vertex-2023-10-16","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Förväntat**: 200 (svar) eller 429 (quota). Båda bekräftar att modellen finns.
**Om 404**: hela aktiveringen är borta, börja om från EULA i Console.

### Diagnostiskt steg 1.2 — hitta vad SA saknar
Anthropic på Vertex har **två kända access-mekanismer** utöver EULA:
1. **Project-level quota** för Anthropic API requests
2. **Per-model service-account-binding** (om Vertex Model Garden erbjuder den UI:n)

Kolla i Console:
- https://console.cloud.google.com/iam-admin/quotas?project=round-plating-480321-j7
  → Sök "anthropic". Om kvoten är 0 eller "default" och har en separat "service-account scope" — höj till **60 req/min** för `insider-graph-sa@...`.
- https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7
  → Sök "Claude Sonnet 4.6" → klicka modell-kortet → leta efter:
  - "Service account access" eller "Add service account"
  - "Bind"-knapp
  - Eller "Enable for service accounts"
  → Lägg till `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com`

**Om INGEN av ovan finns på modellsidan**: Anthropic-modeller kan ha en separat
"Anthropic Console partner integration". Kolla:
- https://console.cloud.google.com/marketplace/details/anthropic-public/claude-sonnet-4-6
- Eller sök "Vertex AI Studio Anthropic" i Console-sökrutan.

### Diagnostiskt steg 1.3 — eskaleringsväg om inget hjälper
Om varken quota-höjning eller Console-binding fungerar:
1. Kolla Cloud Audit Logs för 404-anropet — exakt error code (kan vara `PUBLISHER_MODEL_NOT_FOUND` vs `PERMISSION_DENIED` vs `BILLING_DISABLED`):
   ```
   gcloud logging read 'resource.type=audited_resource AND
     protoPayload.serviceName="aiplatform.googleapis.com" AND
     protoPayload.methodName=~"RawPredict" AND
     protoPayload.authenticationInfo.principalEmail="insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com"' \
     --project=round-plating-480321-j7 --limit=5
   ```
2. Open Cloud Support-case (om billing-plan inkluderar det) med felmeddelande + projekt-ID.

### Verifierings-test (det som BEKRÄFTAR att aktiveringen är klar)
Antigravity ska kunna köra detta från sin maskin (kräver `iam.serviceAccountTokenCreator`
på sig själv för insider-graph-sa, ELLER köra det INNE i Cloud Run via en custom endpoint):
```bash
# Variant 1: lokalt med impersonation (kräver att antigravity har permission)
SA_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com)

curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://global-aiplatform.googleapis.com/v1/projects/round-plating-480321-j7/locations/global/publishers/anthropic/models/claude-sonnet-4-6:rawPredict" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anthropic_version":"vertex-2023-10-16","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Klart om**: HTTP 200 eller 429 (modellen svarar eller är quota-begränsad — båda godtagbara).
**Inte klart om**: HTTP 404 fortsätter.

```bash
# Variant 2 (om impersonation inte funkar): kör model-availability-check som SA i Cloud Run
gcloud run jobs execute model-availability-check \
  --region=europe-north1 --project=round-plating-480321-j7 --wait
# Kolla loggen — sök efter "claude-sonnet-4-6" och felklassificeringen
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name="model-availability-check"' \
  --project=round-plating-480321-j7 --limit=20
```

### Avslut
Skicka tillbaka till Gustav:
- Resultatet av diagnostiska steg 1.1, 1.2, 1.3
- Exakt vad ni gjorde i Console (skärmdumpar eller text)
- Output från verifierings-testet (Variant 1 eller 2)

Om HTTP 200 eller 429 → Gustav flippar `"status": "planned"` → `"live"` i
`insider-graph-api/services/llm.py:PROBE_ENGINE_REGISTRY` (Claude-raden) och pushar.

---

## Uppgift 2 — Mistral Medium 3

### Diagnostiskt steg 2.1 — bekräfta att modellen är 404 med användar-ADC
```bash
TOKEN=$(gcloud auth print-access-token)
for REGION in us-central1 europe-west4 europe-west1 us-east4; do
  echo "=== $REGION ==="
  curl -s -w "HTTP %{http_code}\n" -X POST \
    "https://${REGION}-aiplatform.googleapis.com/v1beta1/projects/round-plating-480321-j7/locations/${REGION}/endpoints/openapi/chat/completions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"mistralai/mistral-medium-3","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
done
```
**Om alla är 404**: modellen är inte aktiverad. Gå vidare till steg 2.2.
**Om någon ger 200/429**: notera regionen — det är där vi ska peka koden senare.

### Diagnostiskt steg 2.2 — Console-aktivering
Mistral i Vertex Model Garden kräver mer än EULA. Sannolik aktiveringssekvens:

1. https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7
2. Sök på "Mistral Medium 3" eller "Mistral AI"
3. Klicka modell-kortet
4. **Leta efter dessa knappar i ordning** (UI:t ändrats över tid):
   - "Enable" → klicka, acceptera Mistral Commercial Terms
   - "Subscribe" / "Get started" / "Activate" → kan vara separat från EULA
   - "Request access" → formulär, kan ta 24-48h för Mistral att godkänna
   - "Service account access" eller "Add service account":
     - Lägg till `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com`

5. **Om det finns en "Deploy to endpoint"-knapp**: kolla om Mistral-modellen kräver
   en custom-endpoint för MaaS. I så fall:
   - Skapa endpoint (Vertex AI → Online Predictions → Create Endpoint)
   - Deploy `mistralai/mistral-medium-3@001` till den
   - Notera endpoint-ID:t — vi kan behöva byta från `:openapi`-endpoint i koden till
     den custom endpoint:en. Säg till Gustav så bygger han en wrapper.

### Diagnostiskt steg 2.3 — verifierings-test
Samma struktur som Claude-verifieringen, fast Mistral-URL:
```bash
SA_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com)

curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/round-plating-480321-j7/locations/europe-west4/endpoints/openapi/chat/completions" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/mistral-medium-3","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Klart om**: HTTP 200 med chat-completions-JSON.
**Inte klart om**: HTTP 404 → ytterligare aktivering saknas.

### Eskaleringsväg
Om inget av Console-stegen löser det:
- Mistral har **direkt API** (api.mistral.ai) — vi kan rulla tillbaka till deras direkta
  integration istället för Vertex MaaS. Säg till Gustav så bygger han om wrappern
  (~30 min jobb) och vi behöver en Mistral API-nyckel ($25-100/mån beroende på volym).

### Avslut
Samma som Claude — rapportera tillbaka resultatet av varje diagnostiskt steg + verifierings-test.

---

## Snabb-sammanfattning för antigravity-prompten

> Gå till GCP-projektet `round-plating-480321-j7` och aktivera **Vertex Anthropic Claude
> Sonnet 4.6** + **Vertex Mistral Medium 3** så att service-accountet
> `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com` får HTTP 200/429
> från:
>
> - Claude: `POST global-aiplatform.googleapis.com/v1/.../publishers/anthropic/models/claude-sonnet-4-6:rawPredict`
> - Mistral: `POST europe-west4-aiplatform.googleapis.com/v1beta1/.../endpoints/openapi/chat/completions` med model=`mistralai/mistral-medium-3`
>
> Just nu får båda **HTTP 404 "Publisher Model not found"** från SA. EULA är accepterad
> för Claude (användar-ADC får 429, alltså modellen finns); för Mistral är även
> användar-ADC 404, så aktiveringen är delvis.
>
> Det vi inte vet är EXAKT vilket Console-steg som binder modellen till SA — du behöver
> diagnostisera. Följ stegen i `docs/claude-mistral-activation-todo.md` (denna fil) som
> diagnostik-först (steg 1.1/2.1), sedan fix (steg 1.2/2.2), sedan verifiering (steg 1.3/2.3).
> Rapportera tillbaka exakt vad du gjorde + verifierings-output, så flippar Gustav
> "planned" → "live" i koden.

---

## Kontakt
- Gustav Westergren: `guswes@gmail.com`
- Repo: `gustwest/Intelboard` (privat) — relevant kod i `The Insiders Insights/insider-graph-api/services/llm.py`
- Tidigare ärenden: ärende #1 fixade Gemini-region-glapp, ärende #2 fixade `anthropic`-SDK
  saknad i Cloud Run-imagen — Claude-init kommer ALL THE WAY till HTTP-anropet nu, det
  är bara serverside-access som blockerar.
