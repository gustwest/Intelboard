# UX/UI — fullständig åtgärdsplan (Insider Graph / Geogiraph)

**Datum:** 2026-06-08 · **Bygger på:** flödes-/IA-/touchpoint-audit 2026-06-08
**Relaterat:** `frontend/docs/ux-audit-2026-06-04.md` (design-system-duplikation — *möjliggörare*, se §3)

Sökvägsprefix: `frontend/src/app/insider-graph/` (FE) och `insider-graph-api/` (BE) om inget annat anges.
Varje punkt har **Problem · Åtgärd · Syfte · Effekt · Filer · [Prioritet · Effort]**.
Prioritet: **P0** stoppar blödning (förtroende/destruktivt) · **P1** arkitektur & flöden · **P2** polish/konsekvens · **P3** nice-to-have.
Effort: **S** <½ dag · **M** ½–2 dagar · **L** >2 dagar.

---

## 0. Beslut (stängda 2026-06-08)

- **D1 — Kunden ser aldrig konsolen.** Får bara installationskit (mejl/PDF) + uppdateringsmejl. Avjargong sker ändå (för kollegor): vedertagna ord, **inga förkortningar**. Mejlet = projektion av dashboarden, men **insikt, inte datadump**. "Kund-läge" i cockpiten → **"Kundvy"**.
- **D2 — Ingen kundportal.** Kunden passiv ("vi sköter det"). De ~3 fall där bara kunden har facit (attesterad data, faktabekräftelse, "borde svaret varit annorlunda?") sköts via **mejl-svarsloop**; operatören matar in. Token-länk (inloggningsfritt formulär) byggs senare vid behov.
- **D3 — Medarbetare valfria, tomt är standard.** Verifierat: personliga LinkedIn-profiler skrapas **inte** (`linkedin_capacity.fetch()` → `[]`; `linkedin_url` lagras bara som referens). Referensfältet behålls.
- **D4 — Granska-volym växer med kundantal** → bulk/tangentbord/källtillit är **P0**.
- **D7 — Motorbyten sker flera gånger/år och motor** → behåll `⋮`-markör + "Så läser du siffran" prominent; grinda jämförelser över modellbyte; förenkla bara förklaringen.
- **Kontext:** ~3 onboardingar/vecka idag, mot ~10. Mest svenska kunder. Framgångsmått: snabbare onboarding, operatöreffektivitet, högre kundvärde/retention.

---

## 1. Tvärgående teman

**TC1 — Ett produktnamn** `[P2 · S]`
- Problem: tre namn (geogiraph / Geogiraph / Insider Graph) i titlar, sidebar, touchpoints.
- Åtgärd: välj ett, använd överallt.
- Syfte: en konsekvent identitet.
- Effekt: lägre kognitiv friktion internt och externt; mer professionellt intryck.
- Filer: tvärs FE+BE.

**TC2 — Reda ut de tre "persona"-begreppen** `[P2 · M]`
- Problem: Persona-targets (output), Persona-palett (warmth) och riskloop-personas lever som tre olika "persona" på samma yta.
- Åtgärd: döp om/gruppera så de tre rollerna blir distinkta.
- Syfte: ta bort en av de största förvirringskällorna i konfigurationen.
- Effekt: operatören vet vilken "persona" som styr vad; färre felinställningar.
- Filer: `_components/{AudiencePrioritiesEditor,PersonaPaletteEditor,MeasurementConfigEditor}.tsx`.

**TC3 — Brygga värdevokabulären mellan touchpoints** `[P2 · S]`
- Problem: kit/profil säger "AI läser er profil/verifierad"; mejlet säger "AI-synlighet/Beslutssäkerhet" — ingen brygga.
- Åtgärd: gemensam värdemening + definiera "Beslutssäkerhet" i en rad i mejlet.
- Syfte: en sammanhängande berättelse genom kundresan.
- Effekt: kunden förstår vad de köpt och vad mätetalen betyder.
- Filer: BE `monthly_report.py`, `install_kit.py`, `schema_org/profile_page.py`.

**TC4 — Avjargongisering, term + förklaring, inga förkortningar** `[P2 · M]`
- Problem: `conf 0.42`, `as_of`, `shadow/gate`, `rubric`, `Acka/Resolva`, `pp`, `SoV`, rå `severity`-enum.
- Åtgärd: behåll termen men lägg enkel förklaring (tooltip/sekundär rad); skriv ut förkortningar ("procentenheter", "andel av AI-svaren").
- Syfte: (D1) kollegor förstår direkt och kan förklara för kund.
- Effekt: kortare upplärning, färre missförstånd, snabbare operatörer.
- Filer: `review/`, `bevisarkiv/`, `alerts/`, `output-quality/`, BE mejl.

