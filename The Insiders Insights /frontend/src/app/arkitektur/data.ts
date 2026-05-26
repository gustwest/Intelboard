/**
 * Arkitektur & Designsystem — ENDA datakällan för portalen.
 *
 * Lärdom från BeachVibes-handovern (§8, fallgrop #1): en tidigare delad
 * `data.ts` blev död kod när innehållet inlinades i klientkomponenten. Vi gör
 * tvärtom från start — ALL innehållsdata bor här och importeras av flikarna.
 * Lägg inte dubbletter i ArchitectureClient.tsx.
 *
 * Färger: hex förekommer ENDAST i COLOR_TOKENS nedan (det är själva swatch-datan).
 * Allt annat färgsätts via CSS-klasser som pekar på --brand-*-tokens.
 */

/* ------------------------------------------------------------------ */
/* Typer                                                               */
/* ------------------------------------------------------------------ */

export type TechItem = {
  id: string;
  emoji: string;
  name: string;
  layer: string; // måste matcha ett id i LAYERS
  layerClass: string; // CSS-klass för lagrets färg
  snippet: string;
  description: string;
  pros: string[];
  cons: string[];
  alternatives: { name: string; why: string }[];
};

export type Layer = { id: string; label: string; cls: string };

export type DiagramNodeData = {
  id: string;
  label: string;
  sub: string;
  color: string; // CSS-klass: nodeBlue | nodeCyan | nodeGreen | nodePurple | nodeOrange | nodeDanger
  detail: {
    description: string; // Vad det är
    whyChosen: string; // Varför vi valde det
    alternatives: string; // Alternativ vi valde bort
    techDetails: string; // Tekniska detaljer
  };
};

export type ModuleNode = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  frontend: string;
  backend: string;
  apiRoutes: string[];
  deps: string[]; // tjänster för beroendematrisen
  moduleUses: { id: string; via: string }[]; // riktade kopplingar → annan modul
};

export type Adr = {
  id: string;
  title: string;
  date: string;
  status: 'Aktiv' | 'Ersatt' | 'Föråldrad';
  context: string;
  decision: string;
  consequences: string;
  revisitWhen: string;
};

export type ColorToken = { name: string; token: string; value: string; note: string };
export type TypeScaleItem = { token: string; size: string; label: string; desc: string };
export type GlossaryItem = { term: string; def: string };

export type SchemaField = {
  name: string;
  type: string;
  optional: boolean;
  isList: boolean;
  isRelation: boolean;
  hasDefault: boolean;
};
export type SchemaModel = {
  name: string;
  table: string;
  domain: string;
  fields: SchemaField[];
};

/* ------------------------------------------------------------------ */
/* Teknikstack                                                         */
/* ------------------------------------------------------------------ */

export const LAYERS: Layer[] = [
  { id: 'Frontend', label: 'Frontend', cls: 'layerFrontend' },
  { id: 'Backend', label: 'Backend', cls: 'layerBackend' },
  { id: 'Data', label: 'Data', cls: 'layerData' },
  { id: 'Tjänster', label: 'Tjänster', cls: 'layerServices' },
  { id: 'Infrastruktur', label: 'Infrastruktur', cls: 'layerInfra' },
];

