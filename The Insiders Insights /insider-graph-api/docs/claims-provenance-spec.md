# Claims & proveniens — spec (lager 1)

Status: utkast för diskussion. Beskriver **informationslagret** — datamodellen som
producerar den JSON-LD som ligger på kundens (eller geogiraphs) profilsida.
Profilsida och badge (lager 2 & 3) specas separat.

## 1. Mål

Producera en JSON-LD-graf om ett bolag som AI-motorer (LLM:er) kan läsa och *lita på*,
där varje uppgift är spårbar till en källa. Verifierbarheten är produkten — det är den
som motiverar märket "AI-Profil verifierad av Geogiraph".

## 2. Grundprinciper

1. **Allt på profilsidan är ett `claim`.** Inga uppgifter renderas utanför claims-modellen.
2. **Ingen källa → inget claim.** Regeln upprätthålls *vid skapandet* av ett claim, inte
   vid renderingen. Ett claim utan minst en käll-referens skrivs aldrig.
3. **Källa och påstående är skilda begrepp.** En källa kan ge flera claims; ett claim kan
   vila på flera källor. Därför eget lager, inte fält på `raw_items`.
4. **Konsistens human ↔ maskin.** Det synliga (fotnoter, prosa) och JSON-LD bygger på
   *samma* claims — de kan aldrig säga olika saker.

## 3. Var det haknar in i nuvarande pipeline

Redan på plats (`insider-graph-api`):

| Lager | Status | Fil |
|---|---|---|
| Connectors → `raw_items` (källor med `url` + stabilt id) | finns | `connectors/*` |
| Review-grind (`needs_review`, `included_in_output`) | finns | `routers/review.py` |
| Kompilator `raw_items → JSON-LD` | finns, men entitet+innehållslista | `schema_org/compiler.py` |

Gapet: dagens output är *"entitet + länkad innehållslista"* (`subjectOf`), inte
*"påståenden med proveniens"*. `Organization.description` kommer från osourcad fritext
(`about`) och bryter regeln i §2.2. Det finns inget `claim`-begrepp.

Nytt lager som införs:

```
raw_items / raw_items_company      KÄLLOR  (finns — id + url + published_at + extra{})
        │
        ▼  extraktion (LLM, strukturerad output)
claims                             PÅSTÅENDEN  (NYTT — varje claim → ≥1 källa)
        │
        ▼  kompilator (utökas)
JSON-LD: Organization + källnoder (CreativeWork) + Claim-noder (isBasedOn → källa)
```

Insikt: connector-fyllda fält (`founded`, `headquarters`, `industry` från Bolagsverket/
LinkedIn) är **sourcade by construction** — de blir property-claims utan extra arbete.
Bara den fria prosan behövde en källa den inte hade.

## 4. Datamodell — `claims`

Firestore-layout (tillägg):

```
clients/{client_id}
    employees/{employee_id}
        raw_items/{item_id}          (oförändrat — källor)
    raw_items_company/{item_id}      (oförändrat — källor)
    claims/{claim_id}                (NYTT)
    polling_results/{week_id}
```

Claim-dokument:

| Fält | Typ | Beskrivning |
|---|---|---|
| `claim_kind` | `"property" \| "narrative"` | Strukturerad property vs prosamening |
| `subject_ref` | str | *Logisk* subjekt-referens: `"org"` eller ett `employee_id`. Kompilatorn löser den till `@id` (robust mot byte av `profile_base_url`). |
| `predicate` | str \| null | Endast `property`: schema.org-egenskap, t.ex. `foundingDate` |
| `value` | any \| null | Endast `property`: värdet, t.ex. `"2014"` |
| `statement` | str \| null | Endast `narrative`: själva meningen |
| `source` | `ClaimSource[]` | ≥1 källa. Tomt → claimet skrivs aldrig (§2.2) |
| `confidence` | float | 0–1, från extraktion/validering |
| `included_in_output` | bool | Återanvänder review-grinden |
| `needs_review` | bool | Lågt confidence → ops-review |
| `review_status` | `"approved" \| "rejected" \| null` | |
| `created_at` / `reviewed_at` | ts | |

`ClaimSource`:

| Fält | Typ | Beskrivning |
|---|---|---|
| `kind` | `"item" \| "manual"` | `item` = härlett ur raw_item; `manual` = uppgift från bolaget |
| `item_id` | str \| null | För `item`: peka på raw_item-dokumentet (→ url, datum) |
| `label` | str \| null | För `manual`: t.ex. "uppgift från bolaget" |

### Manuella claims

Tillåtna. Ops kan lägga ett claim med `source = [{kind: "manual", label: ...}]`.
Renderas **annorlunda** än länkbara källor (ingen klickbar referens, märks t.ex.
"uppgift från bolaget"), så att Verified-historien förblir ärlig. Ett manuellt claim
uppfyller §2.2 (det *har* en källa), men är inte externt verifierbart.

## 5. Extraktionspipeline

Tre steg — steg 3 är det som skiljer "verifierad" från "påstår sig vara verifierad":

