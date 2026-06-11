# AI-synlighet — utvecklingsplan (efter UX-audit 2026-06-11)

**Datum:** 2026-06-11 · **Bygger på:** UX-audit av AI-synlighetsfliken 2026-06-11 (18 punkter) + Gustavs kompletterande beslut
**Relaterat:** `docs/ux-audit-plan-2026-06-08.md` (flödes-/IA-planen — särskilt TC2 persona-begreppen och F3-klustret) · `frontend/docs/ux-audit-2026-06-04.md` (design-system)

Sökvägsprefix: `frontend/src/app/insider-graph/polling/` (FE) och `insider-graph-api/` (BE) om inget annat anges.
Varje punkt har **Problem · Åtgärd · Syfte · Effekt · Filer · [Prioritet · Effort]**.
Prioritet: **P0** stoppar blödning · **P1** arkitektur & flöden · **P2** polish/konsekvens · **P3** nice-to-have.
Effort: **S** <½ dag · **M** ½–2 dagar · **L** >2 dagar.

---

## 0. Beslut (stängda 2026-06-11)

- **B1 — Sidan är ops-only.** Kundvy-togglen är borttagen (genomfört). Den enda externa artefakten är månadsrapporten (HTML/utskrift + kundmejl). Allt på sidan får därmed designas för operatören.
- **B2 — Exponering visas aldrig som rå siffra.** (p.11) Risk-exponering ska bli en tydlig visuell skala som ger insikter — inte ett tal ingen förstår. Rå kvot/procent förbjuden i både flik och rapport.
- **B3 — Ett riskblock i månadsrapporten.** (p.16) Riskerna presenteras enhetligt i ETT block, i linje med hur riskytan i fliken byggs om (Etapp 1). Exponeringssiffrorna tas in i rapporten först när de genererar tydliga, lättförståeliga insikter (= när B2/E1 är klar) — inte som siffra.
- **B4 — Förtroendegap ska förklara sig självt.** (p.8) Modellen (säger/belägger/AI uppfattar) förklaras i UI:t, och presentationen designas om så att insikterna är tydliga och lätta att förstå utan förkunskap.
- **B5 — Frågedesign blir ett eget fokuserat arbetsspår.** (p.18) Forskningsbaserat och optimerat över tid — med kvalitetsramverk, kontrollfrågor, versionering och evidenskoppling. Löpande spår, inte ett engångsjobb.

---

> **Status 2026-06-11 (samma dag, em):** Etapp 0 ✅ · Etapp 1 (R1–R5) ✅ `38b97838d` ·
> E1+M2 ✅ `e39c60996` · M1 ✅ `dee4adc9b` · E2 ✅ `964b25286` · L1–L3 ✅ `bdd3dd707` ·
> L4 ✅ `627a2be3f` · Etapp 5-start F1+F3+F7 ✅ `49b427e56` · **F2 kontrollfrågor ✅**
> `6ac9eb882` · **M3 dokumentram ✅** · **F5 domarstabilitet ✅** · **F6 NER-kvalitet ✅** ·
> **F4 polling-språk sv/en ✅** · **F4b warmth-språkinfra ✅** (default-personor + språk-
> nycklade warmth/baseline-dok) · **F4b-content ✅** (full en-täckning, alla 10 personor)
> (principdok: `docs/fragedesign-principer.md`).
> **Kvar (enbart datagrindat):** E1-kalibrering av bandtrösklarna mot historik, F2:s
> inflationssiffra in i rapporten när underlaget vuxit (≥4 kontrollbärande veckor).

## 1. Genomfört — Etapp 0 (2026-06-11, commit `eab56ec26`)

- ✅ Risk-frågor: EN vy med statusflikar **Väntar / Godkända / Avvisade** (`#risk-fragor`); RiskLoopStatus ankarlänkar dit istället för egen inline-godkännare. (p.7)
- ✅ Risk-exponering: "1413%" ersatt med riskpoäng + antal svar + tunt-underlag-varning (<5 svar). Interimslösning tills E1. (p.11)
- ✅ Jobbknappar: pipeline-ordning, förklarande tooltips, resultatlänk efter lyckad körning ("klart — granska frågorna ↓"). (p.3)
- ✅ Senaste händelser: 4 rader default + "Visa fler". (p.5)
- ✅ Ops/Kundvy-togglen borttagen. (p.15)