export const TECH_STACK: TechItem[] = [
  {
    id: 'nextjs',
    emoji: '▲',
    name: 'Next.js 16 (App Router)',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    snippet: 'Server- + Client Components',
    description:
      'Hela admin-konsolen (insiders-frontend) är en Next.js 16-app med App Router. Server Components gör auth-guard och fs-läsning; resten är "use client".',
    pros: [
      'Server Components håller hemligheter och guards på servern',
      'Filbaserad routing matchar vår sidstruktur (/kunder, /moduler, /rapporter …)',
      'Samma ramverk för både The Insiders och Insider Graph-vyerna',
    ],
    cons: [
      'App Router har brutit mot äldre API:er — kräver att man läser docs',
      'RSC/Client-gränsen är lätt att råka bryta',
    ],
    alternatives: [
      { name: 'Vite + React SPA', why: 'Tappar SSR-guard och filbaserad routing' },
      { name: 'Remix', why: 'Mindre ekosystem för vårt GCP-bygge' },
    ],
  },
  {
    id: 'react',
    emoji: '⚛️',
    name: 'React 19',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    snippet: 'UI-bibliotek',
    description: 'React 19 driver alla vyer, med hooks för flik-state och datahämtning.',
    pros: ['Stort ekosystem', 'Server Components-stöd'],
    cons: ['Snabb versionstakt'],
    alternatives: [{ name: 'Vue / Svelte', why: 'Mindre överlapp med övriga AntiGravity-projekt' }],
  },
  {
    id: 'tailwind',
    emoji: '🎨',
    name: 'Tailwind CSS v4 + tokens',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    snippet: 'Utility-CSS + --brand-*-tokens',
    description:
      'Tailwind v4 via @tailwindcss/postcss. Färger styrs av --brand-*-CSS-variabler i globals.css (cyan-temat), inte hårdkodade hex.',
    pros: ['Tokens = ett ställe att byta tema', 'Inga globala klasskollisioner'],
    cons: ['Lång klasslista i markup'],
    alternatives: [{ name: 'CSS Modules överallt', why: 'Mer boilerplate för enkel layout' }],
  },
  {
    id: 'nextauth',
    emoji: '🔑',
    name: 'NextAuth v5 (Google OAuth)',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    snippet: 'JWT-session + e-postwhitelist',
    description:
      'Inloggning via Google OAuth. middleware.ts skyddar alla rutter utom /login; team.ts är whitelist med roller (SUPERADMIN/ADMIN).',
    pros: ['Edge-kompatibel middleware-guard', 'Ingen egen lösenordshantering'],
    cons: ['v5 är fortfarande beta', 'Whitelist underhålls manuellt i team.ts'],
    alternatives: [
      { name: 'Egen JWT-auth', why: 'Mer kod, mer att göra fel på' },
      { name: 'Firebase Auth', why: 'Binder hårdare mot en extern leverantör' },
    ],
  },
  {
    id: 'recharts',
    emoji: '📈',
    name: 'Recharts + html2canvas',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    snippet: 'Diagram + PNG-export',
    description: 'Recharts ritar dashboard-diagram; html2canvas exporterar rapportvyer som bild för LinkedIn-rapporter.',
    pros: ['Deklarativa React-diagram', 'Export utan server-rendering'],
    cons: ['html2canvas matchar inte alltid komplex CSS pixel-perfekt'],
    alternatives: [{ name: 'Chart.js', why: 'Imperativt API passar React sämre' }],
  },
  {
    id: 'fastapi',
    emoji: '⚡',
    name: 'FastAPI + Uvicorn',
    layer: 'Backend',
    layerClass: 'layerBackend',
    snippet: 'insiders-api',
    description:
      'Backend (insiders-api) är en tunn FastAPI-app i main.py som registrerar routers/ (customers, sources, datasets, modules, reports, agent, chat, ai_chat …).',
    pros: ['Typade Pydantic-scheman (schemas.py)', 'Async + snabb', 'Auto-OpenAPI'],
    cons: ['Manuell DB-migrering (auto-migrate i db.py)'],
    alternatives: [
      { name: 'Django REST', why: 'Tyngre än vad ett KPI-API behöver' },
      { name: 'Node/Express', why: 'Pandas/NumPy-ekosystemet bor i Python' },
    ],
  },
  {
    id: 'sqlalchemy',
    emoji: '🗃️',
    name: 'SQLAlchemy 2.0 (ORM)',
    layer: 'Backend',
    layerClass: 'layerBackend',
    snippet: 'models.py — datamodellen',
    description:
      'Datamodellen definieras som SQLAlchemy-klasser i backend/models.py. Moduler binder mot stabila SourceField.id, inte kolumnnamn (se ADR).',
    pros: ['Samma modeller mot Postgres och SQLite', 'Relationer + cascade i kod'],
    cons: ['create_all lägger inte till kolumner — vi har egen auto-migrate'],
    alternatives: [
      { name: 'Prisma', why: 'JS-orienterat; vår backend är Python' },
      { name: 'Rå SQL', why: 'Tappar relationer och typer' },
    ],
  },
  {
    id: 'pandas',
    emoji: '🐼',
    name: 'Pandas + NumPy',
    layer: 'Backend',
    layerClass: 'layerBackend',
    snippet: 'Ingest + formel-engine',
    description:
      'Pandas/NumPy normaliserar uppladdade rapportfiler och driver formel-engine (formula.py) som räknar KPI-uttryck. openpyxl/xlrd läser Excel.',
    pros: ['Robust CSV/Excel-parsning', 'Vektoriserade beräkningar'],
    cons: ['Minnesglupskt för mycket stora filer'],
    alternatives: [{ name: 'Polars', why: 'Mindre moget ekosystem för Excel-läsning' }],
  },
  {
    id: 'postgres',
    emoji: '🐘',
    name: 'Cloud SQL PostgreSQL',
    layer: 'Data',
    layerClass: 'layerData',
    snippet: 'Produktionsdatabas',
    description:
      'Produktion kör PostgreSQL på Cloud SQL (psycopg2). DATABASE_URL sätts i Cloud Run; saknas den faller db.py tillbaka på lokal SQLite.',
    pros: ['Relationell integritet för kund/källa/dataset', 'Hanterad backup'],
    cons: ['Kräver Cloud SQL-instans + connector'],
    alternatives: [{ name: 'Endast SQLite', why: 'Skalar inte till delad produktion' }],
  },
  {
    id: 'sqlite',
    emoji: '💾',
    name: 'SQLite (lokal dev)',
    layer: 'Data',
    layerClass: 'layerData',
    snippet: 'data/insiders.db',
    description: 'Lokal utveckling använder SQLite-fil utan extern tjänst. Samma SQLAlchemy-modeller, egen auto-migrate.',
    pros: ['Noll uppsättning lokalt', 'Identisk modellkod'],
    cons: ['SQLite saknar ADD COLUMN IF NOT EXISTS — egen migrationssvepning'],
    alternatives: [{ name: 'Docker-Postgres lokalt', why: 'Mer friktion för snabb iteration' }],
  },
  {
    id: 'firestore',
    emoji: '🔥',
    name: 'Firestore (Insider Graph)',
    layer: 'Data',
    layerClass: 'layerData',
    snippet: 'GEO/AI-synlighet',
    description:
      'Systertjänsten insider-graph-api lagrar AI-synlighets-/GEO-data i Firestore — separat datalager från KPI-plattformens Postgres.',
    pros: ['Schemalöst passar polling-/connector-data', 'Skalar horisontellt'],
    cons: ['Eget frågespråk, ingen join med Postgres'],
    alternatives: [{ name: 'Samma Postgres', why: 'Tvingar ihop två olika produktmodeller' }],
  },
  {
    id: 'gemini',
    emoji: '✨',
    name: 'Vertex AI — Gemini 3 Flash',
    layer: 'Tjänster',
    layerClass: 'layerServices',
    snippet: 'Dataset-sammanfattningar',
    description:
      'ai.py anropar Gemini 3 Flash via Vertex AI (Cloud Runs default service account) för att skriva korta svenska sammanfattningar av nyuppladdade dataset.',
    pros: ['Ingen API-nyckel att rotera på Cloud Run', 'Snabb + billig för korta texter'],
    cons: ['gemini-3-flash-preview kräver global endpoint (se EU-ADR)'],
    alternatives: [{ name: 'OpenAI', why: 'Vi vill hålla data inom GCP/EU' }],
  },
  {
    id: 'claude',
    emoji: '🤖',
    name: 'Claude-agent (Anthropic)',
    layer: 'Tjänster',
    layerClass: 'layerServices',
    snippet: 'agent_tasks-kö',
    description:
      'En extern Claude-agent (claude-sonnet-4-6) pollar agent_tasks-kön via /api/admin/agent och utför utvecklings-/analysuppgifter i admin-arbetsytan.',
    pros: ['Avlastar manuellt arbete', 'Pollande kö frikopplar agenten'],
    cons: ['Extern beroende; körs utanför Cloud Run'],
    alternatives: [{ name: 'Inbäddad agent', why: 'Cloud Run-tjänsten ska vara tunn' }],
  },
  {
    id: 'gcs',
    emoji: '📦',
    name: 'Google Cloud Storage',
    layer: 'Tjänster',
    layerClass: 'layerServices',
    snippet: 'Fil-/bilduppladdning',
    description: 'GCS lagrar admin-uppladdade filer (AdminFile) och bilagor utanför databasen.',
    pros: ['Billig blob-lagring', 'Signerade URL:er'],
    cons: ['Ännu en resurs att rättighetsstyra'],
    alternatives: [{ name: 'Spara i DB', why: 'Blåser upp databasen med binärdata' }],
  },
  {
    id: 'cloudrun',
    emoji: '☁️',
    name: 'Google Cloud Run',
    layer: 'Infrastruktur',
    layerClass: 'layerInfra',
    snippet: 'europe-north1',
    description:
      'Frontend, insiders-api och insider-graph-api körs som separata Cloud Run-tjänster i europe-north1 (projekt round-plating-480321-j7), alla allow-unauthenticated bakom egen auth.',
    pros: ['Skalar till noll', 'En tjänst per ansvar'],
    cons: ['Kallstarter', 'Containrar strippar källfiler (se Live-schemafallback)'],
    alternatives: [{ name: 'GKE', why: 'Överkill för vår trafik' }],
  },
  {
    id: 'cloudbuild',
    emoji: '🏗️',
    name: 'Cloud Build + Kaniko',
    layer: 'Infrastruktur',
    layerClass: 'layerInfra',
    snippet: 'Auto-deploy på push till main',
    description:
      'Per-tjänst Cloud Build-triggers (i europe-west1) bygger med Kaniko-cache och deployar till Cloud Run vid push till main. Staging = där vi verifierar.',
    pros: ['Push → live utan manuella steg', 'Kaniko-lagercache snabbar bygget'],
    cons: ['Samtidiga byggen kan racea — vänta in kön innan ny push'],
    alternatives: [{ name: 'GitHub Actions', why: 'Cloud Build sitter närmare GCP-rättigheter' }],
  },
];

