# Humaniseringslager & Förtroendegap-motorn — spec

Status: utkast för diskussion. Beskriver ett **tillägg** till informationslagret
(`docs/claims-provenance-spec.md`) som låter oss emittera *verifierad* mänsklig/kulturell
signal i JSON-LD:n, och en **förtroendegap-motor** som mäter avståndet mellan vad ett
bolag *säger*, *gör* och *uppfattas som* av AI-motorerna. Bygger uteslutande på befintlig
pipeline (claims → compiler → delivery → rapport). Ingen ny grund.

Relaterade specar: `claims-provenance-spec.md` (lager 1), `hallucination-loop-spec.md`
(probes/perception), ESG-modulen (`schemas.py: ESGMetricsSubmission`).

---

## 1. Mål

Göra det möjligt för ett bolag att framstå som mänskligt och värdedrivet för LLM:er
(ChatGPT, Perplexity, Gemini) — men **bara i den mån det går att belägga**. Samma
anti-hallucinationsregel som resten av systemet (`ingen källa → inget claim`) gör att
vår "värme" kommer med proveniens, vilket en kunskapsgraf väger tyngre än konkurrenters
osourcade nyckelord.

Det unika är inte markupen (den kommodifieras). Det är att vi mäter och rapporterar
**gapet** mellan påstådd och bevisad mänsklighet, och vägrar låta det ena ersätta det
andra. Det gör verktyget till en kraft som belönar att *vara*, inte att *synas*.

## 2. Grundprinciper

1. **Allt är ett `claim`** (ärvs från lager 1). Värmesignaler är culture-taggade claims.
2. **Ingen källa → inget claim.** Oförändrat.
3. **Påstått ≠ bevisat.** Ny axel `warmth_mode ∈ {declared, demonstrated}`. `declared`
   = en utsaga/policy finns. `demonstrated` = en handling/utfall med tredjepartsunderlag.
4. **Poängen belönar bevis, inte perception.** `perceived` (vad LLM:erna säger) går
   *aldrig* in i poängen — bara i gap-analysen. Annars vore poängen gameable via PR.
5. **Spegel, inte megafon.** Rapporten visar dissonans (externa källor som motsäger
   det deklarerade) lika tydligt som styrkor. Rekommendationer pekar på verklig
   handling, aldrig på "lägg till mer markup".
6. **Endast organisationsnivå (Lager A).** Rör aldrig `employees`-kollektionen. All
   mångfalds-/välmåendesignal är aggregat — aldrig en uppmärkt individs egenskap.
7. **Begriplig för vem som helst.** Allt som rapporteras måste vara förståeligt utan
   förkunskap. De interna facktermerna (salience, valens, credibility_gap, assurance,
   declared/demonstrated …) är *modellens* språk, aldrig *rapportens*. Varje siffra och
   begrepp översätts till tydlig, intuitiv vardagssvenska innan det visas. Förstår inte en
   mottagare utan kontext en rad i rapporten, är raden fel skriven — inte mottagaren.

## 3. Var det hakar in i nuvarande pipeline

Redan på plats:

| Lager | Status | Fil |
|---|---|---|
| Claims med proveniens (`item`/`attested`/`manual`) | finns | `schemas.py`, `routers/review.py` |
| Deterministisk property-claim-derivering | finns | `schema_org/claims.py` |
| Attestering (CSV → `Dataset` + `sdPublisher`) | finns | `routers/review.py`, attested-flödet |
| Kompilator claims → JSON-LD | finns | `schema_org/compiler.py` |
| Probes / perception | finns | `jobs/polling_weekly.py`, hallucination-loop |
| GEO-rapport (månad, ledningsgrupp) | finns | `jobs/monthly_report.py` |
| Färskhets-decay (sunset) | finns | `jobs/sunset_skills.py` |
| ESG-metrik-inlämning (kön/lönegap/styrelse) | finns | `schemas.py: ESGMetricsSubmission` |