**TC5 — Skilj fel-tillstånd från tom-tillstånd** `[P0 · S]`
- Problem: `.catch(()=>[])` gör att backend-fel visar t.ex. "Inget väntar på dig 🎉".
- Åtgärd: visa "Kunde inte ladda" + retry vid fel; tomt bara när det faktiskt är tomt.
- Syfte: aldrig ljuga om systemets tillstånd.
- Effekt: operatören upptäcker avbrott istället för att tro att allt är lugnt.
- Filer: `page.tsx` (översikt), `review/page.tsx` m.fl. `.catch`-ställen.

**TC6 — Progressiv exponering som princip** `[P1 · genomgående]`
- Problem: allt ligger framme samtidigt (kunddetalj 15 kort, cockpit 12 kort).
- Åtgärd: flikar/collapsible/skeleton (konkretiseras i KU1, F3-7, KU7).
- Syfte: visa rätt sak vid rätt tillfälle.
- Effekt: lägre kognitiv last; nya användare bygger mental modell.

---

## 2. Område-för-område

### 2.1 Onboarding / Sätt upp

**ON1 — Laga hand-off-klippan (auto-nav + setup-checklista)** `[P0 · M]`
- Problem: modalen skapar ~20 % av en färdig kund, dumpar till listan, ingen nästa-åtgärd.
- Åtgärd: auto-navigera till kunddetalj vid skapande + checklista (kontakt ✓, bransch ✓, audience ✓, connectors ✓, första profil körd ✓), separat från pipeline-status.
- Syfte: göra "färdig-konfigurerad" till ett synligt, styrt mål.
- Effekt: snabbare, mer komplett onboarding; färre halvkonfigurerade kunder.
- Filer: `kunder/page.tsx`, `kunder/[client_id]/page.tsx`, BE `routers/clients.py`.

**ON2 — Lyft kontakt-e-post till synlig, kritisk status** `[P0 · S]` (ihop med ON1/N2)
- Problem: mottagaren för kit + mejl ligger begravd och ser valfri ut; utan den når leveransen ingen, tyst.
- Åtgärd: in i checklistan + tydlig "krävs för leverans"-markering.
- Syfte: garantera att leverans har en mottagare.
- Effekt: inga tyst-misslyckade leveranser.
- Filer: `_components/IdentityMetadataEditor.tsx`.

**ON3 — Visa beroenden före klick** `[P2 · S]`
- Problem: "Auto-härled"/"Hämta automatiskt" felar med 422/info *efter* klick (kräver scrape först).
- Åtgärd: pre-condition-hint/disable med förklaring ("Kräver att website-connectorn körts först").
- Syfte: vägleda istället för att straffa.
- Effekt: färre förvirrande fel; rätt ordning första gången.
- Filer: `_components/{AudiencePrioritiesEditor,IdentityMetadataEditor}.tsx`.

**ON4 — Validera/auto-slugga client_id** `[P1 · S]`
- Problem: bara `.trim()`; "Exempel AB" går igenom som id; ingen unikhetskoll förrän 409.
- Åtgärd: auto-slugify (gemener, bindestreck) + unikhetskoll före submit.
- Syfte: rena, kollisionsfria identifierare.
- Effekt: färre trasiga kunder/URL:er och dubbletter.
- Filer: `kunder/page.tsx`.

**ON5 — Required-markörer + fältnära fel i modalen** `[P1 · S]`
- Problem: client_id/Företagsnamn saknar required-markör; fel visas som bottenbanner.
- Åtgärd: markera obligatoriska fält; visa fel vid fältet.
- Syfte: tydlig, omedelbar feedback.
- Effekt: snabbare ifyllnad, mindre scrollande efter felet.
- Filer: `kunder/page.tsx`.

**ON6 / N1 — Medarbetare valfria, standard tom** `[P1 · S]`
- Problem: hård-krav "minst en medarbetare med LinkedIn-URL" blockerar företagsnivå-kunder.
- Åtgärd: ta bort kravet, tomt som standard; behåll personlig LinkedIn-URL som referensfält; uppdatera tom-text.
- Syfte: stödja kunder utan namngivna personer (D3).
- Effekt: bredare kundbas kan onboardas; enklare flöde.
- Filer: `kunder/page.tsx`, BE `services/discovery.py`/`schemas.py`.