/* ------------------------------------------------------------------ */
/* Diagram                                                             */
/* ------------------------------------------------------------------ */

export const CLIENTS: DiagramNodeData[] = [
  {
    id: 'browser',
    label: 'Webbläsare (team)',
    sub: 'The Insiders-byrån',
    color: 'nodeCyan',
    detail: {
      description: 'Byråns team använder admin-konsolen i webbläsaren för kunder, källor, moduler och rapporter.',
      whyChosen: 'Internt verktyg — ingen publik kundåtkomst behövs.',
      alternatives: 'Kundinloggning valdes bort i MVP; rapporter levereras manuellt.',
      techDetails: 'Skyddas av NextAuth-middleware; bara whitelistade e-poster i team.ts släpps in.',
    },
  },
  {
    id: 'agent-client',
    label: 'AI-agent (CLI)',
    sub: 'Claude pollar kön',
    color: 'nodePurple',
    detail: {
      description: 'En extern Claude-agent agerar klient och pollar agent_tasks för uppgifter.',
      whyChosen: 'Avlastar repetitivt arbete utan att bädda in agenten i tjänsten.',
      alternatives: 'Inbäddad agent valdes bort — Cloud Run-tjänsten ska vara tunn.',
      techDetails: 'Anropar /api/admin/agent (status/poll/cancel) med produktscope.',
    },
  },
];

