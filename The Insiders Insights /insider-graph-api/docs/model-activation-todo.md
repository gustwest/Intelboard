# Modell-aktivering — TODO

Checklista för att få probe-motorerna **Claude**, **Gemini**, **ChatGPT**, **Mistral**
och **Perplexity** live i AI-synlighets-flödet. Koden är på plats — det som återstår är
manuella acceptanssteg i Cloud Console + en deploy + en verifieringsrunda.

> Projekt: `round-plating-480321-j7`
> Default-region: `europe-west1` (resonemang) + `global` (Vertex-probarna) + Perplexity direkt-API
> Lokal verifiering: `./venv/bin/python -m pytest tests/` → ska visa **473 passed**

---

## 🚀 Quick start — gör detta i tur och ordning

**Beräknad tid: ~15 minuter klick + 5 minuter verifiering.**

### Steg 1: Acceptera 4 EULAs i Vertex Model Garden (~5 min)

Öppna: https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7

För varje av nedan: sök på namnet → klicka kortet → **ENABLE** → acceptera ToS.

- [ ] **Claude Sonnet 4.6** (Anthropic Commercial ToS)
- [ ] **Claude Opus 4.8** (Anthropic Commercial ToS)
- [ ] **Claude Haiku 4.5** (Anthropic Commercial ToS)
- [ ] **Mistral Medium 3** (Mistral Commercial ToS) — **OBS**: efter EULA-klicket kräver
      Mistral troligen även en explicit "Subscribe" eller "Request access"-knapp på samma
      sida. EULA ensam räcker INTE — i prod-test fick vi 404 på `mistral-medium-3` i alla
      regioner trots accepterad EULA. Probe_mistral är därför markerad som `planned` i
      `PROBE_ENGINE_REGISTRY` tills aktiveringen är komplett. När du löst det:
      flippa `"status": "planned"` → `"live"` i `services/llm.py` och pusha.

### Steg 2: Skapa Perplexity API-nyckel (~3 min)

1. Logga in på https://www.perplexity.ai/settings/api → **Generate New API Key**
   (kräver betalkort på kontot — pay-as-you-go, ~$0.001/request för Sonar)
2. Kopiera nyckeln (`pplx-...`) och uppdatera secreten:

   ```bash
   echo -n "pplx-XXXXXXXX" | gcloud secrets versions add insider-graph-perplexity-api-key \
     --project=round-plating-480321-j7 --data-file=-
   ```

   (Secreten är redan skapad med en placeholder. Du lägger till en ny version med
   den riktiga nyckeln; `:latest`-bindningen plockar upp den automatiskt.)

### Steg 3: Verifiera EULAs och secret (~2 min)

```bash
# Anthropic/Mistral CAN_PREDICT ska visa Yes:
gcloud ai model-garden models list --project=round-plating-480321-j7 \
  | grep -E "claude-sonnet-4-6|claude-opus-4-8|claude-haiku-4-5|mistral-medium-3"

# Perplexity-secreten har minst version 2 (din nya nyckel):
gcloud secrets versions list insider-graph-perplexity-api-key \
  --project=round-plating-480321-j7
```

### Steg 4: Pusha till main (~3 min)

```bash
git add -A
git commit -m "feat(geogiraph): aktivera 5 probe-motorer + knowledge_source-distinktion"
git push origin main
```

Cloud Build kör automatiskt:
1. Bygger ny image
2. Deployar `insider-graph-api`-service
3. Uppdaterar alla Cloud Run Jobs
4. **CI-grinden** kör `model-availability-check --dry-run` — failar deployen om någon
   probe inte svarar (regions-glapp, EULA saknas, ogiltig nyckel)

### Steg 5: Trigga `bootstrap.sh` om de nya jobben behöver skapas (~2 min)

Jobben `model-drift-scan` och `model-availability-check` är nya — bootstrap behövs
för att skapa dem + deras Cloud Scheduler-triggers:

```bash
cd insider-graph-api && PROJECT_ID=round-plating-480321-j7 ./scripts/bootstrap.sh
```

(Idempotent — kan köras flera gånger.)

### Steg 6: Slut-verifiering (~3 min)

```bash
# Trigga availability-check manuellt och vänta på resultat:
gcloud run jobs execute model-availability-check \
  --region=europe-north1 --project=round-plating-480321-j7 --wait

# Hämta JSON-svar — ska visa unavailable: 0:
curl https://insider-graph-api-<hash>.run.app/api/model-drift | jq '.counts'
```

Om allt är grönt: **du har 5 probe-motorer live**. AI-synlighet-fliken kommer visa
4 training-baserade probar + 1 web-RAG-probe efter nästa deploy av frontend.

