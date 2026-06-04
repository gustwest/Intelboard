/**
 * Arkitektur & Designsystem — ENDA datakällan för portalen.
 *
 * Portalen dokumenterar BÅDA spåren i monorepot och hur de samspelar:
 *   • The Insiders Insights — KPI-/LinkedIn-analysplattform (FastAPI + Postgres)
 *   • Geogiraph (insider-graph) — AI-synlighet / GEO-kunskapsgraf (FastAPI + Firestore)
 * Delad frontend (Next.js) med ProductSwitcher; AI-chatten i insiders-api växlar
 * kontext och hämtar i graf-läge LIVE Geogiraph-data via GRAPH_API_URL.
 *
 * Lärdom (handover §8, fallgrop #1): ingen dubblerad datafil. ALL innehållsdata
 * bor här och importeras av flikarna. Hex förekommer ENDAST i COLOR_TOKENS.
 *
 * Modell-ID:n hämtas från @/lib/aiModels (som speglar
 * insider-graph-api/services/model_registry.py). Hårdkoda ALDRIG ett
 * model-ID här — drift-scannen flaggar det och prosan riskerar bli
 * faktiskt felaktig när registret uppdateras.
 */
import {
  GEO_GENERATOR_MODEL,
  GEO_VALIDATOR_MODEL,
  PROBE_CLAUDE_MODEL,
  PROBE_GEMINI_MODEL,
} from '@/lib/aiModels';

/* ------------------------------------------------------------------ */
/* Spår                                                                */
/* ------------------------------------------------------------------ */

export type Track = 'insiders' | 'geogiraph' | 'delad';

export const TRACK_LABELS: Record<Track, string> = {
  insiders: 'The Insiders',
  geogiraph: 'Geogiraph',
  delad: 'Delad',
};

/* ------------------------------------------------------------------ */
/* Typer                                                               */
/* ------------------------------------------------------------------ */

export type TechItem = {
  id: string;
  emoji: string;
  name: string;
  layer: string; // måste matcha ett id i LAYERS
  layerClass: string;
  track: Track;
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
    description: string;
    whyChosen: string;
    alternatives: string;
    techDetails: string;
  };
};

export type Interaction = {
  id: string;
  from: string;
  to: string;
  label: string;
  detail: string;
};

export type LoopStep = {
  id: string;
  num: number;
  actor: 'System' | 'Operatör' | 'Extern';
  color: string; // CSS-klass: nodeGreen | nodeOrange | nodePurple | nodeBlue | nodeCyan
  label: string;
  sub: string;
  detail: {
    what: string; // vad steget gör
    who: string; // automatiskt vs människa
    where: string; // var det syns / vilken fil
    output: string; // vad det producerar / nästa steg
  };
};