**ON7 — Vänliga connector-namn i modalen** `[P2 · S]`
- Problem: connectors visas som rå id (`gleif`, `jobfeed`) i onboarding men som "GLEIF (org-data)" på andra ställen.
- Åtgärd: använd samma NAME-map överallt.
- Syfte: konsekvent, begripligt språk.
- Effekt: operatören känner igen källorna; mindre osäkerhet.
- Filer: `kunder/page.tsx`, `_components/ConnectorsEditor.tsx`.

**ON8 — Premium-tier: länk + DNS-guide** `[P2 · S]`
- Problem: "egen domän / CNAME → se Leverans" utan länk eller instruktion.
- Åtgärd: länk till Leverans + kort DNS-guide i flödet.
- Syfte: göra premium-vägen genomförbar utan gissning.
- Effekt: färre fastnade premium-onboardingar / supportärenden.
- Filer: `kunder/page.tsx`, `leverans/page.tsx`.

**ON9 — Samla in wikidata_id i modalen** `[P3 · S]`
- Problem: backend stödjer `wikidata_id` men modalen samlar inte in det.
- Åtgärd: lägg till fältet (valfritt).
- Syfte: utnyttja en redan stödd entitetskoppling.
- Effekt: bättre entitetsmatchning hos AI-motorerna.
- Filer: `kunder/page.tsx`, BE `schemas.py`.

### 2.2 Kunder (lista + detalj + underysidor)

**KU1 / F2-1 — Strukturera kunddetalj i flikar** `[P1 · L]`
- Problem: 15 platta kort, ingen hierarki; Medarbetare ligger sist.
- Åtgärd: flikar — Översikt (Pipeline + Företagsöversikt + Medarbetare + Kontakter) · Datakällor · Konfiguration · Kvalitet & verifiering · ESG · Fara.
- Syfte: gruppera efter uppgift; göra sidan navigerbar.
- Effekt: dramatiskt lägre kognitiv last; snabbare att hitta rätt.
- Filer: `kunder/[client_id]/page.tsx` (+ flik-primitiv).

**KU2 — Fixa underrubrik + lyft Medarbetare** `[P1 · S]` (del av KU1)
- Problem: underrubriken lovar "medarbetare/opt-out/radering" men sidan är en konfig-konsol.
- Åtgärd: skriv om underrubriken till sidans faktiska scope; Medarbetare i Översikt-fliken.
- Syfte: ärlig sidbeskrivning.
- Effekt: rätt förväntan, snabbare till vanligaste uppgiften.
- Filer: `kunder/[client_id]/page.tsx`.

**KU3 — Tydliggör de två pipeline-knapparna** `[P1 · S]`
- Problem: "Uppdatera profil" vs "Återpublicera" — skillnaden bara i tooltip.
- Åtgärd: etiketter som bär scope ("Kör full uppdatering" vs "Bygg om profilen"); gör den sekundära tydligt underordnad.
- Syfte: rätt knapp utan att gissa.
- Effekt: färre felkörningar/onödig analys.
- Filer: `kunder/[client_id]/page.tsx`.

**KU4 — Laga ESG dead-end** `[P1 · S]`
- Problem: `/esg/{id}` öppnas avstängd och säger "slå på på kundsidan" utan länk; enable-länken försvinner just när den behövs.
- Åtgärd: inline enable-knapp på ESG-sidan; behåll länk på detaljkortet även avstängd (eller dölj chip när avstängd).
- Syfte: ingen återvändsgränd.
- Effekt: ESG kan slås på där man står.
- Filer: `esg/[client_id]/page.tsx`, `_components/ESGAddon.tsx`, `kunder/page.tsx`.

**KU5 — Standardisera kundidentitet i breadcrumbs** `[P1 · S]`
- Problem: samma kund visas som företagsnamn på en sida och rå slug på nästa.
- Åtgärd: använd företagsnamn konsekvent.
- Syfte: konsekvent identitet i navigationen.
- Effekt: mindre förvirring om "vilken kund är detta".
- Filer: `kunder/[client_id]/`, `.../output-quality/`, `esg/[client_id]/`.