---

## Etapp 1 — Riskytan: en risk, ett kort `[P1]`

Auditens kärnfynd (p.6, 9, 12, 13): alla riskboxar läser samma `risk_findings`-samling men visar fyra frikopplade presentationer. Målet: **en kanonisk risklista där varje risk är ett kort**, och allt annat blir egenskaper eller handlingar på kortet.

**R1 — Kanonisk riskkort-komponent** `[P1 · L]`
- Problem: "Detekterade risker" (tabell), "Riskens livscykel" (tidslinje), "What-if" (sandlåda) och "Vad mjukvaran gjorde" (lista) visar samma objekt utan synlig koppling.
- Åtgärd: ny komponent `RiskCard` + `RiskBoard`: lista med statusfilter (Öppna/Åtgärdade/Lösta/Avfärdade), varje kort visar fråga, persona, motor, skademodell, allvarlighet, statusbadge och motorcitat. Datakälla: `/api/review/{cid}/risks/timeline` (har redan allt).
- Syfte: operatören håller EN mental modell av risk.
- Effekt: fyra boxar blir en yta; ingen mer "hur hänger de ihop?".
- Filer: FE nytt `_components/RiskBoard.tsx`; ersätter `RiskTimeline.tsx`:s lista; `page.tsx`.

**R2 — Livscykeln som expanderbar detalj på kortet** `[P1 · S]` *(ingår i R1)*
- Problem: tidslinjen (detekterad → åtgärdad → löst, clean_streak) bor i egen box.
- Åtgärd: expandera kortet → tidslinje + händelsedatum + "2 rena cykler i rad krävs för löst" förklarat inline.
- Effekt: livscykeln blir en egenskap hos risken, inte ett eget koncept.
- Filer: `RiskBoard.tsx` (tidslinjerendering flyttas från `RiskTimeline.tsx`).

**R3 — What-if per riskkort** `[P1 · M]`
- Problem: What-if är en frikopplad sandlåda långt från riskerna den simulerar.
- Åtgärd: kryssruta "simulera löst" på varje öppet riskkort + sticky summeringsrad: "Om ni löser de 3 markerade: beslutssäkerhet 62 → 74 (+12, utanför brusbandet)". Samma endpoint (`/api/forecast/{cid}/confidence/whatif`), samma debounce. `WhatIfPanel` utgår.
- Syfte: what-if förvandlas från leksak till prioriteringsverktyg mitt i arbetsytan.
- Effekt: operatören ser direkt vilka risker som ger störst poänglyft — naturligt flöde istället för separat box.
- Filer: `RiskBoard.tsx`; `WhatIfPanel.tsx` tas bort; `page.tsx`.

**R4 — Åtgärda/avfärda direkt på kortet** `[P1 · M]`
- Problem: åtgärd kräver hopp till Granska-fliken.
- Åtgärd: knappar "Åtgärda (skapa förstärkande claim)" och "Avfärda" på kortet — samma endpoint som Granska (`POST /api/review/{cid}/risks/{finding_id}`); åtgärda öppnar samma formulär (statement/source_label/source_url) som modal.
- Effekt: sluten loop på ett ställe; Granska-fliken kvarstår för volymarbete.
- Filer: `RiskBoard.tsx`; formulärlogik delas med `review/` (extrahera gemensam modul).

**R5 — Rapportens "Detekterade risker" blir ett filter, inte en box** `[P2 · S]`
- Problem: månadsrapportens öppna risker (frysta vid rapporttillfället) ser ut som en FEMTE risklista.
- Åtgärd: i fliken ersätts rapportens risktabell av RiskBoard med filtret "i månadsrapporten" (matchning på finding-id från `report.detected`); avvikelse mellan live och rapport markeras ("löst efter rapporttillfället").
- Effekt: ögonblicksbilden förklaras istället för att duplicera.
- Filer: `RiskBoard.tsx`, `page.tsx`.

