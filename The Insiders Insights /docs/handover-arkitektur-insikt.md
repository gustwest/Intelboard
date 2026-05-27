# Handover: "Arkitektur & Designsystem"-portalen (admin)

> **Syfte med detta dokument:** Beskriva hur BeachVibes interna arkitektur-/insiktsida
> är byggd, så att ett **annat projekt ("The Insiders Insights")** kan återskapa samma
> visualisering och beskrivning av *sina egna* tjänster. Skrivet för en Claude 4.7 CLI-agent
> som arbetar i det projektets repo. Du behöver **inte** ha tillgång till BeachVibes-koden —
> allt du behöver för att återskapa mönstret står här.

---

## 1. Vad det är (konceptet)

En lösenordsskyddad (admin-only) **enkel-sida med flikar** som dokumenterar hela
systemets arkitektur på ett interaktivt, klickbart sätt. Den ersätter en statisk
README med en levande "portal". Sex flikar:

| Flik | Vad den visar | Datakälla |
|------|---------------|-----------|
| **Diagram** | Klickbart systemdiagram (klienter → backend → data + externa tjänster). Klick på nod → detaljpanel (vad/varför/alternativ/tekniska detaljer). | Hårdkodad array i komponenten |
| **Teknikstack** | Tekniker grupperade i lager (Frontend/Backend/Data/Tjänster/Infra). Klick → panel med för-/nackdelar + bortvalda alternativ. | Hårdkodad array |
| **Designsystem** | Färgtokens (swatches), typskala, regel-kort, kodexempel. | Hårdkodad array |
| **Domänmoduler** | Feature-moduler som **graf** (SVG med beroendepilar) ELLER kortvy + service-beroendematris. | Hårdkodad array |
| **ADRs** | Architecture Decision Records (utfällbara: kontext/beslut/konsekvenser/ompröva-när). | Hårdkodad array |
| **Live** | Realtidsstatus (staging/prod/DB ping), schema-browser (parsad live), ordlista. | **API + filsystem** |

Designspråk: mörk bakgrund, en "hero"-header, token-baserad CSS, allt på svenska.

---

## 2. Filstruktur

Allt ligger under en route-mapp + ett par API-routes. I BeachVibes:

```
src/app/(main)/admin/architecture/
├── page.tsx                 # Server Component: admin-guard + parsar DB-schema från fil
├── ArchitectureClient.tsx   # 'use client' — flik-state + Stack/UX/Modules-flikarna inline
├── DiagramTab.tsx           # Diagram-fliken (klickbara noder + detaljpanel)
├── AdrTab.tsx               # ADR-fliken (utfällbara kort)
├── LiveTab.tsx              # Live-fliken (status-fetch, schema-browser, ordlista)
├── ModuleGraph.tsx          # SVG-grafen som ritar modulberoenden
└── architecture.module.css  # ALL styling (~2800 rader, scoped CSS Module)

src/app/api/admin/architecture/
├── status/route.ts          # Pingar staging/prod-URL + DB, returnerar JSON
├── schema/route.ts          # (valfri) serverar parsad schema-data
└── bundle/route.ts          # (valfri) läser .next-build-artefakter (chunk-storlekar)
```

Länkas in från admin-navet som en vanlig länk:
```tsx
{ kind: 'link', href: '/admin/architecture', label: 'Arkitektur', emoji: '🏛️' }
```

> **Översätt till Insiders:** byt `architecture` mot er motsvarande route, och `(main)/admin`
> mot er admin-layout. Om Insiders inte är Next.js App Router, se §8.

---

## 3. Arkitekturen i komponenten (hur det hänger ihop)

### page.tsx (Server Component)
Tre ansvar:
1. **Admin-guard** — hämtar session, kollar `role === 'ADMIN'`, annars `redirect()`.
2. **Schema-parsning** — läser `prisma/schema.prisma` från disk med `fs.readFileSync`,
   regex-parsar ut modeller + fält + domän, skickar in som prop.
3. Renderar `<ArchitectureClient schemaModels={...} />`.

```ts
// Regex som plockar ut "model X { ... }"-block och deras fält:
const modelRegex = /^model\s+(\w+)\s*\{([^}]+)\}/gm
// För varje fält gissas: optional (?), list ([]), relation (versal början), @default
// Domän gissas via nyckelord i modellnamnet (inferDomain), t.ex. "event*" → "Events".
```

> **Översätt till Insiders:** behåll guard + "läs er datamodell från disk och parsa den".
> Om ni använder Drizzle/SQL i stället för Prisma → parsa er schema-fil i stället. Om ingen
> fil finns, hårdkoda modell-listan precis som de andra flikarna.