1. **Chunka källorna.** `raw_items` (+`extra{}`) blir numrerade chunks med stabila id:n.
2. **Generera strukturerat.** LLM får chunks och returnerar
   `{claim_kind, predicate?, value?, statement?, source_item_ids[], confidence}`.
   Lågt temperatur, instruktion: påstå inget som inte står i en chunk. Inget käll-id
   returnerat → inget claim skapas.
3. **Validera.** Kontrollsteg (regel + ev. andra-LLM-pass) som verifierar att den citerade
   chunken *faktiskt stödjer* claimet. Faller → `needs_review` eller kasseras.
   Lågt confidence → review-grinden (§3).

**Implementation:** `services/claim_extraction.py` (narrativ extraktion: chunka → generera
→ validera, andra-LLM-pass på varje claim) + job-wrapper `jobs/extract_claims.py`.
Claim utan giltig chunk eller som faller på valideringen skrivs aldrig med
`included_in_output=True`. `confidence < 0.7` → `needs_review`. Idempotent (deterministiskt
claim-id). Property-claims härleds separat och deterministiskt (`schema_org/claims.py`).

Property-claims mappas från connector-`extra{}` deterministiskt (ingen LLM behövs):

| Källfält (`extra`) | predicate | källa |
|---|---|---|
| `founded` | `foundingDate` | bolagsverket / linkedin |
| `headquarters` / `address` | `address` | bolagsverket / linkedin |
| `industries` | `knowsAbout` / `naics` | linkedin |
| `org_number` | `identifier` | bolagsverket |
| `legal_form` | (Organization-subtyp) | bolagsverket |

## 6. Kompilator — ändringar (`schema_org/compiler.py`)

Idag: läser kurerade fält + mergar connector-data + listar `subjectOf`.
Nytt: **`Organization` projiceras helt ur claims.**

- Sluta läsa `data.get("founding_date")` etc. direkt → bygg properties ur `property`-claims.
- Emittera **källnoder**: en `CreativeWork` per refererat raw_item, med `@id`, `url`,
  `datePublished`.
- Emittera **`Claim`-noder för *varje* claim** (property och narrative), med `isBasedOn`
  → käll-`@id`. Property-claims hoistas *dessutom* som native egenskaper på subjektsnoden
  (konsumtion); Claim-noden bär proveniensen. (schema.org `Claim` stödjer
  `appearance`/`firstAppearance`/`isBasedOn`.) Manuella claims får ingen `isBasedOn` —
  proveniensen visas som etikett på profilsidan (§9).
- **Implementationsstatus:** företagsnivå (`subject_ref="org"`) är fullt claims-driven.
  `Person`-noder byggs i detta skede från medarbetardokumentets identitetsfält (namn,
  titel) och kan ta emot claims; full claims-projektion av medarbetare är ett senare steg.
- `Organization.description` = sammanfattning komponerad **enbart** av godkända
  narrative-claims på org-nivå (inte längre handskriven `about`). Bygger på att varje
  narrative-claim är självbärande (§5) → sammanfogas till löptext.
- Sociala mätvärden (följare, likes) inkluderas fortsatt **aldrig** (oförändrad regel).
- **`@id`-basen är konfigurerbar per kund** via `profile_base_url`, default
  `https://profiles.geogiraph.com/<kund>` (konstant `DEFAULT_BASE`). Se §7.

Skiss på output:

```jsonc
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": ".../#org",
      "name": "...", "foundingDate": "2014", "address": {…},
      "description": "<ur narrative-claims>" },
    { "@type": "CreativeWork", "@id": ".../#src-12",
      "url": "https://...", "datePublished": "2024-03-01" },
    { "@type": "Claim", "@id": ".../#claim-7",
      "text": "Bolaget fokuserar på inbyggda system inom fordonsindustrin",
      "about": { "@id": ".../#org" },
      "isBasedOn": { "@id": ".../#src-12" } }
  ]
}
```

## 7. Leverans, hosting & identitet

Bestämmande princip: **separera stabilt från färskt.** Det som ligger på kundens egen
sajt klistras in *en gång* och rörs aldrig igen; allt som uppdateras (claims, prosa,
källor) bor på den hostade profilsidan som vi uppdaterar åt kunden. Kunden får
"klistra in en gång" samtidigt som datan alltid är färsk.

### Leverans

- **Datan levereras aldrig via ren JS-injektion.** Många AI-crawlers kör inte JS och
  skulle då missa hela poängen. JSON-LD ska vara statisk eller server-side.
- **På kundens hemsida:** en liten, *stabil* `<script type="application/ld+json">`-snutt
  (identitet — `Organization` med `url`/`sameAs` → profilsidan som kanonisk) + badgen.
  Snutten ändras aldrig, så ingen omklistring vid uppdateringar.
- **Profilsidan** (hostad) bär den fullständiga, färska grafen + prosa + fotnoter.
- Badgen får vara ett JS-snippet (riktar sig till människor, inte crawlers).

### Hosting per tier

