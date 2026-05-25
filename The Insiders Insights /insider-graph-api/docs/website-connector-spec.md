# Website-connector — v1-spec

Status: utkast för granskning (innan kod). Komplement till `docs/claims-provenance-spec.md`.

## Mål

En `website`-connector som crawlar en kunds domän (flersidigt), läser **text** ur
HTML och PDF, filtrerar fram det relevanta och matar in det i den befintliga
claim-pipelinen som källhänvisad information. Inget nedströms (Firestore-state,
JSON-LD-compiler, profilsida, badge) ändras i sitt kontrakt.

Connectorn delas i två lager:

1. **Format-specifikt** (hämta → text): crawl + content-type-router + readers.
2. **Format-agnostiskt** (text → claims): relevans-lager + befintlig
   `extract_claims_for_client`. Allt här bryr sig bara om `RawItem.content`.

## 1. Datamodell — enda basschema-ändringen

Idag kapas `RawItem.content` till 2000 tecken (`connectors/rss.py:107`), byggt för
korta inlägg. Otillräckligt för sidor/PDF:er.

**Ändring:** chunkning som förstaklassbegrepp. Ett långt dokument → flera `RawItem`,
en per sektion (~2 000–3 000 tecken, liten överlapp så inget tappas vid gränsen).
`extra` bär proveniens-metadata:

```
extra = {
  "name": <sid-/dokumenttitel>,
  "doc_url": <ursprungsdokumentets url>,
  "chunk_index": <n>, "chunk_total": <m>,
  "content_type": "html" | "pdf",
  "needs_ocr": <bool>     # inskannad PDF utan textlager → flaggas, hoppas över i v1
}
```

`url` pekar på dokumentet; `chunk_index` ger proveniens ner till rätt sektion.
Detta är den **enda** ändring som rör basschemat — medvetet beslut.

**Idempotens vid omkörning:** varje `RawItem` får ett stabilt doc-id =
`hash(url + chunk_index)`, så veckovis omkörning skriver över i stället för att
hopa dubbletter.

## 2. Connector-struktur

`connectors/website.py`, registrerad i `connectors/__init__.py` REGISTRY:

```
id = "website"; fetch_method = "scrape"; frequency = "weekly"; tier = "standard"
output_types = ("Organization", "Person")
```

`schema_type="Organization"` på allt sidinnehåll → compilern (`schema_org/compiler.py:179`)
renderar det som en `WebPage`-källnod (konventionen "webbsidor vi läst", rad 32–34).
**Inga compiler-ändringar krävs.** `Person` reserveras för tydliga personsidor (se
öppen punkt nedan).

Internt **content-type-router**: URL → reader. v1 har två readers:

| Format | Reader | Status |
|---|---|---|
| HTML | trafilatura / readability | v1 |
| PDF (textlager) | pypdf / pdfplumber | v1 |
| PPTX | python-pptx | interface förbereds, byggs ej |
| DOCX | python-docx | interface förbereds, byggs ej |
| YouTube | youtube-transcript-api | interface förbereds, byggs ej |

Reader-interfacet görs så att de tre senare är triviala att addera utan nedströms-ändring.

## 3. Crawl-strategi

Per-kund-konfig (samma mönster som `rss_feeds`):

```
settings.website = {
  "start_url": "https://kund.se",
  "urls": [...],          # valfri explicit lista — vinner om satt
  "max_pages": 50,        # hårt tak 200
  "max_depth": 2,
  "max_file_size_mb": 10
}
```

Företrädesordning: **explicit lista** → annars **sitemap.xml** → annars
**bounded crawl** (samma domän, max_depth, max_pages). Länkar till PDF följs och
routas till PDF-readern. Hämtning lager 1 = `httpx`; lager 2 (fallback för
JS-tunga/blockerade sidor) = Bright Data (`services/brightdata.py`), adderas efter v1.

## 4. Relevans-lager (mellan hämtning och extraktion)

1. **Heuristisk förfiltrering** (ingen LLM): släng `/cookies`, `/privacy`, `/login`,
   footer-boilerplate; kräv minsta textlängd; deduplicera nästan-identiskt.
2. **LLM-relevansgrindning**: poängsätt varje kvarvarande sida — "innehåller
   företagsfakta värda att lyfta?" — behåll över tröskel / topp-K tills total
   budget (~300 chunks) nås.

## 5. Extraktion (återanvänder befintligt)

`extract_claims_for_client` (`services/claim_extraction.py`) tar vid oförändrad i
sitt kontrakt, med två justeringar:

- **Modelluppgradering** i `_pick_llm` (rad 177–184): bort från gpt-4o /
  gemini-1.5-pro → frontier (se rekommendation).
- **Batchning av `_generate`** (rad 141–145): dela korpus i batchar om den
  överstiger tröskel. Med stort kontextfönster krävs det sällan för normala
  sajter, men gör pipelinen robust mot extremfall.

Allt annat — "ingen källa → inget claim", validering mot källtext, proveniens via
`ClaimSource.item_id`, idempotent persist — är oförändrat.

## 6. Spikade gränser

| Parameter | Värde |
|---|---|
| Chunk-storlek | 2 000–3 000 tecken, liten överlapp |
| Max chunks/dokument | ~40 |
| Max sidor/crawl | default 50, tak 200 |
| Max filstorlek | 10 MB |
| Total budget/körning | ~300 chunks (efter relevansgrindning) |

## 7. Uttryckligen utanför v1

OCR av inskannade PDF:er (flaggas `needs_ocr`, skjuts upp); PPTX/DOCX/YouTube-readers
(interface förbereds, byggs ej); Bright Data-fallback (lager 2); auth-skyddade sidor.

## 8. Öppna punkter

- **Person-attribution:** kräver att en personsida mappas till rätt `employee_id`.
  v1-förslag: behandla allt sidinnehåll som `Organization`-subjekt, hoppa över
  person-attribution. (Att bekräfta.)
- **Relevanströskel:** startgissning, kalibreras mot riktig data.