Nytt som införs:

```
claims (utökas: facet, warmth_mode, dimension)
attestations (NYTT — GEMENSAM verifieringsrutin, delas med ESG; ops-only i MVP)
        │
        ▼  compute_trust_gap-jobb (NYTT)
trust_gap (NYTT — levande tillstånd per klient)
trust_gap_snapshots/{date} (NYTT — daterad historik)
        │
        ▼  rendering
JSON-LD (utökas: org-värmepredikat, Review/Event/Project) + GEO-rapportsektion
```

## 4. Omfång & GDPR

**Endast Lager A (organisationsnivå).** Lager B (namngivna individer) är uttryckligen
utanför detta tillägg.

Invarianter som kodas in, inte checkas manuellt:
- **Aggregat-only.** Inget publicerat tal får härröra från individdata.
- **Minsta cellstorlek.** Suppress publicerad siffra under tröskel (`MIN_CELL_N`,
  förslag 10) — re-identifieringsskydd.
- **Ingen särskild kategori (GDPR art. 9) per individ.** Mångfald uttrycks som
  sammansättning ("50% kvinnor i ledningen"), aldrig individattribut.
- Behandling som rör personuppgifter hålls i EU (Vertex EU), oförändrat.

## 5. Datamodell

### 5.1 Tillägg till `Claim` (`schemas.py`)

```python
class Claim(BaseModel):
    ...                                   # befintliga fält oförändrade
    facet: Literal["operational", "culture"] = "operational"
    # endast för facet="culture":
    warmth_mode: Literal["declared", "demonstrated"] | None = None
    dimension: str | None = None          # en av §5.2, t.ex. "transparency"
```

Inga befintliga fält ändras. Default `facet="operational"` → allt gammalt beteende
oförändrat.

### 5.2 Dimension-taxonomi (config, ej hårdkodad)

```
inclusion     mångfald & inkludering
wellbeing     välmående & arbetsmiljö
transparency  transparens, kollektivavtal, likalön
ethics        etik, styrning, uppförande
development   lärande & utveckling
community     samhällsengagemang
```

Mappningen `predicate → dimension` + dimensionsvikter ligger i en config-modul
(`schema_org/humanization_config.py`) så taxonomin kan justeras utan att röra logiken.

### 5.3 Culture-predikat (`schema_org/claims.py`)

```python
_CULTURE_PREDICATE_MAP = {
    # DECLARED — utsaga finns. Källa = sidan själv (kind="item") eller manual.
    "ethics_policy_url":    ("ethicsPolicy",    "declared",     "ethics"),
    "diversity_policy_url": ("diversityPolicy", "declared",     "inclusion"),
    "slogan":               ("slogan",          "declared",     None),
    "csr_topics":           ("knowsAbout",      "declared",     "community"),

    # DEMONSTRATED — handling/utfall. Kräver item/attested för full vikt.
    "collective_agreement": ("memberOf",        "demonstrated", "transparency"),
    "job_benefits":         ("jobBenefits",     "demonstrated", "wellbeing"),
    "employee_rating":      ("aggregateRating", "demonstrated", "wellbeing"),
    "workplace_label":      ("hasCredential",   "demonstrated", "wellbeing"),
    "culture_event":        ("subjectOf",       "demonstrated", "community"),
}
```

**Återanvänd ESG-data.** `ESGMetricsSubmission` samlar redan `management_female_pct`,
`board_female_pct` (→ `inclusion`, demonstrated) och `unadjusted_gender_pay_gap_pct`
(→ `transparency`, demonstrated). Dessa ska *deriveras till culture-claims*, inte
samlas in på nytt.

### 5.4 `Verification` — gemensamt verifieringsrecord (NYTT)

**En** modell för stämpeln **"Manually verified by Geogiraph"**, delad av ESG, humanisering
och framtida moduler (se §7). `clients/{client_id}/verifications/{verification_id}`. Knyter
en uppladdad artefakt till en `ClaimSource` och bär den valda säkerhetsnivån.

