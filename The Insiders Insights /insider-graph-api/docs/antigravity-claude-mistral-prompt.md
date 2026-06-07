# Antigravity-prompt: Aktivera Claude + Mistral på Vertex för specifik service-account

> **Klistra hela detta dokument** (eller länka till det) som prompt till antigravity.
> Bakgrundsdokumentation: `insider-graph-api/docs/claude-mistral-activation-todo.md` —
> innehåller den fullständiga diagnostik-historiken med verifierade HTTP-tabeller.

---

## Mission

Aktivera **Claude Sonnet 4.6** (Vertex Anthropic) och **Mistral Medium 3** (Vertex
Model Garden MaaS) för service-accounten
`insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com` i GCP-projektet
`round-plating-480321-j7`, så att Cloud Run-jobbet `insider-graph-api` kan anropa dem
från `europe-north1`.

**Klart-kriterium**: Båda modellerna svarar med **HTTP 200** (eller 429 quota-fel,
också OK) på `:rawPredict`/`chat/completions`-anrop autentiserade med SA-token.
**Idag returnerar båda HTTP 404** men av två olika anledningar — se kontext nedan.

---

## Verifierad nuläge (testat 2026-06-04)

```
Claude global endpoint, användar-ADC  → 429 quota          ← modellen finns och svarar
Claude global endpoint, SA-token      → 404 GENERIC GOOGLE  ← SA-blockerad PRE-Vertex
Claude regional (alla 4 regioner), användar-ADC → 404 Vertex  ← bara global aktiverad

Mistral europe-west4, användar-ADC    → 404 Vertex          ← modellen inte aktiverad
Mistral europe-west4, SA-token        → 404 Vertex strukt.  ← SA når Vertex, modell inte aktiv
```

**Tolkning**:
- **Claude**: routing-nivå-blockering för SA (anropet rutas bort INNAN Vertex AI-gatewayen).
  Detta är ovanligt och INTE en vanlig IAM- eller quota-fråga.
- **Mistral**: modellen är inte aktiverad alls — kräver troligen ett "Subscribe"-steg
  utöver EULA i Console.

SA har redan `roles/aiplatform.user` — det räcker inte. Gemini och ChatGPT fungerar
redan via samma SA, så `aiplatform.googleapis.com` är aktiverat på projektet.

---

## Uppgift A: Mistral Medium 3 (sannolikt enklare — börja här)

### A1. Verifiera nuläget (innan ändringar)
Kör:
```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/round-plating-480321-j7/locations/europe-west4/endpoints/openapi/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/mistral-medium-3","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Förväntat innan fix**: HTTP 404 med Vertex-strukturerad error.
Om det är 200/429 redan: gå direkt till A4.

### A2. Console-aktivering (öppna i browser)
URL: https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7

Sök på **"Mistral Medium 3"** → klicka modell-kortet. Klicka knappar i denna ordning,
notera VAD du ser:
1. "Enable" → klicka, acceptera Mistral Commercial Terms (om inte redan gjort)
2. **"Subscribe"** / "Get started" / "Activate" → KRITISKT, detta är troligen vad som
   saknas. Notera knappens exakta text + om något formulär dyker upp.
3. Om "Request access" → fyll formulär; väntan kan ta 24-48h
4. **Service-account-sektion** (om finns):
   - Lägg till `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com`

### A3. Alt-väg om Subscribe inte räcker
Om modellsidan visar **"Deploy to endpoint"**:
- Skapa en Endpoint i Vertex AI (Online Predictions → Create Endpoint, region
  `europe-west4`)
- Deploy `mistralai/mistral-medium-3@001` till endpointen
- Notera endpoint-ID:t. Rapportera tillbaka — då behöver vi byta endpoint i koden.

### A4. Verifiera SUCCESS
```bash
# Ge dig själv tillfällig impersonation-permission (TA BORT efter test, se A5):
gcloud iam service-accounts add-iam-policy-binding \
  insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com \
  --member="user:DIN-EPOST@example.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=round-plating-480321-j7

sleep 60  # IAM-propagering

SA_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com)

curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/round-plating-480321-j7/locations/europe-west4/endpoints/openapi/chat/completions" \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/mistral-medium-3","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Klart om**: HTTP 200 med chat-completions JSON-svar.
**Inte klart om**: HTTP 404 eller 403.

### A5. Cleanup
```bash
gcloud iam service-accounts remove-iam-policy-binding \
  insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com \
  --member="user:DIN-EPOST@example.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=round-plating-480321-j7
```

---

## Uppgift B: Claude Sonnet 4.6 (svårare — SA-routing-blockering)

### B1. Verifiera nuläget
```bash
# Användar-ADC (BÖR ge 429 eller 200 — bekräftar modellen finns):
TOKEN=$(gcloud auth print-access-token)
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://global-aiplatform.googleapis.com/v1/projects/round-plating-480321-j7/locations/global/publishers/anthropic/models/claude-sonnet-4-6:rawPredict" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anthropic_version":"vertex-2023-10-16","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```
**Förväntat**: HTTP 429 ("Quota exceeded") eller 200. Bekräftar att modellen finns
för organisationen och bara är access-blockerad för SA.