### ArchitectureClient.tsx (Client Component)
- Håller `tab`-state och `selected`-state (vald tech-kort).
- Definierar `TABS`-arrayen (id, label, ikon från `lucide-react`).
- Renderar hero + tab-bar + villkorligt rätt flik-komponent.
- **Innehåller själv** Stack-, UX- och Modules-flikarna som lokala funktioner
  (`StackTab`, `UXTab`, `ModulesTab`). Diagram/ADR/Live är egna filer.
- All "innehållsdata" (TECH_STACK, MODULES, COLOR_TOKENS, TYPE_SCALE) ligger som
  **konstanta arrayer överst i filen**.

---

## 4. Datamodellerna (kopiera dessa typer rakt av)

Detta är själva "kontraktet" — fyll bara arrayerna med Insiders egna värden.

```ts
/* Teknikstack-kort */
type TechItem = {
  id: string; emoji: string; name: string
  layer: string          // måste matcha ett id i LAYERS
  layerClass: string     // CSS-klass för lagrets färg, t.ex. 'layerFrontend'
  snippet: string        // kort one-liner under namnet
  description: string
  pros: string[]; cons: string[]
  alternatives: { name: string; why: string }[]
}
const LAYERS = [
  { id: 'Frontend', label: 'Frontend', cls: 'layerFrontend' },
  // Backend / Data / Tjänster / Infrastruktur ...
]

/* Diagram-nod */
type DiagramNodeData = {
  id: string; label: string; sub: string
  color: string          // CSS-klass: nodeBlue|nodeYellow|nodeOrange|nodePink|nodeGreen
  detail: {
    description: string  // "Vad det är"
    whyChosen: string    // "Varför vi valde det"
    alternatives: string // "Alternativ vi valde bort"
    techDetails: string  // "Tekniska detaljer"
  }
}
// Tre grupper: CLIENTS[] (toppen), DIAGRAM_NODES[] (mittkolumnen, ritas i fast
// ordning 0..5 med pilar mellan), SIDE_NODES[] (externa tjänster i sidopanel).

/* Domänmodul */
type Module = {
  id: string; emoji: string; name: string
  description: string
  frontend: string; backend: string     // fri text/sökväg
  apiRoutes: string[]                    // ["GET /api/x", ...]
  deps: string[]                         // service-namn för matrisen
  moduleUses: { id: string; via: string }[]  // riktade kopplingar → annan modul
}
// "Används av" (inkommande pilar) räknas ut automatiskt från alla moduluses.
// Kopplingsgrad = uses + usedBy. >=3 = "hub-nod", 0 = "isolerad".

/* ADR */
type Adr = {
  id: string; title: string; date: string
  status: 'Aktiv' | 'Ersatt' | 'Föråldrad'
  context: string; decision: string; consequences: string; revisitWhen: string
}

/* Designsystem */
const COLOR_TOKENS = [{ name, token, value /* hex */, note }]
const TYPE_SCALE   = [{ token, size /* css */, label, desc }]
```

---

## 5. Grafen (ModuleGraph.tsx) — den klurigaste biten

Ren SVG, ingen graf-lib. Så här fungerar den:

- **Fasta positioner:** `POSITIONS: Record<id, [x, y]>` — du placerar varje modul manuellt
  i ett `viewBox="0 0 680 450"`-koordinatsystem. Justera koordinaterna för ditt antal moduler.
- **Kanter:** `getEdgePath(from, to)` returnerar en SVG bezier-path. Horisontella kopplingar
  (liten y-skillnad) får en uppåtbåge; vertikala går botten-center → topp-center. Pilspets via
  `<marker>`. Ritas före noderna så noder ligger ovanpå.
- **Noder:** `<rect>` + emoji-`<text>` + namn-`<text>` + en badge-cirkel med kopplingsgraden.
- **Interaktion:** klick på `<g>` sätter `selectedId`; valda nodens kanter highlightas;
  detaljpanel under grafen visar "Använder"/"Används av".

> Detta är generiskt — byt bara `POSITIONS` och mata in dina moduler. Allt annat följer med.

---

## 6. Live-fliken + status-API

- **LiveTab** anropar `GET /api/admin/architecture/status` (`cache: 'no-store'`) vid mount och
  via "Uppdatera"-knapp. Visar tre statuskort (staging/prod/DB) med svarstid + grön/röd prick.