// Ritas i fast ordning 0..5 med pilar mellan (se DiagramTab).
export const DIAGRAM_NODES: DiagramNodeData[] = [
  {
    id: 'frontend',
    label: 'Next.js Frontend',
    sub: 'insiders-frontend',
    color: 'nodeCyan',
    detail: {
      description: 'Admin-konsolen: vyer för kunder, källor, dataset, moduler, rapporter, loggar och denna arkitekturportal.',
      whyChosen: 'App Router ger oss server-side guards och filbaserad routing i ett.',
      alternatives: 'Ren SPA valdes bort — vi ville ha SSR-guard och RSC.',
      techDetails: 'Next.js 16, React 19, Tailwind v4. Pratar med insiders-api via NEXT_PUBLIC_API_URL.',
    },
  },
  {
    id: 'auth',
    label: 'NextAuth-middleware',
    sub: 'Google OAuth-guard',
    color: 'nodeOrange',
    detail: {
      description: 'Edge-middleware som kräver inloggad session för alla rutter utom /login.',
      whyChosen: 'Skyddar hela konsolen på ett ställe utan att duplicera guards.',
      alternatives: 'Per-sida-guards valdes bort som primär barriär (men sidor som denna lägger på roll-koll också).',
      techDetails: 'JWT-strategi; team.ts mappar e-post → roll (SUPERADMIN/ADMIN).',
    },
  },
  {
    id: 'api',
    label: 'FastAPI Backend',
    sub: 'insiders-api',
    color: 'nodeBlue',
    detail: {
      description: 'Tunn FastAPI-app som registrerar alla routers och hanterar request-loggning + health.',
      whyChosen: 'Python-ekosystemet (Pandas) bor här; Pydantic ger typade scheman.',
      alternatives: 'Node-backend valdes bort — beräkningarna vill ha Pandas/NumPy.',
      techDetails: 'main.py → routers/. CORS öppet, allt bakom samma tjänst i europe-north1.',
    },
  },
  {
    id: 'engine',
    label: 'Formel-engine',
    sub: 'formula.py',
    color: 'nodeBlue',
    detail: {
      description: 'Räknar KPI-modulernas uttryck (t.ex. impressions / reach * 100) över normaliserade dataset-rader.',
      whyChosen: 'Moduler ska kunna definieras som formler mot stabila fält, inte hårdkodas.',
      alternatives: 'Hårdkodade KPI:er valdes bort — vi vill kunna skapa moduler i UI.',
      techDetails: 'Läser ModuleFieldRef → SourceField, slår upp DatasetRow.values_json, aggregerar med Pandas.',
    },
  },
  {
    id: 'orm',
    label: 'SQLAlchemy ORM',
    sub: 'models.py',
    color: 'nodeGreen',
    detail: {
      description: 'Datamodell-lagret. Definierar kund, källa (versionerad), dataset, modul, rapport m.fl.',
      whyChosen: 'Relationer + cascade i kod, samma modeller mot Postgres och SQLite.',
      alternatives: 'Rå SQL valdes bort — tappar relationer och typer.',
      techDetails: 'declarative_base; init_db() kör create_all + egen auto-migrate.',
    },
  },
  {
    id: 'db',
    label: 'Cloud SQL Postgres',
    sub: 'SQLite lokalt',
    color: 'nodeGreen',
    detail: {
      description: 'Persistenslagret för KPI-plattformen.',
      whyChosen: 'Relationell integritet mellan kund, källa, dataset och modul.',
      alternatives: 'Firestore valdes bort för denna data (används i stället av Insider Graph).',
      techDetails: 'psycopg2 + pool_pre_ping. DATABASE_URL i Cloud Run, annars SQLite-fallback.',
    },
  },
];

export const SIDE_NODES: DiagramNodeData[] = [
  {
    id: 'vertex',
    label: 'Vertex AI · Gemini 3 Flash',
    sub: 'Dataset-sammanfattning',
    color: 'nodeOrange',
    detail: {
      description: 'Skriver korta svenska sammanfattningar av nyuppladdade dataset.',
      whyChosen: 'Default service account på Cloud Run → ingen nyckel att rotera.',
      alternatives: 'Tredjeparts-LLM i USA valdes bort av datahänsyn.',
      techDetails: 'ai.py via google-genai, vertexai=True. EU-only-kravet kräver omrouting (se ADR).',
    },
  },
  {
    id: 'claude-svc',
    label: 'Claude-agent',
    sub: 'claude-sonnet-4-6',
    color: 'nodePurple',
    detail: {
      description: 'Extern agent som utför uppgifter ur agent_tasks-kön.',
      whyChosen: 'Pollande kö frikopplar agenten från tjänstens livscykel.',
      alternatives: 'Inbäddad körning valdes bort.',
      techDetails: 'Pratar med /api/admin/agent; status/poll/cancel.',
    },
  },
  {
    id: 'gcs-svc',
    label: 'Cloud Storage',
    sub: 'Fil-/bildblob',
    color: 'nodeBlue',
    detail: {
      description: 'Lagrar admin-uppladdade filer utanför databasen.',
      whyChosen: 'Billig blob-lagring i stället för binärdata i DB.',
      alternatives: 'Spara i DB valdes bort.',
      techDetails: 'google-cloud-storage SDK.',
    },
  },
  {
    id: 'graph-svc',
    label: 'Insider Graph API',
    sub: 'GEO/AI-synlighet',
    color: 'nodePurple',
    detail: {
      description: 'Systertjänst för AI-synlighet/GEO med eget Firestore-datalager och egna connectors.',
      whyChosen: 'Separat produktmodell — hålls isär från KPI-plattformen.',
      alternatives: 'Att utöka insiders-api valdes bort.',
      techDetails: 'Egen Cloud Run-tjänst; frontend pratar via graphFetch (x-api-key).',
    },
  },
  {
    id: 'oauth',
    label: 'Google OAuth',
    sub: 'Inloggning',
    color: 'nodeOrange',
    detail: {
      description: 'Identitetsleverantör för teamets inloggning.',
      whyChosen: 'Teamet har redan Google-konton; ingen egen lösenordshantering.',
      alternatives: 'Egen auth valdes bort.',
      techDetails: 'NextAuth Google-provider; whitelist i team.ts.',
    },
  },
];