export type ModuleNode = {
  id: string;
  emoji: string;
  name: string;
  track: Exclude<Track, 'delad'>;
  description: string;
  frontend: string;
  backend: string;
  apiRoutes: string[];
  deps: string[];
  moduleUses: { id: string; via: string }[];
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

export type FirestoreCollection = {
  path: string;
  description: string;
  fields: string[];
};

/* ------------------------------------------------------------------ */
/* Teknikstack — båda spåren, taggade med track                        */
/* ------------------------------------------------------------------ */

export const LAYERS: Layer[] = [
  { id: 'Frontend', label: 'Frontend', cls: 'layerFrontend' },
  { id: 'Backend', label: 'Backend', cls: 'layerBackend' },
  { id: 'Data', label: 'Data', cls: 'layerData' },
  { id: 'AI & Tjänster', label: 'AI & Tjänster', cls: 'layerServices' },
  { id: 'Infrastruktur', label: 'Infrastruktur', cls: 'layerInfra' },
];

export const TECH_STACK: TechItem[] = [
  /* ---- Frontend (delad) ---- */
  {
    id: 'nextjs',
    emoji: '▲',
    name: 'Next.js 16 (App Router)',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    track: 'delad',
    snippet: 'Delad konsol för båda spåren',
    description:
      'En enda Next.js 16-app (insiders-frontend) driver båda produkterna. Insiders-vyerna (/kunder, /moduler …) och Geogiraph-vyerna (/insider-graph/*) lever sida vid sida; ProductSwitcher växlar.',
    pros: [
      'En kodbas, ett bygge, en inloggning för båda spåren',
      'Server Components för guards + fs-läsning',
      'Route-baserad produktdetektion (/insider-graph → graf-läge)',
    ],
    cons: ['App Router har brutit mot äldre API:er', 'Två teman i samma app kräver disciplin'],
    alternatives: [
      { name: 'Två separata frontends', why: 'Dubbel auth + dubbelt bygge för litet team' },
    ],
  },
  {
    id: 'productswitcher',
    emoji: '🔀',
    name: 'ProductSwitcher + delad auth',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    track: 'delad',
    snippet: 'NextAuth (Google) för båda spåren',
    description:
      'ProductSwitcher.tsx växlar mellan The Insiders och Geogiraph via pathname. NextAuth v5 (Google OAuth, whitelist i team.ts) är single sign-on för båda. Sidebar visar INSIDERS_LINKS eller GRAPH_LINKS.',
    pros: ['En inloggning täcker båda', 'Tydlig visuell separation (cyan vs lila)'],
    cons: ['Whitelist underhålls manuellt', 'v5 är beta'],
    alternatives: [{ name: 'Separata inloggningar', why: 'Onödig friktion — samma team' }],
  },
  {
    id: 'tailwind',
    emoji: '🎨',
    name: 'Tailwind v4 + tokens',
    layer: 'Frontend',
    layerClass: 'layerFrontend',
    track: 'delad',
    snippet: 'Två teman via --brand-*',
    description:
      'Tailwind v4. Insiders kör mörkt tema (cyan accent); Geogiraph-vyerna scopar ett ljust tema (off-white, lila accent #9f51b6) i sin layout.tsx. Färger via tokens, ej hårdkodade hex.',
    pros: ['Tokens = ett ställe att byta tema', 'Inga globala klasskollisioner'],
    cons: ['Lång klasslista i markup'],
    alternatives: [{ name: 'CSS Modules överallt', why: 'Mer boilerplate' }],
  },
  /* ---- Backend ---- */
  {
    id: 'fastapi-insiders',
    emoji: '⚡',
    name: 'FastAPI — insiders-api',
    layer: 'Backend',
    layerClass: 'layerBackend',
    track: 'insiders',
    snippet: 'KPI-API + delad AI-chatt',
    description:
      'Insiders backend: tunn FastAPI-app (main.py) som registrerar routers (customers, sources, datasets, modules, reports, agent, chat, ai_chat …). Här bor även den delade AI-chatten som växlar kontext per produkt.',
    pros: ['Pydantic-scheman', 'Pandas/NumPy för formel-engine', 'Auto-OpenAPI'],
    cons: ['Manuell auto-migrate i db.py'],
    alternatives: [{ name: 'Node/Express', why: 'Pandas-ekosystemet bor i Python' }],
  },
  {
    id: 'fastapi-graph',
    emoji: '🕸️',
    name: 'FastAPI — insider-graph-api',
    layer: 'Backend',
    layerClass: 'layerBackend',
    track: 'geogiraph',
    snippet: 'GEO-kunskapsgraf + pipeline',
    description:
      'Geogiraph backend: egen FastAPI-tjänst (routers: clients, connectors, delivery, polling, review, esg, jobs, onboard, linkedin, badge, reports, webhooks). X-API-Key-auth. Driver hela scrape→extrahera→kompilera→leverera→mät-kedjan.',
    pros: ['Helt frikopplad från KPI-plattformen', 'Egen deploy + egna jobb'],
    cons: ['Ingen direkt join mot Postgres — integration via API'],
    alternatives: [{ name: 'Utöka insiders-api', why: 'Två helt olika produktmodeller' }],
  },
  {
    id: 'pandas',
    emoji: '🐼',
    name: 'Pandas + NumPy',
    layer: 'Backend',
    layerClass: 'layerBackend',
    track: 'insiders',
    snippet: 'Ingest + formel-engine',
    description:
      'Normaliserar uppladdade LinkedIn-rapporter och driver KPI-formel-engine (formula.py). openpyxl/xlrd läser Excel.',
    pros: ['Robust CSV/Excel-parsning', 'Vektoriserade beräkningar'],
    cons: ['Minnesglupskt för stora filer'],
    alternatives: [{ name: 'Polars', why: 'Mindre moget för Excel' }],
  },
  {
    id: 'langchain',
    emoji: '🔗',
    name: 'LangChain + Vertex-bindning',
    layer: 'Backend',
    layerClass: 'layerBackend',
    track: 'geogiraph',
    snippet: 'langchain-google-vertexai',
    description:
      `Geogiraphs LLM-fabrik (services/llm.py) bygger generator (${GEO_GENERATOR_MODEL}) och validator (${GEO_VALIDATOR_MODEL}) via langchain-google-vertexai — allt mot Vertex AI EU. trafilatura extraherar text vid webbcrawl.`,
    pros: ['Enhetligt LLM-gränssnitt', 'Vertex = EU-residens utan API-nycklar'],
    cons: ['Abstraktionslager att hålla koll på'],
    alternatives: [{ name: 'Direkta SDK-anrop', why: 'Mer limkod per modell' }],
  },
  /* ---- Data ---- */
  {
    id: 'postgres',
    emoji: '🐘',
    name: 'Cloud SQL PostgreSQL',
    layer: 'Data',
    layerClass: 'layerData',
    track: 'insiders',
    snippet: 'Insiders KPI-data',
    description:
      'Insiders kör PostgreSQL på Cloud SQL (psycopg2, SQLAlchemy). DATABASE_URL i Cloud Run; saknas den faller db.py tillbaka på lokal SQLite. Modeller i backend/models.py.',
    pros: ['Relationell integritet kund/källa/dataset/modul', 'Hanterad backup'],
    cons: ['Kräver Cloud SQL-instans + connector'],
    alternatives: [{ name: 'Endast SQLite', why: 'Skalar inte i produktion' }],
  },
  {
    id: 'firestore',
    emoji: '🔥',
    name: 'Firestore (native EU)',
    layer: 'Data',
    layerClass: 'layerData',
    track: 'geogiraph',
    snippet: 'GEO-kunskapsgraf',
    description:
      'Geogiraph lagrar kunder, anställda (noder), raw_items, claims, polling_results, risk_findings, esg_findings m.m. i Firestore. Schemalöst passar den heterogena connector-/claim-datan.',
    pros: ['Schemalöst passar claim-/polling-data', 'Skalar horisontellt', 'EU-region'],
    cons: ['Eget frågespråk, ingen join med Postgres'],
    alternatives: [{ name: 'Samma Postgres', why: 'Tvingar ihop två produktmodeller' }],
  },
  {
    id: 'gcs-cdn',
    emoji: '📦',
    name: 'Cloud Storage + CDN',
    layer: 'Data',
    layerClass: 'layerData',
    track: 'geogiraph',
    snippet: 'Publicerad JSON-LD',
    description:
      'Kompilerade kunskapsgrafer (JSON-LD), profilsidor och badges pushas till GCS/CDN. Kunden injicerar identitets-snippet via GTM en gång. Insiders använder även GCS för admin-filer.',
    pros: ['Billig publik leverans', 'CDN-cache'],
    cons: ['Cache-invalidering att tänka på'],
    alternatives: [{ name: 'Serva från tjänsten', why: 'Onödig last + sämre cache' }],
  },
  /* ---- AI & Tjänster ---- */
  {
    id: 'vertex-eu',
    emoji: '🇪🇺',
    name: 'Vertex AI EU (resonemang)',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'geogiraph',
    snippet: `${GEO_GENERATOR_MODEL} + ${GEO_VALIDATOR_MODEL}`,
    description:
      `Resonemangsmodellerna som bearbetar kunddata körs ENBART via Vertex AI i europe-west1: generator ${GEO_GENERATOR_MODEL}, validator/reasoner ${GEO_VALIDATOR_MODEL}. Hård EU-residens — Claude körs inte här (ej EU-resident i regionen).`,
    pros: ['Data stannar i EU', 'Service account-auth, inga nycklar att rotera'],
    cons: ['Claude ej EU-resident via förstapart → Gemini för ESG-resonemang'],
    alternatives: [{ name: 'Förstaparts-US-API', why: 'Bryter EU-only-kravet' }],
  },
  {
    id: 'probes',
    emoji: '🛰️',
    name: 'Probe-motorer (mätning)',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'geogiraph',
    snippet: `${PROBE_CLAUDE_MODEL} + ${PROBE_GEMINI_MODEL} (Vertex EU)`,
    description:
      `AI-synlighet och risk mäts mot de motorer riktiga användare möter: ${PROBE_CLAUDE_MODEL} (via Vertex Model Garden) + ${PROBE_GEMINI_MODEL} (via Vertex AI EU). Modellerna är identiska med vad publika API:erna serverar — Vertex är leveransvägen, inte ett annat modellbygge. Sedan 2026-06-02 gemensam auth via service account, ingen separat API-nyckel-hantering.`,
    pros: [
      'Mäter samma modeller som publika användare träffar',
      'En auth-väg (ADC) — inga separata leverantörsnycklar',
      'EU-residency även för probe-trafik',
    ],
    cons: ['Vertex Model Garden måste vara enabled för Claude i projektet'],
    alternatives: [{ name: 'Förstaparts OpenAI/Gemini direkt', why: 'Sårbart för whitespace-förorenade nycklar (vi körde det till 2026-06-02)' }],
  },
  {
    id: 'gemini-summaries',
    emoji: '✨',
    name: 'Gemini (dataset-sammanfattning)',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'insiders',
    snippet: 'ai.py via Vertex',
    description:
      'Insiders ai.py skriver korta svenska sammanfattningar av nyuppladdade dataset via Gemini Flash på Vertex (Cloud Runs default service account).',
    pros: ['Ingen nyckel att rotera', 'Snabb + billig'],
    cons: ['EU-only-kravet kräver fortsatt EU-region-routing (se ADR)'],
    alternatives: [{ name: 'Tredjeparts-LLM', why: 'Vi vill hålla data inom GCP/EU' }],
  },
  {
    id: 'brightdata',
    emoji: '🌐',
    name: 'Bright Data',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'geogiraph',
    snippet: 'LinkedIn-profiler/bolag',
    description:
      'LinkedIn-connectorn hämtar profil- och bolagsdata via Bright Datas Datasets API. RSS/jobbflöden + GLEIF (LEI) kompletterar.',
    pros: ['Strukturerad LinkedIn-data utan egen skrapning'],
    cons: ['Extern kostnad + dataset-id:n att hantera'],
    alternatives: [{ name: 'Egen skrapning', why: 'Skört + mot ToS' }],
  },
  {
    id: 'sendgrid',
    emoji: '✉️',
    name: 'SendGrid (in/ut-mail)',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'geogiraph',
    snippet: 'Notiser & påminnelser',
    description:
      'Utgående notiser (t.ex. kvartalspåminnelse om LinkedIn-kapacitet och ops-aviseringar) skickas via SendGrid.',
    pros: ['Enkla notiser', 'Spårbar leverans'],
    cons: ['Ännu en extern tjänst'],
    alternatives: [{ name: 'Ingen notisutsändning', why: 'Missar tidskritiska påminnelser' }],
  },
  {
    id: 'claude-agent',
    emoji: '🤖',
    name: 'Claude-agent (admin)',
    layer: 'AI & Tjänster',
    layerClass: 'layerServices',
    track: 'delad',
    snippet: 'agent_tasks-kö',
    description:
      'En extern Claude-agent pollar agent_tasks i insiders-api och utför utvecklings-/analysuppgifter i admin-arbetsytan. Produktscopad (the-insiders | insider-graph).',
    pros: ['Avlastar manuellt arbete', 'Pollande kö frikopplar agenten'],
    cons: ['Extern; körs utanför Cloud Run'],
    alternatives: [{ name: 'Inbäddad agent', why: 'Tjänsten ska vara tunn' }],
  },
  /* ---- Infrastruktur ---- */
  {
    id: 'cloudrun',
    emoji: '☁️',
    name: 'Google Cloud Run',
    layer: 'Infrastruktur',
    layerClass: 'layerInfra',
    track: 'delad',
    snippet: 'Tre tjänster, europe-north1',
    description:
      'insiders-frontend, insiders-api och insider-graph-api körs som separata Cloud Run-tjänster i europe-north1 (projekt round-plating-480321-j7).',
    pros: ['Skalar till noll', 'En tjänst per ansvar'],
    cons: ['Kallstarter', 'Containrar strippar källfiler (se Live-schemafallback)'],
    alternatives: [{ name: 'GKE', why: 'Överkill för vår trafik' }],
  },
  {
    id: 'jobs',
    emoji: '⏱️',
    name: 'Cloud Run Jobs + Scheduler',
    layer: 'Infrastruktur',
    layerClass: 'layerInfra',
    track: 'geogiraph',
    snippet: 'Geogiraphs pipeline-kron',
    description:
      'Geogiraphs pipeline körs som schemalagda Cloud Run Jobs (scrape-active/episodic/website, extract-all-claims, compile-all-schemas, polling-weekly, xml-sync, sunset-skills, quarterly-todo) via Cloud Scheduler + Eventarc. Alla byggs ur samma image.',
    pros: ['Frikopplad batch utan att blockera API:t', 'En image → alla jobb'],
    cons: ['Nya jobb kräver BÅDE gcloud-create OCH cloudbuild-loopen'],
    alternatives: [{ name: 'Cron i tjänsten', why: 'Blandar request- och batch-last' }],
  },
  {
    id: 'cloudbuild',
    emoji: '🏗️',
    name: 'Cloud Build + Kaniko',
    layer: 'Infrastruktur',
    layerClass: 'layerInfra',
    track: 'delad',
    snippet: 'Auto-deploy per tjänst',
    description:
      'Per-tjänst Cloud Build-triggers (i europe-west1) bygger med Kaniko-cache och deployar till Cloud Run vid push till main. graph-api-bygget uppdaterar dessutom alla jobb-images. Staging = där vi verifierar.',
    pros: ['Push → live utan manuella steg', 'Kaniko-cache snabbar bygget'],
    cons: ['Samtidiga byggen kan racea — vänta in kön'],
    alternatives: [{ name: 'GitHub Actions', why: 'Cloud Build sitter närmare GCP-rättigheter' }],
  },
];

/* ------------------------------------------------------------------ */
/* Diagram — delat lager + två spår + integrationskant                 */
/* ------------------------------------------------------------------ */

// Delade noder (toppen) — gemensamma för båda spåren.
export const DIAGRAM_SHARED: DiagramNodeData[] = [
  {
    id: 'browser',
    label: 'Webbläsare (team)',
    sub: 'Byrå + ops',
    color: 'nodeCyan',
    detail: {
      description: 'Teamet arbetar i den delade admin-konsolen och växlar mellan The Insiders och Geogiraph.',
      whyChosen: 'Internt verktyg för båda produkterna — ingen publik kundåtkomst.',
      alternatives: 'Separata konsoler valdes bort för samma lilla team.',
      techDetails: 'Skyddas av NextAuth-middleware; whitelist i team.ts.',
    },
  },
  {
    id: 'frontend',
    label: 'Next.js Frontend',
    sub: 'insiders-frontend (delad)',
    color: 'nodeCyan',
    detail: {
      description: 'En app som renderar både Insiders-vyer och Geogiraph-vyer. ProductSwitcher + Sidebar växlar spår via pathname.',
      whyChosen: 'En kodbas, ett bygge, en inloggning för båda spåren.',
      alternatives: 'Två frontends valdes bort — dubbel auth/bygge.',
      techDetails: 'Next.js 16. /insider-graph/* = graf-läge (ljust tema, lila). Pratar med insiders-api (NEXT_PUBLIC_API_URL) och graph-api (graphFetch).',
    },
  },
  {
    id: 'ai-chat',
    label: 'AI-chatt (kontextväxlande)',
    sub: 'bor i insiders-api',
    color: 'nodeOrange',
    detail: {
      description: 'Den delade assistenten. I graf-läge laddas Geogiraph-kunskap och LIVE Geogiraph-kunder/connectors; i Insiders-läge laddas Insiders-kunskap.',
      whyChosen: 'En assistent för båda spåren utan att blanda ihop kontexterna.',
      alternatives: 'Separata assistenter valdes bort.',
      techDetails: 'ai_chat.py: page_context "graph_*" → hämtar /api/clients + /api/connectors från graph-api. Faller aldrig tillbaka på Insiders-kunder.',
    },
  },
];

// Insiders-spårets noder (vänster lane).
export const DIAGRAM_INSIDERS: DiagramNodeData[] = [
  {
    id: 'insiders-api',
    label: 'FastAPI · insiders-api',
    sub: 'KPI-/rapport-API',
    color: 'nodeBlue',
    detail: {
      description: 'Hanterar kunder, källor, dataset, KPI-moduler och rapporter — plus den delade AI-chatten och admin-arbetsytan.',
      whyChosen: 'Python/Pandas för formel-engine; Pydantic-scheman.',
      alternatives: 'Node-backend valdes bort.',
      techDetails: 'main.py → routers/. CORS öppet. europe-north1.',
    },
  },
  {
    id: 'engine',
    label: 'Formel-engine',
    sub: 'formula.py',
    color: 'nodeBlue',
    detail: {
      description: 'Räknar KPI-modulernas uttryck över normaliserade dataset-rader.',
      whyChosen: 'Moduler ska definieras som formler mot stabila fält, inte hårdkodas.',
      alternatives: 'Hårdkodade KPI:er valdes bort.',
      techDetails: 'ModuleFieldRef → SourceField → DatasetRow.values_json, aggregeras med Pandas.',
    },
  },
  {
    id: 'orm',
    label: 'SQLAlchemy ORM',
    sub: 'models.py',
    color: 'nodeGreen',
    detail: {
      description: 'Relationell datamodell: kund, källa (versionerad), dataset, modul, rapport.',
      whyChosen: 'Relationer + cascade i kod; samma modeller mot Postgres och SQLite.',
      alternatives: 'Rå SQL valdes bort.',
      techDetails: 'init_db() kör create_all + egen auto-migrate.',
    },
  },
  {
    id: 'postgres-db',
    label: 'Cloud SQL Postgres',
    sub: 'SQLite lokalt',
    color: 'nodeGreen',
    detail: {
      description: 'Persistens för KPI-plattformen.',
      whyChosen: 'Relationell integritet mellan kund/källa/dataset/modul.',
      alternatives: 'Firestore används av Geogiraph i stället.',
      techDetails: 'psycopg2 + pool_pre_ping. DATABASE_URL i Cloud Run.',
    },
  },
];

// Geogiraph-spårets noder (höger lane).
export const DIAGRAM_GEOGRAPH: DiagramNodeData[] = [
  {
    id: 'graph-api',
    label: 'FastAPI · insider-graph-api',
    sub: 'GEO-kunskapsgraf',
    color: 'nodePurple',
    detail: {
      description: 'Onboarding, connectors, granskning, leverans, polling, ESG. Drivkraften i hela scrape→kompilera→mät-kedjan.',
      whyChosen: 'Egen produktmodell, helt frikopplad från KPI-plattformen.',
      alternatives: 'Att utöka insiders-api valdes bort.',
      techDetails: 'X-API-Key-auth. Egen Cloud Run-tjänst + schemalagda jobb.',
    },
  },
  {
    id: 'pipeline-jobs',
    label: 'Pipeline-jobb',
    sub: 'Cloud Run Jobs + Scheduler',
    color: 'nodeOrange',
    detail: {
      description: 'Schemalagd batch: skrapar källor, extraherar claims, kompilerar grafer, mäter AI-synlighet.',
      whyChosen: 'Tung batch ska inte blockera API:t.',
      alternatives: 'Cron i tjänsten valdes bort.',
      techDetails: 'scrape-* / extract-all-claims / compile-all-schemas / polling-weekly / xml-sync … via Eventarc + Scheduler.',
    },
  },
  {
    id: 'firestore-db',
    label: 'Firestore (EU)',
    sub: 'noder, claims, findings',
    color: 'nodeGreen',
    detail: {
      description: 'Kunder/anställda (noder), raw_items, claims, polling_results, risk-/esg-findings.',
      whyChosen: 'Schemalöst passar heterogen connector-/claim-data.',
      alternatives: 'Postgres valdes bort för denna data.',
      techDetails: 'firestore_client.py. Native EU-region.',
    },
  },
  {
    id: 'vertex',
    label: 'Vertex AI EU',
    sub: `${GEO_GENERATOR_MODEL} / ${GEO_VALIDATOR_MODEL}`,
    color: 'nodePink',
    detail: {
      description: 'Resonemangsmodeller som bearbetar kunddata: generator + validator. Körs ENBART i EU.',
      whyChosen: 'Hård EU-residens; service account-auth.',
      alternatives: 'Förstaparts-US-API valdes bort (bryter EU-only).',
      techDetails: 'services/llm.py via langchain-google-vertexai, europe-west1.',
    },
  },
  {
    id: 'cdn',
    label: 'CDN / GCS',
    sub: 'publicerad JSON-LD',
    color: 'nodeBlue',
    detail: {
      description: 'Kompilerade kunskapsgrafer, profilsidor och badges som kunden injicerar via GTM.',
      whyChosen: 'Billig, cachebar publik leverans.',
      alternatives: 'Serva från tjänsten valdes bort.',
      techDetails: 'schema_org/compiler.py → JSON-LD → GCS-bucket → CDN.',
    },
  },
  {
    id: 'probe-engines',
    label: 'Probe-motorer',
    sub: `${PROBE_CLAUDE_MODEL} + ${PROBE_GEMINI_MODEL} (Vertex EU)`,
    color: 'nodeOrange',
    detail: {
      description: 'De AI-motorer riktiga användare möter. Mäter Share of Voice, sentiment och paritet.',
      whyChosen: 'Måste mäta verkliga, användarvända motorer.',
      alternatives: 'Bara EU-motorer valdes bort — mäter inte verkligheten.',
      techDetails: 'Publik payload (bolagsnamn + generisk fråga) → avsiktligt utanför EU-grinden.',
    },
  },
];

// Integrationspunkter mellan spåren (renderas som klickbara kort).
export const DIAGRAM_INTERACTIONS: Interaction[] = [
  {
    id: 'chat-live',
    from: 'ai-chat',
    to: 'graph-api',
    label: 'AI-chatt → graph-api (live)',
    detail:
      'I graf-läge hämtar ai_chat.py LIVE-data via GRAPH_API_URL: GET /api/clients + GET /api/connectors. Assistenten ser bara Geogiraph-kunder/connectors och kan aldrig läcka Insiders-kunder.',
  },
  {
    id: 'shared-frontend',
    from: 'frontend',
    to: 'graph-api',
    label: 'Frontend → graph-api (graphFetch)',
    detail:
      'Geogiraph-vyerna (/insider-graph/*) pratar direkt med graph-api via graphFetch (x-api-key, NEXT_PUBLIC_GRAPH_API_URL). Insiders-vyerna pratar med insiders-api.',
  },
  {
    id: 'product-scope',
    from: 'insiders-api',
    to: 'graph-api',
    label: 'Produktscope (delad admin)',
    detail:
      'Den delade admin-arbetsytan (Ärenden/Filer/Agent) lever i insiders-api med en product-kolumn ("the-insiders" | "insider-graph") som isolerar data per spår. Riktningen är enkelriktad: insiders-api läser från graph-api, aldrig tvärtom.',
  },
];

/* ------------------------------------------------------------------ */
/* Den slutna loopen — Geogiraphs mät → recept → leverera → mät-cykel  */
/* ------------------------------------------------------------------ */
// Renderas som en numrerad cykel i Loop-fliken. Steg 8 sluter tillbaka
// till steg 1. Kärnprincip (se ADR-008): systemet MÄTER, FÖRESLÅR och
// VERIFIERAR automatiskt, men operatören GODKÄNNER och PUBLICERAR det
// faktiska innehållet — inga claims fabriceras för att täcka ett gap.
export const CLOSED_LOOP_STEPS: LoopStep[] = [
  {
    id: 'measure-gap',
    num: 1,
    actor: 'System',
    color: 'nodeGreen',
    label: 'Mät gapet',
    sub: 'compute_trust_gap',
    detail: {
      what:
        'Jämför per dimension vad kunden SÄGER (declared), kan BELÄGGA (demonstrated) och hur AI UPPFATTAR det (perceived). Sex flaggor kan tändas: over_claim, opportunity, missing_evidence, contradiction, persona_mismatch, factual_drift.',
      who: 'Automatiskt. Schemalagt jobb (veckovis polling).',
      where: 'jobs/compute_trust_gap.py · _detect_flags()',
      output: 'En lista flaggor per dimension → matar receptmotorn.',
    },
  },
  {
    id: 'generate-recipe',
    num: 2,
    actor: 'System',
    color: 'nodeOrange',
    label: 'Generera recept',
    sub: 'Receptmotor · Lager A/B/C',
    detail: {
      what:
        'Lager A (regler): ett låst skelett per gap-typ — kanal, åtgärdstyp, förväntad metrik. Lager B (LLM): Gemini på Vertex EU detaljerar skelettet och pekar ut VILKA befintliga claims som ska aktiveras — får aldrig ändra strategin (valideringsgrind förkastar otillåten kanal). Lager C: sparas idempotent (id = hash av gap-typ + dimension).',
      who: 'Automatiskt. Triggas i kedjan extract_claims → compile_schema → POST /api/recipes/{client_id}/generate.',
      where: 'services/gap_recipes.py · gap_recipes_llm.py · recipes.py',
      output: "Ett recept i status 'pending'.",
    },
  },
  {
    id: 'surface-cockpit',
    num: 3,
    actor: 'Operatör',
    color: 'nodePurple',
    label: 'Förslag i cockpit',
    sub: 'AI-synlighet → TrustGapCockpit',
    detail: {
      what:
        'Receptet dyker upp för OPERATÖREN (byrån/ops) — inte kunden. Visar varför, konkret åtgärd, prioriterad kanal, framgångskriterium, vilka proof points och risker.',
      who: 'Människa läser. Status-badge: Förslag / Godkänt / Publicerat / Verifierat / Avfärdat.',
      where: 'frontend polling/page.tsx · TrustGapCockpit · GET /api/recipes/{client_id}',
      output: 'Operatören väljer: godkänn eller avfärda.',
    },
  },
  {
    id: 'approve',
    num: 4,
    actor: 'Operatör',
    color: 'nodeCyan',
    label: 'Godkänn',
    sub: 'status → agreed',
    detail: {
      what: "Operatören accepterar förslaget. Avfärda i stället → 'dismissed' (terminalt).",
      who: 'Människa. Beslutet låser receptet — nya mätkörningar skriver inte över ett recept som lämnat pending.',
      where: 'POST /api/recipes/{client_id}/{recipe_id}/status',
      output: 'Klart att agera på.',
    },
  },
  {
    id: 'publish-external',
    num: 5,
    actor: 'Extern',
    color: 'nodeCyan',
    label: 'Publicera externt',
    sub: 'LinkedIn / press / attesterad uppladdning',
    detail: {
      what:
        'Operatören publicerar det FAKTISKA innehållet själv — systemet skriver inte texten. Receptet pekar bara ut vilka befintliga proof points som ska lyftas.',
      who: 'Människa, utanför verktyget. Inga claims fabriceras — hela poängen är att "demonstrated" måste vara sant.',
      where: 'Manuellt steg (LinkedIn-inlägg, pressrelease, dokument-upload).',
      output: 'Nytt verkligt innehåll ute i världen.',
    },
  },
  {
    id: 'mark-acted',
    num: 6,
    actor: 'Operatör',
    color: 'nodeBlue',
    label: 'Markera "acted"',
    sub: 'status → acted · intervention skapas',
    detail: {
      what:
        'När operatören markerar "acted" tar systemet en baseline-snapshot av gapet (declared, demonstrated, valence, salience, öppna flaggor) och öppnar en intervention.',
      who: 'Operatör klickar; systemet snapshotar automatiskt (idempotent id = hash av recipe_id + acted_at).',
      where: 'services/interventions.py · create_for_acted_recipe()',
      output: "Intervention i status 'open' — mätningen av effekten börjar.",
    },
  },
  {
    id: 'harvest-deliver',
    num: 7,
    actor: 'System',
    color: 'nodeBlue',
    label: 'Skörda claims + leverera',
    sub: 'extract_claims → JSON-LD',
    detail: {
      what:
        'Nästa körning skördar det nya, verkliga innehållet → blir riktiga claims → compile_schema projicerar in dem i leveransen: JSON-LD, profilsida och llms.txt på CDN.',
      who: 'Automatiskt. Samma claim-pipeline som vanligt — inget specialspår för recept.',
      where: 'jobs/extract_claims.py → compile_schema → schema_org/compiler.py → GCS/CDN',
      output: 'Uppdaterad publik kunskapsgraf som probe-motorerna kan läsa.',
    },
  },
  {
    id: 'verify-intervention',
    num: 8,
    actor: 'System',
    color: 'nodeGreen',
    label: 'Mät igen + verifiera',
    sub: 'verify_open() → days_to_close',
    detail: {
      what:
        'Efter nästa trust_gap-mätning klassas interventionen mot baseline: resolved_full / resolved_partial / regressed / no_change_yet. Vid stängning byggs en closure (valence_delta, demonstrated_delta, days_to_close) och receptet auto-verifieras.',
      who: 'Automatiskt. Sluter loopen tillbaka till steg 1 för nästa mätning.',
      where: 'services/interventions.py · verify_open() · _classify()',
      output: '↩ Tillbaka till steg 1 — kausalt spår: "stängde på N dagar".',
    },
  },
];

/* ------------------------------------------------------------------ */
/* Domänmoduler — per spår                                             */
/* ------------------------------------------------------------------ */

export const MODULES: ModuleNode[] = [
  /* ---- Insiders ---- */
  {
    id: 'kunder',
    emoji: '🏢',
    name: 'Kunder',
    track: 'insiders',
    description: 'Kundregister med ICP, taggar, anteckningar och mätbara mål.',
    frontend: 'src/app/kunder',
    backend: 'routers/customers.py, routers/notes.py',
    apiRoutes: ['GET /api/customers', 'POST /api/customers', 'POST /api/customers/{id}/notes'],
    deps: ['Postgres'],
    moduleUses: [{ id: 'moduler', via: 'CustomerGoal kan länka en KPI-modul' }],
  },
  {
    id: 'kallor',
    emoji: '📥',
    name: 'Källor',
    track: 'insiders',
    description: 'Versionerade rapporttyper. SourceField är stabilt; kolumnnamn mappas per version.',
    frontend: 'src/app/sources',
    backend: 'routers/sources.py',
    apiRoutes: ['GET /api/sources', 'POST /api/sources/{id}/versions', 'GET /api/sources/{id}/fields'],
    deps: ['Postgres'],
    moduleUses: [],
  },
  {
    id: 'datasets',
    emoji: '📊',
    name: 'Dataset',
    track: 'insiders',
    description: 'Uppladdade filer normaliserade till rader. AI-sammanfattning + periodspårning.',
    frontend: 'src/app/kunder/[id]',
    backend: 'routers/datasets.py, ai.py',
    apiRoutes: ['POST /api/datasets', 'GET /api/datasets/{id}'],
    deps: ['Postgres', 'Gemini', 'Pandas'],
    moduleUses: [{ id: 'kallor', via: 'normaliserar rader mot SourceField/version' }],
  },
  {
    id: 'moduler',
    emoji: '🧩',
    name: 'Moduler / KPI',
    track: 'insiders',
    description: 'KPI-moduler som formler mot SourceField. Tröskelvärden + insiktsmallar.',
    frontend: 'src/app/moduler, src/app/engine',
    backend: 'routers/modules.py, formula.py',
    apiRoutes: ['GET /api/modules', 'POST /api/modules/{id}/evaluate'],
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
    track: 'insiders',
    description: 'Sparade vyer som kombinerar moduler och kunder. Dashboard + LinkedIn-export.',
    frontend: 'src/app/rapporter',
    backend: 'routers/reports.py, routers/dashboard.py',
    apiRoutes: ['GET /api/reports', 'GET /api/dashboard'],
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
    track: 'insiders',
    description: 'Delad assistent som växlar kontext per produkt och hämtar live Geogiraph-data i graf-läge.',
    frontend: 'src/components/AIAssistant.tsx',
    backend: 'routers/ai_chat.py',
    apiRoutes: ['POST /api/ai-chat', 'GET /api/ai-chat/{session_id}'],
    deps: ['Postgres', 'Gemini', 'graph-api'],
    moduleUses: [
      { id: 'kunder', via: 'kundkontext (Insiders-läge)' },
      { id: 'rapporter', via: 'läser dashboard-data' },
    ],
  },
  {
    id: 'agent',
    emoji: '🤖',
    name: 'AI-agent (admin)',
    track: 'insiders',
    description: 'Sessioner + uppgiftskö för den externa Claude-agenten, scopad per produkt.',
    frontend: 'src/app/api/admin/agent, src/lib/agent-store.ts',
    backend: 'routers/agent.py',
    apiRoutes: ['GET /api/admin/agent/status', 'POST /api/admin/agent'],
    deps: ['Postgres', 'Claude-agent'],
    moduleUses: [],
  },
  /* ---- Geogiraph ---- */
  {
    id: 'onboarding',
    emoji: '🚀',
    name: 'Onboarding',
    track: 'geogiraph',
    description: 'Skapar kund + anställda (noder) i Firestore och startar första insamlingen.',
    frontend: 'src/app/insider-graph/kunder',
    backend: 'routers/onboard.py, services/discovery.py, services/ingest.py',
    apiRoutes: ['POST /api/onboard', 'GET /api/clients'],
    deps: ['Firestore'],
    moduleUses: [{ id: 'connectors', via: 'aktiverar connectors för kunden' }],
  },
  {
    id: 'connectors',
    emoji: '🔌',
    name: 'Connectors',
    track: 'geogiraph',
    description: 'Pluggbara källor: LinkedIn (Bright Data), RSS, webbsajt, jobbflöde (ATS), GLEIF, LinkedIn-kapacitet.',
    frontend: 'src/app/insider-graph/connectors',
    backend: 'routers/connectors_router.py, connectors/*',
    apiRoutes: ['GET /api/connectors', 'POST /api/connectors/{client_id}'],
    deps: ['Firestore', 'Bright Data'],
    moduleUses: [],
  },
  {
    id: 'insamling',
    emoji: '🕷️',
    name: 'Insamling',
    track: 'geogiraph',
    description: 'Skrapar källor (bolagsnivå + webbsajt) till raw_items. Cadence-skydd + relevansfilter.',
    frontend: '—',
    backend: 'jobs/scrape_*.py, services/web_crawl.py, services/brightdata.py',
    apiRoutes: ['POST /api/jobs/scrape-active'],
    deps: ['Firestore', 'Bright Data'],
    moduleUses: [{ id: 'connectors', via: 'kör connector-scrapes' }],
  },
  {
    id: 'claims',
    emoji: '🧾',
    name: 'Claim-extraktion',
    track: 'geogiraph',
    description: 'Fritext → narrativa claims med provenience. Generator + validator via Vertex EU.',
    frontend: 'src/app/insider-graph/review',
    backend: 'jobs/extract_all_claims.py, services/claim_extraction.py',
    apiRoutes: ['GET /api/review/{client_id}/claims'],
    deps: ['Firestore', 'Vertex EU'],
    moduleUses: [
      { id: 'insamling', via: 'läser raw_items' },
      { id: 'grounding', via: 'deterministisk källvalidering' },
      { id: 'review', via: 'låg confidence → granskning' },
    ],
  },
  {
    id: 'grounding',
    emoji: '⚓',
    name: 'Källgrind (anti-hallucination)',
    track: 'geogiraph',
    description: 'Deterministisk validering: citerade spann + numerisk närvaro. Ingen LLM — agenten hittar aldrig på data.',
    frontend: '—',
    backend: 'services/claim_grounding.py',
    apiRoutes: [],
    deps: ['Firestore'],
    moduleUses: [],
  },
  {
    id: 'compiler',
    emoji: '🧬',
    name: 'Schema-kompilering',
    track: 'geogiraph',
    description: 'Validerade claims → schema.org JSON-LD (Organization-rot, Person/Event/JobPosting, Claim→isBasedOn→source).',
    frontend: '—',
    backend: 'jobs/compile_all_schemas.py, schema_org/compiler.py',
    apiRoutes: ['POST /api/jobs/compile'],
    deps: ['Firestore', 'CDN'],
    moduleUses: [{ id: 'claims', via: 'kompilerar validerade claims' }],
  },
  {
    id: 'leverans',
    emoji: '📡',
    name: 'Leverans / CDN',
    track: 'geogiraph',
    description: 'Publicerar JSON-LD, profilsida och badge. Kunden injicerar identitets-snippet via GTM.',
    frontend: 'src/app/insider-graph/leverans',
    backend: 'routers/delivery.py, schema_org/profile_page.py, schema_org/badge.py',
    apiRoutes: ['GET /api/delivery/{client_id}', 'GET /api/badge/{client_id}'],
    deps: ['CDN'],
    moduleUses: [{ id: 'compiler', via: 'publicerar kompilerad graf' }],
  },
  {
    id: 'polling',
    emoji: '🛰️',
    name: 'AI-synlighet',
    track: 'geogiraph',
    description: 'Mäter Share of Voice, sentiment och paritet veckovis mot probe-motorerna.',
    frontend: 'src/app/insider-graph/polling',
    backend: 'jobs/polling_weekly.py, services/polling.py',
    apiRoutes: ['GET /api/polling/{client_id}'],
    deps: ['Firestore', 'Probe-motorer'],
    moduleUses: [{ id: 'leverans', via: 'mäter publicerad närvaro' }],
  },
  {
    id: 'risk',
    emoji: '⚠️',
    name: 'GEO-riskloop',
    track: 'geogiraph',
    description: 'Genererar persona-frågor, kör blint mot probe-motorer, klassar skador → findings + korrigerande claims.',
    frontend: 'src/app/insider-graph/review',
    backend: 'services/risk_detector.py, services/risk_corrector.py, services/monthly_report.py',
    apiRoutes: ['GET /api/review/{client_id}/risks'],
    deps: ['Firestore', 'Vertex EU', 'Probe-motorer'],
    moduleUses: [
      { id: 'polling', via: 'probe-motorer mäter risk' },
      { id: 'review', via: 'findings → granskning' },
    ],
  },
  {
    id: 'esg',
    emoji: '🌱',
    name: 'ESG & CSRD-audit',
    track: 'geogiraph',
    description: 'Blind skanning av ESRS E/S/G-frågor → omissions-/ryktesrisk; kundverifierad data → korrigerande claims.',
    frontend: 'src/app/insider-graph/esg/[client_id]',
    backend: 'routers/esg.py, services/esg_scanner.py, services/esg_ingestion.py, services/esrs_mapping.py',
    apiRoutes: ['GET /api/esg/{client_id}/status', 'POST /api/esg/enable'],
    deps: ['Firestore', 'Vertex EU', 'Probe-motorer'],
    moduleUses: [{ id: 'review', via: 'ESG-findings → granskning' }],
  },
  {
    id: 'review',
    emoji: '🔎',
    name: 'Granskning',
    track: 'geogiraph',
    description: 'Ops godkänner/avvisar låg-confidence-claims och risk-/ESG-findings innan de når output.',
    frontend: 'src/app/insider-graph/review',
    backend: 'routers/review.py',
    apiRoutes: ['POST /api/review/{client_id}/claims', 'POST /api/review/{client_id}/risks'],
    deps: ['Firestore'],
    moduleUses: [],
  },
];

// Manuella positioner per spår (ingen autolayout).
export const MODULE_POSITIONS_INSIDERS: Record<string, [number, number]> = {
  kallor: [40, 40],
  kunder: [520, 40],
  datasets: [40, 165],
  moduler: [280, 165],
  rapporter: [520, 165],
  aichat: [280, 290],
  agent: [520, 290],
};
export const GRAPH_VIEWBOX_INSIDERS = { w: 680, h: 380 };

export const MODULE_POSITIONS_GEOGRAPH: Record<string, [number, number]> = {
  onboarding: [40, 30],
  connectors: [300, 30],
  insamling: [300, 130],
  review: [40, 250],
  claims: [300, 250],
  grounding: [560, 250],
  compiler: [300, 360],
  leverans: [300, 470],
  polling: [560, 470],
  risk: [560, 360],
  esg: [560, 140],
};
export const GRAPH_VIEWBOX_GEOGRAPH = { w: 720, h: 560 };

/* ------------------------------------------------------------------ */
/* ADRs                                                                */
/* ------------------------------------------------------------------ */

export const ADRS: Adr[] = [
  {
    id: 'adr-001',
    title: 'Två spår, två backends, två datalager',
    date: '2026-05',
    status: 'Aktiv',
    context:
      'The Insiders (KPI/LinkedIn-analys) och Geogiraph (AI-synlighet/GEO) är olika produktmodeller med olika datakarakteristik — relationell KPI-data vs heterogen claim-/grafdata.',
    decision:
      'Separata Cloud Run-tjänster: insiders-api (Postgres) och insider-graph-api (Firestore). Delad Next.js-frontend och delad inloggning. Integration sker enkelriktat via API (insiders-api läser från graph-api).',
    consequences:
      'Ren separation och oberoende deploy. Men ingen DB-join mellan spåren — all korsdata går via HTTP, och chatten måste hämta Geogiraph-data live.',
    revisitWhen: 'Om produkterna behöver delade rapporter som kräver en gemensam datamodell.',
  },
  {
    id: 'adr-002',
    title: 'Delad AI-chatt hämtar Geogiraph-data live i graf-läge',
    date: '2026-05',
    status: 'Aktiv',
    context:
      'Assistenten är delad men får aldrig blanda spåren — den ska inte visa Insiders-kunder när användaren är i Geogiraph-läge.',
    decision:
      'ai_chat.py växlar kunskap på page_context ("graph_*") och hämtar då LIVE Geogiraph-kunder/connectors via GRAPH_API_URL (/api/clients + /api/connectors). Faller aldrig tillbaka på Postgres-kunder.',
    consequences:
      'Korrekt, icke-läckande kontext och alltid färsk data. Men chatten beror på att graph-api svarar; vid avbrott visas tom lista hellre än fel spår.',
    revisitWhen: 'Om kontextväxlingen blir för spröd eller graph-api-latensen stör chattupplevelsen.',
  },
  {
    id: 'adr-003',
    title: 'EU-only dataresidens — resonemang via Vertex AI EU',
    date: '2026-05',
    status: 'Aktiv',
    context:
      'Geogiraph bearbetar kunddata med LLM:er. Hårt EU-only-krav gäller. Claude är inte EU-resident via Anthropics förstapart.',
    decision:
      `Resonemangsmodeller (generator ${GEO_GENERATOR_MODEL}, validator/reasoner ${GEO_VALIDATOR_MODEL}) körs ENBART via Vertex AI i europe-west1 med service account-auth. ESG-resonemang använder Gemini eftersom Claude saknar EU-residens. Ingen förstaparts-US-väg finns kvar i koden.`,
    consequences:
      'Kunddata stannar i EU utan API-nycklar att rotera. Men modellvalet begränsas till vad som faktiskt serveras i EU-regionen.',
    revisitWhen: 'När nyare modeller (t.ex. Gemini 3.x eller Claude) blir EU-resident-tillgängliga på Vertex.',
  },
  {
    id: 'adr-004',
    title: 'Probe-motorer via Vertex AI — samma modeller, en auth-väg (uppdaterad 2026-06)',
    date: '2026-06',
    status: 'Aktiv',
    context:
      `AI-synlighet och risk måste mätas mot de modeller riktiga användare faktiskt möter (${PROBE_CLAUDE_MODEL}, ${PROBE_GEMINI_MODEL}). Den första versionen körde direkt mot OpenAI/Gemini-API:erna med separata nycklar, vilket gav återkommande "Connection error" och "Illegal header value" på grund av whitespace-förorenade hemligheter.`,
    decision:
      `Probe-motorerna körs via Vertex AI sedan 2026-06-02: Gemini via ChatVertexAI, Claude via ChatAnthropicVertex (Model Garden). Modellerna är identiska med vad publika API:erna serverar — Vertex är leveransvägen, inte ett annat modellbygge. Vinster: gemensam service account-auth, EU-residency även för probe-trafik, ingen nyckel-rotation. OpenAI direkt-spåret är parkerat (kan återinföras som planerad motor).`,
    consequences:
      'En auth-väg för all LLM-trafik. Mätningen speglar fortfarande verkligheten eftersom modell-weights är desamma. Förutsätter att Claude är enabled i projektets Vertex Model Garden.',
    revisitWhen: 'Om Vertex Model Garden tar bort Claude, om OpenAI öppnar en motsvarande Vertex-väg, eller om probe-frågor någonsin behöver innehålla icke-publik kunddata.',
  },
  {
    id: 'adr-005',
    title: 'Deterministisk källgrind mot hallucination',
    date: '2026-05',
    status: 'Aktiv',
    context:
      'En kunskapsgraf som publiceras externt får inte innehålla påhittade siffror eller citat.',
    decision:
      'claim_grounding.py validerar varje claim deterministiskt (citerade spann måste finnas i källan; siffror måste vara närvarande) — utan LLM. Låg-confidence-claims går till manuell granskning innan de inkluderas.',
    consequences:
      'Hög tillförlitlighet i publicerad data. Men strikt grindning kan filtrera bort korrekta claims som formulerats om för fritt.',
    revisitWhen: 'Om för många giltiga claims fastnar i grinden och kräver manuell granskning.',
  },
  {
    id: 'adr-006',
    title: 'Geogiraph-pipeline som schemalagda Cloud Run Jobs',
    date: '2026-05',
    status: 'Aktiv',
    context: 'Skrapning, extraktion, kompilering och mätning är tung batch som inte ska blockera API:t.',
    decision:
      'Pipelinen körs som Cloud Run Jobs (scrape-*, extract-all-claims, compile-all-schemas, polling-weekly, xml-sync, sunset-skills, quarterly-todo) via Cloud Scheduler + Eventarc. Alla jobb byggs ur samma image; graph-api-bygget uppdaterar jobb-images.',
    consequences:
      'Frikopplad, skalbar batch. Men nya jobb kräver BÅDE gcloud-create OCH cloudbuild-loopen — lätt att glömma ett av stegen.',
    revisitWhen: 'Om jobb-orkestreringen växer ur Scheduler/Eventarc (t.ex. beroendekedjor mellan jobb).',
  },
  {
    id: 'adr-007',
    title: 'Moduler binder mot stabila SourceField (Insiders)',
    date: '2026-04',
    status: 'Aktiv',
    context:
      'LinkedIn-rapporternas kolumnrubriker ändras mellan exporter. Band mot kolumnnamn skulle knäcka KPI:erna.',
    decision:
      'Moduler refererar SourceField.id. Vid rapportändring läggs en ny SourceVersion med uppdaterade SourceFieldMapping-rader. Modulerna fortsätter fungera.',
    consequences: 'Ett extra mappningslager, men robusthet mot kolumnbyten och bevarad historik.',
    revisitWhen: 'Om en källa byter datapunkter helt så gamla SourceField saknar motsvarighet.',
  },
  {
    id: 'adr-008',
    title: 'Sluten loop: mät → recept → publicera → mät — men aldrig auto-fabricerade claims',
    date: '2026-06',
    status: 'Aktiv',
    context:
      'Geogiraph mäter ett förtroendegap (declared vs demonstrated vs perceived). Mätning utan åtgärd ger ingen förbättring. Samtidigt får systemet ALDRIG hitta på claims för att täcka ett gap — då tappar "demonstrated" sin mening och hela trovärdigheten i den publicerade grafen faller.',
    decision:
      'Receptmotorn (Lager A regler + B LLM på Vertex EU + C persistens) föreslår åtgärder och pekar ut BEFINTLIGA proof points, men en operatör godkänner och publicerar det faktiska innehållet externt. Först när operatören markerar "acted" öppnas en intervention som mäter om gapet stängdes och auto-verifierar receptet. Hela cykeln visualiseras i Loop-fliken.',
    consequences:
      'Human-in-the-loop: systemet auto-detekterar, föreslår och verifierar; människan beslutar och publicerar. Varje åtgärd får ett kausalt spår (days_to_close). Nackdel: takten begränsas av operatörens publiceringscykel, och perceptionstalen är gatade tills probe-kalibreringen (Fas 2.2) är klar.',
    revisitWhen:
      'Om vi vill auto-utkasta innehåll (fortfarande bakom mänsklig gate), eller när probe-kalibreringen är klar och perceptions-deltan blir skarpa.',
  },
];

/* ------------------------------------------------------------------ */
/* Designsystem                                                        */
/* ------------------------------------------------------------------ */

export const COLOR_TOKENS: ColorToken[] = [
  { name: 'Bakgrund', token: '--brand-bg', value: '#0f111a', note: 'App-bakgrund (Insiders, mörk)' },
  { name: 'Panel', token: '--brand-panel', value: '#1e212b', note: 'Kort och paneler' },
  { name: 'Panel hover', token: '--brand-panel-hover', value: '#262936', note: 'Hover-yta' },
  { name: 'Accent', token: '--brand-accent', value: '#00d4ff', note: 'Insiders cyan — CTA/aktiv' },
  { name: 'Accent ljus', token: '--brand-accent-bright', value: '#00f2fe', note: 'Glow/highlight' },
  { name: 'Success', token: '--brand-success', value: '#22c55e', note: 'OK-status' },
  { name: 'Warning', token: '--brand-warning', value: '#f59e0b', note: 'Varning' },
  { name: 'Danger', token: '--brand-danger', value: '#ef4444', note: 'Fel/nedstatus' },
  { name: 'Geogiraph-accent', token: '--brand-purple', value: '#b14ef4', note: 'Geogiraph-spårets lila (~#9f51b6 i graf-vyer)' },
  { name: 'Blue', token: '--brand-blue', value: '#3b82f6', note: 'Sekundär diagramfärg' },
  { name: 'Text', token: '--brand-text', value: '#ffffff', note: 'Primär text (mörkt tema)' },
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
    title: 'Två teman, ett tokensystem',
    body: 'Insiders kör mörkt tema med cyan accent; Geogiraph-vyerna scopar ett ljust tema (off-white, lila accent) i sin layout.tsx. Båda bygger på --brand-*-tokens.',
  },
  {
    title: 'Inga hårdkodade hex',
    body: 'Färger kommer från --brand-*-tokens i globals.css. Enda undantaget är COLOR_TOKENS-datan här, som visar själva värdena.',
  },
  {
    title: 'Inter Tight, tajt rubriktracking',
    body: 'Rubriker: vikt 600, letter-spacing -0.02em. Brödtext: vikt 400, line-height 1.5em.',
  },
  {
    title: 'Produktaccent signalerar spår',
    body: 'Cyan = The Insiders, lila = Geogiraph. Sidebar, ProductSwitcher och aktiva tillstånd följer aktivt spår.',
  },
];

