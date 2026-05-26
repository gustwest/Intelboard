# GEO-riskloop — runbook för testkörning

Koden (skiva 1–4) är klar och EU-routad. Det här är sekvensen för att köra hela loopen
end-to-end i staging. Steg 1–3 kräver GCP/ops-access (du); steg 4 är ett kommando.

## 1. Deploya + applicera config
- Kör Cloud Build så ny image (med `langchain-google-vertexai`) går ut.
- Kör `scripts/bootstrap.sh` → sätter `GCP_PROJECT` + `VERTEX_LOCATION`, `roles/aiplatform.user`,
  aktiverar `aiplatform.googleapis.com`, på både service och jobb.

## 2. Slutför Vertex (manuellt — utanför bootstrap)
- Aktivera **Claude i Vertex Model Garden** (engångs, acceptera villkor).
- Lista giltiga modell-id och sätt env därefter:
  ```bash
  gcloud ai model-garden models list --region=europe-west1 | grep -iE "claude|gemini"
  gcloud run services update insider-graph-api --region=europe-north1 \
    --update-env-vars="VALIDATOR_MODEL=<vertex-claude-id>,GENERATOR_MODEL=<vertex-gemini-id>"
  ```
- Probe-nycklar (`OPENAI_API_KEY`/`GEMINI_API_KEY`) finns redan i Secret Manager.

## 3. En onboardad kund
- Loopen behöver ett klientdokument med `company_name` + lite fakta/claims (FACIT) +
  gärna `competitors`. Saknas en testkund: onboarda via `/api/onboard`.

## 4. Kör loopen (push-button)
```bash
python scripts/risk_loop_smoke.py \
  --base-url https://<cloud-run-url> --client-id <cid> \
  --admin-key "$ADMIN_API_KEY" --auto-approve \
  --action-statement "Acme har aldrig haft en publik dataläcka." \
  --save-html /tmp/geo-report.html
```
Skriptet: genererar frågor → auto-godkänner → detekterar/klassar → listar findings →
åtgärdar första → bygger månadsrapport → skriver ut beslutssäkerhet + sparar HTML.
`--auto-approve` kringgår review-grinden och är **endast för test**.

Diagnos via loggar: `GCP-projekt ej satt` = `GCP_PROJECT` saknas; tomt frågebatteri =
Vertex/modell-id fel; `probe ... ` = probe-nyckel saknas.

## Kvar / fast-follow
- **DPO-grönt** på att probe-frågor kan innehålla publika nyckelpersonsnamn (compliance,
  före riktig kunddata — ej teknisk blockerare).
- **Cloud Run Jobs** för risk-generate/detect: kör idag in-process som BackgroundTasks på
  API:t — OK för test, men tunga skarpa körningar bör flyttas till Jobs (mot request-timeout).