**KU6 — Gör listkort-chips uppenbart klickbara** `[P2 · S]`
- Problem: "att granska / ESG / risk"-chips ser ut som passiva räknare men är knappar till tre olika ytor.
- Åtgärd: hover/ikon-affordance.
- Syfte: avslöja interaktiviteten.
- Effekt: snabbare djupnavigering; mindre missad funktion.
- Filer: `kunder/page.tsx`.

**KU7 / F4-7 — Skeleton + collapsa tunga editorer** `[P2 · S–M]`
- Problem: sektion-för-sektion pop-in; alla editorer öppna som default.
- Åtgärd: använd befintlig `SkeletonCard`; collapsa Mät/Identitet/Audience/Persona/Verifiering som default.
- Syfte: stabilare första intryck, lägre last.
- Effekt: sidan känns snabbare och mindre överväldigande.
- Filer: `kunder/[client_id]/page.tsx`, `_components/*Editor.tsx`.

**KU8 / F4-8 — Vänliga felmeddelanden** `[P2 · S]`
- Problem: rå `{e.message}`/`HTTP {status}` visas för operatören.
- Åtgärd: wrappa i användarvänlig copy (rått i tooltip/konsol).
- Syfte: begripliga fel.
- Effekt: snabbare felsökning, mindre oro.
- Filer: `kunder/`, m.fl.

**KU9 — Översätt maskinsträngar i output-quality** `[P2 · M]` (del av TC4)
- Problem: `verdict`, `Transform/Drop/Publish`, `shadow`, `lint`, råa `dimension_hint`-chips.
- Åtgärd: översätt/gloss.
- Syfte: läsbar kvalitetsvy.
- Effekt: operatören tolkar rätt utan kodkännedom.
- Filer: `kunder/[client_id]/output-quality/`, `_components/OutputQualityBits.tsx`.

### 2.3 Arbeta (Granska, Leverans, Bevisarkiv, Kvitto)

**AR1 / F1-2 — Granska: säkerhet + bulk + tangentbord + källtillit** `[P0 · a:S b:M c:M d:M]`
- Problem: Avvisa irreversibelt (inget undo/bekräftelse); inga bulk-åtgärder; inget tangentbord; kön växer med kundantal.
- Åtgärd: (a) ångra-toast/mjuk-radering på alla Avvisa; (b) bulk select + "Godkänn/Avvisa alla" + "Godkänn alla ≥ X conf"; (c) tangentbord a/r/j/k, ⌘↵; (d) **per-connector auto-godkänn-tröskel** (minska inflödet vid roten). Bulk loggas med granskare+tid.
- Syfte: säker, skalbar triage.
- Effekt: ingen oåterkallelig felradering; mångdubblad genomströmning; kön krymper.
- Filer: `review/page.tsx`, BE connector-tröskel.

**AR2 — Enhetligt efter-beteende mellan de tre köerna** `[P1 · S]`
- Problem: godkänd claim blir kvar med bock, men godkänt mail/LinkedIn försvinner.
- Åtgärd: välj ett mönster för alla tre + success-feedback.
- Syfte: förutsägbar interaktion.
- Effekt: mindre osäkerhet om "gick det igenom?".
- Filer: `review/page.tsx`.

**AR3 — Normalisera godkänn-verbet** `[P1 · S]`
- Problem: "Godkänn" (claims/mail) vs "Verifiera" (LinkedIn) för samma handling.
- Åtgärd: ett verb överallt.
- Syfte: språklig konsekvens.
- Effekt: mindre kognitiv friktion i kön.
- Filer: `review/page.tsx`.

**AR4 — Humanisera confidence** `[P2 · S]`
- Problem: rå `conf 0.42`; separator-inkonsekvens (0.42 vs 0,7); tröskeln syns aldrig på kortet.
- Åtgärd: band (Låg/Medel) + tröskel-tooltip; enhetlig decimal.
- Syfte: begriplig osäkerhet.
- Effekt: snabbare, säkrare beslut.
- Filer: `review/page.tsx`.

**AR5 / F2-6 — Djuplänka bell + sidebar till rätt under-tab** `[P1 · S]`
- Problem: bell/sidebar landar på default-tab trots `?tab=`-stöd.
- Åtgärd: använd `?tab=` i länkarna.
- Syfte: ta operatören dit räknaren pekar.
- Effekt: färre felklick, snabbare till rätt kö.
- Filer: `components/GraphInboxBell.tsx`, `Sidebar.tsx`, `review/page.tsx`.

