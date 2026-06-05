# Arbetsplan: Optimerad leverans (full implementationsspec)

> Härledd ur leverans-auditen (2026-06-05) + fact-checkad deep research. Scope:
> **P4** överlämning+kunduppdatering utan login (#1 kit + #2 månadsmejl),
> **P6** språkstrategi (evidensgrundad),
> **Profilsidan** alla förbättringspunkter.
>
> Ej i scope (noterade beroenden): P1 clean-URL, P2 hälsoverifiering, P3 versionering, P5 premium-domän.
>
> **Insats-skala:** S = <½ dag · M = ~1–2 dagar · L = >2 dagar. Filsökvägar relativa `insider-graph-api/`.

---

## Evidensbas (deep research 2026-06-05, körning `wf_81749da3-171`)

13 bekräftade / 12 refuterade fynd. Detaljer i [[reference_geo_citerbarhet_evidens]].

**Bekräftade citeringsspakar (rangordnat):**
1. **Inbäddade citat/källor/statistik** — starkast (~40% lyft, Aggarwal KDD'24 peer-reviewad). Gynnar utmanarvarumärken oproportionerligt (+115% för rank-5-källor). *Mappar direkt på vår `isBasedOn`-provenans.*
2. **Innehållsdensitet & djup** — ~11x ord, ~12x rubriker vs tunna sidor.
3. **Front-loading** — ~44% citeringar från sidans första 30%.
4. **Ren H1/H2/H3 + JSON-LD-datum (`datePublished`/`dateModified`) som matchar synligt innehåll.**
5. **Låg perplexitet** (klar, konventionell prosa) — AIO-citering ~47%→56%.
6. **Makro-arkitektur > keywords** (44,9% vs 15,4%).

**Refuterat — bygg INTE på:** FAQ-format i sig (−5,74%; värdet sitter i evidensen inuti) · llms.txt-effekt · schema som *självständig* citeringsdrivare · `sameAs`/org.nr/LEI som citeringshöjare · jämförelsetabeller "2,5x" · fasta chunk-regler.

**Språk:** sv+en motiverat av engine-query-språkprincipen (motorspecifik: Google AIO starkast språkkänslig, ChatGPT svag/omvänd). Ingen studie mätte svenska/ChatGPT/Claude → egen polling-mätning (C2) avgör. BCP 47 på `inLanguage`/`hreflang` = korrekt mekanism (schema.org primärkälla).

---

## Förberedelse P0 — datamodell (enabler, **S**) — ✅ KLAR
> Backend: `contact_email`/`contact_name`/`language` i `ClientConfigUpdate` + validering (e-post, språk-enum sv|en) + eko i `get_client` (default `sv`). Test: `tests/test_clients_contact_language.py`.
> Frontend: kontakt-e-post + kontaktnamn + språk-toggle (sv/en) i `IdentityMetadataEditor.tsx` (samma `PUT /config`). Typkollar rent.


Två nya fält på kund-doc. Filer: `routers/clients.py` (`ClientConfigUpdate` + `update_client_config` + `get_client`-svaret), frontend kund-kort (`IdentityMetadataEditor`/`MeasurementConfigEditor`).

- **P0.1 `contact_email`** (+ valfri `contact_name`) — mottagare för Spår B. Sätts via `PUT /api/clients/{id}/config`, eka i `get_client`. Validera e-postformat; tom sträng rensar.
- **P0.2 `language`** — primärspråk, default `"sv"`, enum `sv|en` (utbyggbart). Konsumeras av A1.

**Acceptans:** båda fälten kan sättas/läsas; saknas de → dagens beteende (svenska, ingen kundnotis). Test i `tests/test_clients*.py`.

---

## SPÅR A — Profilsidan

Alla ändringar i `schema_org/profile_page.py` (`_render`/`render_llms_txt`) + `schema_org/compiler.py` (render-modell, `build_faq`). Render-modellen (`RenderModel`, `Fact`, `Prose`, `Source`) har redan fälten vi behöver: `footnotes`, `manual_label`, `audience`, `assurance_level`, `Source.date/url/name/number`.

### A1 — Språk-refaktor (grund, **M**)
**Mål:** avhårdkoda språk; möjliggör en/parallellspråk utan att röra logik.
**Ändringar:**
- Extrahera alla svenska strängar i `profile_page.py` till en språkordbok-modul (t.ex. `schema_org/i18n.py`): `_FACT_LABELS` (rad 19–24), `_MONTHS_SV` (26–29), footer "AI-Profil verifierad av Geogiraph" (202), sektionsrubriker "Källor"/"Vanliga frågor"/"Aktuella roller", `_trust_line`-text (266–271). Även `DEFAULT_MANUAL_LABEL`/`DEFAULT_ATTESTED_LABEL` i `compiler.py` (36–37).
- `_render` läser `data.get("language", "sv")`, sätter `<html lang=...>` (147) och väljer ordbok.
- Emit:a `inLanguage` (BCP 47) på Organization/WebPage i `compile_client` och i identitets-snutten.
**Beslutet sv/en/båda tas i C3** — A1 defaultar `sv`, bygger bara mekanismen.
**Acceptans:** kund med `language=en` får engelska etiketter/månader + `lang="en"` + `inLanguage="en"`; svenska kunder oförändrade. Snapshot-test per språk.

### A2 — Synlig, tät evidens inline (**M**, **HÖGSTA GEO-VÄRDE**) — ✅ KLAR (branch `leverans-a2-p0`)
> Gjort: källans namn+datum renderas inline vid varje sourceat påstående (`_evidence`/`_inline_sources` i `profile_page.py`); `Source.excerpt` tillagt (`compiler.py`) och hämtas i `_load_source`; källans ordagranna citat visas i bibliografin (`_source_item`). Fotnotsankare + JSON-LD `isBasedOn` oförändrade. Test: `tests/test_profile_page.py`.
> **Provenans-beslut:** excerpt är KÄLLnivå → visas i källistan, INTE inline per claim (skulle antyda fel proveniens).
> **Uppföljning A2.1:** claim-nivå-citat (det specifika utdrag som styrker just det claimet) — den allra starkaste formen — kräver claim↔snippet-länkning i pipelinen. Separat arbete.

**Mål:** lyft fram den starkaste belagda spaken — källattribution/citat/siffror — från fotnoter i botten till synligt **inline** vid varje påstående.
**Ändringar (`profile_page.py`):**
- Idag: `_marks()` (249–256) ger bara superscript `[n]` + `_source_item` listar källor längst ner. Komplettera: rendera källans namn/datum **inline** vid faktan (t.ex. "Grundat 2014 — *Allabolag, mars 2024*") utöver fotnoten.
- Där en källa bär ett ordagrant citat eller siffra: exponera det. Kräver att `Source` ev. bär ett kort `excerpt`/`quote`-fält — utöka `Source` (compiler.py:65) + `_load_source` (643) att plocka `raw.get("excerpt")` om det finns; annars faller vi tillbaka på namn+datum (ingen regression).
- Behåll källistan i botten (bibliografi) — inline + lista kompletterar varandra.
**Acceptans:** varje faktapåstående visar sin källa (namn+datum, och citat/siffra när det finns) synligt utan att scrolla till listan; JSON-LD `isBasedOn` oförändrad.
**Not:** detta är primärt presentations-omarbetning av befintlig data — ingen ny pipeline.

### A3 — Front-loadad, citerbar ingress (**S–M**) — ✅ KLAR
> Gjort: `RenderModel.lead` + `_build_lead` (compiler.py) bygger "{namn} är verksamt inom … med säte i … grundat …" ur fakta, faller tillbaka på starkaste prosan. Renderas synligt överst (`<p class="lead">`) före faktapanelen, + meta/OG-description + llms.txt-summering. JSON-LD `Organization.description` lämnades som aggregerad prosa (rikt, inget tappat). Test: `tests/test_profile_page.py` (LeadIngressTest).
**Mål:** led med en självständig, ordagrant citerbar mening + nyckelfakta överst (position bias).
**Ändringar:**
- `compiler.py`: idag byggs `description` som hopslagning av all prosa (241). Lägg en härledd **lead-mening** "[Bolag] är [knowsAbout/verksamhet] i [address] som [förstärkt prosa]" ur befintliga fakta (foundingDate/address/knowsAbout) + starkaste prosan. Exponera som eget fält på `RenderModel` (t.ex. `lead`).
- `profile_page.py` `_render`: rendera `lead` som synlig ingress direkt efter `<h1>` (före facts-panelen) och använd den som JSON-LD `description`.
**Acceptans:** sidan inleds med en kvotbar mening + nyckelfakta; samma mening är `description` i grafen.

### A4 — Densitet, rubrikhierarki & "om"-sektion (**M**) — ✅ KLAR
> Gjort: ren H1/H2-hierarki (global `h2`-stil), egna rubriker `<h2>Fakta</h2>` + `<h2>Om {namn}</h2>`, och prosan bryts i ett `<p>` per claim (`_prose_paragraph`) i stället för en namnlös klump. Tomma sektioner utelämnas. Test: `tests/test_profile_page.py` (StructureAndFreshnessTest).
**Mål:** ren H1/H2/H3, beskrivande rubriker, tät fler-styckes-prosa (tunna sidor förlorar).
**Ändringar (`profile_page.py` `_render`, 190–192):**
- "Om"-prosan ligger idag i ett enda namnlöst `<p>`. Ge `<h2>Om {namn}</h2>` (lokaliserad via A1) och bryt `model.prose` i flera `<p>` (ett per prose-entry, fotnoter bevarade) i stället för `"".join(...).strip()` till en klump.
- Säkerställ konsekvent rubrikordning: H1 (namn) → ingress (A3) → fakta → Om → roller → FAQ → källor. Ge varje `<section>` en `<h2>`.
**Acceptans:** tydlig H1/H2-hierarki; "om" har `<h2>` + flera stycken; fotnoter/inline-evidens (A2) bevarade.

### A5 — Färskhetssignaler (**S–M**) — ✅ KLAR
> Gjort: `Organization.dateModified` = senaste källdatum (`model.last_updated`) i `compile_client` — matchar den synliga trust-raden ("senast uppdaterad …"). Per-claim-datum är redan synligt inline via A2. Test: `tests/test_profile_page.py` (date_modified_matches_last_source_date).
**Mål:** per-claim/per-källa-datum synligt + JSON-LD-datum som matchar synligt innehåll.
**Ändringar:**
- `profile_page.py`: visa källdatum inline (delvis täckt av A2) och behåll global trust-rad.
- `compiler.py` `compile_client`: lägg `dateModified` på Organization (= `model.last_updated`, rad 243 finns redan) och ev. `datePublished` per Claim-nod ur källans datum. Säkerställ att JSON-LD-datumen matchar det HTML visar (researchens krav).
**Acceptans:** fakta visar källdatum när det finns; `dateModified` i grafen = synligt "senast uppdaterad"; ingen layout-regression.

### A6 — FAQ som bärare av tät, källförsedd text (**M**, omformulerad) — ✅ KLAR
> Gjort: `_FAQ_TEMPLATES`/`_FAQ_ORDER` utökade med `slogan`/`memberOf`/`hasCredential` (källförsedda via befintliga footnotes → `Answer.citation`); svenska faktaetiketter för de nya predikaten. Test: `tests/test_profile_page.py`.
**Mål:** FAQ-formatet är inte spaken — men en bra behållare för evidens. Utöka `build_faq` och fyll svaren med källa+siffra/citat.
**Ändringar (`compiler.py` `build_faq`, 428–455):**
- Idag: 5 hårdkodade predikat (`_FAQ_TEMPLATES`/`_FAQ_ORDER`, 418–425) + "Vad gör {name}?". Utöka med fler predikat (t.ex. `jobBenefits` finns redan; lägg `memberOf`, `hasCredential`, `slogan`, ESG/culture-teman) och persona-relevanta frågor ur `audience`-taggade claims.
- Säkerställ att varje `FaqEntry.answer` bär konkret evidens (källa via `footnotes`, som redan citeras i JSON-LD `Answer.citation`, 387–389) — inte tomma Q&A.
- Lokalisera frågemallarna via A1.
**Acceptans:** FAQ täcker fler teman; varje svar källförsett; `FAQPage` matchar HTML. Lägre prio än A2–A5.

### A7 — Persona-sektioner i HTML (**S–M**) — ✅ KLAR
> Gjort: `_audience_sections_html` speglar llms.txt:s persona-gruppering till HTML (`<section class="audience"><h2>För {persona}</h2>`) med synlig källattribution (A2). Test: `tests/test_profile_page.py`.
**Mål:** spegla `_audience_sections` (idag bara i `render_llms_txt`, 88–126) i den människo/Googlebot-vända HTML:en.
**Ändringar:** ny `_audience_sections_html()` i `profile_page.py` som renderar samma persona-grupperade claims som `<section><h2>För {persona}</h2>...`, anropad i `_render`. Återanvänd `persona_registry`-ordning + dedup-logiken.
**Acceptans:** HTML visar persona-rubricerade sektioner motsvarande llms.txt.

### A8 — Fluency / låg perplexitet (**S**, mät i C2) — ✅ KLAR (lätt version)
> Gjort: `services/readability.py` — deterministisk, språkagnostisk meningslängds-proxy, loggad icke-blockerande i shadow-rubric:en (`output_quality_shadow`). Ingen tung perplexitetsmodell (engelsk-biased fynd) — trösklarna är provisoriska och kalibreras mot C2-utfallet. Test: `tests/test_readability.py`.
**Mål:** klar, konventionell prosa höjer AIO-citering.
**Ändringar:** granska LLM-prosa-generatorn (claim→mening) för jargong/stilistiskt udda formulering; ev. lägg en läsbarhets-/perplexitetscheck i output-quality-loopen (`services/output_quality.py`). *OBS: perplexitetsfyndet mätt på engelska — verifiera för svenska i C2 innan tung investering.*
**Acceptans:** prosa-output konsekvent klar; ev. läsbarhetsflagga i rubric:en.

### A9 — Logo + visuell trovärdighet (**S**, människo-förtroende ej GEO) — ✅ KLAR
> Gjort: logotyp ur Organization-noden renderas i `<header class="brand">` bredvid H1 (ren CSS, noll JS, rent fallback utan logo). Test: `tests/test_profile_page.py`.
**Mål:** `logo_url` (finns i identitets-snutten) saknas på profilsidan.
**Ändringar (`profile_page.py` `_render`):** rendera `<img>` med `data.get("logo_url")` bredvid H1 + minimal brand-touch i inline-CSS. Noll JS. Fallback rent när loggan saknas.
**Acceptans:** logga visas när satt; rent fallback; fortfarande ingen JS.

> **Refuterat (bygg inte på för citering):** llms.txt-effekt, schema som självständig drivare, `sameAs`/org.nr/LEI som citeringshöjare. Behåll för disambiguering/korrekthet/färskhet.

---

## SPÅR B — Överlämning & kunduppdatering (P4)

Princip: felnotiser internt (ops); kundyta = friktionsfri engångsöverlämning + löpande värdeuppdatering. Ingen login.

### Förarbete B0 — utöka notis-sömmen (**S**) — ✅ KLAR
> Gjort: `_deliver` tar nu `html=None` (sätter `html_content`); ny `send_customer_email` (kundvänd väg, self-no-op vid saknad konfig/kontakt). Kvartals-påminnelsen oförändrad. Test: `tests/test_notifications.py`.
`services/notifications.py` `_deliver` skickar idag bara `plain_text_content` till `ops_notify_email`. Utöka:
- `_deliver(to_email, subject, body, html=None)` → sätt `html_content` när `html` ges (SendGrid `Mail` stödjer det).
- Behåll self-no-op/felsäkerhet (saknad nyckel/avsändare → logga, fäll aldrig jobb).
**Acceptans:** kan skicka HTML-mejl till godtycklig mottagare; befintlig kvartals-påminnelse oförändrad.

### B1 — Auto-genererat installationskit (#1, **M**) — ✅ KLAR
> Gjort: `schema_org/install_kit.py` (render HTML-sida + e-postvariant ur snutt+badge+profil-länk, utskrivbar PDF, badge respekterar kundens `language`); endpoints `GET /api/delivery/{id}/install-kit` (HTML) + `POST .../install-kit/send` (mejlar kundkontakten via `send_customer_email`); frontend "Förhandsgranska/Skicka installationskit"-knappar i leverans-fliken. Self-no-op utan kontakt. Test: `tests/test_install_kit.py`.
**Mål:** ett klick → kunden får snutt + badge + instruktion.
**Ändringar:**
- Ny renderare `schema_org/install_kit.py`: bygg en ren HTML-sida (+ utskrivbar/PDF via print-CSS som månadsrapporten, 514–524) som samlar `render_identity_snippet` (delivery.py), badge-snippet (`schema_org/badge.py`), `profile_url`, och steg-för-steg "klistra här". Lokaliserad via A1.
- Ny endpoint `routers/delivery.py`: `GET /api/delivery/{client_id}/install-kit` (HTML) + `POST .../send` som mejlar kitet till `contact_email` via `_deliver(..., html=...)`.
- Frontend: knapp "Skicka installationskit" i Leverans-fliken (`frontend/.../leverans/page.tsx`).
**Acceptans:** kit innehåller fungerande snutt+badge+instruktion; skickas till kundkontakt; self-no-op utan kontakt/SendGrid. Test i `tests/test_delivery.py`.

### B2 — Månatligt kund-mejl ur rapportmotorn (#2, **M**, återanvänder infra) — ✅ KLAR (kod; schemaläggning = ops-steg kvar)
> Gjort: `monthly_report.render_customer_email(model)` destillerar BARA ofarliga fält (beslutssäkerhet/verdict/trend/styrkor/förbättringar) — inga motor-citat/harm-koder/narrativ-utkast/humaniserings-detaljer (enhetstest verifierar att inget läcker); jobb `jobs/customer_report_email.py`; manuell endpoint `POST /api/reports/{id}/{month}/send-customer-email`. Test: `tests/test_customer_report_email.py`.
> **Kvar (ops):** registrera jobbet som Cloud Run Job + Cloud Scheduler (cloudbuild.yaml-loopen + gcloud-create) så det körs månatligt efter `monthly_report`. Manuell send funkar redan.
**Mål:** destillera månadsrapporten till kundvänd sammanfattning. **Återanvänd INTE det interna utkastet** (`render_report_html` har banner "Internt utkast", engine-excerpts, harm-koder, `draft_narrative`) — bygg en kund-säker vy ur de ofarliga fälten i `build_report_model`: `verdict`, `decision_confidence` (stage + score + next_step), `trend` (serie + delta + resolved), `strengths`, `improvement_opportunities`. Uteslut `detected`/`actions`/`engine_excerpt`/`draft_narrative`/`humanization`-detaljer.
**Ändringar:**
- Ny `services/monthly_report.render_customer_email(model)` → HTML (kort, ledningsgrupps-vänlig, ingen jargong/kausalitet — samma ton som narrativ-systemprompten 340–355).
- Nytt jobb `jobs/customer_report_email.py` (mönster: `jobs/monthly_report.py` + `record_run`) som körs **efter** `monthly_report` och mejlar till `contact_email`. Lägg i `monthly_report_all`-kedjan eller egen scheduler i `scripts/bootstrap.sh`.
- Idempotent per (kund, månad); skicka bara om rapporten finns och kontakt satt.
**Acceptans:** månadsjobb renderar kund-säker rapport och skickar till kundkontakt; ingen intern detalj läcker; self-no-op utan konfig. Test i `tests/test_monthly_report.py` (kund-vyn) + nytt jobbtest.

> **Beroende mot P2 (ej i scope):** B förutsätter att ops vet att leveransen är live. P2-hälsoverifieringen är den interna motparten — rekommenderas som nästa spår efter B.

---

## SPÅR C — Språkevidens & beslut (P6)

### C1 — Deep research (KLAR 2026-06-05)
Se Evidensbas. Slutsats: sv+en motiverat av engine-query-språkprincipen (motorspecifik); ingen studie mätte svenska/ChatGPT/Claude → C2 avgör.

### C2 — Empiriskt polling-experiment sv vs en (**M**, avgörande)
**Mål:** mät vår faktiska kontext med befintlig polling-loop.
**Ändringar:** kör samma probe-batteri på svenska vs engelska per motor × persona för ≥1 pilotkund; jämför citerbarhet/uppfattning. Undersök öppna frågan om persona-skillnad (investerare/talang ev. mer engelska än kund i Norden). Återanvänd `services/polling.py` + `polling_questions`-konfig per kund (`clients.py` POLLING_CATEGORIES).
**Acceptans:** jämförande mätning sv vs en per persona/motor finns; matar C3.

### C3 — Språkbeslut + konfiguration (**S**)
Kombinera C1 + C2 → sätt `language` per kund/marknad (P0.2) och avgör om engelsk parallellutgåva av profil/llms.txt ska byggas (på A1-mekanismen). Öppen designfråga: en kombinerad språk-taggad sida vs två hreflang-länkade URL:er (sv/en) — forskningen avgör inte; testa.
**Acceptans:** dokumenterat språkbeslut; konfig satt; ev. parallellspråk specat.

---

## Sekvens (faser)

| Fas | Innehåll | Beroenden |
|-----|----------|-----------|
| **0 (klar/pågår)** | ✅ C1 research · P0.1+P0.2 datamodell | — |
| **1 — högsta GEO-värde** | **A2 synlig tät evidens** · A3 ingress · A4 densitet/rubriker · A5 färskhet | (A2/A3 oberoende; A1 ej krav för svenska) |
| **2 — grund för flerspråk** | A1 språk-refaktor | P0.2 |
| **3 — kundyta** | B0 notis-söm · B1 kit · B2 månadsmejl | P0.1 |
| **4 — komplettering** | A6 FAQ · A7 persona-HTML · A8 fluency · A9 logo | A1 (A6/A7 lokaliseras) |
| **5 — språkbeslut** | C2 polling-experiment → C3 beslut/konfig | C1, A1 |

---

## ▶ Rekommenderad start: A2 (synlig tät evidens) + P0 parallellt

**Börja med A2.** Skäl:
1. **Högsta evidensbelagda GEO-värde** — inbäddade citat/källor/statistik är den starkaste spaken och gynnar utmanarvarumärken mest.
2. **Bygger på data vi redan har** — `isBasedOn`/källnoder finns; det är en presentations-omarbetning, inte ny pipeline. Låg risk.
3. **Oberoende** av det öppna språkbeslutet (C2/C3) och av Spår B — ingen rework-risk.
4. **Kompounderar** — samma `_render`-omarbetning bär sedan A3/A4/A5 naturligt.

**Kör P0.1+P0.2 parallellt** (≈halvdag) eftersom de är triviala och låser upp hela Spår B och C.

**Håll A1 (språk-refaktorn) tills efter A2–A5** — annars refaktorerar vi strängar som A2–A5 ändå skriver om, och språkbeslutet (C3) är inte fattat än. Svenska kunder är opåverkade under tiden.

Nästa konkreta leverabel: en PR som (a) lägger `contact_email`+`language` på kund-doc:et och (b) renderar källa/citat/siffra inline vid varje faktapåstående på profilsidan, med snapshot-test.