### B2. Audit log för exakt fel-kod (kör som SA)
```bash
gcloud logging read 'resource.type=audited_resource AND
  protoPayload.serviceName="aiplatform.googleapis.com" AND
  protoPayload.methodName=~"RawPredict" AND
  protoPayload.authenticationInfo.principalEmail="insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com"' \
  --project=round-plating-480321-j7 \
  --limit=5 \
  --format="value(protoPayload.status.code,protoPayload.status.message,protoPayload.resourceName)"
```
Rapportera tillbaka `status.code` (`NOT_FOUND` vs `PERMISSION_DENIED` vs
`BILLING_DISABLED` betyder olika saker).

### B3. Hypotetiska fix att prova (i prioritetsordning)

#### B3a. Anthropic-quota med SA-scope
1. Öppna https://console.cloud.google.com/iam-admin/quotas?project=round-plating-480321-j7
2. Sök "Anthropic" eller filter på Service `Vertex AI API`
3. Om en kvot-rad med "Anthropic" eller "claude" finns: höj till **60 req/min**.
   Om en separat "Service account scope" finns: sätt SA där.
4. Vissa kvoter kräver Cloud Support-case för höjning över default — notera det och
   gå vidare till B3b medan ärendet är öppet.

#### B3b. Per-modell SA-binding i Model Garden
1. https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7
2. Sök "Claude Sonnet 4.6" → modell-kort
3. Sök efter sektioner: "Service account access", "Bind to service account",
   "Permissions" på modellsidan
4. Om finns: lägg till `insider-graph-sa@round-plating-480321-j7.iam.gserviceaccount.com`

#### B3c. Vertex AI Studio Anthropic-partner-konfiguration
Anthropic på Vertex kan ha en separat aktivering via Anthropic-partner-portal eller
en marketplace-lista:
1. https://console.cloud.google.com/marketplace/details/anthropic-public/claude-sonnet-4-6
2. Sök även "Anthropic" i Console-sökrutan globalt
3. Om en "Configure for service account"-knapp finns: använd den

#### B3d. Eskalera till Cloud Support
Om B3a–B3c inte fungerar:
- Öppna Cloud Support-case med:
  - Projekt-ID: `round-plating-480321-j7`
  - Beskrivning: "Service account `insider-graph-sa` gets HTTP 404 (generic Google
    error page, not a Vertex error) when calling Anthropic global endpoint via
    `:rawPredict`, while user-ADC gets 429 (quota). Need access enabled for SA."
  - Inkludera curl-resultaten från B1 (user) och från SA-test (efter A4-pattern impersonation)

### B4. Verifiera SUCCESS
Samma struktur som A4, men URL:n är:
```
https://global-aiplatform.googleapis.com/v1/projects/round-plating-480321-j7/locations/global/publishers/anthropic/models/claude-sonnet-4-6:rawPredict
```
med body
```json
{"anthropic_version":"vertex-2023-10-16","messages":[{"role":"user","content":"hi"}],"max_tokens":5}
```

**Klart om**: HTTP 200 (svar) eller 429 (quota — modellen är access:bar, bara kvoten slut).

---

## Rapporteringsformat (skicka tillbaka till Gustav)

Använd denna struktur:

```yaml
mistral:
  before_fix:
    user_adc: HTTP <code>
    sa_impersonation: HTTP <code>
  actions_taken:
    - "Klickade Subscribe-knappen i Model Garden — formulär dök upp / ingen formulär"
    - "Lade till SA i Service account access-sektionen"
    - "<andra steg>"
  after_fix:
    user_adc: HTTP <code>
    sa_impersonation: HTTP <code>
  status: SUCCESS | NEEDS_ESCALATION | BLOCKED_24H

claude:
  before_fix:
    user_adc: HTTP <code>
    sa_impersonation: HTTP <code>
    audit_log_status_code: <NOT_FOUND | PERMISSION_DENIED | ...>
  actions_taken:
    - "<vad gjordes>"
  after_fix:
    user_adc: HTTP <code>
    sa_impersonation: HTTP <code>
  status: SUCCESS | NEEDS_ESCALATION | SUPPORT_CASE_OPEN
  support_case_id: <om öppnat>
```

När du rapporterar SUCCESS för en eller båda: Gustav flippar
`"status": "planned"` → `"live"` i
`insider-graph-api/services/llm.py:PROBE_ENGINE_REGISTRY` (en boolean per modell),
pushar, och nästa polling-runda plockar upp dem.

---

## Inte ändra (utanför scope)

- Koden i `insider-graph-api/` — den är fullt redo. Vi pratar bara om GCP-konfiguration.
- Andra SA:s än `insider-graph-sa@...`.
- Andra projekt än `round-plating-480321-j7`.
- Bortta EULA-acceptanser eller IAM-roller som redan finns.

## Kontakt

Gustav Westergren: `guswes@gmail.com`. Skicka tillbaka rapporten enligt formatet ovan.