export const CODE_EXAMPLES: { title: string; code: string }[] = [
  { title: 'Primär CTA', code: '<button className="brand-btn-primary">Spara</button>' },
  { title: 'Glaspanel', code: '<div className="brand-glass-panel" style={{ padding: 16 }}>…</div>' },
  { title: 'Token i CSS', code: 'color: var(--brand-muted);\nborder: 1px solid var(--brand-border);' },
];

/* ------------------------------------------------------------------ */
/* Live — Postgres-schema (fallback) + Firestore-collections + ordlista */
/* ------------------------------------------------------------------ */

// Hårdkodad fallback för schema-browsern. page.tsx försöker först parsa
// backend/models.py från disk; i containern finns inte filen → denna används.
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
      { name: 'platform', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
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
    ],
  },
  {
    name: 'Dataset',
    table: 'datasets',
    domain: 'Dataset',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'customer_id', type: 'String', optional: false, isList: false, isRelation: true, hasDefault: false },
      { name: 'sha256', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'ai_summary', type: 'Text', optional: false, isList: false, isRelation: false, hasDefault: true },
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
      { name: 'formula_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
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
      { name: 'config_json', type: 'JSON', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
  {
    name: 'Issue',
    table: 'issues',
    domain: 'Admin (delad)',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'product', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'status', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
    ],
  },
  {
    name: 'AgentSession',
    table: 'agent_sessions',
    domain: 'Admin (delad)',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'product', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'tasks', type: 'AgentTask', optional: false, isList: true, isRelation: true, hasDefault: false },
    ],
  },
  {
    name: 'AIChatMessage',
    table: 'ai_chat_messages',
    domain: 'AI-assistent',
    fields: [
      { name: 'id', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: true },
      { name: 'role', type: 'String', optional: false, isList: false, isRelation: false, hasDefault: false },
      { name: 'page_context', type: 'String', optional: true, isList: false, isRelation: false, hasDefault: false },
    ],
  },
];