| Tier | Profilsida | Hur |
|---|---|---|
| **Default** | `profiles.geogiraph.com/<kund>` | Vi serverar statiskt. Kundsajten får identitets-snutt + badge. |
| **Premium** | `profil.kund.se` | **CNAME-subdomän** → vår tjänst. Kundens IT lägger en DNS-post en gång; vi serverar och auto-uppdaterar på kundens domän. |

### Identitet (`@id`)

`profile_base_url` blir ett fält per kund på klientdokumentet. Kompilatorn bygger alla
`@id`, `isBasedOn` och källnoder relativt det. Regel: **ankra entiteten till den
starkaste domän som finns i kundens tier.**

- *Default:* `@id` på geogiraph-domänen, med kraftfull `sameAs`/`url` → kundens riktiga sajt.
- *Premium:* `@id` på **kundens** domän (starkast auktoritet för AI-motorerna — och det
  mätbara mervärdet i premium).

**Implementation:** identitets-snutten (`schema_org/delivery.py`, statisk JSON-LD med
samma `@id` som profilens org + `sameAs` → profilsidan) + endpoint
`GET /api/delivery/{client_id}`. Ops samlar leverans-artefakterna (profil-länk,
identitets-snutt, badge) i frontend-fliken **Leverans** (`insider-graph/leverans`).

## 8. Konsekvens för ops-rollen

Från **"skriv beskrivningen"** → **"godkänn, redigera och prioritera de claims systemet
extraherat"**. Handskriven fritext utan källa är inte längre möjlig (utom som explicit
markerat manuellt claim, §4).

## 9. Profilsida — rendering (lager 2)

Profilsidan renderar nivå-2-proveniens (fotnoter) ovanpå lager-1-datan. Anatomi:

1. **Faktapanel** överst — `property`-claims (grundat år, ort, bransch, antal anställda…).
2. **Prosadel** — `narrative`-claims som löptext med **superscript-fotnoter**.
3. **Källförteckning** längst ner — aggregerad ur alla refererade källor, med datum.
4. **Trust-rad** — "Sammanställd från N källor · senast uppdaterad <månad år>".

**Fotnoternas beteende:** både *och*.
- En **ankrad lista** (superscript → scrollar till källan i förteckningen) — crawl-vänlig,
  källan finns som riktig länk i HTML.
- En **hover-popover** ovanpå (källa + datum) — smidigare UX.

**Manuella claims:** renderas som en **neutral liten etikett** i stället för en klickbar
siffra (ser normalt ut, inte som en varning). Texten är `ClaimSource.label`, default
**"uppgift från bolaget"**, omskrivningsbar (t.ex. "enligt branschrapport X") när
uppgiften har ett annat icke-länkbart ursprung.

**Implementation:** `schema_org/profile_page.py` renderar statisk HTML ur samma
render-modell som JSON-LD (`build_render_model` i `compiler.py`) — de kan aldrig
divergera. `compile-schema`-jobbet laddar upp `index.html` bredvid `schema.json` och
sätter `profile_url` på klientdokumentet. Faktapanel + prosa bär fotnoter (ankrad lista
+ `title`-popover); källförteckning numrerad med url + datum; trust-rad med källantal +
färskhet.

## 10. Badge (lager 3)

Diskret komponent på kundsajten som länkar till profilsidan. Riktar sig till människor.

- **Form:** **footer-länk som default** (minst påträngande), **flytande pill som tillval**.
- **Innehåll:** ikon + "AI-Profil verifierad av Geogiraph" + [Visa profil]. Hover/tooltip:
  "Sammanställd från N källor · senast uppdaterad <månad år>".
- **Tema:** ljust/mörkt val + ev. kundens accentfärg, för att smälta in.
- **Leverans:** två varianter.
  - **Statisk HTML-snutt** (ren `<a>` + inline-SVG, noll JS) — default, robust, CSP-säker.
  - **JS-snippet** — uppgradering för *live* färskhet (hämtar senast-uppdaterad från oss).
- **Trust-integritet:** badgen är **alltid på** (ingen logik på kundsajten). Sanningen om
  status/färskhet lever på **profilsidan**. För det sällsynta dåliga läget (tömd/uråldrig
  profil) finns en **central server-side degrade-switch** hos oss — märket skyddas utan att
  kunden rör något.

**Implementation:** `schema_org/badge.py` (`render_badge` statisk / `render_badge_js`) +
endpoint `GET /api/badge/{client_id}` (`routers/badge.py`) med `theme`, `variant`,
`accent`, `delivery`. Live-färskhet i JS-varianten kräver ett publicerat meta-endpoint
och degrade-switchen — ännu inte byggt.

## 11. Utanför denna spec

- Onboarding-UI för claims-review.
- Schemaläggning av `extract-claims`-jobbet (cron/Eventarc) som övriga jobs.
- Central degrade-switch + meta-endpoint för badgens live-färskhet (§10).
- Premium-tier: faktisk CNAME-uppsättning + servering på kundens domän (§7).
```