**Klart när:** en risk går att följa från upptäckt → simulering → åtgärd → löst utan att lämna en (1) yta, och inga dubbla risklistor finns i fliken.

---

## Etapp 2 — Insikter istället för siffror `[P1]`

**E1 — Exponerings-skala med insikt (B2, p.11)** `[P1 · M/L]`
- Problem: exponering = allvarlighetspoäng/svar — en obegränsad kvot utan tolkningsram. Även dagens interimsvisning (poäng + svar) kräver att man tänker själv.
- Åtgärd (backend): klassa exponeringen i **band** istället för att exponera kvoten:
  - *Underlagsgrind först:* < N svar (förslag N=5, kalibreras mot verklig data) → bandet är "Otillräckligt mätt" oavsett poäng. Ingen klassning på tunt underlag.
  - *Band:* *Låg / Förhöjd / Hög / Kritisk* utifrån poäng-per-svar med trösklar satta från historisk fördelning över kunder (percentiler), inte handviftade konstanter. Dokumentera trösklarna i koden + spec.
  - *Insiktsmening genereras regelbaserat* (inte LLM): t.ex. "Exponeringen är koncentrerad till investerare: 2 allvarliga risker av 3 öppna. Att lösa dem tar personan till Låg." — mall: var är den koncentrerad, vad driver den, vad krävs för nästa band.
- Åtgärd (frontend): horisontell bandskala (Låg → Kritisk) med markör per persona + allvarlighets-chips ("2 hög · 1 medel") + insiktsmeningen. Aldrig procent, aldrig rå kvot. Vid "Otillräckligt mätt": grå skala + uppmaning ("kör risk-detect / godkänn fler frågor").
- Syfte: siffran ersätts av en dom + en förklaring + en nästa-handling.
- Effekt: exponering blir användbar för både operatör och (via M2) ledningsgrupp.
- Filer: BE `services/monthly_report.py` (`_exposure` → band + insikt), spec i `docs/`; FE `page.tsx` (exponeringskorten), ny `_components/ExposureScale.tsx`.

**E2 — Förtroendegap: förklara + visa om (B4, p.8)** `[P1 · L]`
- Problem: tre-axel-modellen (säger/belägger/AI uppfattar) förklaras aldrig; tre staplar per dimension kräver att man redan kan modellen; gapet — själva poängen — syns inte som gap.
- Åtgärd, tre lager:
  1. **Förklaringslager:** en mening i boxhuvudet ("Gapet mellan vad ni säger, vad ni kan bevisa och hur AI beskriver er — positivt gap = AI överdriver er bild, negativt = ni underkommunicerar"), kollapsbar "Så funkar måttet" (de tre axlarna + kalibreringen i klartext), tooltip på varje term. Jfr TC4 i 06-08-planen (term + förklaring).
  2. **Visuell omdesign:** ersätt tre staplar med **dumbbell-diagram** per dimension — en punkt för *Belägger* (evidens), en för *AI uppfattar* (kalibrerad), pilen mellan dem ÄR gapet; färg efter riktning (överdrift = varningsfärg, underkommunikation = möjlighetsfärg, i linje = neutral). *Säger* blir en binär markering (✓/—) istället för stapel (den ÄR binär i datat). Sortera dimensionerna efter |gap| — mest att göra överst.
  3. **Insiktslager:** klartextmening per dimension ("AI beskriver er som varmare inom Transparens än era belägg håller för — trovärdighetsrisk om någon granskar") + sammanfattningsrad överst: "Största trovärdighetsrisk: X · Största outnyttjade möjlighet: Y". Recepten kopplas inline som CTA på den dimension de adresserar (de är redan gap-genererade).
- Syfte: insikten ska kunna läsas av någon som aldrig sett modellen.
- Effekt: boxen går från "expertinstrument" till beslutsyta; recepten får tydlig motivering.
- Filer: FE `TrustGapCockpit.tsx` (omskrivning av DimensionRow till dumbbell + sortering + insiktsrad); BE `services/trust_gap_report.py` (insiktsmeningar finns delvis — komplettera per-dimension + topp-sammanfattning).

