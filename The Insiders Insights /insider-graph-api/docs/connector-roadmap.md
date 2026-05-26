# Connector-roadmap — MVP

Status: levande dokument. Enda källan till sanning för vilka connectors som ska in
i MVP, i vilken ordning, och när en räknas som klar. Uppdatera status-tabellen när
en connector går vidare ett steg.

## 1. Mål

Alla connectors nedan ska in i MVP. Vi bygger **en i taget, i tur och ordning** — en
connector tas inte upp förrän föregående är klar enligt definitionen i §3. Det håller
grafens kvalitet och proveniens-disciplin intakt och undviker halvfärdiga källor.

Röda tråden för vad som kvalar in: **sanna, verifierbara affärsfakta med stark
proveniens** (se claims-provenance-spec.md §2). Inte "skrapa mer".

## 2. Status

Legend: ⬜ ej påbörjad · 🟡 pågår · ✅ klar (alla DoD-punkter i §3 bockade)

| # | Connector | Kärna | Status |
|---|-----------|-------|--------|
| — | linkedin / rss / website / gleif | (redan i drift) | ✅ |
| 1 | **GEO-riskloop** | Sondera beslutskritiska persona-frågor → skadeklassa svar → källförsedda korrigeringar + månadsrapport med Risk Exposure-trend ([spec](hallucination-loop-spec.md)) | 🟡 skiva 1–4 byggda + EU-routad LLM (Vertex EU / Azure OpenAI EU); kvar före skarp drift: ops-config (GCP_PROJECT, Azure OpenAI EU) + verifiering mot skarp källa |
| 2 | Auktoritativa attesteringar | VIES (moms), EUIPO/PRV (varumärke), patent, offentlig upphandling, ISO, utmärkelser | ⬜ |
| 3 | Wikidata/KG-förankring | sameAs-berikning + motsägelsedetektering mot Wikidata/OpenCorporates/Crunchbase | ⬜ |
| 4 | Erbjudande-katalog | Product/Service/Offer-noder länkade till Organization | ⬜ |
| 5 | Talat ord | Transkribera poddar/webinars/tal → narrative-claims på Person-noder | ⬜ |
| 6 | Kund-attesterings-liggare | Månatligt strukturerat utskick → `kind="attested"`-fakta med `attested_at` | ⬜ |

Sekvenseringsprincip: värde × hävstång på befintlig infra ÷ insats. #1 och #2 bygger på
det vi redan har (polling, claims, registry-mönstret) och är mest differentierande.

## 3. Definition of Done — checklista per connector

Härledd ur hur GLEIF faktiskt byggdes. En connector är **klar** först när alla punkter
som gäller den är bockade:

1. **Connector-klass** i `connectors/<id>.py` som subclassar `BaseConnector`
   (id, fetch_method, output_types, frequency, tier, input_fields), med robust
   felhantering (logga + returnera tomt, kasta aldrig).
2. **Registrerad** i `connectors/__init__.py` REGISTRY.
3. **Claims-mappning**: `extra`-fält → schema.org-predikat i `schema_org/claims.py`
   (skalärer via `_COMPANY_FIELD_MAP`, strukturerade objekt via egen härledning).
4. **Onboarding-fält** (om connectorn behöver input): `OnboardRequest` + persist i
   `services/discovery.py` + matas till `ConnectorConfig.params` i scrape-jobben.
   Frontend-payload mappar fältnamnet (kunder/page.tsx) — generisk rendering räcker
   inte, fältet måste in i payloaden.
5. **Onboarding-ingestion**: körs av `services/ingest.py` så ny kund fylls direkt.
6. **Compile**: nya predikat renderas korrekt i JSON-LD (`schema_org/compiler.py`) och
   på profilsidan; FAQ-mallar vid behov.
7. **Tester**: connector-parsning (mocka nätverk), claims-härledning, compiler-projektion.
   Hela sviten grön (`python -m unittest discover -s tests`).
8. **Proveniens**: varje producerat claim har en källa (item/manual/attested). Inga
   vanity-mätvärden, inget som kan exponera kunden (jfr avförd domän-skanner).
9. **Verifierat mot skarp källa** där en publik API/datakälla finns.

## 4. Process per connector

1. Skriv kort spec i `docs/` (mål, datakälla, fält→predikat, edge-cases) — som GLEIF.
2. Implementera mot checklistan i §3.
3. Verifiera (tester + skarp källa), pusha, uppdatera status-tabellen i §2.
4. Först därefter: nästa rad i tabellen.