**AR6 / F2-3 — Flytta Kvitto + Bevisarkiv ur "Arbeta"** `[P1 · S]`
- Problem: båda är read-only rapporter utan arbetsåtgärd; ligger bland arbetsytor.
- Åtgärd: flytta till "Mät"/ny "Rapporter"-grupp, bredvid AI-synlighet (de djuplänkar redan till varandra).
- Syfte: gruppera efter verb (göra vs läsa).
- Effekt: tydligare meny; lättare hitta rapporter.
- Filer: `components/Sidebar.tsx`.

**AR7 / F2-6 — Stäng attesterad-data-loopen** `[P1 · S–M]`
- Problem: attesterad data visas på två ytor; Leverans säger "bekräfta på kundkortet" utan länk.
- Åtgärd: länka Leverans → bekräfta-sektionen (eller tillåt åtgärd från Leverans).
- Syfte: ett sammanhängande flöde.
- Effekt: mindre tabbhoppande; snabbare leverans.
- Filer: `leverans/page.tsx`, `_components/AttestedUpload.tsx`.

**AR8 — Säkra badge-förhandsvisning (XSS)** `[P2 · S]`
- Problem: `dangerouslySetInnerHTML` på server-returnerad badge-HTML.
- Åtgärd: sanera/avgränsa, eller rendera utan rå-HTML.
- Syfte: ta bort en injektionsyta.
- Effekt: lägre säkerhetsrisk.
- Filer: `leverans/page.tsx`.

**AR9 — Saknade states: toast/spinner/retry** `[P2–P3 · S]`
- Problem: ingen success-toast (utom claim-approve); export utan spinner; kvitto/bevisarkiv utan retry.
- Åtgärd: lägg till bekräftelse-toast, laddnings-spinner på export, retry på fetch-fel.
- Syfte: tydlig feedback på alla handlingar.
- Effekt: mindre "hände det något?"-osäkerhet.
- Filer: `review/`, `bevisarkiv/`, `kvitto/page.tsx`.

### 2.4 Mät, Översikt, Admin

**MA1 — Översikt: fel-tillstånd** `[P0 · S]` (= TC5 på översikten)
- Problem: failade fetches visar tomt/"allt lugnt".
- Åtgärd: fel-state per panel.
- Syfte/Effekt: se TC5.
- Filer: `page.tsx`.

**MA2 / F2-2 — Dela "Mät" i Mät + System/Drift** `[P1 · S]`
- Problem: kundvänd analys (AI-synlighet) ligger i samma låda som infra (Kostnader, Modell-hälsa, Drift-larm).
- Åtgärd: Mät = AI-synlighet + Output-kvalitet; System/Drift = Kostnader + Modell-hälsa + Drift-larm.
- Syfte: separera publik/syfte.
- Effekt: rätt mental modell; lättare hitta.
- Filer: `components/Sidebar.tsx`.

**MA3 / F2-4 — Lös Output-kvalitet-dubbletten** `[P1 · M]`
- Problem: Mät-fliken "Output-kvalitet (connector)" och per-kund-output-quality har nästan samma namn/ikon/komponent.
- Åtgärd: döp om (Connector-kvalitet (alla kunder) vs Output-kvalitet (per kund)); lägg kundfilter på Mät-fliken; kors-länka.
- Syfte: ta bort en findability-fälla.
- Effekt: operatören hittar rätt vy direkt.
- Filer: `output-quality/page.tsx`, `_components/OutputQualityPanel.tsx`, `Sidebar.tsx`.

**MA4 / F2-5 — Avgränsa de tre modellhälsa-ytorna** `[P2 · M]`
- Problem: Motor-status / Modell-hälsa / Drift-larm överlappar; `model_drift` dubbelt.
- Åtgärd: "använd denna när …"-rad på var och en, eller slå ihop drift-flaggor i Drift-larm.
- Syfte: tydliggöra vilken yta som svarar på vad.
- Effekt: snabbare felsökning, ingen dubbelyta.
- Filer: `model-health/page.tsx`, `alerts/page.tsx`.

**MA5 / F3-5 — Defaulta AI-synlighet till "Kundvy"** `[P1 · S]`
- Problem: defaultar till Ops (firehose) för förstagångsanvändare.
- Åtgärd: defaulta till Kundvy (eller detektera förstagång).
- Syfte: landa i den läsbara vyn.
- Effekt: nya användare överväldigas inte; matchar att vyn = kundens rapport.
- Filer: `polling/page.tsx:56`.