```jsonc
{
  "evidence_type": "survey_aggregate",   // styr profilen i §7 (cert | policy_document |
                                          //   esg_metric | collective_agreement | external_rating ...)
  "subject": { "domain": "culture", "dimension": "wellbeing", "metric": "eNPS", "value": 8.5 },
  "artifact_ref": "gs://.../survey-q1-2026.pdf",  // ALLTID bifogad — revisionsspår
  "instrument_or_issuer": "Winningtemp",
  "document_date": "2026-04-01",
  "methodology": { "period": "2026-Q1", "sample_n": 420, "response_rate": 0.78 },
  "checks": {                            // §7 — de fyra generiska
    "independence": true, "methodology": true, "freshness": true, "traceability": true
  },
  "assurance_level": "third_party_reviewed",  // OPS VÄLJER, begränsat av checks (§7)
                                              //   self_declared | third_party_reviewed | independently_assured
  "verdict": "attested",                 // attested | manual | rejected
  "verification_text": "Manually verified by Geogiraph — granskat underlag från Winningtemp ...",
  "verified_by": "ops:gustav",
  "verified_at": "2026-05-27T...",
  "expires_at": "2027-05-27T..."         // färskhet → decay-/påminnelse-loop
}
```

Recordet emitterar en `ClaimSource` på den/de claims det stöder. `source_kind`
(item/manual/attested) styr *hur vi citerar*; `assurance_level` styr *hur starkt det
väger* i `compute_trust_gap` och ESG (§8). De är skilda axlar.

### 5.5 `trust_gap` — levande tillstånd (NYTT)

`clients/{client_id}/trust_gap` (ett dok, **överskrivs** av jobbet).

```jsonc
{
  "computed_at": "2026-05-27T...",
  "inputs_hash": "sha1(...)",        // change-detection (som compile_schema)
  "overall_score": 0.41,             // 0..1, evidensbaserad
  "coverage": { "declared": 5, "demonstrated": 3, "of": 6 },
  "dimensions": {
    "transparency": {
      "declared": 1.0, "demonstrated": 0.72,
      // PERCEPTION delas i TVÅ axlar (ej ett tal):
      "perceived": {
        "salience": 0.6,             // hur mycket grundad kunskap motorerna har
        "valence": 0.55,             // hur positiv DÅ den uttalar sig
        "confidence": 0.4,           // härledd ur sampel-/motor-samstämmighet + salience
        "by_engine": {               // per motor förstklassigt, ej bara snitt
          "perplexity": { "salience": 0.8, "valence": 0.6, "n_samples": 3 },
          "gemini":     { "salience": 0.2, "valence": null, "n_samples": 3 },  // ~osynlig
          "chatgpt":    { "salience": 0.7, "valence": 0.5, "n_samples": 3 }
        },
        "attribution": [             // VAD motorn byggde det på (citat/ev. källa)
          { "engine": "perplexity", "quote": "...", "cited_url": "..." }
        ],
        "measurement": {             // mät-proveniens — krävs för ärliga trender
          "prompt_version": "v3", "captured_at": "2026-05-27T...",
          "engine_versions": { "chatgpt": "gpt-...", "gemini": "..." }
        }
      },
      "score": 0.58,                 // evidensbaserad; perception ingår EJ
      "substance_gap": -0.28,        // demonstrated − declared
      "credibility_gap": -0.17,      // valence − evidence (endast om salience ≥ golv)
      "evidence": [
        { "claim_id": "...", "predicate": "memberOf", "warmth_mode": "demonstrated",
          "assurance_level": "independently_assured", "weight": 0.4,
          "label": "Kollektivavtal", "url": "..." }
      ],
      "probe_refs": ["polling_results/..."],
      "dissonance": [ { "source": "glassdoor", "url": "...", "note": "..." } ]
    }
    // ... alla sex dimensioner
  },
  "flags": [ { "kind": "opportunity", "dimension": "wellbeing", "confidence": 0.7 } ]
}
```