// Geogiraphs Firestore är schemalöst — vi listar collections som referens.
export const FIRESTORE_COLLECTIONS: FirestoreCollection[] = [
  {
    path: 'clients/{client_id}',
    description: 'Kund/organisation. Aktiva connectors, tier, profil-URL, ESG-flagga.',
    fields: ['company_name', 'company_linkedin_url', 'lei', 'active_connectors', 'settings', 'tier', 'esg_audit_enabled'],
  },
  {
    path: 'clients/{id}/employees/{employee_id}',
    description: 'Anställd som nod (manuellt registrerade personer per kund).',
    fields: ['name', 'linkedin_url', 'title', 'gender', 'opted_out'],
  },
  {
    path: '…/raw_items/{item_id}',
    description: 'Oprocessad källdata per nod (connector-output).',
    fields: ['schema_type', 'url', 'published_at', 'content', 'confidence', 'extra'],
  },
  {
    path: 'clients/{id}/claims/{claim_id}',
    description: 'Narrativa/egenskaps-claims med provenience och granskningsstatus.',
    fields: ['claim_kind', 'predicate', 'value', 'statement', 'source[]', 'confidence', 'needs_review', 'review_status'],
  },
  {
    path: 'clients/{id}/polling_results/{week_id}',
    description: 'Veckovis AI-synlighet: Share of Voice, sentiment, paritet.',
    fields: ['share_of_voice', 'sentiment_score', 'parity_index', 'category_results', 'models_used', 'raw_responses'],
  },
  {
    path: 'clients/{id}/risk_findings/{finding_id}',
    description: 'GEO-riskloopens fynd per persona/motor med skadeklass.',
    fields: ['persona', 'question', 'engine', 'harm', 'severity', 'status'],
  },
  {
    path: 'clients/{id}/esg_findings/{finding_id}',
    description: 'ESG/CSRD-skanningens fynd per ESRS-pelare.',
    fields: ['pillar', 'question', 'engine', 'severity', 'status'],
  },
  {
    path: 'clients/{id}/linkedin_snapshots/{id}',
    description: 'Kvartalsvis LinkedIn-kapacitet (aggregerat, ingen PII).',
    fields: ['skills[]', 'quarter', 'followers', 'status', 'verified_at'],
  },
];