**MA6 / F3-6 — Säg "bas-kunskap vs live-signal" en gång; förenkla SoV-grafen** `[P1 · M]`
- Problem: konceptet förklaras 4+ ggr; SoV-stapeln kodar 5 signaler i sparkline-storlek.
- Åtgärd: en förklaring (info-ikon/dismissible); flytta `╪`/`⋮`-legend till hover; brusband på hover. Behåll markeringen (D7).
- Syfte: hederlighet utan clutter.
- Effekt: grafen läsbar vid en blick; budskapet kvar.
- Filer: `polling/_components/WeeklyVisibility.tsx`, `common.tsx`.

**MA7 — Avgränsa Översikt "Kundhälsa" mot Modell-hälsa** `[P3 · S]`
- Problem: två "hälsa"-vyer; oklart var man letar.
- Åtgärd: kort förklarande rubrik/scope på vardera.
- Syfte: undvika överlapp.
- Effekt: rätt vy vid "är något trasigt?".
- Filer: `page.tsx`, `model-health/page.tsx`.

**MA8 / F4-4 — Sluta läcka endpoints/filsökvägar i copy** `[P2 · S]`
- Problem: `POST /api/...`, `PRICE_TABLE`, skriptsökvägar i tom-/fel-texter.
- Åtgärd: flytta till collapsible "tekniska detaljer".
- Syfte: ren UI, behåll ops-info.
- Effekt: mindre brus, fortsatt felsökbart.
- Filer: `costs/`, m.fl.

**MA9 — Admin: notera generisk workspace** `[P3 · —]`
- Problem: Admin = delad `AdminWorkspace`, ej geogiraph-design.
- Åtgärd: medvetet val — behåll eller anpassa vid behov.
- Syfte/Effekt: konsekvent designspråk om man väljer att investera.
- Filer: `admin/page.tsx`.

### 2.5 What-if & Konkurrent-yta (AI-synlighet)

**WC1 / F3-1 — Mode-gating + "Kundvy"-namn** `[P1 · S]`
- Problem: båda visas i Kundvy fast What-if är en operatörs-sandlåda.
- Åtgärd: What-if → Ops-only; Konkurrent-ytan → kvar i båda; döp om läget till "Kundvy".
- Syfte: rätt verktyg i rätt vy.
- Effekt: ren presentationsvy; säljbar konkurrentinsikt kvar.
- Filer: `polling/page.tsx:398,482,56`, `_components/WhatIfPanel.tsx`, `CompetitorSurface.tsx`.

**WC2 / F3-2 — Konsolidera risk-ytan** `[P1 · L]`
- Problem: ~5 risk-paneler (RiskLoop, Detekterade risker, What-if, Livscykel, recept) splittrar mentalmodellen.
- Åtgärd: en "Risker"-sektion/flik: detektion → what-if → recept/åtgärd → livscykel som ett flöde.
- Syfte: ett sammanhängande risk-arbetsflöde.
- Effekt: operatören håller en vy, inte fem; tydligare orsak-verkan.
- Filer: `polling/page.tsx`, `_components/{RiskLoop,RiskTimeline,WhatIfPanel,TrustGapCockpit}.tsx`.

**WC3 / F3-3 — What-if: led till åtgärd + debounce** `[P1 · M]`
- Problem: simulerar men leder inte till handling; POST på varje kryss-klick.
- Åtgärd: "Simulera → skapa recept/åtgärd"-länk; debounce eller "Beräkna"-knapp.
- Syfte: koppla insikt till handling; stabil interaktion.
- Effekt: simuleringen blir användbar; mindre flimmer/last.
- Filer: `_components/WhatIfPanel.tsx`, `TrustGapCockpit.tsx`.

**WC4 / F3-4 — Konkurrent: egen trend + lös överlapp** `[P1 · S–M]`
- Problem: "Ni"-raden hårdkodad flat/—; överlapp mot Veckovis synlighets hopfällda rad.
- Åtgärd: beräkna egen trend (eller förklara `—`); märk översikt vs djupdyk; säkra att vyerna inte motsäger varandra.
- Syfte: konsekvent, icke-motsägande konkurrentbild.
- Effekt: trovärdig leaderboard; inget "varför saknar vår rad trend?".
- Filer: `_components/CompetitorSurface.tsx`, `WeeklyVisibility.tsx`, `_shared.tsx`.

