'use client';

import { graphColors as C } from '../_components/GraphPageShell';
import {
  PROBE_CLAUDE_MODEL,
  PROBE_GEMINI_MODEL,
  PROBE_OPENAI_MODEL,
  PROBE_MISTRAL_MODEL,
  PROBE_PERPLEXITY_MODEL,
  MODEL_REGISTRY,
  type KnowledgeSource,
} from '@/lib/aiModels';

// Mappar varje probe model_id → "training" (bas-kunskap, RLHF) eller "web_rag"
// (live-signal, Perplexity etc). Driver UI-grupperingen i AI-synlighet så vi
// aldrig medeltala över olika fördelningar. Default "training" om id saknas.
// Legacy kort-namn ('perplexity', 'sonar') ingår explicit eftersom historiska
// polling-veckor sparades med dem före model_registry-flytten.
export const ENGINE_KNOWLEDGE_SOURCE: Record<string, KnowledgeSource> = {
  ...Object.fromEntries(
    MODEL_REGISTRY.filter((e) => e.role.startsWith('probe_'))
      .map((e) => [e.modelId, e.knowledgeSource ?? 'training']),
  ),
  perplexity: 'web_rag',
  sonar: 'web_rag',
};

export function knowledgeSourceFor(engineId: string): KnowledgeSource {
  return ENGINE_KNOWLEDGE_SOURCE[engineId] ?? 'training';
}

// Beräknar per-source-type-aggregat över ett urval engine-rader. Säkrar att vi
// rapporterar SoV och sentiment per source-typ utan att medeltala över olika
// fördelningar (training kontra web_rag). Vi summerar mention/answer-räknarna
// och re-deriverar, snarare än att medeltala redan-normaliserade SoV-värden.
export function aggregateEnginesBySource(
  engineEntries: [string, EngineResult][],
  source: KnowledgeSource,
) {
  const engines = engineEntries.filter(([eng]) => knowledgeSourceFor(eng) === source);
  let mentions = 0;
  let answers = 0;
  let sentSum = 0;
  let sentWeight = 0;
  for (const [, r] of engines) {
    mentions += r.mention_count;
    answers += r.answer_count;
    if (r.sentiment_score != null && r.answer_count > 0) {
      sentSum += r.sentiment_score * r.answer_count;
      sentWeight += r.answer_count;
    }
  }
  return {
    engines,
    mentions,
    answers,
    sov: answers > 0 ? mentions / answers : null,
    sentiment: sentWeight > 0 ? sentSum / sentWeight : null,
  };
}

// --- Riskloopens render-modell (speglar services/monthly_report.py) ---

// Kanonisk vokabulär (delad med backend services/audience_personas.py).
// Etiketterna behålls beslutskontext-anpassade (Köpare/Kandidat) även om id:t
// är customer/employee — samma målgrupp, risk-lins.
export type Persona = 'customer' | 'employee' | 'investor';

export const PERSONA_SV: Record<string, string> = {
  customer: 'Köpare',
  employee: 'Kandidat',
  investor: 'Investerare',
};

export const HARM_SV: Record<string, string> = {
  '#1': 'Förväxling',
  '#2': 'Inaktuellt negativ',
  '#3': 'Hallucinerat negativ',
  '#4': 'Konkurrentförskjutning',
  '#5': 'Skadlig tystnad',
  '#6': 'Negativ inramning',
};

// Måste matcha GEO_STAGES + CONFIDENCE_CEILING i backend.
export const GEO_STAGES: [number, string][] = [
  [0, 'Tidigt läge'],
  [40, 'På väg'],
  [60, 'God grund'],
  [75, 'Stark'],
  [90, 'Mycket stark'],
];

export type DecisionConfidence = {
  score: number | null;
  stage: string;
  headroom: number | null;
  answers: number;
  safe: number;
  covered_personas: number;
  ceiling: number;
  next_step: string;
};

export type PersonaExposure = { weighted: number; answers: number; score: number | null };

export type Finding = {
  persona: string | null;
  question: string | null;
  engine: string | null;
  harm: string | null;
  severity: 'high' | 'medium' | 'low' | null;
  engine_excerpt: string | null;
  status: string;
  via_follow_up: boolean;
};

export type Action = {
  persona: string | null;
  question: string | null;
  harm: string | null;
  action_taken: string | null;
  ammo_claim_ids: string[];
  action_at: string | null;
};

