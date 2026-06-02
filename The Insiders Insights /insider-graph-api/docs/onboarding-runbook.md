# Onboarding-runbook — ny kund

Steg-för-steg när en ny kund läggs till. Tänker på *vad operatören gör*, *vad
systemet gör*, och *vad som ska verifieras* — i den ordningen. Mer detaljer om
varje delsystem finns i respektive spec.

## 1. Skapa kunden (UI eller API)

**Operatör:** Öppna `/insider-graph/kunder/ny`. Fyll i:
- `company_name`, `client_id` (URL-säkert slug)
- `industry`, `topic`, `service_area` (för polling-substitutioner)
- `competitors`, `risk_personas` (default: buyer/candidate/investor)
- Active connectors + per-connector input-fält (`website`, `linkedin_url`,
  `rss_feeds`, `lei`, `job_feeds` etc — listan kommer från connector-registret)

**System:** `routers/onboard.py` skapar `clients/{id}` + sub-state, triggar
`services/ingest` som kör `scrape_active.run_for_client` + `scrape_website.crawl_client`
direkt så data finns i grafen utan att vänta på cron.

**Verifiera:**
- `clients/{id}` finns i Firestore.
- `clients/{id}/raw_items_company` har dokument.
- Tabben "Kompilerade fält" i kundsidan visar något.

## 2. Granska + godkänn risk-frågor

**System:** För att risk-detect ska köra något skarpt krävs godkända frågor
(`docs/hallucination-loop-spec.md §5.1`). Operatör kör:
```
POST /api/clients/{client_id}/risk-questions/generate
```
eller klickar "Generera risk-frågebatteri" i UI:t. Tre persona-batterier i två
spår skapas som `needs_review`.

**Operatör:** Gå igenom batteri i inboxen → godkänn/justera/avvisa. Endast
godkända frågor körs i veckovis `risk_detect_all`.

## 3. Verifiera mätloopen (frivilligt men rekommenderat)

Innan tisdag morgon-cron tar över, kör en manuell run:
```
gcloud run jobs execute polling-weekly --region=europe-north1 --update-env-vars=CLOUD_RUN_TASK_COUNT=1
gcloud run jobs execute risk-detect-all --region=europe-north1 --update-env-vars=CLOUD_RUN_TASK_COUNT=1
```
- Verifiera att `clients/{id}/polling_results/{vecka}` skrivits.
- Verifiera att `clients/{id}/risk_findings/...` har dokument (eller en
  `risk_run_summary` med 0 findings — bägge är OK).

## 4. Publicera profilsidan

**System:** `jobs/compile_all_schemas` (cron 05:00 dagligen) lyfter den nya
kunden automatiskt. För omedelbar publish:
```
gcloud run jobs execute compile-all-schemas --region=europe-north1
```

**Verifiera:**
- `https://${CDN_BASE_URL}/clients/{client_id}/` (eller den rena URL:en) svarar 200.
- `/clients/{id}/schema.json` har giltigt JSON-LD.

## 5. Bjud in kund-användare

(Saknas i nuvarande system — admin_api_key är master-nyckel. När SSO landar:
peka kund till login-flow, ge dem `viewer`-roll på sin tenant.)

## Sanity-checks efter onboarding (24h)

- `job_runs` har success-poster för scrape_active, scrape_website,
  extract_all_claims, compile_all_schemas på den nya `client_id`.
- Inga `failed`-poster för den kunden i 24h.
- Token-användning i `job_runs.summary.tokens` är i rimligt intervall
  (några tusen tokens per körning för risk-detect — *inte* hundratusentals).

## Kostnadsförväntan

En "normal" kund kostar ~$5–15/månad i tokens vid full pipeline (polling +
risk-detect + warmth-probes + claim-extraction). Plus Bright Data per LinkedIn-
snapshot. Kunder med många approved risk-questions × båda probe-motorer kan
nå 2–3× det — flaggas i kostnadsdashboarden när den finns.
