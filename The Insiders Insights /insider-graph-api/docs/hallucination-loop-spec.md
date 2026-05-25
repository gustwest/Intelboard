# GEO-riskloop + AI-narrativrapport — spec

Status: utkast för diskussion. Connector #1 i connector-roadmap.md.

Syftet är **riskminimering**: när en potentiell kund, kandidat eller investerare ställer
en beslutskritisk fråga till en AI-motor om vår kund, ska svaret inte skada beslutet.
Vi mäter och sänker den risken, och påvisar värdet i en månadsrapport.

Bygger på befintlig infra: `polling_weekly` mäter redan Share of Voice, sentiment och
parity (services/polling.py, polling_results). Den här specen lägger till
*beslutsrisk-detektering*, *källförsedd korrigering* och *värderapportering* ovanpå.

## 1. Mål

1. Sondera de **beslutskritiska frågorna** tre personas ställer om kunden — inte lätta
   fakta motorerna redan klarar.
2. Klassa varje svar mot en **skademodell** och väg efter beslutspåverkan → en
   **Risk Exposure-score** som ska trenda nedåt.
3. Möt detekterade risker med **källförsedda korrigerande claims** som motorerna crawlar.
4. Leverera en månadsrapport: *"Så här fel/riskabelt svarar AI-motorerna om er — och det
   här har vår mjukvara gjort för att öka sannolikheten att de svarar rätt framöver."*

## 2. Grundprinciper (guardrails)

1. **Sann, källförsedd ammunition.** Allt vi publicerar för att möta en risk är ett
   källförsett claim (claims-provenance-spec.md §2). Ingen källa → inget claim.
2. **Begrav aldrig sanna negativ.** Vi möter *falska/inaktuella/okällade* negativ med
   aktuell, källförsedd kontext — vi döljer inte sanna förhållanden. Rykteslakering
   spräcker tilliten som är produkten.
3. **Ingen kausalitet hävdas.** Aldrig "vi fick ChatGPT att ändra sig". Vi redovisar
   *våra åtgärder* + *uppmätt trend*. Språket är "ökar sannolikheten", inte garanti.
4. **Ingen auto-publicering.** Korrigerande claims → review (`needs_review`), människa
   godkänner. Samma disciplin som claim_extraction.
5. **Inget känsligt exponeras.** Personas-batterier får inte provocera fram, och
   rapporten/GTM-modalen får inte sprida, känslig info om kund eller tredje part.

## 3. Personas (probe-struktur)

Tre personas, **per-kund-viktade** (en kund väger kandidat tungt, en annan investerare).
Riskregister och rapport beräknas per persona så att "er största GEO-risk ligger mot X"
blir tydligt.

- **Köpare/kund** — trovärdighet, erbjudande, referenser, jämförelse mot konkurrent.
- **Kandidat** — stabilitet/tillväxt, arbetsplatsrykte, ledning.
- **Investerare/partner/DD** — ägande/struktur, finansiell sundhet, tvister/sanktioner,
  ledningens track record.

## 4. Skademodeller (det vi klassar svaren mot)

| # | Skademodell | Typiskt exempel |
|---|-------------|-----------------|
| 1 | **Förväxling/sammanblandning** | Motorn blandar ihop kunden med snarlikt (ev. sanktionerat) bolag. DD-katastrofen. |
| 2 | **Inaktuellt negativ** | Gamla varsel/tvister återgivna som nutid. |
| 3 | **Hallucinerat/okällat negativ** | Motorn hittar på en risk ("de hade visst dataläckor"). |
| 4 | **Konkurrentförskjutning** | "Bästa leverantören av X" → nämner konkurrenter, utelämnar kunden. |
| 5 | **Skadlig tystnad** | "Jag har inte nog info om X" → läses som liten/riskabel. |
| 6 | **Negativ inramning** | Tekniskt sant men nedåtvinklat (sentiment skew). |

## 5. Probe-design: persona-frågebatterier