**WC5 / F3-7 — Gör Konkurrent-kortet collapsible** `[P2 · S]`
- Problem: tungt kort (väljare + callout + leaderboard + heatmap + disclosure) på en redan tät skärm.
- Åtgärd: collapsible eller egen vy (ihop med WC2).
- Syfte: minska densitet.
- Effekt: lättare skärm; insikten kvar på begäran.
- Filer: `_components/CompetitorSurface.tsx`.

### 2.6 Kundtouchpoints (kit, mejl, profilsida)

**TP1 / F1-4 — Installationskit: plattformsguide + fallback** `[P0 · S–M]`
- Problem: steg 1 räcker en marknadsförare rå JSON-LD + "klistra i `<head>`" utan vägledning; **kunden installerar själv** (vi har inte åtkomst).
- Åtgärd: per-plattform-hjälp (WordPress/Squarespace/Webflow/Wix) + "Inte säker? Vidarebefordra till er webbansvarig".
- Syfte: göra installationen genomförbar för en icke-tekniker.
- Effekt: fler lyckade installationer; färre avhopp/supportärenden.
- Filer: BE `schema_org/install_kit.py`.

**TP2 / F4-5 — Lokalisera installationskitet** `[P2 · M]`
- Problem: hårdkodad svenska + `<html lang="sv">`, men badge på kundens språk → mixad artefakt. (Lågt nu: mest svenska kunder.)
- Åtgärd: i18n:a kitet.
- Syfte: konsekvent språk per kund.
- Effekt: professionellt intryck för icke-svenska kunder (när de kommer).
- Filer: BE `schema_org/install_kit.py`, `i18n.py`.

**TP3 — Kit: trust-rad "vad vi verifierat / vem är Geogiraph"** `[P2 · S]`
- Problem: ni ber kunden klistra kod på produktionssajt utan att förklara varför det är att lita på.
- Åtgärd: kort förtroenderad.
- Syfte: sänka tröskeln för att installera.
- Effekt: fler vågar slutföra; högre upplevd seriositet.
- Filer: BE `schema_org/install_kit.py`.

**TP4 / F1-3 — Mejl: strippa operatörs-"Nästa steg" + profillänk** `[P0 · S]`
- Problem: "Nästa steg" exponerar interna åtgärder kunden inte kan göra och motsäger "ni behöver inte göra något"; ingen länk till profilsidan.
- Åtgärd: strippa alla operatörssteg; kund-fråga bara när den finns ("svara med X", D2); lägg "Se din AI-profil →".
- Syfte: bara kund-relevant innehåll + en väg till deliverabeln.
- Effekt: trovärdigt mejl; kunden tittar på profilen.
- Filer: BE `services/monthly_report.py`, `jobs/customer_report_email.py`.

**TP5 / N3 — Mejl som insikt, inte datadump** `[P1 · M]`
- Problem: risk att mejlet blir mätetal istället för budskap.
- Åtgärd: fast struktur — (1) rubrik-insikt med betydelse, (2) vad ändrats (grindat mot brusband), (3) viktigaste risken + vad vi gör, (4) ett bevis, (5) reassurance + ev. kund-fråga.
- Syfte: en uppdatering kunden faktiskt läser och förstår.
- Effekt: högre upplevt värde; tydlig månadsnytta → retention.
- Filer: BE `services/monthly_report.py`.

**TP6 — Definiera "Beslutssäkerhet" i mejlet** `[P2 · S]` (del av TC3)
- Problem: headline-metriken definieras aldrig i en rad.
- Åtgärd: en mening om vad talet betyder.
- Syfte: begriplig huvudsiffra.
- Effekt: chefen förstår direkt vad de ser.
- Filer: BE `services/monthly_report.py`.

**TP7 / F4-6 — Personalisera mejlets hälsning** `[P2 · S]`
- Problem: öppnar direkt på rubriken, ingen hälsning till kontaktnamn.
- Åtgärd: hälsa med kontaktnamn (finns på kunddoc / N2).
- Syfte: personligt, mindre mall-känsla.
- Effekt: högre engagemang.
- Filer: BE `services/monthly_report.py`.

**TP8 / F4-6 — Normalisera "AI-profil"-casing** `[P2 · S]`
- Problem: "AI-Profil" (footer) vs "AI-profil" (badge/i18n).
- Åtgärd: enhetlig casing.
- Syfte: polish.
- Effekt: konsekvent varumärkesintryck.
- Filer: BE `schema_org/i18n.py`, `badge.py`.

