# GEO Parity Index v2 — porträttering vs baseline (DPA-säkrad)

*Spec 2026-06-10. Status: Fas 0 ✅, Fas 1+2 ✅ (öppen person-NER på Vertex EU,
nya aggregatfält, ingen namn-persistens), Fas 6 backend-delen ✅ (router
exponerar fälten). Kvar: Fas 3 (baseline-inmatning UI+router), Fas 5
(månadsrapportens gap-narrativ), Fas 6 frontend, Fas 7 löpande.*

## Principändring

Dagens `parity_index` mäter andel kvinnor bland **uppladdade anställda** som AI
nämner (`services/polling.py:_calculate_parity` + `gender`-fältet på employees).
Det kräver komplett personallista med könsfält — vilket vi inte kommer ha.

V2 river det beroendet:

1. Mät paritet på personer AI **öppet namnger** (person-NER på svaren).
2. Estimera kön **statistiskt ur förnamnet** (lokal SCB-data, `services/name_gender.py`).
3. Jämför mot en **officiell ledningsbaseline** per kund (manuellt inmatad m. proveniens).
4. **Gapet** (porträtterad − baseline) är kundvärdet: "AI:s framlyfta personer
   vs er formella ledning". Rapportspråket ska alltid markera att kohorterna
   inte är identiska (approach (a): vi cohort-matchar inte mot en ledningslista,
   för det skulle smyga tillbaka personallisteberoendet).

Parity Index förblir ett **eget mätvärde, ej fakta** — redovisas separat, aldrig
i Decision Confidence/Risk Exposure (jfr hallucination-loop-spec §7).

## DPA-efterlevnad (hårda villkor, inbakade i faserna)

| # | Villkor | DPA-klausul | Fas |
|---|---------|-------------|-----|
| 1 | Person-NER körs **uteslutande på Vertex EU-motor** — aldrig probe-`judge` (kan vara US). Svarstext kan innehålla personnamn = personuppgift; efterbehandling får inte lämna EU/EES | §6.1 | 1 |
| 2 | **Personnamn/kön persisteras aldrig** — bara anonyma aggregat skrivs (Firestore). `raw_responses` får inte längre bära `persons_mentioned` | §6.2, §7.2 | 2 |
| 3 | Behandlingen dokumenteras som **instruktion**: "Extraktion av personnamn i AI-motorers utdata + statistisk könsestimering, uteslutande för aggregerat representationsmått; inga namn/kön persisteras" | §2.2 | 4 |

Namn→kön-uppslaget är in-process (buntad SCB-fil) — inga externa anrop, EU per
definition. Externa estimerings-API:er (genderize/Namsor) är förbjudna (US-routning
av personnamn = tredjelandsöverföring).

Prejudikat: email-extraktionens OpenAI-fallback avvecklades 2026-06-10 av samma
skäl (`services/llm.py:make_email_extractor_openai` är hårdneutraliserad).

## Faser

### Fas 0 — Namn→kön-källa ✅ KLAR (2026-06-10)
- `data/scb_fornamn_2022.csv.gz` — 148 412 förnamn, bärare per kön. Källa: SCB
  "Samtliga folkbokförda – förnamn med minst två bärare" (frusen serie 2022-12-31).
  Regenerering: `scripts/build_scb_name_data.py`.
- `services/name_gender.py` — `estimate(namn) → P(kvinna)|None` (None = okänt,
  aldrig gissning; golv `MIN_BEARERS=5`), `aggregate(namn) → {parity, n,
  unknown_share}` sannolikhetsvägt.
- `tests/test_name_gender.py` — 13 tester inkl. regressionsskydd för villkor 2.

### Fas 1 — Öppen person-NER, EU-låst
- `polling.py:_extract_persons` görs om från employee-lookup till öppen NER.
- **Eget LLM-anrop på explicit Vertex EU-motor** (via `llm_factory`s EU-accessor) —
  inte invikt i `_extract_orgs` (som går på `judge` = första probe-motorn, kan
  vara US). Gated på `run_idx == 0` som övriga dyra anrop.
- `employee_names` behålls enbart för bolagsomnämnande (`_has_mention`).

### Fas 2 — Estimering, osäkerhet, ingen namn-persistens
- `_calculate_parity` ersätts av `name_gender.aggregate` + Wilson-CI95 (samma
  osäkerhetsgrindning som `sov_ci95`).
- `PollingResult` utökas: `parity_portrayed`, `parity_n`, `parity_unknown_share`,
  `parity_ci95`, `parity_baseline` (snapshot), `parity_gap`. `parity_index`
  behålls som alias = `parity_portrayed` (bakåtkomp).
- `_write` skriver bara aggregat; `raw_responses` slutar bära `persons_mentioned`.

### Fas 3 — Baseline per kund
- Klientfält `parity_baseline { value, source, as_of }` — ledningens/styrelsens
  kvinnoandel, manuell inmatning med proveniens (Bolagsverket-connector = ev. steg 2).
- Exponeras i `routers/clients.py`; inmatning i `IdentityMetadataEditor.tsx`.
- `run_for_client` snapshotar baselinen; `_aggregate` räknar gap.

### Fas 4 — DPA-instruktion
- Behandlingsbeskrivningen (villkor 3) in i detta dokument ✅ (ovan) + flagga
  till DPA-ägaren att spegla i den externa DPA-bilagan/underbiträdeslistan.

### Fas 5 — Månadsrapport
- `monthly_report.py:_latest_parity` → `{portrayed, baseline, gap, unknown_share, n}`.
- Rapportrad + `_strengths`-narrativ leds av **gapet**, båda riktningarna,
  grindat på `unknown_share`/`n` (inga tvärsäkra utsagor på tunt underlag).

### Fas 6 — API + frontend
- `routers/polling.py` exponerar nya fält; typer i `polling/_shared.tsx`;
  `WeeklyVisibility.tsx` visar porträtterad + baseline + gap med osäkerhetsband
  och låg-täckning-markering.

### Fas 7 — Tester (löpande)
- Gap-beräkning, Wilson-CI, tom nämnare, senaste-vecka-vinner, regress: inga
  namn i persisterad data.

## Migrering
- Gamla veckodokument saknar nya fält → läsare defaultar (`gap=None` utan baseline).
- Employees `gender`-fält slutar användas av paritet (lämnas orört).

## Kvarvarande risker
- Person-NER-träffsäkerhet bör spot-verifieras (eget EU-anrop = liten kostnadsökning).
- Litet urval: Wilson-CI + unknown_share/n-grindning dämpar men eliminerar inte.
- Baseline-trovärdighet beror på manuell inmatning tills ev. Bolagsverket-connector.
- SCB-serien är frusen (2022) — täckningen åldras långsamt; `unknown_share` är
  kanariefågeln.