export type Trend = {
  previous_month: string | null;
  previous_score: number | null;
  delta: number | null;
  resolved_count: number;
  series: { month: string; score: number | null }[];
};

export type Report = {
  month: string;
  company_name: string | null;
  is_draft: boolean;
  decision_confidence: DecisionConfidence;
  verdict: string;
  risk_exposure: {
    per_persona: Record<string, PersonaExposure>;
    total: PersonaExposure;
  };
  parity_index: number | null;
  strengths: string[];
  improvement_opportunities: string[];
  detected: Finding[];
  actions: Action[];
  resolved: { count: number; items: Finding[] };
  trend: Trend;
};

export type Client = { client_id: string; company_name: string | null };

// --- Veckovis polling (speglar routers/polling.py + services/polling.py) ---

export type CategoryResult = {
  share_of_voice: number;
  sentiment_score: number;
  answer_count: number;
  mention_count: number;
};

export type EngineResult = {
  share_of_voice: number;
  sentiment_score: number | null;
  answer_count: number;
  mention_count: number;
};

export type Competitor = {
  name: string;
  mentions: number;
  share: number;
};

export type PollingWeek = {
  week_id: string;
  share_of_voice: number | null;
  sentiment_score: number | null;
  parity_index: number | null;
  category_results: Record<string, CategoryResult> | null;
  category_competitors: Record<string, Competitor[]> | null;
  per_engine: Record<string, EngineResult> | null;
  total_answers: number | null;
  answers_with_mention: number | null;
  models_used: string[] | null;
};

// Backend returnerar id:n från services/model_registry (PROBE_CLAUDE_MODEL,
// PROBE_GEMINI_MODEL). När registret uppgraderas slipper denna mapping rivas — den
// följer med via konstanten. Legacy-ID:n från tidigare polling-veckor mappas också
// så historiska sparklines + risk-tidsserier inte tappar visningsnamn:
//   - 'gpt-4o' / 'gpt-5.5' = tidigare OpenAI-direkt probe (före Vertex-flytten)
//   - 'gemini-1.5-pro' / 'gemini-3.5-flash' = tidigare google_genai-probe
export const ENGINE_SV: Record<string, string> = {
  [PROBE_CLAUDE_MODEL]: 'Claude',
  [PROBE_GEMINI_MODEL]: 'Gemini',
  [PROBE_OPENAI_MODEL]: 'ChatGPT',
  [PROBE_MISTRAL_MODEL]: 'Mistral',
  [PROBE_PERPLEXITY_MODEL]: 'Perplexity',
  'gpt-4o': 'ChatGPT (legacy)',
  'gemini-1.5-pro': 'Gemini (legacy)',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
};

export const CATEGORY_SV: Record<string, string> = {
  affar: 'Affär',
  finans: 'Finans',
  innovation: 'Innovation',
  hr: 'HR',
};

// --- Kalibreringsbrytning (modellbyte mellan veckor) -----------------------
// När probe-motorerna byts (t.ex. gpt-4o → gpt-4.1, eller nya motorer tillkommer)
// blir share-of-voice INTE jämförbart över bytet — det är olika mätinstrument.
// Vi härleder bytet direkt ur `models_used` (datan bär sin egen proveniens), så
// detekteringen funkar för historiska byten utan beroende på change-event-loggen.

export type ModelBreak = {
  /** Index i den kronologiska serien för veckan EFTER bytet (där linjen ritas före). */
  beforeIndex: number;
  added: string[];
  removed: string[];
};

/** Returnerar visningsnamn för ett model-id (samma mapping som motorerna). */
function engineLabel(id: string): string {
  return ENGINE_SV[id] || id;
}

/** Detektera modellbyten i en kronologisk (äldst→nyast) serie veckor. En brytning
 *  uppstår där veckans `models_used` skiljer sig från föregående veckas. */
export function detectModelBreaks(chronoWeeks: PollingWeek[]): ModelBreak[] {
  const breaks: ModelBreak[] = [];
  for (let i = 1; i < chronoWeeks.length; i++) {
    const prev = chronoWeeks[i - 1].models_used;
    const curr = chronoWeeks[i].models_used;
    if (!prev || !curr) continue; // saknad proveniens → kan inte avgöra, hoppa
    const prevSet = new Set(prev);
    const currSet = new Set(curr);
    const added = curr.filter((m) => !prevSet.has(m));
    const removed = prev.filter((m) => !currSet.has(m));
    if (added.length || removed.length) {
      breaks.push({ beforeIndex: i, added, removed });
    }
  }
  return breaks;
}