/* ------------------------------------------------------------------ */
/* Domänmoduler                                                        */
/* ------------------------------------------------------------------ */

export const MODULES: ModuleNode[] = [
  {
    id: 'kunder',
    emoji: '🏢',
    name: 'Kunder',
    description: 'Kundregister med ICP, taggar, anteckningar och mätbara mål.',
    frontend: 'src/app/kunder',
    backend: 'routers/customers.py, routers/notes.py',
    apiRoutes: ['GET /api/customers', 'POST /api/customers', 'GET /api/customers/{id}', 'POST /api/customers/{id}/notes'],
    deps: ['Postgres'],
    moduleUses: [{ id: 'moduler', via: 'CustomerGoal kan länka en KPI-modul' }],
  },
  {
    id: 'kallor',
    emoji: '📥',
    name: 'Källor',
    description: 'Versionerade rapporttyper. SourceField är stabilt; kolumnnamn mappas per version.',
    frontend: 'src/app/sources',
    backend: 'routers/sources.py',
    apiRoutes: ['GET /api/sources', 'POST /api/sources', 'POST /api/sources/{id}/versions', 'GET /api/sources/{id}/fields'],
    deps: ['Postgres'],
    moduleUses: [],
  },
  {
    id: 'datasets',
    emoji: '📊',
    name: 'Dataset',
    description: 'Uppladdade filer normaliserade till rader. AI-sammanfattning + periodspårning mot dubbelräkning.',
    frontend: 'src/app/kunder/[id]',
    backend: 'routers/datasets.py, ai.py',
    apiRoutes: ['POST /api/datasets', 'GET /api/datasets/{id}', 'DELETE /api/datasets/{id}'],
    deps: ['Postgres', 'Vertex AI', 'Pandas'],
    moduleUses: [{ id: 'kallor', via: 'normaliserar rader mot SourceField/version' }],
  },
  {
    id: 'moduler',
    emoji: '🧩',
    name: 'Moduler / KPI',
    description: 'KPI-moduler som formler mot SourceField. Tröskelvärden, visualisering, insiktsmallar.',
    frontend: 'src/app/moduler, src/app/engine',
    backend: 'routers/modules.py, formula.py',
    apiRoutes: ['GET /api/modules', 'POST /api/modules', 'POST /api/modules/{id}/evaluate'],
    deps: ['Postgres', 'Pandas'],
    moduleUses: [
      { id: 'kallor', via: 'ModuleFieldRef → SourceField' },
      { id: 'datasets', via: 'läser DatasetRow.values_json' },
    ],
  },
  {
    id: 'rapporter',
    emoji: '📈',
    name: 'Rapporter',
    description: 'Sparade vyer som kombinerar moduler och kunder. Dashboard + LinkedIn-rapportexport.',
    frontend: 'src/app/rapporter',
    backend: 'routers/reports.py, routers/dashboard.py',
    apiRoutes: ['GET /api/reports', 'POST /api/reports', 'GET /api/dashboard'],
    deps: ['Postgres'],
    moduleUses: [
      { id: 'moduler', via: 'aggregerar KPI:er' },
      { id: 'kunder', via: 'filtrerar per kund' },
    ],
  },
  {
    id: 'aichat',
    emoji: '💡',
    name: 'AI-assistent',
    description: 'Inbyggd assistent som svarar på frågor om kunder och rapporter med sidkontext.',
    frontend: 'src/components/AIAssistant.tsx',
    backend: 'routers/ai_chat.py',
    apiRoutes: ['POST /api/ai-chat', 'GET /api/ai-chat/{session_id}'],
    deps: ['Postgres', 'Vertex AI'],
    moduleUses: [
      { id: 'kunder', via: 'kundkontext i prompten' },
      { id: 'rapporter', via: 'läser dashboard-/rapportdata' },
    ],
  },
  {
    id: 'teamchat',
    emoji: '💬',
    name: 'Team-chat',
    description: 'Intern chatt mellan teammedlemmar med konversationer, bilagor och reaktioner.',
    frontend: 'src/components/ChatWidget.tsx',
    backend: 'routers/chat.py',
    apiRoutes: ['GET /api/conversations', 'POST /api/conversations/{id}/messages'],
    deps: ['Postgres'],
    moduleUses: [],
  },
  {
    id: 'kanban',
    emoji: '🗂️',
    name: 'Kanban / Issues',
    description: 'Per-produkt arbetsyta med issues, kommentarer och bilder (feedback-bubblan).',
    frontend: 'src/components/AdminWorkspace.tsx',
    backend: 'routers/issues.py',
    apiRoutes: ['GET /api/issues', 'POST /api/issues', 'PATCH /api/issues/{id}'],
    deps: ['Postgres'],
    moduleUses: [],
  },
  {
    id: 'agent',
    emoji: '🤖',
    name: 'AI-agent',
    description: 'Sessioner och uppgiftskö för den externa Claude-agenten, scopad per produkt.',
    frontend: 'src/app/api/admin/agent, src/lib/agent-store.ts',
    backend: 'routers/agent.py',
    apiRoutes: ['GET /api/admin/agent/status', 'POST /api/admin/agent', 'POST /api/admin/agent/poll'],
    deps: ['Postgres', 'Claude-agent'],
    moduleUses: [{ id: 'kanban', via: 'kan agera på issues' }],
  },
];