- **status/route.ts** gör `fetch('<url>/login', timeout 5s)` mot staging+prod parallellt och
  `SELECT 1` + räknar tabeller i DB:n via `information_schema.tables`. Wrappas i projektets
  auth-wrapper (`withAuth`).
- **Schema-browser:** tar `schemaModels`-propen (parsad i page.tsx), sök + domän-filter,
  utfällbara fält med färgkodade typer.
- **Ordlista (GLOSSARY):** hårdkodad `[{ term, def }]`, sökbar.

> **Översätt till Insiders:** byt URL-konstanterna och DB-pingen mot era miljöer. Behåll
> mönstret "parallella health checks → ett JSON-svar → färgkodade kort".

---

## 7. Styling

- **En enda CSS Module** (`architecture.module.css`), scoped, inga globala klasser.
- **Inga hårdkodade hex utanför `COLOR_TOKENS`-datan** — färger kommer från CSS custom
  properties (`var(--brand-primary)`, `var(--bg-secondary)`, `var(--text-primary)` osv.)
  som definieras globalt i projektets `globals.css`.
- Lager-/nod-färgklasserna (`layerFrontend`, `nodeBlue` ...) mappar till var sin token.

> **Översätt till Insiders:** använd ERAT eget designsystems tokens. Hårdkoda inte färger;
> peka klasserna mot era `--*`-variabler. Layouten (hero, tab-bar, grid, sticky detaljpanel)
> kan kopieras nästan rakt av.

---

## 8. Beroenden & antaganden att känna till

- **Ramverk:** Next.js 16 App Router (Server + Client Components). En Server Component-sida
  som gör guard + fs-läsning, resten är `'use client'`.
- **Ikoner:** `lucide-react` (`Layers`, `GitBranch`, `Package`, `BookOpen`, `Radio`, m.fl.).
- **Auth-wrapper:** API-routen använder en intern `withAuth()`. Använd er egen motsvarighet.
- **`fs`-läsning i runtime:** page.tsx läser `schema.prisma` från `process.cwd()`. Wrappad i
  try/catch eftersom filen inte alltid finns i container-imagen. Om er deploy strippar
  käll-filer → hårdkoda modell-listan i stället.
- Om Insiders **inte** är Next.js: behåll all data + komponentlogik (det är vanlig React),
  byt bara ut server-sidans guard/fs-läsning mot er routing och datakälla.

### ⚠️ Fallgropar (lärdomar)
1. **`data.ts` i BeachVibes är död kod** — en tidigare delad datafil som inte importeras
   längre (datan inlinades i `ArchitectureClient.tsx`). Återskapa **inte** den dubbleringen;
   välj *en* plats för datan från start (egen `data.ts` som faktiskt importeras är renast).
2. **Diagram-noderna ritas i fast index-ordning** (`DIAGRAM_NODES[0..5]`) med pilar mellan.
   Ändrar du antalet noder måste du justera JSX-layouten i `DiagramTab`, inte bara arrayen.
3. **Grafens `POSITIONS` är manuella** — inga autolayout. Planera koordinater för ditt antal moduler.
4. **Admin-guard får inte glömmas** — sidan exponerar intern arkitektur. Kontrollera roll
   server-side och `redirect()` annars.

---

## 9. Rekommenderad bygg-ordning för Insiders

1. Skapa route + admin-guard (tom sida som bara renderar hero + tab-bar).
2. Lägg in `COLOR_TOKENS`/`TYPE_SCALE` → **Designsystem-fliken** (snabbast, ger känsla direkt).
3. Fyll `TECH_STACK` + `LAYERS` → **Teknikstack-fliken**.
4. Fyll `MODULES` → **Domänmoduler** (kortvy först, sen grafen med `POSITIONS`).
5. Fyll `DIAGRAM_NODES`/`CLIENTS`/`SIDE_NODES` → **Diagram-fliken**.
6. Fyll `ADRS` → **ADR-fliken**.
7. **Live-fliken** sist — kräver status-API + ev. schema-parsning mot er datakälla.

Varje flik är fristående; en halvfärdig portal med 3 ifyllda flikar är fullt användbar.

---

## 10. Källfiler att be om vid behov

Om Insiders-agenten vill ha exakt CSS eller en komponent rakt av, be användaren kopiera
någon av dessa från BeachVibes-repot (sökvägar i §2):
`ArchitectureClient.tsx`, `DiagramTab.tsx`, `ModuleGraph.tsx`, `LiveTab.tsx`, `AdrTab.tsx`,
`architecture.module.css`, `api/admin/architecture/status/route.ts`.
De är vanlig React + CSS och kan lyftas med minimal anpassning (byt data, tokens och URL:er).