**Klart när:** en kollega utan förkunskap kan läsa båda ytorna och korrekt återge vad de säger och vad nästa handling är (testa på en person).

---

## Etapp 3 — Månadsrapporten: ett riskblock `[P1]`

**M1 — Kanoniskt riskblock i rapporten (B3, p.16)** `[P1 · M/L]`
- Problem: risker visas i sex format i rapporten: verdict-prosa, exponeringskvoter, `detected`-tabell, `actions`-lista, `resolved`-räknare, plus over-claim-flaggor i humanization och LLM-narrativet. Datadump, olika format.
- Åtgärd: ETT riskblock med EN tabell: **Risk (frågan) · Persona · Allvarlighet · Status (Ny / Åtgärdad / Löst denna månad) · Vad vi gjorde**. Ersätter `detected` + `actions` + `resolved` som separata sektioner. Narrativet (behålls — det fungerar för ledningsgrupp) refererar riskerna vid namn istället för att parallellbeskriva dem. Samma struktur i alla tre renderingarna: fliken, HTML-rapporten, kundmejlet.
- Beroende: ska spegla Etapp 1:s riskkortsmodell (samma statusspråk, samma allvarlighetsbadges) — **kör efter R1**.
- Syfte: ledningsgruppen ser hela livscykeln i en vy; ett format att lära sig.
- Effekt: rapporten blir sammanfattning + ett risikblock + trend — inte fem riskformat.
- Filer: BE `services/monthly_report.py` (modellen: slå ihop till `risk_block`), HTML-rendering (`render_report_html`, `render_customer_email`); FE `page.tsx` (rapportzonen), `Panels.tsx` (`RiskTable` ersätts).

**M2 — Exponering in i rapporten via E1, inte före** `[P1 · S]`
- Problem: exponeringskvoterna i kundrapporten underminerar förtroendet (1413%).
- Åtgärd: ta bort råa exponeringssiffror ur HTML-rapport och kundmejl NU; återinför som E1:s bandskala + insiktsmening när E1 är klar. I fliken behålls interimsvisningen tills E1.
- Filer: BE `monthly_report.py` HTML/mejl-renderingen.

**M3 — Rapporten inramad som dokument** `[P2 · S]` ✅ (2026-06-11)
- Problem: rapportzonen ser ut som sju boxar till; att den ligger sist framstår som ologiskt (p.10) fast det är pipelinens utdata.
- Åtgärd: hela zonen inramad med egen pergament-bakgrund/ram + rubrik "Månadsrapport {månad} — så ser kunden den" + utskriftslänk (Utskriftsvy / PDF). En inledande rad reder ut beslutssäkerhets-dubbletten: rapportsiffrorna är rapportmånadens ögonblicksbild, toppbarens hero är den live/löpande.
- Effekt: placeringen längst ner blir begriplig; dubbletten slutar förvirra.
- Filer: FE `page.tsx`.

**Klart när:** risk förekommer i exakt ett block (+ narrativreferenser) i rapportens alla tre renderingar, och inga råa exponeringstal går externt.

---

## Etapp 4 — Layout & navigering `[P2]`

**L1 — Kompakt sticky-bar vid skroll (p.4)** `[P2 · M]`
- Problem: toppbaren med motorstatus tar stor del av fönstret vid skroll.
- Åtgärd: kollapsa till enrads-läge vid skroll (kund · månad · hero-siffra · motorhälsa som grön/röd prick); full motorstatus visas vid klick eller när någon motor avviker (undantagsinformation får yta bara när den avviker).
- Filer: FE `ContextBar.tsx`.

**L2 — Effekt över tid som hero-sparkline (p.14)** `[P2 · S]`
- Problem: flikens viktigaste säljande siffra ("blir det bättre?") ligger längst ner.
- Åtgärd: sparkline av månadsserien + delta bredvid hero-talet i sticky-baren; fulla diagrammet bor kvar i rapportzonen.
- Filer: FE `ContextBar.tsx`, `_shared.tsx` (`buildHero` får serien).