---

## 📋 Detaljerade sektioner

---

## 1. Acceptera EULA i Vertex Model Garden (manuellt — Console)

**Varför**: Vertex Model Garden kräver att leverantörens kommersiella villkor accepteras
**per projekt**. `gcloud` har inget kommando för detta — måste göras via Console UI.

Gå till:
https://console.cloud.google.com/vertex-ai/model-garden?project=round-plating-480321-j7

För varje modell nedan: sök fram kortet, klicka **ENABLE**, acceptera ToS:n.

- [ ] **Claude Sonnet 4.6** — driver `probe_claude` + `agent_sonnet`. Anthropic Commercial ToS.
- [ ] **Claude Opus 4.8** — driver `agent_default`. Anthropic Commercial ToS.
- [ ] **Claude Haiku 4.5** — driver `agent_haiku`. Anthropic Commercial ToS.
- [ ] **Mistral Medium 3** — driver `probe_mistral`. Mistral Commercial ToS.

> **Perplexity** finns INTE i Model Garden — den körs via Perplexity Developer API direkt
> (separat auth-väg). Se sektion 2 nedan för API-nyckel-skapandet.

Verifiera att `CAN_PREDICT` flippat från `No` till `Yes`:

```bash
gcloud ai model-garden models list --project=round-plating-480321-j7 \
  | grep -E "claude-sonnet-4-6|claude-opus-4-8|claude-haiku-4-5|mistral-medium-3"
```

Alla fyra raderna ska visa `Yes` i sista kolumnen. Gemini-modellerna (`gemini-2.5-pro`,
`gemini-3.5-flash`) är redan `Yes` — kräver ingen EULA.

---

## 2. Verifiera kompletterande infra

- [ ] **OPENAI_API_KEY-secret aktuell** — verifiera att versionen i Secret Manager
      fortfarande är giltig (nyckeln är från 2026-05-19):

      ```bash
      gcloud secrets versions list insider-graph-openai-api-key \
        --project=round-plating-480321-j7
      ```

      Om versionen är raderad / nyckeln återkallad: skapa en ny version med en aktuell
      OpenAI-API-nyckel via Console eller `gcloud secrets versions add`.

- [ ] **Skapa Perplexity API-nyckel** (för `probe_perplexity`):

      1. Logga in på https://www.perplexity.ai/settings/api → "Generate New API Key"
         (kräver ett betalkort på kontot — pay-as-you-go, ~$1/1k requests för Sonar)
      2. Lägg in nyckeln i Secret Manager:

         ```bash
         echo -n "pplx-XXXXXXXX" | gcloud secrets create insider-graph-perplexity-api-key \
           --project=round-plating-480321-j7 --replication-policy=automatic --data-file=-
         ```

         (Om secreten redan finns, använd `gcloud secrets versions add` istället.)

- [ ] **Service-account har rätt scope för Mistral MaaS** — `_vertex_mistral` använder
      `gcloud auth`-tokenen för OpenAI-kompatibla endpoints. Default-scopen
      `cloud-platform` räcker. Bekräfta att `insider-graph-sa@...` har rollen
      `roles/aiplatform.user` (sätts av `scripts/bootstrap.sh` redan).

---

## 3. Deploy

- [ ] **Pusha till `main`** — Cloud Build:
   1. bygger image
   2. deployar `insider-graph-api`-service
   3. uppdaterar alla Cloud Run Jobs (inkl. `model-availability-check`)
   4. **kör CI-grinden** `model-availability-check --dry-run` → blockar deployen
      om någon LIVE-modell inte är aktiverad ännu.

   > Om CI-grinden failar: åtgärda EULA-steget ovan och tryck om bygget. Felmeddelandet
   > anger exakt vilken roll/modell som saknas.

- [ ] **Trigga `bootstrap.sh` om det inte redan körts** — för att skapa det nya
      `model-availability-check`-jobbet + dess scheduler (dagligen 02:00):

      ```bash
      cd insider-graph-api && PROJECT_ID=round-plating-480321-j7 ./scripts/bootstrap.sh
      ```

---

## 4. Live-verifiering efter deploy

- [ ] **Trigga availability-check manuellt** för att se att alla fyra probarna svarar:

      ```bash
      gcloud run jobs execute model-availability-check \
        --region=europe-north1 --project=round-plating-480321-j7 --wait
      ```

      Förväntat: `summary.unavailable = 0` i loggen.

- [ ] **Hämta drift-status via API** — ingen `model_unavailable`-finding ska finnas:

      ```bash
      curl https://insider-graph-api-<hash>.run.app/api/model-drift | jq '.counts'
      ```