export const GLOSSARY: GlossaryItem[] = [
  // Delat / arkitektur
  { term: 'Spår', def: 'De två produktlinjerna: The Insiders (KPI/LinkedIn-analys) och Geogiraph (AI-synlighet/GEO).' },
  { term: 'Graf-läge', def: 'När frontend/chatt är i Geogiraph-kontext (pathname /insider-graph eller page_context "graph_*").' },
  { term: 'GRAPH_API_URL', def: 'Env-var i insiders-api som pekar på insider-graph-api; används för live-hämtning av kunder/connectors i chatten.' },
  { term: 'Produktscope', def: '"the-insiders" | "insider-graph" — kolumn på Issue/AgentSession/AdminFile som isolerar admin-data per spår.' },
  // Insiders
  { term: 'SourceField', def: 'Stabil datapunkt (t.ex. impressions) som KPI-moduler binder mot. Lever över rapportversioner.' },
  { term: 'Modul (KPI)', def: 'Ett mätetal definierat som en formel mot SourceField via ModuleFieldRef-alias.' },
  // Geogiraph
  { term: 'Personprofil-uppladdning', def: 'Bolaget skickar PDF/text med biografier på de personer som ska synliggöras. Replace-mode i attested-uppladdningen — enkelt att rensa.' },
  { term: 'Claim', def: 'Ett påstående med provenience (källa, confidence). Narrativt eller egenskaps-baserat; grindas mot källan.' },
  { term: 'Källgrind', def: 'Deterministisk validering (citat + siffror måste finnas i källan) som stoppar hallucinerad data.' },
  { term: 'JSON-LD / schema.org', def: 'Det maskinläsbara format kunskapsgrafen kompileras till och publiceras via CDN/GTM.' },
  { term: 'Share of Voice', def: 'Andel AI-svar som nämner bolaget/medarbetarna i en kategori — kärnan i AI-synlighet.' },
  { term: 'Paritetsindex', def: 'Andel kvinnor bland personer som AI rekommenderar — jämställdhetsmått i polling.' },
  { term: 'Probe-motor', def: `De AI-motorer (${PROBE_CLAUDE_MODEL} via Vertex Model Garden, ${PROBE_GEMINI_MODEL} via Vertex AI EU) som mätningarna körs mot — modellerna speglar vad användare möter, leveransvägen är Vertex.` },
  { term: 'ESRS', def: 'EU:s hållbarhetsrapporteringsstandard (E/S/G-pelare) som ESG-auditens frågor mappas mot.' },
  { term: 'Vertex AI EU', def: 'Google-plattform i europe-west1 där alla resonemangsmodeller (Gemini/Claude) körs — EU-residens.' },
  { term: 'Staging', def: 'insiders-frontend/-api/-graph-api på Cloud Run — miljön där vi verifierar allt som pushas till main.' },
];

/* ------------------------------------------------------------------ */
/* Miljöer (Live-status)                                               */
/* ------------------------------------------------------------------ */

export const ENVIRONMENTS = {
  frontend: 'https://insiders-frontend-815335042776.europe-north1.run.app',
  api: 'https://insiders-api-815335042776.europe-north1.run.app',
  graph: 'https://insider-graph-api-815335042776.europe-north1.run.app',
};