**L3 — Senaste händelser: senaste körning per jobbtyp (p.5)** `[P2 · S]`
- Problem: kronologisk lista svarar inte på operatörens egentliga fråga ("kördes allt som skulle köras?").
- Åtgärd: default-läget visar senaste körning per jobbtyp (4 rader: frågor, detect, polling, rapport) med status + relativ tid; "Visa historik" expanderar till kronologin (bygger på Etapp 0:s Visa fler).
- Filer: FE `Panels.tsx` (`ActivityFeed`).

**L4 — Mätinställningar som drawer i fliken (p.2, p.17)** `[P2 · M]`
- Problem: Mätkonfiguration och Persona-paletten bor på kundkortet — ett kontextbyte mitt i arbetsflödet. Paletten styr mätningen, inte kunddatat.
- Åtgärd: slide-over/drawer "Mätinställningar" öppnas från fliken — från Synlighets-frågor (industry/topic/service_area + egna frågor) och från riskytan (persona-paletten). Samma komponenter och API:er (`MeasurementConfigEditor`, `PersonaPaletteEditor`); kundkortet behåller sin ingång för onboarding-flödet.
- Samordna med **TC2** i 06-08-planen (de tre persona-begreppen) så att paletten inte flyttas in med oklart namn.
- Filer: FE `page.tsx`, `_components/` (drawer-wrapper), `insider-graph/_components/{MeasurementConfigEditor,PersonaPaletteEditor}.tsx`.

---

## Etapp 5 — Frågedesign-programmet (B5, p.18) `[P1 · löpande spår]`

Eget fokuserat arbetsspår: forskningsbaserat och optimerat över tid. Tre frågebatterier finns (polling/SoV-mallar, risk-frågor med människogrind, 120 warmth-prober) — programmet omfattar alla tre. Styrkorna behålls: adversariell parning, salience-grindning, mediandomare, per-motor-baselines, canary-drift, probe-guard.

**F1 — Kvalitetsramverk för frågor** `[P1 · M]`
- Problem: rubric finns för svaren men ingen kvalitetskontroll av frågorna (presuppositioner, emotiva ord, falska dikotomier, ledande inramning).
- Åtgärd: automatiserad ledande-språk-detektor + kvalitetsrubric för frågor; körs som gate vid generering (risk-generate) och vid egna frågor (custom). Flagga, inte blockera, i första versionen.
- Filer: BE ny `services/question_quality.py`; hooks i `risk_detector.generate_and_store_questions` och `routers/review.py` (custom-frågor).

**F2 — Kontrollfrågor & inflations-A/B** `[P1 · M]` ✅ (2026-06-11)
- Problem: "Vilka är de *ledande* bolagen inom {industry}?" primar motorn på konkurrenslandskapet — SoV-siffran kan vara uppblåst av frågekonstruktionen, okänt hur mycket.
- Åtgärd: 2–3 neutralt formulerade kontrollfrågor per kund (egen `kontroll`-kategori, `CONTROL_QUESTIONS`), mäts varje vecka men poolas ALDRIG in i rubrik-SoV/per-motor/sentiment/paritet. Inflationen = batteri-SoV − kontroll-SoV, summerad över ≥4 veckor med underlagsgrind (`services/sov_inflation.py`) och rapporterad som läsanvisning i cockpiten (under Veckovis synlighet).
- Status: i drift. Inflationssiffran i den externa rapporten väntar tills underlag finns (≥4 kontrollbärande veckor) och inramas då som band/insikt enligt B2 — inte rå %.
- Filer: BE `services/polling.py` (CONTROL_QUESTIONS, `_aggregate` exkluderar kontroll, `framing_inflation`), ny `services/sov_inflation.py`, `routers/polling.py` (per-vecka + `framing_inflation_summary`); FE `_shared.tsx` (typer/`CONTROL_CATEGORY`), `WeeklyVisibility.tsx` (`InflationNote`), `Panels.tsx` (kontrollkategori + Neutral-badge), `page.tsx`. Tester: `tests/test_sov_inflation.py`, F2-klasser i `tests/test_polling_sampling.py`.