/** Mänsklig sammanfattning av ett byte för tooltip. */
export function describeModelBreak(b: ModelBreak): string {
  const parts: string[] = [];
  if (b.added.length) parts.push(`+ ${b.added.map(engineLabel).join(', ')}`);
  if (b.removed.length) parts.push(`− ${b.removed.map(engineLabel).join(', ')}`);
  return `Modellbyte: ${parts.join('  ')}. Jämför inte Share of Voice rakt över denna linje — det är olika mätinstrument.`;
}

// --- Schemalagda körningar (speglar routers/schedules.py) ---

export type ScheduleRow = {
  name: string;
  label: string;
  cadence: string;
  state?: string;
  paused?: boolean;
  schedule?: string;
  time_zone?: string;
  last_run?: string | null;
  next_run?: string | null;
  exists?: boolean;
};
export type SchedulesResp = { available: boolean; location?: string; schedules: ScheduleRow[] };

// --- Risk-tidslinje (speglar routers/review.py — closed-loop per risk) ---

export type RiskStatus = 'open' | 'actioned' | 'resolved' | 'dismissed';
export type RiskTimelineRow = {
  id: string;
  persona: string | null;
  track: string | null;
  question: string | null;
  engine: string | null;
  harm: string | null;
  severity: 'high' | 'medium' | 'low' | null;
  engine_excerpt: string | null;
  status: RiskStatus;
  detected_at: string | null;
  action_at: string | null;
  resolved_at: string | null;
  action_taken: string | null;
  ammo_claim_ids: string[];
  clean_streak: number;
};
export type RiskTimelineResp = {
  client_id: string;
  findings: RiskTimelineRow[];
  counts: Record<RiskStatus, number>;
};

export type RiskQuestionsResp = {
  client_id: string;
  questions: { id: string; persona: string | null; type: string | null; text: string | null; status: string; custom?: boolean }[];
  counts: { open: number; approved: number; rejected: number };
};

// --- Probe-motorer-status (speglar routers/polling.engine_health) ---

export type EngineHealth = {
  id: string;
  label: string;
  vendor: string;
  status: 'live' | 'planned';
  note: string | null;
  ok: boolean | null;
  latency_ms: number | null;
  error: string | null;
};
export type EngineHealthResp = {
  engines: EngineHealth[];
  checked_at: string;
  cache_ttl_sec: number;
};

// --- Polling-frågor (resolved per kund — speglar services/polling.resolve_polling_questions) ---

export type PollingQuestion = { text: string; source: 'custom' | 'default' };
export type PollingQuestionsResp = {
  client_id: string;
  is_custom: boolean;
  substitutions: { industry: string; topic: string; service_area: string };
  by_category: Record<string, PollingQuestion[]>;
  total: number;
};

// --- Förtroendegap-cockpit (speglar services/trust_gap_report.py — översättningslagret §10.1) ---
// declared = ni säger det · demonstrated = ni belägger det · perceived = AI uppfattar det

export type PerceivedRaw = {
  status?: string | null;
  salience?: number | null;
  valence?: number | null;
  confidence?: number | null;
};
export type DimensionRaw = {
  declared?: number | null;
  demonstrated?: number | null;
  score?: number | null;
  credibility_gap?: number | null;
  perceived?: PerceivedRaw | null;
};
export type EnginePerceptionLine = { engine: string; text: string; knowledge_source?: KnowledgeSource };
export type HumanizationDim = {
  dimension: string;
  label: string;
  evidence_plain: string;
  perception_plain: string;
  perception_by_engine: EnginePerceptionLine[];
  action: string;
  confidence_note: string | null;
  raw?: DimensionRaw;
};
export type HumanizationTrend = {
  previous_date?: string | null;
  demonstrated_delta?: number | null;
  declared_delta?: number | null;
  note?: string | null;
};
export type Humanization = {
  available: boolean;
  coverage_plain?: string;
  dimensions?: HumanizationDim[];
  ranked_actions?: { label: string; why: string; action: string }[];
  opportunities_and_risks?: string[];
  trend?: HumanizationTrend;
  raw?: { overall_score?: number | null; coverage?: { declared?: number; demonstrated?: number; of?: number } };
};