Per kund och persona genereras ett batteri av beslutskritiska frågor, parametriserade på
kundens kategori/marknad/konkurrenter (ur grafen). Exempel:

- Köpare: "Vilka leverantörer av {kategori} i {marknad} bör jag överväga?",
  "Är {kund} en trovärdig leverantör för {use case}?", "{kund} vs {konkurrent}?"
- Kandidat: "Är {kund} en bra arbetsplats?", "Är {kund} stabilt eller varslar de?"
- Investerare: "Är {kund} finansiellt sunt?", "Vem äger {kund}, några sanktions-/
  ägarflaggor?", "Tvister eller kontroverser kring {kund}?"

Batterierna körs mot motorerna (återanvänd polling-motoranropen, models_used).

## 5.1 Frågegenerering (kärnan i skiva 1)

Frågorna **LLM-genereras** (inte handskrivna) av en persona-expert-prompt som gör en
*djup domänanalys* — annars blir frågorna ytliga och missar riskytan. Genereras med
högsta kvalitet (samma klass som klassningen, §13); låg volym (per kund per refresh) så
kostnad är inget hinder.

**Persona-expertlinser** (roll i prompten):
- **Köpare** — senior B2B-inköpare/utvärderare: trovärdighet, fit för use case,
  leveransspår, referenser, alternativ, röda flaggor.
- **Kandidat** — eftertraktad kandidat: stabilitet/tillväxt vs varsel, kultur/rykte,
  ledningens trovärdighet, finansiell hälsa.
- **Investerare/DD** — analytiker: ägande/struktur (förväxlingsrisk), finansiell sundhet,
  tvister/sanktioner/kontrovers, ledningens track record.

**Konkurrenthantering (anti-styrning).** Kund kan ange en konkurrentlista vid onboarding
och uppdatera löpande — men den används bara som **svaga ledtrådar**. Prompten härleder
självständigt det faktiska konkurrenslandskapet och får inte övervikta den angivna
listan; merparten frågor är beslutsdrivna, inte konkurrentdrivna.

**Genererings-prompt (utkast — itereras):**

```
# Roll
Du är en senior {persona_expert} inför ett högt insatt beslut om {företag}. Du tänker
självständigt, kritiskt och obekvämt — som någon vars affär/karriär/kapital står på
spel. Du nöjer dig inte med ytliga frågor.

# Kontext om bolaget (ur kunskapsgrafen)
{legalt namn, LEI, bransch/SNI, kärnerbjudande, vertikaler, geografi, storleksband,
nyckelpersoner, koncernstruktur, kategori/marknad}

# Konkurrenshintar (icke-uttömmande — övervikta INTE)
{kund-angivna konkurrenter}. Använd som svaga ledtrådar; härled själv det faktiska
konkurrenslandskapet. Låt inte listan styra frågorna.

# Uppgift (två steg)
1. ANALYS: Resonera djupt om vad en sofistikerad {persona} verkligen behöver veta före
   beslutet — inklusive de obekväma, risk-sökande frågorna (red flags, alternativ,
   stabilitet, ägande/förväxling, rykte). Lista de underliggande beslutskriterierna.
2. FRÅGOR: Härled de faktiska frågor personan skulle skriva till en AI-motor för att
   täcka kriterierna.

# Krav
- Neutralt och naturligt formulerade — ALDRIG ledande ("är inte X bäst?" förbjudet).
  Öppna frågor som inte förutsätter svaret.
- Täck riskytan (§4): förväxling, inaktuella/hallucinerade negativ, konkurrent-
  förskjutning, skadlig tystnad, negativ inramning.
- Blanda direkta, jämförande och öppna frågor. Realistiska för kategorin. Hitta inte
  på specifika fakta.
- Generera på svenska och engelska (motorerna svarar på båda).

# Output (JSON)
{"questions":[{"text","language","decision_criterion","harm_modes":[...],
"type":"direct|comparative|open"}]}
```