Varje tal är spårbart: evidens via `evidence[]`, perception via `attribution[]`/`probe_refs[]`
— ärver anti-hallucinationsprincipen. **Synlighet och valens hålls isär** så att "osynlig"
(låg salience) aldrig förväxlas med "uppfattas dåligt" (låg valens) — det är olika åtgärder.
`confidence` ligger i datan, inte bara i UI:t, så rendering aldrig kan visa ett
lågkonfidens-tal som fakta.

### 5.6 `trust_gap_snapshots/{YYYY-MM-DD}` (NYTT)

Immutabel djupkopia av `trust_gap` + den renderade rapporten vid ett tillfälle.
Skapas vid rapportgenerering (on-demand) och av månadsschemat. Ger trendlinjen.

## 6. Källor & signaler (Norden)

Lönespann i annonser saknas på nordisk marknad; ersätts av starkare,
tredjepartscertifierade aggregat. Demonstrated rankas över declared.

| Signal | Källtyp | Dimension |
|---|---|---|
| Kollektivavtal | `item` (företagssida/partsregister) | transparency |
| Lönekartläggning / likalöne­rapportering (SE/NO/IS-certifiering) | `attested` → `Dataset` | transparency |
| Tredjepartsmärkning (GPTW, Karriärföretag, ISO 45001) | `attested`/`item` → `hasCredential` | wellbeing |
| Föräldralön, friskvård, flexibilitet (ur annons/karriärsida) | `item` → `jobBenefits` | wellbeing |
| Ledningssammansättning (% kvinnor) | ESG-data / `item` | inclusion |
| ESG-/hållbarhetsrapport | `item` → `isBasedOn` | community/ethics |
| Inkluderingsevent, mångfalds-hackathon | `item` → `Event`/`Project` | community |
| Medarbetarenkät-aggregat (eNPS) | `attested` (§7) | wellbeing |
| Glassdoor/Indeed-snitt | extern → `aggregateRating` / dissonans | wellbeing |
| ethicsPolicy, diversityPolicy, slogan, CSR-teman | `item`/`manual` (declared) | ethics/inclusion |

## 7. Den gemensamma verifieringsrutinen ("Manually verified by Geogiraph")

Stämpeln **"Manually verified by Geogiraph"** ska betyda **samma sak** oavsett modul. Därför
*en* rutin (`services/verification.py: run_verification()`) och *ett* record (§5.4) som ESG,
humanisering och connector-data flödar genom. Det domänspecifika ligger i en **profil**,
inte i rutinen. Det är provenans- och metodik-verifiering — **inte** sanningsgaranti.

### 7.1 Assurance-stegen — den enda definitionen

| Nivå | Betyder | Vikt i §8 / ESG | `source_kind` |
|---|---|---|---|
| `self_declared` | Bolagets eget ord, inget oberoende underlag | minimal — rör ej demonstrated | `manual` |
| `third_party_reviewed` | Geogiraph har granskat tredjeparts-underlag mot profilen | demonstrated-vikt (standardstämpel) | `attested` |
| `independently_assured` | Reviderat/ackrediterat utfärdat (publik registry, auditerad rapport) | toppvikt | `item`/`attested` |

### 7.2 De fyra generiska kontrollerna

Samma fyra för allt; bara tröskeln varierar per profil:

1. **Oberoende** — beviset kommer från någon annan än bolaget självt (eller är oberoende
   bestyrkt). Ej egentillverkat ark.
2. **Metodik** — krävda fält finns och möter tröskel. Startvärden (justerbara): `N ≥ 30`,
   svarsfrekvens redovisad (flaggas/nedviktas < 0.50), inget nedbrutet tal under `MIN_CELL_N` (10).