**F3 — Versionering, rotation & staleness** `[P1 · M]`
- Problem: samma 12 frågor varje vecka; kundernas industry/topic sätts vid onboarding och uppdateras aldrig; mallbyte skulle idag knäcka jämförbarheten ospårat.
- Åtgärd: (a) versionera frågemallarna — varje ändring arkiveras med datum + motivering, vecko-resultat taggas med mallversion, trendbrott vid versionsbyte markeras i UI (som modell-bryt-markörerna i WeeklyVisibility); (b) kvartalsvis mallöversyn som rutin; (c) staleness-flagg i fliken när substitutioner är >90 dagar orörda.
- Filer: BE `services/polling.py` (version i resultatdokumentet), FE `WeeklyVisibility.tsx` (versionsbryt), `Panels.tsx` (staleness i Synlighets-frågor).

**F4 — Språk: sv/en per kund** `[P2 · M]` ✅ polling-spåret + F4b warmth-infra (2026-06-11)
- Problem: allt är svenska — men citerbarhet är motor- och språkspecifik (GEO-evidensen); engelska frågor kan ge en annan synlighetsbild för samma kund.
- Åtgärd: språkval per kund i mätkonfig; engelska varianter av default-mallarna; resultat taggas med språk och medeltalas aldrig över språk (samma princip som bas-kunskap vs live-signal).
- Status: **polling-spåret i drift.** `measurement_language` (sv/en) per kund i mätkonfig (skilt från profilspråket), engelska default- + kontrollfrågemallar (geografin "Swedish" behålls = samma marknad), engelsk systemram i `_ask`, resultat taggat med `language` och språk invävt i `questions_fingerprint` (språkbyte = jämförbarhetsbrott). Custom-frågor är språkagnostiska.
- **F4b — warmth-spåret i drift (default-personor).** `persona_registry` har nu engelska prober för de tre default-personorna (customer/talent/investor); `probes_for(persona, lang)` väljer språk med sv-fallback. `warmth_probes` läser `measurement_language`, ställer engelska prober + canary + systemram, och persisterar till **språk-nyckladt** warmth-dokument (`{WARMTH_PROBE_DOC}-en`); EWMA-baselines lagras språk-separerat (`engine-baselines-en`) så engelsk perception aldrig kalibreras mot svensk baseline; `compute_trust_gap` läser rätt språkdokument. En en-mätning hoppar över personor utan en-prober (loggat) så spåret förblir rent. Svenska vägen byte-identisk (default sv → samma doknamn). De engelska baselines konvergerar automatiskt över veckor (EWMA-uppvärmning, inget manuellt).
- **F4b-content ✅ (2026-06-11):** engelska prober för alla 7 palett-personorna (partner/media/regulator/patient/student/donor/citizen) — full en-täckning för hela paletten (10 personor × 6 dim × 2 vinklar). Ingen persona hoppas längre över i en-mätningar. `probes_for`-fallbacken är kvar som säkerhetsnät för framtida personor utan en-prober.
- Filer: BE `services/polling.py` (DEFAULT_QUESTIONS_EN, CONTROL_QUESTIONS_EN, `_measurement_language`, `_substitutions`, språk i ask/fingerprint/PollingResult), `routers/clients.py` (measurement_language), `routers/polling.py`; FE `MeasurementConfigEditor.tsx` (språkväljare), `_shared.tsx`, `Panels.tsx`. Tester: `test_polling_sampling.py`, `test_clients_contact_language.py`.