// --- Receptmotorn (speglar services/recipes.py + services/interventions.py — Fas 1.5) ---

export type RecipeSkeleton = {
  gap_type: string;
  dimension: string;
  dimension_label: string;
  knowledge_source_target: 'training' | 'web_rag' | 'both';
  action_type: string;
  target_channels: string[];
  why_template: string;
  skeleton_text: string;
  expected_impact_metric: string;
  confidence: number;
};
export type RecipeDetailsType = {
  detailed_action: string;
  specific_proof_points: string[];
  prioritized_channel: string;
  prioritized_channel_reason: string;
  success_criteria: string;
  refined_why: string;
  risks: string[];
};
export type InterventionStatus =
  | 'open' | 'resolved_full' | 'resolved_partial'
  | 'no_change_yet' | 'regressed' | 'abandoned';
export type Intervention = {
  intervention_id: string;
  recipe_id: string;
  dimension: string;
  gap_type: string;
  knowledge_source_target?: string | null;
  prioritized_channel?: string | null;
  baseline: {
    declared?: number | null;
    demonstrated?: number | null;
    valence?: number | null;
    salience?: number | null;
    flag_kinds?: string[];
    captured_at?: string;
  };
  current: {
    declared?: number | null;
    demonstrated?: number | null;
    valence?: number | null;
    salience?: number | null;
    flag_kinds?: string[];
    measured_at?: string;
  };
  status: InterventionStatus;
  closure: {
    valence_delta: number | null;
    demonstrated_delta: number | null;
    flag_kinds_removed: string[];
    flag_kinds_added: string[];
    closed_at: string | null;
    days_to_close: number | null;
  } | null;
  acted_at: string;
};
export type RecipeStatus = 'pending' | 'agreed' | 'acted' | 'verified' | 'dismissed';
export type Recipe = {
  recipe_id: string;
  client_id: string;
  skeleton: RecipeSkeleton;
  details: RecipeDetailsType | null;
  detailifier_model: string;
  detailified_at: string | null;
  status: RecipeStatus;
  created_at: string;
  updated_at: string;
  agreed_at: string | null;
  acted_at: string | null;
  verified_at: string | null;
  dismissed_at: string | null;
  notes: { at: string; status: string; text: string }[];
  intervention: Intervention | null;
};
export type RecipesResp = {
  client_id: string;
  recipes: Recipe[];
  counts: Record<RecipeStatus, number>;
};

export const PERSONAS: Persona[] = ['customer', 'employee', 'investor'];

// Konsekvent status-palett: röd = öppen/risk, gul = väntar handling, grön = löst, lila = pågående,
// blå = info, grå = neutral. Används överallt där status visas (badges, dots, banderoller).
export const S = {
  open: { fg: '#b91c1c', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.28)' },
  waiting: { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.28)' },
  inProgress: { fg: C.accent, bg: 'rgba(159,81,182,0.10)', border: 'rgba(159,81,182,0.28)' },
  resolved: { fg: '#16a34a', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.25)' },
  info: { fg: '#0e7490', bg: 'rgba(14,116,144,0.08)', border: 'rgba(14,116,144,0.25)' },
  neutral: { fg: '#6a7e8a', bg: 'rgba(106,126,138,0.10)', border: 'rgba(106,126,138,0.22)' },
};

export const SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'Hög', color: S.open.fg, bg: S.open.bg },
  medium: { label: 'Medel', color: S.waiting.fg, bg: S.waiting.bg },
  low: { label: 'Låg', color: S.neutral.fg, bg: S.neutral.bg },
};

export type ViewMode = 'ops' | 'customer';

export const LS_CLIENT = 'ig-polling-client';
export const LS_MODE = 'ig-polling-mode';

// --- Recept-UI (Fas 1.5) ------------------------------------------------------

export const RECIPE_STATUS_LABEL: Record<RecipeStatus, string> = {
  pending:   'Förslag',
  agreed:    'Godkänt',
  acted:     'Publicerat',
  verified:  'Verifierat',
  dismissed: 'Avfärdat',
};

export function recipeStatusColor(status: RecipeStatus): [string, string] {
  switch (status) {
    case 'pending':   return [C.accent, 'rgba(159,81,182,0.12)'];  // lila — väntar handling
    case 'agreed':    return ['#0e7490', 'rgba(14,116,144,0.12)'];  // blå — i loopen
    case 'acted':     return ['#b45309', 'rgba(245,158,11,0.14)'];  // gul — mäts nu
    case 'verified':  return ['#16a34a', 'rgba(22,163,74,0.12)'];   // grön — loopen stängd
    case 'dismissed': return ['#6a7e8a', 'rgba(106,126,138,0.12)']; // grå — terminal
  }
}