3. **Färskhet** — inom giltighetsfönstret (`expires_at`); decay därefter (`sunset_skills`-mönster).
4. **Spårbarhet** — den hävdade siffran/utsagan pekar på en specifik plats i underlaget.

### 7.3 Profilen — det enda som varierar per bevistyp

`services/verification_profiles.py` (registry). En profil deklarerar: `verification_mode`
(`ops_review` | `public_registry`), `required_fields`, `threshold`, `independence_rule`,
`default_validity_months`, föreslagen `assurance_level`, `verification_template`, GDPR-villkor.
Ny bevistyp = ny profil, **inte** ändrad rutin. `public_registry` (GLEIF, ackrediterade
cert) körs automatiskt utan ops; `ops_review` går via kundkortet (§7.5).

### 7.4 Uppladdning ≠ verifiering — roll-modellen

Varje uppladdad fil får en **roll**. Verifiering är opt-in, aldrig automatisk:

| Roll | Vad som händer | Stämpel? |
|---|---|---|
| **Källa** (default) | Blir vanligt claim med proveniens (`item` om publik URL, annars `manual`) | Nej |
| **Bevis-att-verifiera** | Körs genom rutinen → verdikt + nivå | Ja, om checks tillåter |
| **Internt/kontext** | Lagras som bakgrund, publiceras ej, blir inget claim | Nej |

Artefakten sparas alltid (revisionsspår); bara publicerade roller blir claims; bara den
verifierade rollen bär en assurance-nivå.

### 7.5 MVP-ops-flödet (ingen kundyta)

Kunden är **aldrig** inne i systemet i MVP. Underlag kommer in ur systemet (mejl/fil). Allt
sker som en ops-handling på kundkortet:

```
1. Ladda upp filen (→ artefakt) och välj roll (§7.4)
2. (om "bevis") Fyll metadata profilen kräver
3. Bocka de fyra kontrollerna (§7.2)
4. VÄLJ assurance-nivå — begränsad av checks: utan "oberoende" är
   independently_assured gråad; utan oberoende underlag → bara self_declared
5. Bekräfta stämpeltexten → spara → run_verification() emitterar ClaimSource
```

Två grindar: **roll-valet** (är detta bevis vi vill verifiera?) och **checklistan**
(förtjänar det stämpeln, på vilken nivå?). En stämpel som gäller allt är värdelös —
knapphet och avsiktlighet *är* vallgraven.

**Stämpelns ordalydelse** — kanonisk etikett **"Manually verified by Geogiraph"**, följt av
omfånget (vad vi går i god för — och inte):

> "Manually verified by Geogiraph — granskat underlag från [instrument], daterat [datum];
> bekräftat att den publicerade siffran överensstämmer med underlaget samt möter Geogiraphs
> miniminivå för urval och färskhet."

Vi hävdar inte att enkäten är metodiskt perfekt eller fri från körsbärsplockning — bara
kedjan till underlaget, tröskeln och att siffran matchar. Det ärliga omfånget är poängen.

## 8. Beräkningslogik — `compute_trust_gap`-jobb (NYTT, `jobs/`)

Cloud Run-jobb i `compile_schema`-stil. Idempotent. Läser senaste state, skriver `trust_gap`.

**Läser:** culture-taggade `claims` (approved/`included_in_output`), senaste probe-resultat
(`polling_results`, värmefrågorna), dissonans-poster (Fas 2), dimension-config.

**Per dimension d:**
1. `declared_d` = ≥1 verifierad declared-claim → 1, annars 0.
2. `demonstrated_d = min(1.0, Σ(base_weight(assurance_level) × recency_factor) / target_norm)`.
   `independently_assured` > `third_party_reviewed`; `self_declared` kapad nära 0. Gammalt sunsetar.
3. `perceived_d` = `{salience, valence, confidence, by_engine, attribution, measurement}`
   (§5.5). `confidence` härleds ur sampel-spridning + motor-samstämmighet + salience.
   Behåll per motor — kollapsa ej för tidigt.