**F5 — Domarstabilitet synliggjord** `[P2 · S]` ✅ (2026-06-11)
- Problem: median + varians över 3 domarkörningar döljer riktningen (systematiska skift mellan körningar syns inte).
- Åtgärd: `_judge_verdict_calibrated` loggar nu `valence_runs` (full fördelning) + `direction_stable` (första-mot-sista-verdikt inom tröskeln `_DIRECTION_DELTA_MAX=0.25`). Instabiliteten propageras konservativt (AND över motorer/personor) upp till `perceived` och surfas som konfidensnot i cockpiten via `_confidence_note` ("Domaren skiftade riktning mellan körningarna…"). Cockpiten renderade redan `confidence_note` — ingen FE-ändring krävdes.
- Filer: BE `services/warmth_probes.py` (`_judge_verdict_calibrated`, `_aggregate_by_engine`, `_aggregate_with_personas`), `services/trust_gap_report.py` (`_confidence_note`). Tester: `test_warmth_probes_calibration.py`, `test_trust_gap_report.py`.

**F6 — Parity-NER-kvalitet** `[P2 · S]` ✅ (2026-06-11)
- Problem: person-NER:ns träffsäkerhet (särskilt icke-svenska namn) är oauditerad; brus går rakt in i Parity-siffran.
- Åtgärd: (a) `name_gender.aggregate` returnerar nu ett anonymt kvalitetsaggregat (`recognized`, `low_confidence`, `low_confidence_share`, `unknown_share`) — inga namn, persisteras som `parity_ner_quality` i veckoresultatet + i routern; en spik i `unknown_share` (>50 %) loggar en audit-varning. (b) Konfidensgrind `CONFIDENT_BEARERS=25`: igenkända men tunt underbyggda estimat hålls utanför pariteten (det är bärartalet, inte unisex-graden, som avgör — unisexa namn med gott om bärare behålls och sannolikhetsvägs som förut).
- Filer: BE `services/name_gender.py` (`_estimate_detail`, konfidensgrind i `aggregate`), `services/polling.py` (`parity_ner_quality` + audit-logg), `routers/polling.py`. Tester: `test_name_gender.py`.

**F7 — Forskningsbas & dokumenterade principer** `[P1 · S, sedan löpande]`
- Problem: frågedesignens principer finns bara implicit i koden.
- Åtgärd: `docs/fragedesign-principer.md` — designprinciperna (adversariell parning, salience-grindning, kalibrering, kontrollfrågor, versionering) med motivering kopplad till evidensen (GEO-citerbarhet: citat/källor/statistik starkast, sv/en motorspecifikt); kvartalsvis evidens-översyn som stående punkt; frågekvalitet in i output-quality-baselinen så att den mäts över tid.
- Filer: `docs/fragedesign-principer.md`; koppling till rubric-loopen.

**Klart när (programmets första cykel):** F1+F3 i drift, F2:s inflationsmätning rapporterad med siffra, principdokumentet skrivet och länkat från cockpiten.

---

## Sekvens & beroenden

```
Etapp 1 (riskkort) ──→ M1 (rapportens riskblock) ──→ M3 (dokumentram)
E1 (exponerings-skala) ──→ M2 (exponering åter i rapporten)
M2 steg 1 (ta bort råa tal ur extern rapport)  ← görs DIREKT, oberoende
E2 (förtroendegap)      — oberoende, kan gå parallellt med Etapp 1
Etapp 4 (layout)        — oberoende, bra utfyllnadsarbete mellan etapperna
Etapp 5 (frågedesign)   — löpande spår; starta F3 + F1, därefter F2
```

Föreslagen körordning: **M2 steg 1** (S, skyddar externa rapporten nu) → **Etapp 1** → **E1 → M1+M2 steg 2** → **E2** → **Etapp 4**, med **Etapp 5 (F3, F1, F2)** som parallellt spår från start.

## Framgångsmått

- **Operatör:** tid från ny risk till åtgärd; antal kontextbyten för ett standardflöde (mål: 0 sidbyten); ny kollega kan förklara förtroendegap + exponering efter att ha läst ytan (E-etappernas "klart när").
- **Rapport:** risk i exakt ett format; inga obegränsade tal externt; ledningsgrupps-läsbarhet (kvalitativ check med en kund).
- **Mätkvalitet:** SoV-inflationen kvantifierad (F2); 100 % av frågeändringar versionsspårade (F3); frågekvalitet med i output-quality-baselinens månadscheck.