// Manuella positioner (top-left av varje nod) i viewBox 0 0 680 450 — ingen autolayout.
export const MODULE_POSITIONS: Record<string, [number, number]> = {
  kallor: [40, 40],
  kunder: [520, 40],
  datasets: [40, 165],
  moduler: [280, 165],
  rapporter: [520, 165],
  aichat: [280, 290],
  teamchat: [40, 380],
  kanban: [280, 380],
  agent: [520, 380],
};

/* ------------------------------------------------------------------ */
/* ADRs                                                                */
/* ------------------------------------------------------------------ */

export const ADRS: Adr[] = [
  {
    id: 'adr-001',
    title: 'Moduler binder mot stabila SourceField, inte kolumnnamn',
    date: '2026-04',
    status: 'Aktiv',
    context:
      'LinkedIn-rapporternas kolumnrubriker ändras mellan exporter. Om moduler band direkt mot kolumnnamn skulle varje rapportändring knäcka KPI:erna.',
    decision:
      'Moduler refererar SourceField.id. När en rapport ändras lägger vi till en ny SourceVersion med uppdaterade SourceFieldMapping-rader. Modulerna fortsätter fungera.',
    consequences:
      'Ett extra mappningslager (SourceField + SourceFieldMapping per version), men robusthet mot kolumnbyten och historik bevaras.',
    revisitWhen: 'Om en källa byter datapunkter helt (inte bara namn) så att gamla SourceField saknar motsvarighet.',
  },
  {
    id: 'adr-002',
    title: 'PostgreSQL i produktion, SQLite lokalt — samma ORM',
    date: '2026-04',
    status: 'Aktiv',
    context: 'Vi vill ha noll uppsättning lokalt men relationell integritet och delad data i produktion.',
    decision:
      'En SQLAlchemy-modell körs mot Cloud SQL Postgres i produktion (DATABASE_URL) och mot lokal SQLite-fil när variabeln saknas. db.py har separata auto-migrate-svep för båda.',
    consequences:
      'Snabb lokal iteration, men SQLite saknar ADD COLUMN IF NOT EXISTS — vi underhåller två migrationslistor som måste hållas i synk.',
    revisitWhen: 'Om vi behöver Postgres-specifika typer (t.ex. jsonb-index) som SQLite inte kan spegla.',
  },
  {
    id: 'adr-003',
    title: 'Gemini 3 Flash via Vertex AI för dataset-sammanfattningar',
    date: '2026-04',
    status: 'Aktiv',
    context:
      'Nyuppladdade dataset behöver en kort, läsbar sammanfattning. Vi vill undvika API-nycklar att rotera och hålla data inom GCP.',
    decision:
      'ai.py anropar gemini-3-flash-preview via Vertex AI med Cloud Runs default service account (vertexai=True).',
    consequences:
      'Ingen nyckelhantering och billig inferens. Men gemini-3-flash-preview kräver location="global", vilket krockar med ett hårt EU-only-krav.',
    revisitWhen:
      'EU-only-datakravet: LLM-anrop ska routas via Vertex AI i EU-region (ej global/US-endpoint). Omprövas och byggs om för EU-residens.',
  },
  {
    id: 'adr-004',
    title: 'NextAuth v5 + Google OAuth med e-postwhitelist',
    date: '2026-04',
    status: 'Aktiv',
    context: 'Internt byråverktyg — bara teamet ska komma in, utan egen lösenordshantering.',
    decision:
      'Google OAuth via NextAuth v5. middleware.ts kräver session för alla rutter utom /login; team.ts är källan till tillåtna e-poster och roller.',
    consequences: 'Enkel, säker inloggning. Whitelist underhålls manuellt och v5 är fortfarande beta.',
    revisitWhen: 'Om kunder ska få egen inloggning, eller teamet växer så manuell whitelist blir ohållbar.',
  },
  {
    id: 'adr-005',
    title: 'Monorepo med per-tjänst Cloud Build-triggers, auto-deploy till staging',
    date: '2026-04',
    status: 'Aktiv',
    context: 'Flera tjänster (frontend, api, graph-api) i ett repo ska kunna deployas oberoende utan manuella steg.',
    decision:
      'Varje tjänst har egen cloudbuild.yaml + trigger filtrerad på sin undermapp. Push till main bygger med Kaniko och deployar till Cloud Run. Staging är där vi verifierar.',
    consequences:
      'Push → live på minuter. Men samtidiga byggen kan racea — man måste vänta in kön innan en ny push.',
    revisitWhen: 'Om vi behöver en separat prod-miljö skild från staging, eller godkännandesteg före deploy.',
  },
  {
    id: 'adr-006',
    title: 'Insider Graph som egen tjänst med eget datalager',
    date: '2026-05',
    status: 'Aktiv',
    context: 'AI-synlighet/GEO är en egen produktmodell (connectors, polling, Firestore) som inte passar KPI-plattformens relationsmodell.',
    decision:
      'insider-graph-api är en separat Cloud Run-tjänst med Firestore. Frontend pratar med den via graphFetch och en egen produktväljare i sidomenyn.',
    consequences:
      'Ren separation och oberoende deploy, men ingen direkt join mellan GEO-data och KPI-data — integrationer går via API.',
    revisitWhen: 'Om produkterna behöver delad data/rapporter som kräver gemensam datamodell.',
  },
];