4. `score_d = min(w₁·declared_d, TAK≈0.3) + w₂·demonstrated_d`. **Perception ingår ej.**
5. `substance_gap = demonstrated_d − declared_d`.
   `credibility_gap = valence_d − evidence_d` (evidence_d = kapad declared + demonstrated)
   — **beräknas bara om `salience_d ≥ SALIENCE_FLOOR`**. Annars rapporteras dimensionen som
   "ännu inte synlig" och **alla gap-flaggor släcks** (räkna ej valens/gap på tomhet).
6. **Flagg-grind** — en flagga reses bara om magnitud OCH `confidence` över tröskel, med
   **asymmetri efter riktning**:
   - `credibility_gap > 0` (uppfattas bättre än beläggbart = anseenderisk för kunden) →
     högsta ribba + helst korroboration (extern dissonans) innan den ens nämns.
   - `credibility_gap < 0` (gör mer än som syns = möjlighet) → lägre ribba, får visas frikostigt.
7. `overall_score` = (vikt)snitt över dimensioner (endast evidens).

**Probe-designregler (matar steg 3, gäller task #6):**
- **Neutrala/öppna frågor**, aldrig ledande ("Vad är känt om hur X behandlar anställda?"
  — inte "Hur omtänksam är X?").
- **Balanserad negativ-probe** per dimension ("Vilken kritik finns mot X som arbetsgivare?")
  så valensen inte är ett artefakt av frågeställningen.
- **Ankar-/kontrollfråga** per körning (känt stabilt faktum). Driver ankaret → motorn har
  skiftat → normalisera eller flagga körningen som ojämförbar (skyddar trenden).

**Skriver:** överskriver `trust_gap`. `inputs_hash` → hoppar över om oförändrat.

**Kadens:** change-agent efter claim-kompilering och efter varje probe-körning, plus
schemalagt golv (dagligen/veckovis). Jobbet *kör inte* probes — läser senaste resultat.

## 9. Flöde end-to-end

```
Connectors/ESG/ops  →  culture-claims (löpande, samma loop som idag)
Probes (polling_weekly)  →  perceived (egen kadens)
Extern ingestion (Fas 2)  →  dissonans
        │
        ▼  compute_trust_gap (change-agent + golv)
trust_gap  (alltid färskt levande tillstånd)
        │
        ▼  on-demand ELLER månadsschema (monthly_report.py)
trust_gap_snapshots/{date}  +  renderad rapport
```

Tillståndet underhålls löpande; rapporten är ett fruset utdrag som kan tas när som helst;
snapshot-historiken ger trenden. En sanningskälla, flera renderare, ingen drift.

## 10. Rendering

**JSON-LD (`compiler.py`):** Organization-noden får värmepredikaten när claim finns
(`ethicsPolicy`, `diversityPolicy`, `slogan`, `knowsAbout`). Nya noder i `@graph`,
alla förankrade i org via `@id`: `Review`/`AggregateRating` (`itemReviewed`),
`Event`/`Project` (`organizer`). `Dataset` med metodikrad (§7) för attesterade aggregat.
FAQPage plockar upp culture-facts deterministiskt (befintligt) → kulturfrågor automatiskt.
Profilsida + llms.txt ärver samma RenderModel (oförändrad princip).

**GEO-rapportsektion "Humaniseringstäckning" (`monthly_report.py`):**
1. Verifierad täckning — X/6 dimensioner med ≥1 verifierad källa.
2. Declared : Demonstrated — ärlighetsmåttet.
3. Perception-delta — vad AI faktiskt säger minus deklarerat (per motor).
4. Dissonans-flaggor — externa motsägelser.
5. Handlingslista — verkliga åtgärder rankade efter gap-stängning. Aldrig "lägg till markup".
6. Trend — diff mot föregående snapshot.

### 10.1 Begriplighetskrav (grundprincip 7)

Rapporten är renderingens **översättningslager**. Inga interna facktermer eller råa
0–1-tal får nå mottagaren oöversatta. Renderaren omsätter modellens språk till vardags­svenska:

| Modellbegrepp | Visas som (exempel) |
|---|---|
| `declared` | "Det ni säger om er själva" |
| `demonstrated` | "Det ni kan bevisa med underlag" |
| hög `salience`, låg `valence` | "AI känner till er men beskriver er svalt på X" |
| låg `salience` | "AI vet ännu nästan inget om er på X" (ej "dåligt betyg") |
| `credibility_gap > 0` | "AI beskriver er varmare än ert underlag styrker — en risk om någon synar det" |
| `credibility_gap < 0` | "Ni gör mer än vad som syns utåt — en möjlighet att berätta" |
| `assurance_level` | "Vad vi har granskat och går i god för" |
| låg `confidence` | "För osäkert underlag för att dra slutsats — vi flaggar, inte bedömer" |

Krav: varje tal åtföljs av en mening i klartext + vad man kan *göra*; en siffra utan
betydelse visas inte. Råa värden får finnas i en valfri bilaga/appendix för den som vill
gräva — men huvudrapporten ska kunna läsas av vem som helst utan förkunskap. Testet: förstår
en ledamot utan kontext varje rad? Annars är raden fel skriven.

## 11. Fasindelning

**Fas 0 — rider på befintlig pipeline (lågrisk, demobart):**
- `Claim`-tillägg (`facet`, `warmth_mode`, `dimension`) + dimension-config.
- Culture-predikat i `claims.py`; derivera ESG-data → culture-claims.
- Säkra källor: `jobBenefits` ur jobfeed, policy-URL:er ur website, kollektivavtal.
- Gemensam verifieringsrutin (`services/verification.py`) + `Verification`-record +
  assurance-stege + roll-modell + MVP-ops-flöde på kundkortet (§7), stämpel
  "Manually verified by Geogiraph". Delas med ESG.
- `compiler.py`: emittera värmepredikat + Review/Event/Dataset-noder.
- **Bygg `warmth_mode`-axeln från dag ett** — annars krävs claim-migrering senare.

**Fas 1 — moatens kärna:**
- Värme-riktade probes (utöka `polling_weekly`).
- `compute_trust_gap`-jobb + `trust_gap`-dokument.
- "Humaniseringstäckning"-sektion i `monthly_report.py` + snapshots.

**Fas 2 — djupaste vallgraven + CSRD-brygga:**
- Extern ingestion (Glassdoor/press) + dissonans-detektion.
- Direktintegrationer mot survey-verktyg (Winningtemp, &frankly, Populum) → egen
  culture-connector (gör survey-data självverifierande, ersätter manuell ops).

## 12. Öppna frågor / beslut

Beslutat:
- **ESG kontra humanisering: EN gemensam verifieringsrutin** (§7), stämpel "Manually
  verified by Geogiraph". `Verification`-record + assurance-stege delas. ESG-inlämningen
  blir `evidence_type="esg_metric"`.
- **Ingen kundyta i MVP.** Verifiering = ops-handling på kundkortet; intag via mejl/fil.
- **Uppladdning ≠ verifiering.** Roll per uppladdning; verifiering opt-in; nivå ops-vald
  men begränsad av checklistan.

Kvarstår:
- Dimensionsvikter (`w₁`, `w₂`, `TAK`) och `target_norm` per dimension — kalibreras mot
  riktig kunddata.
- Tröskelvärden i §7 (`N`, svarsfrekvens, `MIN_CELL_N`) — slutgiltiga nivåer.
- Probe-frågornas exakta formulering per dimension (påverkar `perceived`-jämförbarhet).
- Hur `perceived` normaliseras över motorer med olika svarsstil.
- `base_weight`-värden per assurance-nivå.