**TP9 — Profilsida: "Vad är detta?"-förklaring** `[P3 · S]`
- Problem: en människa som klickar badgen saknar kontext.
- Åtgärd: diskret förklaringslänk.
- Syfte: kontext för badge-besökaren.
- Effekt: bättre förståelse, mer förtroende.
- Filer: BE `schema_org/profile_page.py`.

---

## 3. Strukturella tillägg & beroenden

**N2 — Flera kontaktpersoner med huvudkontakt** `[P1 · M]`
- Problem: bara en kontakt; kontakt kan ändras för befintlig kund.
- Åtgärd: `contacts[]` med `is_primary` + valfri `role`; huvudkontakt får mejl + kit, övriga cc/rolltagg ("webbansvarig" → kit); migrera nuvarande `contact_email` → primär; byte loggas + bekräftelsemejl till ny kontakt; UI i Översikt-fliken.
- Syfte: realistisk kontaktstruktur + säkert byte.
- Effekt: rätt person får rätt utskick; inga tappade leveranser vid personbyte.
- Filer: `_components/IdentityMetadataEditor.tsx`, BE `routers/clients.py`, `services/monthly_report.py`.

**R1 — Roadmap (ej UX-backlog): Person-expertis som källa (CV-uppladdning)** `[L · beroende]`
- Problem/möjlighet: nyckelpersoners expertis gör bolaget citerbart i AI-svar.
- Åtgärd: ladda upp medarbetares CV (LinkedIn-export) → smal `Person`-extraktion (expertområden, meriter, roller) → granskningskö → publiceras som "uppgift från personen" på lägsta assurance-tier. **Kräver aktivt samtycke (bygg på `opted_out`) + relevansfiltrering (GDPR).**
- Syfte: stärka expertis-/auktoritetssignalen.
- Effekt: bättre person-/expertis-citering hos AI-motorer — för rätt kundtyp.
- Beslut krävs: **andel personberoende kunder (konsult/expert) vs produkt/varumärke?** Konsultbolag först, produktbolag parkeras.
- Filer: BE `services/`, `schema_org/claims.py`, `routers/review.py`.

**Beroende — design-system-foundation (audit 2026-06-04):** delade primitiver (Card, SectionHead, Badge, Toggle→flik, Empty/Error-state, Modal med a11y) är en *möjliggörare* för KU1, MA3, WC2, KU7, TC4. Dra de mest använda primitiverna före/parallellt med §2.2–2.4.

---

## 4. Sekvensering

1. **Snabba P0 utan beroenden:** TC5/MA1 (fel≠tomt), TP1 (kit-guide), ON6/N1 (medarbetare valfria).
2. **Resten av P0:** ON1/ON2 (onboarding-checklista), AR1 (Granska säkerhet→bulk→källtillit), TP4 (mejl-strip + profillänk).
3. **Foundation-primitiver** (från 06-04) parallellt.
4. **P1 IA — snabba först:** MA2/AR6 (sidebar-flytt), AR5 (djuplänkar), KU3/KU4/KU5, ON4/ON5, AR2/AR3 → sedan KU1 (stor) och MA3.
5. **P1 flaggskepp:** MA5/WC1/MA6 (snabba) → WC2 (stor konsolidering), WC3/WC4.
6. **P1 touchpoints/kontakt:** N2, TP5/N3.
7. **P2 polish** löpande: TC1–TC4, ON3/ON7/ON8, KU6/KU7/KU8/KU9, AR4/AR8/AR9, MA4/MA8, TP2/TP3/TP6/TP7/TP8, WC5.
8. **P3 / roadmap:** ON9, MA7/MA9, TP9; R1 efter beslut om kundtyps-andel.

---

## 5. Bevarade styrkor (rör inte / förenkla inte bort)

Översiktens "Att göra"-inbox med auto-dolda köer · matvaliditets-hederligheten (brusband, takmarkör, What-if-disclosure, konkurrent-"väg A"-disclosure, mejlets "Så läser du siffran") · profilsidans källattribution per claim + "(uppgift från bolaget/personen)" · type-to-confirm vid radering · pipeline-prickarnas a11y-labels · Ops/Kundvy-läget som idé (bara default + namn ändras) · `⋮`-modellbytesmarkör (D7).