/* ------------------------------------------------------------------ */
/* Designsystem                                                        */
/* ------------------------------------------------------------------ */

// Detta ÄR swatch-datan — enda stället där hex får stå (speglar globals.css).
export const COLOR_TOKENS: ColorToken[] = [
  { name: 'Bakgrund', token: '--brand-bg', value: '#0f111a', note: 'App-bakgrund (mörk)' },
  { name: 'Panel', token: '--brand-panel', value: '#1e212b', note: 'Kort och paneler' },
  { name: 'Panel hover', token: '--brand-panel-hover', value: '#262936', note: 'Hover-yta' },
  { name: 'Accent', token: '--brand-accent', value: '#00d4ff', note: 'Primär cyan — CTA/aktiv' },
  { name: 'Accent ljus', token: '--brand-accent-bright', value: '#00f2fe', note: 'Glow/highlight' },
  { name: 'Success', token: '--brand-success', value: '#22c55e', note: 'OK-status' },
  { name: 'Warning', token: '--brand-warning', value: '#f59e0b', note: 'Varning' },
  { name: 'Danger', token: '--brand-danger', value: '#ef4444', note: 'Fel/nedstatus' },
  { name: 'Purple', token: '--brand-purple', value: '#b14ef4', note: 'Insider Graph-accent' },
  { name: 'Blue', token: '--brand-blue', value: '#3b82f6', note: 'Sekundär diagramfärg' },
  { name: 'Text', token: '--brand-text', value: '#ffffff', note: 'Primär text' },
  { name: 'Muted', token: '--brand-muted', value: '#94a3b8', note: 'Sekundär text (slate-400)' },
  { name: 'Border', token: '--brand-border', value: 'rgba(255,255,255,0.08)', note: 'Kantlinjer' },
];

export const TYPE_SCALE: TypeScaleItem[] = [
  { token: 'Hero', size: '2rem / 600', label: 'Sidrubrik', desc: 'Inter Tight, tracking -0.02em' },
  { token: 'H1', size: '1.5rem / 600', label: 'Sektionsrubrik', desc: 'Inter Tight, tight tracking' },
  { token: 'H2', size: '1.125rem / 600', label: 'Kortrubrik', desc: 'Korttitlar och flik-rubriker' },
  { token: 'Body', size: '0.9375rem / 400', label: 'Brödtext', desc: 'line-height 1.5em' },
  { token: 'Small', size: '0.8125rem / 400', label: 'Hjälptext', desc: 'Beskrivningar och meta' },
  { token: 'Caption', size: '0.6875rem / 600', label: 'Etikett/badge', desc: 'Versaler, tracking 0.12em' },
];

export const DESIGN_RULES: { title: string; body: string }[] = [
  {
    title: 'Inga hårdkodade hex',
    body: 'Färger kommer från --brand-*-tokens i globals.css. Enda undantaget är COLOR_TOKENS-datan här, som visar själva värdena.',
  },
  {
    title: 'Mörk bas, cyan accent',
    body: '--brand-bg som botten, --brand-accent (cyan) för CTA och aktiva tillstånd. Insider Graph-vyerna använder lila (--brand-purple).',
  },
  {
    title: 'Inter Tight, tajt rubriktracking',
    body: 'Rubriker: vikt 600, letter-spacing -0.02em. Brödtext: vikt 400, line-height 1.5em.',
  },
  {
    title: 'Glaspaneler + 16px-radie',
    body: '.brand-glass-panel: panelbakgrund, 1px --brand-border, 16px rundning, mjuk skugga.',
  },
];

export const CODE_EXAMPLES: { title: string; code: string }[] = [
  {
    title: 'Primär CTA',
    code: '<button className="brand-btn-primary">Spara</button>',
  },
  {
    title: 'Glaspanel',
    code: '<div className="brand-glass-panel" style={{ padding: 16 }}>…</div>',
  },
  {
    title: 'Token i CSS',
    code: 'color: var(--brand-muted);\nborder: 1px solid var(--brand-border);',
  },
];