- [ ] **Trigga en manuell polling-runda** för en testkund och verifiera att alla
      fyra motorerna producerar svar (inte bara 1–3). Loggarna ska visa
      `Token-meter: by_model` med alla fyra model-id.

---

## 5. Frontend (efter deploy)

- [ ] **AI-synlighet-fliken** ska visa **5 live-motorer** i health-statusraden
      (Claude, Gemini, ChatGPT, Mistral, Perplexity) + 1 planned (Copilot).
      Drivs av `/api/model-registry` + `PROBE_ENGINE_REGISTRY`.

- [ ] **Två separata sektioner i AI-synlighet** — `knowledge_source`-fältet i
      `MODEL_REGISTRY` driver UI-grupperingen. Använd `TRAINING_PROBE_ROLES` och
      `WEB_RAG_PROBE_ROLES` från `frontend/src/lib/aiModels.ts`. Föreslagen layout:

      | Sektion | Probar | Aggregat-KPI | Kundens åtgärd |
      |---|---|---|---|
      | **AI:s bas-kunskap** (training) | Claude, Gemini, ChatGPT, Mistral | "AI Knowledge Score" | Long-form innehåll, Wikipedia, autoritativa sources |
      | **AI:s live-signal** (web_rag) | Perplexity | "AI Discoverability Score" | Fresh press, SEO, structured data, news cycle |

      **Aldrig** medeltala över de två sektionerna — det är olika fördelningar.
      Visualisera separat, kommunicera distinkt åtgärd per sektion.

- [ ] **Verifiera change-event** — `/api/model-changes` ska visa ett färskt
      `model_changed`-event för `probe_claude` (sonnet-4-5 → sonnet-4-6) första gången
      `model-drift-scan` körs efter deploy. Detta ritar brytlinjen i tidsserierna.

- [ ] **AI-synlighet-grafen** — fundera på om Mistral-tidsserien behöver ett särskilt
      visningsbeslut (annan färg, EU-flagga). `probe_mistral` är ny dimension från och
      med första körningen efter aktivering.

---

## 6. Påminnelser / framtida arbete

- **Token-refresh för Mistral** — `_vertex_mistral` förnyar tokenen vid varje
  `make_probe_engines()`-anrop. Polling-loopen skapar klienter per körning, inte per
  kund — tokenens 60-min-livslängd räcker. Om vi någonsin börjar återanvända klienten
  över längre cykler: lägg in en explicit refresh-loop eller cacha credentials med
  `google.auth.transport.requests.AuthorizedSession`.

- **Kalibrering** — Claude-proben bytte model_id (sonnet-4-5 → sonnet-4-6) vid samma
  tillfälle som vi aktiverade Mistral. Tidsserierna för Claude och Mistral börjar
  båda från `effective_since = 2026-06-02`. AI-synlighet-grafen bör rita en
  brytlinje där och inte tolka pre/post som äkta trend.

- **Perplexity + Copilot** — fortfarande `planned` i PROBE_ENGINE_REGISTRY. Perplexity
  kräver REST-API-integration (utanför Vertex). Copilot använder OpenAI under huven
  och täcks delvis redan av `probe_openai` — diskutera om en separat probe behövs.

- **Grok / Llama / DeepSeek** — medvetet uteslutna 2026-06-02. Värt att utvärdera om
  kundbas eller marknad ändras (xAI-marknadsandel växer; Meta AI växer i konsumentledet).

---

## 7. Rollback-plan (om något går fel efter deploy)

Om Mistral-proben failar i prod men resten fungerar:

1. **Snabb tystning**: sätt `mistral`-rollen som `planned` i `PROBE_ENGINE_REGISTRY`
   och rip:a `probe_mistral`-rollen ur registret. `make_probe_engines` returnerar då
   bara tre probar. Pusha om → CI-grinden klarar deploy. Inboxen flaggar
   `unauthorized_hardcode` om mistral-id finns kvar i någon legacy-Firestore-doc —
   lägg `"mistral-medium-3"` i `LEGACY_ALIASES` då.

2. **Mistral aktiverad men auth failar konsekvent**: kolla service-account-IAM
   (`roles/aiplatform.user` + `cloud-platform`-scope). `_vertex_mistral` föredrar
   service-account-creds när jobbet kör i Cloud Run; lokalt kör det utan vidare.

3. **Hela polling-loopen failar**: stoppa `polling-weekly-tue`-scheduleen
   (`gcloud scheduler jobs pause polling-weekly-tue --location=europe-west1`). Inga
   nya datapunkter skrivs förrän probe-motorerna är gröna igen.