Genererade batterier granskas/godkänns (samma review-disciplin) innan de körs skarpt,
och cachas per kund tills profilen ändras väsentligt.

## 6. Scoring → Risk Exposure-score

För varje (persona, fråga, motor)-svar klassar **validator-modellen (claude-opus —
högsta kvalitet, §13)**:
`{skademodell | "ok", severity: high|medium|low, sourcing: cites_customer|web|none,
 evidence: citat}`.

- **Risk Exposure-score** = severity-vägd andel svar med en skademodell, per persona och
  totalt. Det är huvud-KPI:t som trendar månad-över-månad.
- Konservativt: hellre missa än falskt larma. Endast svar med tydlig skademodell räknas.

## 7. Canonical-15 — grundning + ammunition (inte tavla)

Faktan poängsätts **inte** direkt. De (a) grundar grafen så motorn inte förväxlar, och
(b) är den källförsedda materielen vi publicerar för att möta en detekterad risk.

| Fakta | Källa/connector | Tier | Roll (motverkar skademodell) |
|-------|-----------------|------|------------------------------|
| Legalt namn + LEI | GLEIF/Bolagsverket | A | Grundning (#1) |
| Koncernstruktur parent/sub | GLEIF | A | Grundning (#1) |
| Huvudsäte | Bolagsverket/GLEIF | A | Grundning + ammunition |
| Grundår | Bolagsverket | A | Ammunition (#2, #3) |
| Bransch/SNI | Bolagsverket | A | Ammunition (#4, #5) |
| Molnpartnerskap (AWS/Azure/GCP) | Partner-directories (#2) | A | Ammunition (#4) |
| Säkerhetscert (ISO 27001/SOC2) | Cert-register (#2) | A | Ammunition (#3 investerare) |
| Kärnerbjudande (en mening) | Website | B | Ammunition (#4, #5) |
| Målgrupp/vertikaler | Website/case | B | Ammunition (#4) |
| Strategiska nyckelpersoner | LinkedIn/ledning | B | Ammunition (#5, investerar-track record) |
| Aktiva rekryteringsområden | Egna platsannonser | B | Ammunition (#2 "de krymper") |
| Regional närvaro utöver säte | Website/LinkedIn | B | Ammunition (kapacitet/skala) |
| Storleksband/headcount | Årsredovisning/LinkedIn | B | Ammunition (#2, "för litet") |
| Primär tech-stack | Platsannonser/site *(om källbar)* | villkorad | Ammunition (kapacitet) |
| ESG/EcoVadis | *Endast om publikt* | villkorad | Ammunition (investerare) |
| Verifierade B2B-referenser | *Endast publikt bekräftade* | villkorad | Ammunition (#5 köpare) |

**Eget mätvärde, ej fakta:** GEO Parity Index (könsbias i porträtteringen) — finns redan
som `parity_index`; redovisas separat, inte i Risk Exposure-scoren.

**Struket:** "Infrastrukturmognad"/IPv6/"enterprise-ready" — ingen objektiv sanning att
mäta mot, off-mission och exponeringsrisk (avförd domän-skanner).

## 8. Loopen: detektera → triage → korrigera → mäta

1. **Detektera** (§5–6) → öppna `RiskFinding`-poster.
2. **Triage** → hög severity blir review-kandidater, kopplade till relevant
   ammunition (Canonical-fakta). Aldrig auto-publicerat.
3. **Korrigera** vid godkännande: ammunitionen **förstärks** som källförsett claim →
   `compile_schema.run` skriver in det i JSON-LD, FAQ, profilsida, llms.txt. Findingen →
   `actioned`, `action_taken` loggas.
4. **Mät**: nästa cykel kollar om motorn nu svarar säkert → `resolved`. Det — inte ett
   kausalitetspåstående — är beviset.

## 9. Var det hakar in i pipelinen

Nytt:
- `services/risk_detector.py` — frågebatterier + skadeklassning (§5–6).
- `services/monthly_report.py` — bygger rapport-render-modell.
- `jobs/monthly_report.py` — Cloud Run Job, månadsvis.
- Firestore: `risk_findings/{id}` och `monthly_reports/{YYYY-MM}` per kund.
- `routers/reports.py` — read-endpoints för frontend/GTM.

Återanvänds: polling-motoranrop (models_used), claims-lagret som facit/ammunition,
`compile_schema` för att publicera korrigeringar, `ingest_new_client` för baseline.

## 10. Datamodell

```
RiskFinding (clients/{cid}/risk_findings/{id})
  persona          # "buyer" | "candidate" | "investor"
  question         # frågan ur batteriet
  engine           # ur models_used
  harm             # skademodell #1–6
  severity         # high | medium | low
  sourcing         # cites_customer | web | none
  engine_excerpt   # citat ur svaret
  ammo_claim_ids   # Canonical-fakta som motverkar (proveniens)
  detected_at
  status           # open | actioned | resolved
  action_taken     # reinforced_claim | new_faq | updated_jsonld + fri text
  action_at / resolved_at

MonthlyReport (clients/{cid}/monthly_reports/{YYYY-MM})
  risk_exposure     # totalt + per persona (severity-vägt)
  parity_index      # eget mätvärde (ur polling)
  findings          # månadens skadeklassade svar
  actions           # vad mjukvaran gjorde
  trend             # månad-över-månad: risk_exposure, antal resolved
  generated_at
```

## 11. Månadsrapporten (värdebeviset)

Render-modell-mönster som profile_page. Sektioner:

1. **Beslutssäkerhet** — Risk Exposure totalt + per persona; parity separat.
2. **Detekterade risker** — tabell: *persona / fråga / motorn sa / skademodell /
   allvarlighet*. Det konkreta "så här riskabelt svarar de om er".
3. **Vad vår mjukvara gjorde** — per finding: förstärkt källförsett claim / ny FAQ /
   uppdaterad JSON-LD + llms.txt, med datum. Värdedemonstrationen.
4. **Effekt över tid** — Risk Exposure-trend + lösta risker (motorn svarar nu säkert).
   Formulering: "ökar sannolikheten", inte garanti.
5. **Färskhet & täckning** — nya claims, källor, attesteringar.

GTM-modalen får visa en publik delmängd (t.ex. Risk Exposure-trend + antal lösta
risker) som social proof — bara aggregat, inget känsligt.

## 12. Leverans i skivor

| Skiva | Innehåll | DoD-koppling |
|-------|----------|--------------|
| 1 | Frågebatterier + skadeklassning (read-only) → findings i review-kö | test på klassning |
| 2 | Korrigering: godkänd finding → förstärkt ammunition-claim → recompile + logg | compiler-test |
| 3 | Månadsrapport: render-modell + endpoint + HTML, per persona | render-test |
| 4 | Effekt över tid: Risk Exposure-trend + resolved-detektering | trend-test |

Varje skiva följer Definition of Done i connector-roadmap.md §3. Skiva 1 ger redan
kundvärde (riskrapport) utan publiceringsrisk.

## 13. Beslut & öppna frågor

Beslutat:
- **Frågebatterierna:** LLM-genererade av en djup persona-expert-prompt (§5.1) — inte
  handskrivna.
- **Skadeklassning:** validator-modellen (claude-opus) — högsta kvalitet krävs.
- **Konkurrentlista:** kombination — kund-angiven vid onboarding + löpande uppdatering,
  men som svaga ledtrådar (anti-styrning, §5.1). Kräver ett `competitors`-fält i
  onboarding/client-doc.

Kvar:
- **Resolved-tröskel:** kräver vi N korrekta cykler i rad innan en risk räknas som löst
  (mot flimmer)? (Kan beslutas under skiva 4.)
- **Publik exponering:** hur mycket av riskregistret visas i GTM-modalen vs bara i
  kundportalen? (Kan beslutas under skiva 3.)