/* ------------------------------------------------------------------ */
/* Live — schema-fallback + ordlista                                   */
/* ------------------------------------------------------------------ */

// Hårdkodad fallback för Live-flikens schema-browser. page.tsx försöker först
// parsa backend/models.py från disk; i Cloud Run-containern finns inte den
// filen (frontend-imagen strippar backend-källan), så denna lista används då.
// Speglar backend/models.py. Domän gissas i page.tsx via inferDomain().
export const SCHEMA_MODELS_FALLBACK: SchemaModel[] = [
  {
    name: 'Customer',
    table: 'customers',
    domain: 'Kunder',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'slug', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'icp_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'tags_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'datasets', type: 'Dataset', optional: false, isList: true, isRelation: true, hasDefault: false },
      { name: 'modules', type: 'Module', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'Source',
    table: 'sources',
    domain: 'Källor',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'key', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'platform', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'detect_rules_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'versions', type: 'SourceVersion', optional: false, isList: true, isRelation: true, hasDefault: false },
      { name: 'fields', type: 'SourceField', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'SourceField',
    table: 'source_fields',
    domain: 'Källor',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'key', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'display_name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'data_type', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'unit', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
  {
    name: 'Dataset',
    table: 'datasets',
    domain: 'Dataset',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'customer_id', type: 'String', optional: false, isList: false, isRelation: true, hasDefault: false },
      { name: 'original_filename', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'sha256', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'ai_summary', type: 'Text', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'granularity', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'period_start', type: 'Date', optional: true, isList: false, isRelation: false, hasDefault: false },
      { name: 'rows', type: 'DatasetRow', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'Module',
    table: 'modules',
    domain: 'Moduler',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'customer_id', type: 'String', optional: true, isList: false, isRelation: true, hasDefault: false },
      { name: 'name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'abbr', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'formula_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'thresholds_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'inverted', type: 'Boolean', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'field_refs', type: 'ModuleFieldRef', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'Report',
    table: 'reports',
    domain: 'Rapporter',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'customer_id', type: 'String', optional: true, isList: false, isRelation: true, hasDefault: false },
      { name: 'name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'config_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
  {
    name: 'Issue',
    table: 'issues',
    domain: 'Kanban',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'product', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'title', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'status', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'comments', type: 'IssueComment', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'AgentSession',
    table: 'agent_sessions',
    domain: 'AI-agent',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'product', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'title', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'claude_session_id', type: 'String', optional: true, isList: false, isRelation: false, hasDefault: false },
      { name: 'tasks', type: 'AgentTask', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'Conversation',
    table: 'conversations',
    domain: 'Chat',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'members_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'messages', type: 'ChatMessage', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'AIChatMessage',
    table: 'ai_chat_messages',
    domain: 'AI-assistent',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'session_id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'role', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'content', type: 'Text', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'page_context', type: 'String', optional: true, isList: false, isRelation: false, hasDefault: false },
    ],
  },
  {
    name: 'CustomerGoal',
    table: 'customer_goals',
    domain: 'Kunder',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'customer_id', type: 'String', optional: false, isList: false, isRelation: true, hasDefault: false },
      { name: 'metric_type', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'module_id', type: 'String', optional: true, isList: false, isRelation: true, hasDefault: false },
      { name: 'target_value', type: 'Float', optional: true, isList: false, isRelation: false, hasDefault: false },
      { name: 'status', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
  {
    name: 'AdminFile',
    table: 'admin_files',
    domain: 'Övrigt',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'product', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'original_name', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'category', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'size', type: 'Integer', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
];

export const GLOSSARY: GlossaryItem[] = [
  { term: 'SourceField', def: 'En stabil datapunkt (t.ex. impressions) som moduler binder mot. Lever över rapportversioner.' },
  { term: 'SourceVersion', def: 'En version av en rapporttyp. Ny version skapas när kolumnerna ändras; mappar fält → kolumnnamn.' },
  { term: 'SourceFieldMapping', def: 'Kopplar ett SourceField till det faktiska kolumnnamnet i en specifik SourceVersion.' },
  { term: 'Dataset', def: 'En uppladdad och normaliserad fil. DatasetRow lagrar värden som { source_field_id: värde }.' },
  { term: 'Modul (KPI)', def: 'Ett mätetal definierat som en formel mot SourceField via ModuleFieldRef-alias.' },
  { term: 'Granularitet', def: 'daily | monthly | aggregated | unknown — spåras per dataset för att undvika dubbelräkning.' },
  { term: 'Produktscope', def: '"the-insiders" eller "insider-graph" — issues, agent-sessioner och filer scopas per produkt.' },
  { term: 'Insider Graph', def: 'Systerprodukt för AI-synlighet/GEO med egen Cloud Run-tjänst och Firestore.' },
  { term: 'Staging', def: 'insiders-frontend på Cloud Run — miljön där vi verifierar allt som pushas till main.' },
];

/* ------------------------------------------------------------------ */
/* Miljöer (Live-status)                                               */
/* ------------------------------------------------------------------ */

export const ENVIRONMENTS = {
  frontend: 'https://insiders-frontend-815335042776.europe-north1.run.app',
  api: 'https://insiders-api-815335042776.europe-north1.run.app',
  graph: 'https://insider-graph-api-815335042776.europe-north1.run.app',
};