export const KNOWLEDGE_SOURCE_LABEL_SHORT: Record<string, string> = {
  training: 'Bas-kunskap',
  web_rag:  'Live-signal',
  both:     'Bas + Live',
  hybrid:   'Hybrid',
};

export const CHANNEL_LABEL_SV: Record<string, string> = {
  attested_upload: 'Attesterad upload',
  linkedin:        'LinkedIn',
  rss:             'RSS-flöde',
  press:           'Pressmeddelande',
  wikipedia:       'Wikipedia',
  glassdoor:       'Glassdoor',
  website:         'Hemsida',
  github:          'GitHub',
  diagnosis:       'Diagnos först',
};

export function fmtBar(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

export function gapTypeLabel(t: string): string {
  return {
    over_claim: 'Anseenderisk',
    opportunity: 'Möjlighet',
    missing_evidence: 'Saknat bevis',
    contradiction: 'Motorerna oense',
    factual_drift: 'Bilden svalnar',
    persona_mismatch: 'Persona-mismatch',
    competitive_displacement: 'Konkurrent dominerar',
  }[t] || t;
}

export function trustGapBadge(color: string, bg: string): React.CSSProperties {
  return { fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${color}33`, borderRadius: 6, padding: '2px 8px', letterSpacing: '0.04em' };
}

export function signedDelta(v: number | null | undefined): string {
  if (v == null) return 'oförändrat';
  if (v > 0) return `+${v}`;
  if (v < 0) return `${v}`;
  return 'oförändrat';
}

// --- Sticky kontextrad + hero -------------------------------------------------

export type Hero = {
  label: string;   // metrikens namn (alltid satt) — gör hero-talet självförklarande
  primary: string;
  unit?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  stage?: string;
  tagline: string;
};

export function buildHero(report: Report | null, riskQuestions: RiskQuestionsResp | null, polling: PollingWeek[] | null): Hero {
  // Primärt huvudtal: Beslutssäkerhet ur senaste rapporten.
  const conf = report?.decision_confidence ?? null;
  if (conf?.score != null) {
    const delta = report?.trend?.delta;
    let deltaStr: string | undefined;
    let deltaTone: 'up' | 'down' | 'flat' | undefined;
    if (delta != null) {
      deltaTone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      deltaStr = delta > 0 ? `↑${delta} sedan föregående månad` : delta < 0 ? `↓${Math.abs(delta)} sedan föregående månad` : 'oförändrat sedan föregående månad';
    }
    return {
      label: 'Beslutssäkerhet',
      primary: String(conf.score),
      unit: '/ 100',
      delta: deltaStr,
      deltaTone,
      stage: conf.stage,
      tagline: 'Hur säkert AI-motorerna svarar om er på beslutskritiska frågor.',
    };
  }
  // Fallback 1: godkända frågor finns men ingen rapport än → loopen rullar.
  const approved = riskQuestions?.counts.approved ?? 0;
  if (approved > 0) {
    return {
      label: 'Risk-frågor i mätning',
      primary: String(approved),
      unit: approved === 1 ? 'fråga' : 'frågor',
      stage: 'Loopen rullar',
      tagline: 'Beslutssäkerhet beräknas vid första månadsrapporten — frågorna mäts varje vecka under tiden.',
    };
  }
  // Fallback 2: bara veckodata.
  const latestWeek = polling?.[0];
  if (latestWeek?.share_of_voice != null) {
    return {
      label: 'Share of Voice',
      primary: `${Math.round(latestWeek.share_of_voice * 100)}%`,
      stage: 'Tidigt läge',
      tagline: 'Beslutssäkerhet kräver godkända frågor + första månadsrapporten. Tills dess: rå synlighet.',
    };
  }
  return {
    label: 'AI-synlighet',
    primary: '—',
    stage: 'Loopen är inte aktiv',
    tagline: 'Starta loopen: kör polling, generera frågor, godkänn, mät.',
  };
}

export function isStale(startedAt: string | null | undefined, minutes: number): boolean {
  if (!startedAt) return false;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > minutes * 60 * 1000;
}

// --- Aktivitetsfeed -----------------------------------------------------------

export const JOB_LABEL: Record<string, string> = {
  polling: 'Polling',
  risk_generate: 'Generera frågor',
  risk_detect: 'Risk-detect',
  monthly_report: 'Månadsrapport',
  compute_trust_gap: 'Trust gap',
  compile_schema: 'Kompilera schema',
  scrape_active: 'Scrape',
  extract_claims: 'Extrahera claims',
  quarterly_todo: 'Kvartalsuppgift',
  'event:report_generated': 'Rapport publicerad',
};

export const ACTIVITY_FEED_TYPES = new Set([
  'polling', 'risk_generate', 'risk_detect', 'monthly_report',
  'compute_trust_gap', 'compile_schema', 'event:report_generated',
]);

export function summaryBlurb(jobType: string, summary: Record<string, unknown>): string {
  if (!summary || Object.keys(summary).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(summary)) {
    if (v == null || v === false || v === '') continue;
    if (typeof v === 'object') continue;
    parts.push(`${k}=${v}`);
  }
  return parts.slice(0, 3).join(' · ');
}

export const INTERVENTION_STATUS_LABEL: Record<InterventionStatus, string> = {
  open:             'Mäter',
  no_change_yet:    'Ingen rörelse än',
  regressed:        'Försämring',
  resolved_partial: 'Delvis stängt',
  resolved_full:    'Stängt',
  abandoned:        'Avbruten',
};

export const RISK_STATUS_SV: Record<RiskStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Öppen', color: S.open.fg, bg: S.open.bg },
  actioned: { label: 'Åtgärdad', color: S.inProgress.fg, bg: S.inProgress.bg },
  resolved: { label: 'Löst', color: S.resolved.fg, bg: S.resolved.bg },
  dismissed: { label: 'Avfärdad', color: S.neutral.fg, bg: S.neutral.bg },
};

export function buildLifecycleEvents(row: RiskTimelineRow): { label: string; date: string; color: string; detail?: string }[] {
  const out: { label: string; date: string; color: string; detail?: string }[] = [];
  if (row.detected_at) out.push({ label: 'Detekterad', date: fmtDate(row.detected_at), color: '#b91c1c' });
  if (row.action_at) {
    out.push({
      label: row.action_taken === 'reinforced_claim' ? 'Korrigerad' : row.status === 'dismissed' ? 'Avfärdad' : 'Åtgärdad',
      date: fmtDate(row.action_at),
      color: row.status === 'dismissed' ? '#6a7e8a' : C.accent,
    });
  }
  if (row.resolved_at) {
    out.push({ label: 'Löst', date: fmtDate(row.resolved_at), color: '#16a34a', detail: `efter ${row.clean_streak} rena cykler` });
  } else if (row.status === 'actioned' && row.clean_streak > 0) {
    out.push({ label: 'Ren-streak', date: '—', color: '#0e7490', detail: `${row.clean_streak} cykler` });
  }
  return out;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function harmLabel(harm: string | null): string {
  if (!harm) return '—';
  const sv = HARM_SV[harm];
  return sv ? `${harm} ${sv}` : harm;
}

export function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

// Sentiment −1..1 → svensk etikett + färg.
export function sentimentLabel(s: number | null | undefined): { text: string; color: string } {
  if (s == null) return { text: '—', color: C.dim };
  if (s > 0.15) return { text: `Positivt (${s.toFixed(2)})`, color: '#16a34a' };
  if (s < -0.15) return { text: `Negativt (${s.toFixed(2)})`, color: '#b91c1c' };
  return { text: `Neutralt (${s.toFixed(2)})`, color: C.muted };
}

/* --- delade stilar --- */

export const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '22px 26px',
  boxShadow: '0 1px 2px rgba(58,75,86,0.03)',
};

export const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '0.8fr 2fr 2.5fr 1.4fr 0.9fr',
  gap: 12,
};

export const catGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.5fr 1.2fr 1.4fr 0.8fr',
  gap: 12,
};

export const catGridTrend: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.8fr 1.3fr 0.8fr 1.1fr',
  gap: 12,
};

export const engineGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr 1.3fr 0.8fr 1.1fr',
  gap: 12,
};

export const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#eef0f1',
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
};

export const errorStyle: React.CSSProperties = {
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 8,
  padding: '12px 16px',
  color: '#b91c1c',
  fontSize: 12,
  marginBottom: 16,
};
