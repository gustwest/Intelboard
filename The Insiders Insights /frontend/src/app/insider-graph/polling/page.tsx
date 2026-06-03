'use client';

import { useEffect, useState } from 'react';
import { Radar, RefreshCw, Play, Loader2, Check, X, Pause, CalendarClock } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch, GRAPH_API } from '../_lib/api';
import { useJobRuns, fmtRelative } from '../_lib/jobRuns';
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
const ENGINE_KNOWLEDGE_SOURCE: Record<string, KnowledgeSource> = {
  ...Object.fromEntries(
    MODEL_REGISTRY.filter((e) => e.role.startsWith('probe_'))
      .map((e) => [e.modelId, e.knowledgeSource ?? 'training']),
  ),
  perplexity: 'web_rag',
  sonar: 'web_rag',
};

function knowledgeSourceFor(engineId: string): KnowledgeSource {
  return ENGINE_KNOWLEDGE_SOURCE[engineId] ?? 'training';
}

// Beräknar per-source-type-aggregat över ett urval engine-rader. Säkrar att vi
// rapporterar SoV och sentiment per source-typ utan att medeltala över olika
// fördelningar (training kontra web_rag). Vi summerar mention/answer-räknarna
// och re-deriverar, snarare än att medeltala redan-normaliserade SoV-värden.
function aggregateEnginesBySource(
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

type Persona = 'buyer' | 'candidate' | 'investor';

const PERSONA_SV: Record<string, string> = {
  buyer: 'Köpare',
  candidate: 'Kandidat',
  investor: 'Investerare',
};

const HARM_SV: Record<string, string> = {
  '#1': 'Förväxling',
  '#2': 'Inaktuellt negativ',
  '#3': 'Hallucinerat negativ',
  '#4': 'Konkurrentförskjutning',
  '#5': 'Skadlig tystnad',
  '#6': 'Negativ inramning',
};

// Måste matcha GEO_STAGES + CONFIDENCE_CEILING i backend.
const GEO_STAGES: [number, string][] = [
  [0, 'Tidigt läge'],
  [40, 'På väg'],
  [60, 'God grund'],
  [75, 'Stark'],
  [90, 'Mycket stark'],
];

type DecisionConfidence = {
  score: number | null;
  stage: string;
  headroom: number | null;
  answers: number;
  safe: number;
  covered_personas: number;
  ceiling: number;
  next_step: string;
};

type PersonaExposure = { weighted: number; answers: number; score: number | null };

type Finding = {
  persona: string | null;
  question: string | null;
  engine: string | null;
  harm: string | null;
  severity: 'high' | 'medium' | 'low' | null;
  engine_excerpt: string | null;
  status: string;
  via_follow_up: boolean;
};

type Action = {
  persona: string | null;
  question: string | null;
  harm: string | null;
  action_taken: string | null;
  ammo_claim_ids: string[];
  action_at: string | null;
};

type Trend = {
  previous_month: string | null;
  previous_score: number | null;
  delta: number | null;
  resolved_count: number;
  series: { month: string; score: number | null }[];
};

type Report = {
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

type Client = { client_id: string; company_name: string | null };

// --- Veckovis polling (speglar routers/polling.py + services/polling.py) ---

type CategoryResult = {
  share_of_voice: number;
  sentiment_score: number;
  answer_count: number;
  mention_count: number;
};

type EngineResult = {
  share_of_voice: number;
  sentiment_score: number | null;
  answer_count: number;
  mention_count: number;
};

type Competitor = {
  name: string;
  mentions: number;
  share: number;
};

type PollingWeek = {
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
const ENGINE_SV: Record<string, string> = {
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

const CATEGORY_SV: Record<string, string> = {
  affar: 'Affär',
  finans: 'Finans',
  innovation: 'Innovation',
  hr: 'HR',
};

// --- Schemalagda körningar (speglar routers/schedules.py) ---

type ScheduleRow = {
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
type SchedulesResp = { available: boolean; location?: string; schedules: ScheduleRow[] };

// --- Risk-tidslinje (speglar routers/review.py — closed-loop per risk) ---

type RiskStatus = 'open' | 'actioned' | 'resolved' | 'dismissed';
type RiskTimelineRow = {
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
type RiskTimelineResp = {
  client_id: string;
  findings: RiskTimelineRow[];
  counts: Record<RiskStatus, number>;
};

type RiskQuestionsResp = {
  client_id: string;
  questions: { id: string; persona: string | null; type: string | null; text: string | null; status: string; custom?: boolean }[];
  counts: { open: number; approved: number; rejected: number };
};

// --- Probe-motorer-status (speglar routers/polling.engine_health) ---

type EngineHealth = {
  id: string;
  label: string;
  vendor: string;
  status: 'live' | 'planned';
  note: string | null;
  ok: boolean | null;
  latency_ms: number | null;
  error: string | null;
};
type EngineHealthResp = {
  engines: EngineHealth[];
  checked_at: string;
  cache_ttl_sec: number;
};

// --- Polling-frågor (resolved per kund — speglar services/polling.resolve_polling_questions) ---

type PollingQuestion = { text: string; source: 'custom' | 'default' };
type PollingQuestionsResp = {
  client_id: string;
  is_custom: boolean;
  substitutions: { industry: string; topic: string; service_area: string };
  by_category: Record<string, PollingQuestion[]>;
  total: number;
};

// --- Förtroendegap-cockpit (speglar services/trust_gap_report.py — översättningslagret §10.1) ---
// declared = ni säger det · demonstrated = ni belägger det · perceived = AI uppfattar det

type PerceivedRaw = {
  status?: string | null;
  salience?: number | null;
  valence?: number | null;
  confidence?: number | null;
};
type DimensionRaw = {
  declared?: number | null;
  demonstrated?: number | null;
  score?: number | null;
  credibility_gap?: number | null;
  perceived?: PerceivedRaw | null;
};
type EnginePerceptionLine = { engine: string; text: string; knowledge_source?: KnowledgeSource };
type HumanizationDim = {
  dimension: string;
  label: string;
  evidence_plain: string;
  perception_plain: string;
  perception_by_engine: EnginePerceptionLine[];
  action: string;
  confidence_note: string | null;
  raw?: DimensionRaw;
};
type HumanizationTrend = {
  previous_date?: string | null;
  demonstrated_delta?: number | null;
  declared_delta?: number | null;
  note?: string | null;
};
type Humanization = {
  available: boolean;
  coverage_plain?: string;
  dimensions?: HumanizationDim[];
  ranked_actions?: { label: string; why: string; action: string }[];
  opportunities_and_risks?: string[];
  trend?: HumanizationTrend;
  raw?: { overall_score?: number | null; coverage?: { declared?: number; demonstrated?: number; of?: number } };
};

const PERSONAS: Persona[] = ['buyer', 'candidate', 'investor'];

// Konsekvent status-palett: röd = öppen/risk, gul = väntar handling, grön = löst, lila = pågående,
// blå = info, grå = neutral. Används överallt där status visas (badges, dots, banderoller).
const S = {
  open: { fg: '#b91c1c', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.28)' },
  waiting: { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.28)' },
  inProgress: { fg: '#9f51b6', bg: 'rgba(159,81,182,0.10)', border: 'rgba(159,81,182,0.28)' },
  resolved: { fg: '#16a34a', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.25)' },
  info: { fg: '#0e7490', bg: 'rgba(14,116,144,0.08)', border: 'rgba(14,116,144,0.25)' },
  neutral: { fg: '#6a7e8a', bg: 'rgba(106,126,138,0.10)', border: 'rgba(106,126,138,0.22)' },
};

const SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'Hög', color: S.open.fg, bg: S.open.bg },
  medium: { label: 'Medel', color: S.waiting.fg, bg: S.waiting.bg },
  low: { label: 'Låg', color: S.neutral.fg, bg: S.neutral.bg },
};

type ViewMode = 'ops' | 'customer';

const LS_CLIENT = 'ig-polling-client';
const LS_MODE = 'ig-polling-mode';

export default function GraphRiskLoopPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [months, setMonths] = useState<string[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [polling, setPolling] = useState<PollingWeek[] | null>(null);
  const [schedules, setSchedules] = useState<SchedulesResp | null>(null);
  const [humanization, setHumanization] = useState<Humanization | null>(null);
  const [riskTimeline, setRiskTimeline] = useState<RiskTimelineResp | null>(null);
  const [riskQuestions, setRiskQuestions] = useState<RiskQuestionsResp | null>(null);
  const [engineHealth, setEngineHealth] = useState<EngineHealthResp | null>(null);
  const [pollingQuestions, setPollingQuestions] = useState<PollingQuestionsResp | null>(null);
  const [mode, setMode] = useState<ViewMode>('ops');
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { latest, runs: jobRuns, active: jobActive, trigger: runJob } = useJobRuns(selected);

  // Återställ sparat kund-val + läge innan första render (en gång).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.localStorage.getItem(LS_MODE);
    if (m === 'ops' || m === 'customer') setMode(m);
    const c = window.localStorage.getItem(LS_CLIENT);
    if (c) setSelected(c);
  }, []);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients.length && !selected) {
          const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_CLIENT) : null;
          const found = saved && d.clients.find((c) => c.client_id === saved) ? saved : d.clients[0].client_id;
          setSelected(found);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Persist kund-val + läge.
  useEffect(() => {
    if (typeof window !== 'undefined' && selected) window.localStorage.setItem(LS_CLIENT, selected);
  }, [selected]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_MODE, mode);
  }, [mode]);

  // Schemastatus (globalt, ej kundberoende) — verkligt Cloud Scheduler-läge + paus.
  useEffect(() => {
    let cancelled = false;
    graphFetch<SchedulesResp>('/api/schedules')
      .then((d) => !cancelled && setSchedules(d))
      .catch(() => !cancelled && setSchedules({ available: false, schedules: [] }));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  async function toggleSchedule(name: string, paused: boolean) {
    try {
      await graphFetch(`/api/schedules/${name}/${paused ? 'resume' : 'pause'}`, { method: 'POST' });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Jobbknapp med progress (delas av polling/risk-detect/månadsrapport).
  function renderJobBtn(label: string, key: string, path: string, jobType: string, opts?: { needsClient?: boolean; onDone?: () => void }) {
    const st = jobActive[key] || 'idle';
    const Icon = st === 'running' ? Loader2 : st === 'success' ? Check : st === 'failed' ? X : Play;
    const color = st === 'failed' ? '#dc2626' : st === 'success' ? '#16a34a' : undefined;
    return (
      <button
        onClick={async () => {
          await runJob(key, path, jobType);
          opts?.onDone?.();
        }}
        disabled={(opts?.needsClient && !selected) || st === 'running'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          background: st === 'success' ? 'rgba(159,81,182,0.18)' : 'transparent',
          color: st === 'success' ? '#9f51b6' : '#3a4b56',
          border: `1px solid ${st === 'success' ? 'rgba(159,81,182,0.3)' : C.border}`,
          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: st === 'running' ? 'wait' : 'pointer',
        }}
      >
        <Icon size={12} color={color} style={st === 'running' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        {st === 'running' ? 'Kör…' : label}
      </button>
    );
  }

  // Lista tillgängliga månadsrapporter för vald kund, välj senaste.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ months: string[] }>(`/api/reports/${selected}`)
      .then((d) => {
        if (cancelled) return;
        setError(null);
        setMonths(d.months);
        setMonth(d.months[0] ?? null);
        if (d.months.length === 0) setReport(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setMonths([]);
        setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Veckovis pollingdata — oberoende av månadsrapporten (det löpande, automatiska måttet).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ weeks: PollingWeek[] }>(`/api/polling/${selected}`)
      .then((d) => !cancelled && setPolling(d.weeks))
      .catch(() => !cancelled && setPolling([]));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Humaniseringsbild — hur AI uppfattar kundens mänsklighet (trust_gap-perception).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<Humanization>(`/api/reports/${selected}/humanization`)
      .then((d) => !cancelled && setHumanization(d))
      .catch(() => !cancelled && setHumanization(null));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Closed-loop tidslinje per risk — alla statusar, inte bara öppna.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<RiskTimelineResp>(`/api/review/${selected}/risks/timeline`)
      .then((d) => !cancelled && setRiskTimeline(d))
      .catch(() => !cancelled && setRiskTimeline(null));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Riskloop-status — pending/approved questions, driver statuspanel + tomtillstånd.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<RiskQuestionsResp>(`/api/review/${selected}/risk-questions?status=all`)
      .then((d) => !cancelled && setRiskQuestions(d))
      .catch(() => !cancelled && setRiskQuestions(null));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Polling-frågor (resolved per kund) — driver transparens-panelen i AI-synlighet.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<PollingQuestionsResp>(`/api/polling/${selected}/questions`)
      .then((d) => !cancelled && setPollingQuestions(d))
      .catch(() => !cancelled && setPollingQuestions(null));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  // Probe-motorer-status — driver "Motor-status"-raden i sticky-baren. Auto-refresh
  // var 2:e min (backend cachar 60s, så detta ger maximalt 2 LLM-probar per minut).
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = () => {
      graphFetch<EngineHealthResp>('/api/polling/engine-health')
        .then((d) => !cancelled && setEngineHealth(d))
        .catch(() => !cancelled && setEngineHealth(null));
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshTick]);

  async function refreshEngineHealth() {
    try {
      const d = await graphFetch<EngineHealthResp>('/api/polling/engine-health?force=true');
      setEngineHealth(d);
    } catch {
      // tyst — UI:t visar gammal data
    }
  }

  // Hämta vald månads rapport.
  useEffect(() => {
    if (!selected || !month) return;
    let cancelled = false;
    graphFetch<Report>(`/api/reports/${selected}/${month}`)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected, month]);

  const conf = report?.decision_confidence ?? null;
  const exposure = report?.risk_exposure ?? null;

  return (
    <GraphPageShell
      title="AI-synlighet"
      icon={<Radar size={22} />}
      subtitle="Riskloopen: hur säkert AI-motorerna svarar om kunden inför beslutskritiska frågor — beslutssäkerhet, kvarvarande risker och effekt över tid."
    >
      <StickyContextBar
        clients={clients}
        selected={selected}
        onSelectClient={setSelected}
        months={months}
        month={month}
        onSelectMonth={setMonth}
        onRefresh={() => setRefreshTick((t) => t + 1)}
        isDraft={!!report?.is_draft}
        mode={mode}
        onModeChange={setMode}
        hero={buildHero(report, riskQuestions, polling)}
        reportShareUrl={month && selected && report ? `/api/reports/${selected}/${month}/html` : null}
        engineHealth={engineHealth}
        onRefreshEngineHealth={refreshEngineHealth}
      />

      {/* Jobbkontroller + aktivitetsfeed (endast ops-läge) */}
      {mode === 'ops' && (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          {renderJobBtn('Kör polling', 'polling', '/api/jobs/polling', 'polling', { onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Generera frågor', 'generate', `/api/jobs/risk-generate/${selected}`, 'risk_generate', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Kör risk-detect', 'risk', `/api/jobs/risk-detect/${selected}`, 'risk_detect', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
          {renderJobBtn('Bygg månadsrapport', 'report', `/api/jobs/monthly-report/${selected}`, 'monthly_report', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        </div>
        <ActivityFeed runs={jobRuns} />
      </>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      {/* Schemalagda körningar — endast ops-läge (admin-info) */}
      {mode === 'ops' && schedules?.available && schedules.schedules.length > 0 && (
        <SchedulesPanel rows={schedules.schedules} onToggle={toggleSchedule} />
      )}

      {/* Riskloop-status — endast ops-läge (intern admin-loop, ej kundens öga) */}
      {mode === 'ops' && (riskQuestions || riskTimeline) && (
        <RiskLoopStatus
          questions={riskQuestions}
          findings={riskTimeline}
          latestDetect={latest('risk_detect')}
          latestGenerate={latest('risk_generate')}
          clientId={selected}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* Godkända risk-frågor — transparens kring vad som mäts (alla lägen, för kund-värde) */}
      {riskQuestions && (riskQuestions.counts.approved > 0) && (
        <ApprovedQuestionsPanel
          questions={riskQuestions.questions.filter((q) => q.status === 'approved')}
          clientId={selected}
          mode={mode}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* Veckovis synlighet — det löpande, automatiska måttet (visas oavsett månadsrapport) */}
      {polling && polling.length > 0 && <WeeklyVisibility weeks={polling} />}

      {/* Polling-frågor — vad AI-motorerna fick frågan om i veckan (transparens) */}
      {pollingQuestions && pollingQuestions.total > 0 && selected && (
        <PollingQuestionsPanel data={pollingQuestions} clientId={selected} mode={mode} />
      )}

      {/* Förtroendegap-cockpit — staplar i ops, bara plain-text i kund-läge */}
      {humanization?.available && <TrustGapCockpit model={humanization} mode={mode} />}

      {/* Closed-loop tidslinje per risk — detektion → åtgärd → resolved, oberoende av månadsrapport */}
      {riskTimeline && <RiskLifecycleTimeline data={riskTimeline} approvedQuestions={riskQuestions?.counts.approved ?? null} />}

      {months?.length === 0 && (!polling || polling.length === 0) && <EmptyState />}

      {report && conf && (
        <>
          {/* 1. Beslutssäkerhet */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Beslutssäkerhet" hint="Hur stor andel av de beslutskritiska frågorna AI-motorerna svarar korrekt och rättvist på. En graderad resa — aldrig helt 'i mål', eftersom motorerna ständigt ändras." />
            {conf.score == null ? (
              <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>{conf.next_step}</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 600, color: '#3a4b56', letterSpacing: '-0.02em' }}>{conf.score}</span>
                  <span style={{ fontSize: 14, color: C.muted }}>/ 100</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>{conf.stage}</span>
                </div>
                <StageScale score={conf.score} ceiling={conf.ceiling} />
                <p style={{ fontSize: 13, color: '#3a4b56', margin: '14px 0 0', lineHeight: 1.6 }}>{report.verdict}</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0' }}>
                  <strong style={{ color: '#3a4b56' }}>Nästa steg:</strong> {conf.next_step}
                </p>
                <p style={{ fontSize: 11, color: C.dim, margin: '6px 0 0' }}>
                  {conf.safe}/{conf.answers} svar säkra · {conf.covered_personas}/3 personas mätta · tak {conf.ceiling}
                </p>
              </>
            )}
          </div>

          {/* 2. Risk Exposure per persona */}
          {exposure && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {PERSONAS.map((p) => {
                const e = exposure.per_persona[p];
                return (
                  <div key={p} style={cardStyle}>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                      {PERSONA_SV[p]}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: '#3a4b56', marginTop: 8, letterSpacing: '-0.02em' }}>
                      {e?.score != null ? `${Math.round(e.score * 100)}%` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                      {e?.answers ? `Risk-exponering · ${e.answers} frågor` : 'Ej mätt än'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Detekterade risker */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Detekterade risker" hint="De svar AI-motorerna ger som kan skada ett beslut — klassade mot skademodellen." />
            {report.detected.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga öppna risker i den här rapporten.</p>
            ) : (
              <RiskTable findings={report.detected} />
            )}
          </div>

          {/* 4. Vad mjukvaran gjorde */}
          {report.actions.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <SectionHead title="Vad vår mjukvara gjorde" hint="Källförsedda korrigeringar som mött detekterade risker — publicerade i JSON-LD, FAQ och profilsida." />
              {report.actions.map((a, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < report.actions.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ fontSize: 13, color: '#3a4b56' }}>{a.question || '—'}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {a.persona ? PERSONA_SV[a.persona] || a.persona : '—'} · {harmLabel(a.harm)} · {a.action_taken || 'åtgärdad'}
                    {a.action_at ? ` · ${a.action_at.slice(0, 10)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 5. Effekt över tid */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <SectionHead title="Effekt över tid" hint="Beslutssäkerhet månad för månad och antal lösta risker. Trenden — inte ett kausalitetspåstående — är beviset." />
            <TrendView trend={report.trend} currentScore={conf.score} />
          </div>

          {/* 6. Sekundärt: Parity Index */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
                  Parity Index
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Könsbalans i porträtteringen — eget mått, ingår ej i beslutssäkerheten.</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#3a4b56', letterSpacing: '-0.02em' }}>
                {report.parity_index != null ? `${Math.round(report.parity_index * 100)}%` : '—'}
              </div>
            </div>
          </div>
        </>
      )}
    </GraphPageShell>
  );
}

/* --- delkomponenter --- */

function SectionHead({ title, hint, collapsible, open, onToggle, badge }: {
  title: string;
  hint?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  badge?: string;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        cursor: collapsible ? 'pointer' : 'default',
        userSelect: collapsible ? 'none' : 'auto',
      }}
      onClick={collapsible ? onToggle : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {collapsible && (
          <span style={{ fontSize: 10, color: C.muted, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        )}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#3a4b56', margin: 0, letterSpacing: '-0.005em' }}>{title}</h2>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 600, color: S.inProgress.fg, background: S.inProgress.bg, border: `1px solid ${S.inProgress.border}`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em' }}>{badge}</span>
        )}
      </div>
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0 0', lineHeight: 1.55, paddingLeft: collapsible ? 20 : 0 }}>{hint}</p>}
    </div>
  );
}

function StageScale({ score, ceiling }: { score: number; ceiling: number }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 8, background: '#eef0f1', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${score}%`, background: C.accent, borderRadius: 5 }} />
        {/* Tak — markerar att 100 aldrig nås */}
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${ceiling}%`, width: 2, background: C.dim }} title={`Tak ${ceiling}`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GEO_STAGES.length}, 1fr)`, marginTop: 6, fontSize: 10, letterSpacing: '0.04em', color: C.dim }}>
        {GEO_STAGES.map(([t, name]) => (
          <span key={t} style={{ color: score >= t ? C.accent : C.dim, fontWeight: score >= t ? 600 : 400 }}>{name}</span>
        ))}
      </div>
    </div>
  );
}

function RiskTable({ findings }: { findings: Finding[] }) {
  return (
    <div>
      <div style={{ ...rowGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
        <span>Persona</span>
        <span>Fråga</span>
        <span>Motorn svarade</span>
        <span>Skademodell</span>
        <span>Allvarlighet</span>
      </div>
      {findings.map((f, i) => {
        const sev = SEVERITY[f.severity || 'low'] || SEVERITY.low;
        return (
          <div key={i} style={{ ...rowGrid, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'start' }}>
            <span style={{ color: '#3a4b56' }}>{f.persona ? PERSONA_SV[f.persona] || f.persona : '—'}</span>
            <span style={{ color: '#3a4b56' }}>
              {f.question || '—'}
              {f.via_follow_up && <span style={{ marginLeft: 6, fontSize: 10, color: C.dim }}>(följdfråga)</span>}
            </span>
            <span style={{ color: C.muted, fontStyle: 'italic' }}>{f.engine_excerpt ? `"${f.engine_excerpt}"` : '—'}</span>
            <span style={{ color: '#3a4b56' }}>{harmLabel(f.harm)}</span>
            <span>
              <span style={{ fontSize: 11, fontWeight: 600, color: sev.color, background: sev.bg, borderRadius: 6, padding: '3px 8px' }}>{sev.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TrendView({ trend, currentScore }: { trend: Trend; currentScore: number | null }) {
  const series = trend.series.filter((s) => s.score != null) as { month: string; score: number }[];
  const arrow = trend.delta == null ? '' : trend.delta > 0 ? '▲' : trend.delta < 0 ? '▼' : '→';
  const arrowColor = trend.delta == null ? C.dim : trend.delta > 0 ? '#16a34a' : trend.delta < 0 ? '#b91c1c' : C.muted;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: series.length > 1 ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Beslutssäkerhet nu</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#3a4b56' }}>
            {currentScore ?? '—'}
            {trend.delta != null && (
              <span style={{ fontSize: 14, color: arrowColor, marginLeft: 8 }}>
                {arrow} {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
              </span>
            )}
          </div>
          {trend.previous_month && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>mot {trend.previous_month}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Lösta risker</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#3a4b56' }}>{trend.resolved_count}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>motorerna svarar nu säkert</div>
        </div>
      </div>

      {series.length > 1 ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
          {series.map((s) => (
            <div key={s.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, maxWidth: 60 }}>
              <span style={{ fontSize: 10, color: C.muted }}>{s.score}</span>
              <div style={{ width: '100%', maxWidth: 32, height: `${Math.max(4, (s.score / 100) * 80)}px`, background: C.accent, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
              <span style={{ fontSize: 9, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{s.month.slice(5)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Trend visas när minst två månadsrapporter finns.</p>
      )}
    </div>
  );
}

function SchedulesPanel({ rows, onToggle }: { rows: ScheduleRow[]; onToggle: (name: string, paused: boolean) => void }) {
  const fmt = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Schemalagda körningar"
        hint="Mätloopens automatik. Pausa stoppar Cloud Scheduler-triggern tills den återupptas — körningar uteblir helt under tiden."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const missing = r.exists === false;
          const paused = !!r.paused;
          const pill = missing
            ? { text: 'Saknas', color: C.dim, bg: 'rgba(106,126,138,0.12)' }
            : paused
            ? { text: 'Pausad', color: '#b45309', bg: 'rgba(245,158,11,0.14)' }
            : { text: 'Aktiv', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' };
          return (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.3fr 1.3fr auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarClock size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>{r.label}</span>
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>{r.cadence}</span>
              <span style={{ fontSize: 11, color: C.dim }}>Senast: {fmt(r.last_run)}</span>
              <span style={{ fontSize: 11, color: C.dim }}>{paused ? 'Nästa: pausad' : `Nästa: ${fmt(r.next_run)}`}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: pill.color, background: pill.bg, borderRadius: 6, padding: '3px 8px' }}>{pill.text}</span>
                {!missing && (
                  <button
                    onClick={() => onToggle(r.name, paused)}
                    title={paused ? 'Återuppta' : 'Pausa'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', color: paused ? '#16a34a' : '#b45309', border: `1px solid ${paused ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? 'Återuppta' : 'Pausa'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyVisibility({ weeks }: { weeks: PollingWeek[] }) {
  const latest = weeks[0];
  // Trenden ritas äldst → nyast (API:t ger nyast först).
  const chrono = [...weeks].reverse();
  const sovSeries = chrono.filter((w) => w.share_of_voice != null) as (PollingWeek & { share_of_voice: number })[];
  const sent = sentimentLabel(latest.sentiment_score);
  const cats = latest.category_results
    ? Object.entries(latest.category_results).sort((a, b) => b[1].share_of_voice - a[1].share_of_voice)
    : [];

  // Per-kategori-trend (12v): plocka SoV per vecka för varje kategori.
  const catTrend: Record<string, (number | null)[]> = {};
  if (cats.length > 0) {
    for (const [cat] of cats) catTrend[cat] = chrono.map((w) => w.category_results?.[cat]?.share_of_voice ?? null);
  }

  // Per-motor (senaste veckan + 12v-trend).
  const engineEntries = latest.per_engine
    ? Object.entries(latest.per_engine).sort((a, b) => b[1].share_of_voice - a[1].share_of_voice)
    : [];
  const engineTrend: Record<string, (number | null)[]> = {};
  for (const [eng] of engineEntries) engineTrend[eng] = chrono.map((w) => w.per_engine?.[eng]?.share_of_voice ?? null);

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Veckovis synlighet"
        hint="Det löpande måttet — hur ofta AI-motorerna nämner kunden på branschfrågor (Share of Voice), med vilket sentiment och med vilken könsbalans. Uppdateras automatiskt varje vecka."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: sovSeries.length > 1 ? 18 : 0 }}>
        <Stat label="Share of Voice" value={pct(latest.share_of_voice)} accent />
        <Stat label="Sentiment" value={sent.text} color={sent.color} />
        <Stat label="Könsbalans (Parity)" value={pct(latest.parity_index)} />
      </div>

      <div style={{ fontSize: 11, color: C.dim, margin: sovSeries.length > 1 ? '0 0 14px' : '10px 0 0' }}>
        {latest.week_id}
        {latest.total_answers != null && ` · ${latest.answers_with_mention ?? 0}/${latest.total_answers} svar nämnde kunden`}
        {latest.models_used?.length ? ` · ${latest.models_used.join(', ')}` : ''}
      </div>

      {sovSeries.length > 1 && (
        <div style={{ marginBottom: cats.length ? 18 : 0 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Share of Voice över tid</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
            {sovSeries.map((w) => (
              <div key={w.week_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, maxWidth: 48 }}>
                <span style={{ fontSize: 10, color: C.muted }}>{Math.round(w.share_of_voice * 100)}</span>
                <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(3, w.share_of_voice * 72)}px`, background: C.accent, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                <span style={{ fontSize: 9, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{w.week_id.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cats.length > 0 && (
        <div style={{ marginBottom: engineEntries.length ? 18 : 0 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Per kategori — senaste veckan + trend</div>
          <div style={{ ...catGridTrend, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
            <span>Kategori</span>
            <span>SoV</span>
            <span>Sentiment</span>
            <span>Svar</span>
            <span>Trend (12v)</span>
          </div>
          {cats.map(([cat, r]) => (
            <CategoryRow
              key={cat}
              cat={cat}
              row={r}
              competitors={latest.category_competitors?.[cat] || []}
              clientSoV={r.share_of_voice}
              trend={catTrend[cat]}
            />
          ))}
        </div>
      )}

      {engineEntries.length > 0 && (() => {
        const training = aggregateEnginesBySource(engineEntries, 'training');
        const webRag = aggregateEnginesBySource(engineEntries, 'web_rag');
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Per AI-motor — senaste veckan + trend</div>
              <span
                title="Bas-kunskap (RLHF-tränade modeller) och Live-signal (web-RAG som Perplexity) har fundamentalt olika fördelningar och frågedjup. De medeltalas aldrig — endast jämförs sida vid sida."
                style={{ fontSize: 10, color: C.dim, fontStyle: 'italic' }}
              >
                Bas-kunskap vs Live-signal — aldrig medeltala
              </span>
            </div>
            {training.engines.length > 0 && (
              <EnginesBySourceSection
                title="AI Base Knowledge"
                subtitle="RLHF-tränade modeller — det AI:n redan kan från sin träning (ChatGPT, Gemini, Claude, Mistral)"
                agg={training}
                trend={engineTrend}
              />
            )}
            {webRag.engines.length > 0 && (
              <EnginesBySourceSection
                title="AI Live Signal"
                subtitle="Web-RAG — vad AI:n hittar live på webben just nu (Perplexity Sonar)"
                agg={webRag}
                trend={engineTrend}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
}

function EnginesBySourceSection({
  title,
  subtitle,
  agg,
  trend,
}: {
  title: string;
  subtitle: string;
  agg: ReturnType<typeof aggregateEnginesBySource>;
  trend: Record<string, (number | null)[]>;
}) {
  const sent = sentimentLabel(agg.sentiment);
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#3a4b56' }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 12 }}>
          <span>SoV: <span style={{ fontWeight: 600, color: '#3a4b56' }}>{agg.sov != null ? `${Math.round(agg.sov * 100)}%` : '—'}</span></span>
          <span>Sentiment: <span style={{ fontWeight: 600, color: sent.color }}>{sent.text}</span></span>
          <span style={{ color: C.dim }}>{agg.mentions}/{agg.answers} svar</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>{subtitle}</div>
      <div style={{ ...engineGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
        <span>Motor</span>
        <span>SoV</span>
        <span>Sentiment</span>
        <span>Nämner</span>
        <span>Trend (12v)</span>
      </div>
      {agg.engines.map(([eng, r]) => {
        const es = sentimentLabel(r.sentiment_score);
        return (
          <div key={eng} style={{ ...engineGrid, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'center' }}>
            <span style={{ color: '#3a4b56', fontWeight: 600 }}>{ENGINE_SV[eng] || eng}</span>
            <span style={{ color: '#3a4b56' }}>{Math.round(r.share_of_voice * 100)}%</span>
            <span style={{ color: es.color }}>{es.text}</span>
            <span style={{ color: C.dim }}>{r.mention_count}/{r.answer_count}</span>
            <Sparkline series={trend[eng]} />
          </div>
        );
      })}
    </div>
  );
}

function CategoryRow({ cat, row, competitors, clientSoV, trend }: {
  cat: string;
  row: CategoryResult;
  competitors: Competitor[];
  clientSoV: number;
  trend: (number | null)[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const cs = sentimentLabel(row.sentiment_score);
  const canExpand = competitors.length > 0;
  return (
    <>
      <div
        style={{
          ...catGridTrend,
          padding: '8px 0',
          borderBottom: open ? 'none' : `1px solid ${C.border}`,
          fontSize: 12,
          alignItems: 'center',
          cursor: canExpand ? 'pointer' : 'default',
        }}
        onClick={() => canExpand && setOpen((o) => !o)}
        title={canExpand ? 'Klicka för att se vilka konkurrenter AI nämner i den här kategorin' : 'Konkurrent-data fylls vid nästa polling-körning'}
      >
        <span style={{ color: '#3a4b56', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {canExpand && <span style={{ fontSize: 9, color: C.muted, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>}
          {CATEGORY_SV[cat] || cat}
        </span>
        <span style={{ color: '#3a4b56' }}>{Math.round(row.share_of_voice * 100)}%</span>
        <span style={{ color: cs.color }}>{cs.text}</span>
        <span style={{ color: C.dim }}>{Math.round(row.mention_count)}/{Math.round(row.answer_count)}</span>
        <Sparkline series={trend} />
      </div>
      {open && (
        <div style={{ padding: '8px 12px 14px 22px', borderBottom: `1px solid ${C.border}`, background: 'rgba(106,126,138,0.03)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 8 }}>
            Vilka AI nämner istället — top {competitors.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CompetitorBar name="Ni" share={clientSoV} highlight />
            {competitors.map((c) => (
              <CompetitorBar key={c.name} name={c.name} share={c.share} mentions={c.mentions} />
            ))}
          </div>
          <p style={{ fontSize: 10, color: C.dim, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
            Andel av kategorins {Math.round(row.answer_count)} AI-svar där respektive aktör nämns. Stora gap är en tydlig "varför" — antingen att berätta tydligare, eller en konkurrent som äger berättelsen.
          </p>
        </div>
      )}
    </>
  );
}

function CompetitorBar({ name, share, mentions, highlight }: { name: string; share: number; mentions?: number; highlight?: boolean }) {
  const pctVal = Math.max(0, Math.min(1, share)) * 100;
  const color = highlight ? C.accent : '#6a7e8a';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ color: highlight ? C.accent : '#3a4b56', fontWeight: highlight ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ height: 8, background: 'rgba(106,126,138,0.12)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: color, opacity: 0.85, borderRadius: 4 }} />
      </div>
      <span style={{ color: C.muted, fontFamily: 'ui-monospace, monospace', textAlign: 'right' }}>
        {Math.round(share * 100)}%{mentions != null ? ` · ${mentions}` : ''}
      </span>
    </div>
  );
}

function PollingQuestionsPanel({ data, clientId, mode }: { data: PollingQuestionsResp; clientId: string; mode: ViewMode }) {
  const [open, setOpen] = useState(false);
  const categories = Object.entries(data.by_category).sort((a, b) => a[0].localeCompare(b[0]));
  const editorUrl = `/insider-graph/kunder/${encodeURIComponent(clientId)}#measurement-config`;

  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title={data.is_custom ? 'Polling-frågor — egna (skräddarsydda)' : 'Polling-frågor — default (genererade ur kundens kontext)'}
        hint={open
          ? "Veckovis polling kör dessa frågor mot AI-motorerna och mäter hur ofta kunden nämns. Default-frågorna fylls med kundens industry/topic/service_area — du kan ersätta dem med egna via Mätningskonfig på kunddetalj."
          : `${data.total} ${data.total === 1 ? 'fråga' : 'frågor'} mäts varje vecka · ${categories.length} kategorier${data.is_custom ? ' · egna' : ' · default-templates'}`
        }
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={`${data.total}`}
      />

      {open && (
        <>
          {mode === 'ops' && !data.is_custom && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(159,81,182,0.04)', border: `1px solid ${S.inProgress.border}`, borderRadius: 8, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              <strong style={{ color: '#3a4b56' }}>Default-frågor ifyllda med kundens kontext:</strong>{' '}
              industry=<code style={{ color: C.accent }}>{data.substitutions.industry}</code> ·{' '}
              topic=<code style={{ color: C.accent }}>{data.substitutions.topic}</code> ·{' '}
              service_area=<code style={{ color: C.accent }}>{data.substitutions.service_area}</code>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {categories.map(([cat, qs]) => (
              <div key={cat}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {CATEGORY_SV[cat] || cat} · {qs.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {qs.map((q, i) => (
                    <div key={i} style={{
                      padding: '8px 12px',
                      background: q.source === 'custom' ? 'rgba(159,81,182,0.04)' : 'rgba(106,126,138,0.04)',
                      border: `1px solid ${q.source === 'custom' ? S.inProgress.border : C.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#3a4b56',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}>
                      <span style={{ flex: 1 }}>{q.text}</span>
                      {q.source === 'custom' && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.1)', border: `1px solid ${S.inProgress.border}`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
                          Egen
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {mode === 'ops' && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                {data.is_custom ? 'Du har skräddarsydda frågor. Default-templates används inte.' : 'Vill du ersätta default-frågorna med egna?'}
              </span>
              <a
                href={editorUrl}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 600,
                  color: C.accent, background: 'rgba(159,81,182,0.08)',
                  border: `1px solid ${S.inProgress.border}`, borderRadius: 6,
                  textDecoration: 'none', letterSpacing: '0.02em',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                Redigera i Mätningskonfig →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Sparkline({ series, width = 88, height = 22 }: { series: (number | null)[] | undefined; width?: number; height?: number }) {
  const pts = (series || []).filter((v): v is number => v != null);
  if (pts.length < 2) return <span style={{ fontSize: 10, color: C.dim }}>—</span>;
  const max = Math.max(...pts, 0.001);
  const step = width / (pts.length - 1);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = last - first;
  const color = delta > 0.02 ? '#16a34a' : delta < -0.02 ? '#b91c1c' : C.muted;
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-label={`trend ${Math.round(first * 100)}→${Math.round(last * 100)}%`}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - (last / max) * (height - 2) - 1} r={2} fill={color} />
    </svg>
  );
}

function TrustGapCockpit({ model, mode }: { model: Humanization; mode: ViewMode }) {
  const dims = model.dimensions || [];
  const flags = model.opportunities_and_risks || [];
  const ranked = model.ranked_actions || [];
  const trend = model.trend;
  // Kund-läge: defaulta kollapsad (mindre brus); Ops-läge: öppen (man behöver dykningen).
  const [open, setOpen] = useState(mode === 'ops');
  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title="Förtroendegap — säger, belägger, AI uppfattar"
        hint={open ? "Tre lager per dimension: vad ni SÄGER om er själva, vad ni BELÄGGER med oberoende underlag, och hur AI UPPFATTAR er. Gap där emellan är handlingen — perception vägs aldrig in i poängen." : `${dims.length} dimensioner · ${ranked.length} öppna åtgärder`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {!open ? null : (
      <>
      <p style={{ fontSize: 13, color: '#3a4b56', margin: '0 0 14px', lineHeight: 1.6 }}>{model.coverage_plain}</p>

      {trend?.previous_date && (
        <div style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          <strong style={{ color: '#3a4b56' }}>Sedan {trend.previous_date}:</strong>{' '}
          belagda områden {signedDelta(trend.demonstrated_delta)} · uttalade områden {signedDelta(trend.declared_delta)}.
        </div>
      )}
      {trend?.note && !trend.previous_date && (
        <div style={{ fontSize: 12, color: C.dim, margin: '0 0 14px', fontStyle: 'italic' }}>{trend.note}</div>
      )}

      {ranked.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(159,81,182,0.06)', border: '1px solid rgba(159,81,182,0.18)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Att göra — mest angeläget först</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: '#3a4b56', fontSize: 13, lineHeight: 1.65 }}>
            {ranked.map((a, i) => (
              <li key={i} style={{ marginBottom: i < ranked.length - 1 ? 6 : 0 }}>
                <strong>{a.label}:</strong> {a.why} <span style={{ color: '#16a34a' }}>{a.action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {flags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Möjligheter &amp; risker</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#3a4b56', fontSize: 13, lineHeight: 1.6 }}>
            {flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dims.map((d) => <DimensionRow key={d.dimension} dim={d} mode={mode} />)}
      </div>
      </>
      )}
    </div>
  );
}

function DimensionRow({ dim, mode }: { dim: HumanizationDim; mode: ViewMode }) {
  const raw = dim.raw || {};
  const declared = typeof raw.declared === 'number' ? raw.declared : null;
  const demonstrated = typeof raw.demonstrated === 'number' ? raw.demonstrated : null;
  const perceived = raw.perceived || null;
  // Perceived som "AI ser er" = salience × valens-mappad till 0..1 (valens 0.5 = neutralt, 1 = positivt, 0 = svalt).
  // Salience-golv 0.25 → annars "not visible" och inga staplar.
  const salience = typeof perceived?.salience === 'number' ? perceived.salience : null;
  const valence = typeof perceived?.valence === 'number' ? perceived.valence : null;
  const perceivedBar = salience != null && salience >= 0.25 && valence != null ? salience * valence : null;
  const overClaim = demonstrated != null && perceived?.status !== 'not_visible' && valence != null && (valence - (demonstrated ?? 0)) > 0.2;
  const opportunity = demonstrated != null && valence != null && ((demonstrated ?? 0) - valence) > 0.2;
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>{dim.label}</div>
        {overClaim && <span style={trustGapBadge('#b45309', 'rgba(245,158,11,0.14)')}>Risk: över-claim</span>}
        {opportunity && <span style={trustGapBadge('#0e7490', 'rgba(14,116,144,0.12)')}>Möjlighet: berätta mer</span>}
      </div>
      {mode === 'ops' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
          <TrustBar label="Säger" value={declared} hint="0 / 1" tone="declared" />
          <TrustBar label="Belägger" value={demonstrated} hint="0 → 1" tone="demonstrated" />
          <TrustBar
            label="AI uppfattar"
            value={perceivedBar}
            hint={perceived?.status === 'not_visible' ? 'AI ser er inte här ännu' : valence != null ? `salience ${salience?.toFixed(2) ?? '—'} · valens ${valence?.toFixed(2) ?? '—'}` : 'för lite synlighet'}
            tone="perceived"
          />
        </div>
      )}
      <div style={{ fontSize: 12, color: '#3a4b56', marginTop: 4, lineHeight: 1.5 }}>{dim.evidence_plain}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{dim.perception_plain}</div>
      {dim.perception_by_engine.length > 0 && (() => {
        // Splitta per knowledge-source så bas-kunskap (RLHF) och live-signal (web-RAG)
        // hålls visuellt åtskilda. Aldrig medeltala över source-typer.
        // Backend levererar knowledge_source per rad; fallback till lokal lookup om
        // fältet saknas (under deploy-skew kan en gammal payload nå en ny frontend).
        const sourceOf = (l: EnginePerceptionLine): KnowledgeSource =>
          l.knowledge_source ?? knowledgeSourceFor(l.engine);
        const training = dim.perception_by_engine.filter((l) => sourceOf(l) === 'training');
        const webRag = dim.perception_by_engine.filter((l) => sourceOf(l) === 'web_rag');
        const renderGroup = (entries: EnginePerceptionLine[], title: string) => (
          entries.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>{title}</div>
              <ul style={{ margin: '2px 0 0', paddingLeft: 16, color: C.dim, fontSize: 11, lineHeight: 1.5 }}>
                {entries.map((l) => <li key={l.engine}>{l.text}</li>)}
              </ul>
            </div>
          )
        );
        return (
          <>
            {renderGroup(training, 'AI Base Knowledge')}
            {renderGroup(webRag, 'AI Live Signal')}
          </>
        );
      })()}
      <div style={{ fontSize: 12, color: '#16a34a', marginTop: 6, lineHeight: 1.5 }}>
        <strong>Att göra:</strong> {dim.action}
      </div>
      {dim.confidence_note && <div style={{ fontSize: 11, color: C.dim, marginTop: 4, fontStyle: 'italic' }}>{dim.confidence_note}</div>}
    </div>
  );
}

function TrustBar({ label, value, hint, tone }: { label: string; value: number | null; hint?: string; tone: 'declared' | 'demonstrated' | 'perceived' }) {
  const colors = {
    declared: { fill: '#6a7e8a', track: 'rgba(106,126,138,0.14)' },
    demonstrated: { fill: '#9f51b6', track: 'rgba(159,81,182,0.14)' },
    perceived: { fill: '#0e7490', track: 'rgba(14,116,144,0.14)' },
  }[tone];
  const pctVal = value != null ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 8, background: colors.track, borderRadius: 4, overflow: 'hidden' }}>
        {value != null && (
          <div style={{ width: `${pctVal}%`, height: '100%', background: colors.fill, borderRadius: 4, transition: 'width .3s' }} />
        )}
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function trustGapBadge(color: string, bg: string): React.CSSProperties {
  return { fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${color}33`, borderRadius: 6, padding: '2px 8px', letterSpacing: '0.04em' };
}

function signedDelta(v: number | null | undefined): string {
  if (v == null) return 'oförändrat';
  if (v > 0) return `+${v}`;
  if (v < 0) return `${v}`;
  return 'oförändrat';
}

// --- Sticky kontextrad + hero -------------------------------------------------

type Hero = {
  primary: string;
  unit?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  stage?: string;
  tagline: string;
};

function buildHero(report: Report | null, riskQuestions: RiskQuestionsResp | null, polling: PollingWeek[] | null): Hero {
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
      primary: String(conf.score),
      unit: '/ 100',
      delta: deltaStr,
      deltaTone,
      stage: conf.stage,
      tagline: 'Beslutssäkerhet — hur säkert AI-motorerna svarar om er på beslutskritiska frågor.',
    };
  }
  // Fallback 1: godkända frågor finns men ingen rapport än → loopen rullar.
  const approved = riskQuestions?.counts.approved ?? 0;
  if (approved > 0) {
    return {
      primary: String(approved),
      unit: 'frågor mäts',
      stage: 'Loopen rullar',
      tagline: 'Beslutssäkerhet beräknas vid första månadsrapporten — frågorna mäts varje vecka under tiden.',
    };
  }
  // Fallback 2: bara veckodata.
  const latestWeek = polling?.[0];
  if (latestWeek?.share_of_voice != null) {
    return {
      primary: `${Math.round(latestWeek.share_of_voice * 100)}%`,
      unit: 'Share of Voice',
      stage: 'Tidigt läge',
      tagline: 'Beslutssäkerhet kräver godkända frågor + första månadsrapporten. Tills dess: rå synlighet.',
    };
  }
  return {
    primary: '—',
    stage: 'Loopen är inte aktiv',
    tagline: 'Starta loopen: kör polling, generera frågor, godkänn, mät.',
  };
}

function StickyContextBar({ clients, selected, onSelectClient, months, month, onSelectMonth, onRefresh, isDraft, mode, onModeChange, hero, reportShareUrl, engineHealth, onRefreshEngineHealth }: {
  clients: Client[];
  selected: string | null;
  onSelectClient: (v: string) => void;
  months: string[] | null;
  month: string | null;
  onSelectMonth: (v: string) => void;
  onRefresh: () => void;
  isDraft: boolean;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  hero: Hero;
  reportShareUrl: string | null;
  engineHealth: EngineHealthResp | null;
  onRefreshEngineHealth: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fullShareUrl = reportShareUrl ? `${GRAPH_API}${reportShareUrl}` : '';
  async function copyShareLink() {
    if (!fullShareUrl) return;
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Kopiera länken:', fullShareUrl);
    }
  }
  const deltaColor = hero.deltaTone === 'up' ? '#16a34a' : hero.deltaTone === 'down' ? '#b91c1c' : C.muted;
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        margin: '0 -24px 20px',
        padding: '14px 24px',
        background: 'rgba(248,249,250,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Kund</label>
          <select value={selected || ''} onChange={(e) => onSelectClient(e.target.value)} style={selectStyle}>
            {clients.length === 0 && <option value="">Inga kunder</option>}
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>{c.company_name || c.client_id}</option>
            ))}
          </select>

          {months && months.length > 0 && (
            <>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 8 }}>Rapport</label>
              <select value={month || ''} onChange={(e) => onSelectMonth(e.target.value)} style={selectStyle}>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </>
          )}

          <button
            onClick={onRefresh}
            title="Uppdatera all data"
            style={{ padding: '8px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} />
          </button>

          {isDraft && (
            <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.12)', border: '1px solid rgba(159,81,182,0.3)', borderRadius: 5, padding: '3px 8px', letterSpacing: '0.04em' }}>
              INTERNT UTKAST
            </span>
          )}

          {reportShareUrl && (
            <>
              <a
                href={fullShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Öppna utskriftsvyn — Skriv ut eller Spara som PDF där"
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: C.muted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, textDecoration: 'none', cursor: 'pointer', letterSpacing: '0.02em' }}
              >
                Utskriftsvy / PDF
              </a>
              <button
                onClick={copyShareLink}
                title="Kopiera direktlänk till denna månadsrapport"
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: copied ? S.resolved.fg : C.muted, background: copied ? S.resolved.bg : 'transparent', border: `1px solid ${copied ? S.resolved.border : C.border}`, borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em' }}
              >
                {copied ? 'Länk kopierad' : 'Kopiera länk'}
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Ops/Kund segmented toggle */}
        <div style={{ display: 'inline-flex', background: 'rgba(106,126,138,0.08)', borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {(['ops', 'customer'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={m === 'ops' ? 'Ops-läge: full insyn, jobbknappar, raw siffror' : 'Kund-läge: presentationsklar — bara plain-text + trender'}
              style={{
                padding: '6px 14px',
                background: mode === m ? '#ffffff' : 'transparent',
                color: mode === m ? '#3a4b56' : C.muted,
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {m === 'ops' ? 'Ops' : 'Kund'}
            </button>
          ))}
        </div>

        {/* Hero-tal */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#3a4b56', lineHeight: 1 }}>{hero.primary}</span>
          {hero.unit && <span style={{ fontSize: 12, color: C.muted }}>{hero.unit}</span>}
          {hero.stage && <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.1)', padding: '3px 8px', borderRadius: 5, letterSpacing: '0.04em' }}>{hero.stage}</span>}
          {hero.delta && <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>{hero.delta}</span>}
        </div>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{hero.tagline}</p>

      {/* Motor-status — synliggör om probarna faktiskt fungerar just nu */}
      {engineHealth && <EngineHealthBar data={engineHealth} onRefresh={onRefreshEngineHealth} />}
    </div>
  );
}

function EngineHealthBar({ data, onRefresh }: { data: EngineHealthResp; onRefresh: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const liveOk = data.engines.filter((e) => e.status === 'live' && e.ok === true).length;
  const liveTotal = data.engines.filter((e) => e.status === 'live').length;
  const banner = liveOk === 0 && liveTotal > 0
    ? { text: 'Ingen probe-motor svarar — mätningarna ger tom data tills detta är åtgärdat', tone: 'urgent' as const }
    : liveOk < liveTotal
      ? { text: `${liveOk}/${liveTotal} probe-motorer svarar — partiella mätningar`, tone: 'waiting' as const }
      : null;

  // Gruppera probarna efter kunskapskälla — bas-kunskap (RLHF, training-data)
  // vs live-signal (web-RAG). Olika fördelningar → ALDRIG medeltala över dem.
  // Planerade motorer (perplexity-stub, copilot etc) hamnar i "training" som default.
  const trainingEngines = data.engines.filter((e) => knowledgeSourceFor(e.id) === 'training');
  const webRagEngines = data.engines.filter((e) => knowledgeSourceFor(e.id) === 'web_rag');

  const renderChips = (engines: typeof data.engines) => engines.map((e) => (
    <EngineChip
      key={e.id}
      engine={e}
      active={openId === e.id}
      onClick={() => setOpenId((curr) => (curr === e.id ? null : e.id))}
    />
  ));

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Sektion 1: Bas-kunskap (training-data baserade modeller) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            title="Modeller som svarar utifrån sin träningsdata (RLHF). Påverkas av long-form innehåll, Wikipedia, autoritativa källor som hamnar i nästa träningsrunda."
            style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginRight: 4, cursor: 'help' }}
          >
            Bas-kunskap
          </span>
          {renderChips(trainingEngines)}
        </div>

        {/* Sektion 2: Live-signal (web-RAG) — bara om vi har sådana motorer */}
        {webRagEngines.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              title="Modeller som söker live på webben (web-RAG) innan de svarar. Påverkas av fresh press, SEO, structured data, nyhetscykel."
              style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginRight: 4, cursor: 'help' }}
            >
              Live-signal
            </span>
            {renderChips(webRagEngines)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button
          onClick={async () => { setRefreshing(true); await onRefresh(); setTimeout(() => setRefreshing(false), 600); }}
          title={`Senast kollat ${new Date(data.checked_at).toLocaleTimeString('sv-SE')} — klick för att probe på nytt`}
          style={{
            padding: '3px 8px', fontSize: 10, fontWeight: 600,
            color: refreshing ? C.accent : C.muted, background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          <RefreshCw size={10} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          {refreshing ? 'Probar…' : 'Kolla'}
        </button>
        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
          {new Date(data.checked_at).toLocaleTimeString('sv-SE')}
        </span>
      </div>

      {banner && (
        <div style={{
          marginTop: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
          color: banner.tone === 'urgent' ? S.open.fg : S.waiting.fg,
          background: banner.tone === 'urgent' ? S.open.bg : S.waiting.bg,
          border: `1px solid ${banner.tone === 'urgent' ? S.open.border : S.waiting.border}`,
          borderRadius: 6,
        }}>
          {banner.text}
        </div>
      )}

      {openId && (() => {
        const e = data.engines.find((x) => x.id === openId);
        if (!e) return null;
        return (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(106,126,138,0.05)', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, lineHeight: 1.5 }}>
            <strong style={{ color: '#3a4b56' }}>{e.label}</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>· {e.vendor}</span>
            {e.status === 'planned' ? (
              <>
                <span style={{ marginLeft: 8, color: S.neutral.fg, fontWeight: 600 }}>Planerad</span>
                {e.note && <div style={{ color: C.muted, marginTop: 4 }}>{e.note}</div>}
              </>
            ) : e.ok ? (
              <>
                <span style={{ marginLeft: 8, color: S.resolved.fg, fontWeight: 600 }}>Svarar</span>
                <div style={{ color: C.muted, marginTop: 4 }}>Latens: {e.latency_ms} ms</div>
              </>
            ) : (
              <>
                <span style={{ marginLeft: 8, color: S.open.fg, fontWeight: 600 }}>Fel</span>
                <div style={{ color: C.muted, marginTop: 4 }}>
                  {e.error || 'Okänt fel'}
                  {e.latency_ms != null && ` · efter ${e.latency_ms} ms`}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function EngineChip({ engine, active, onClick }: { engine: EngineHealth; active: boolean; onClick: () => void }) {
  const tone =
    engine.status === 'planned' ? S.neutral :
    engine.ok === true ? S.resolved :
    engine.ok === false ? S.open : S.neutral;
  const dotChar = engine.status === 'planned' ? '◌' : '●';
  const subtitle =
    engine.status === 'planned' ? 'Planerad' :
    engine.ok === true ? `${engine.latency_ms} ms` :
    'Fel';
  return (
    <button
      onClick={onClick}
      title={engine.status === 'planned' ? engine.note || 'Planerad motor' : engine.error || 'OK'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', fontSize: 11, fontWeight: 600,
        color: tone.fg, background: active ? tone.bg : 'transparent',
        border: `1px solid ${active ? tone.fg : tone.border}`,
        borderRadius: 999, cursor: 'pointer', letterSpacing: '0.02em',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{dotChar}</span>
      {engine.label}
      <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.75, letterSpacing: '0.03em' }}>· {subtitle}</span>
    </button>
  );
}

function isStale(startedAt: string | null | undefined, minutes: number): boolean {
  if (!startedAt) return false;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > minutes * 60 * 1000;
}

// --- Aktivitetsfeed -----------------------------------------------------------

const JOB_LABEL: Record<string, string> = {
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

const ACTIVITY_FEED_TYPES = new Set([
  'polling', 'risk_generate', 'risk_detect', 'monthly_report',
  'compute_trust_gap', 'compile_schema', 'event:report_generated',
]);

function summaryBlurb(jobType: string, summary: Record<string, unknown>): string {
  if (!summary || Object.keys(summary).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(summary)) {
    if (v == null || v === false || v === '') continue;
    if (typeof v === 'object') continue;
    parts.push(`${k}=${v}`);
  }
  return parts.slice(0, 3).join(' · ');
}

function ActivityFeed({ runs }: { runs: import('../_lib/jobRuns').JobRun[] | null }) {
  if (runs === null) return <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Laddar händelser…</div>;
  const filtered = runs.filter((r) => ACTIVITY_FEED_TYPES.has(r.job_type)).slice(0, 12);
  if (filtered.length === 0) {
    return <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Inga händelser ännu.</div>;
  }
  return (
    <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 10 }}>
        Senaste händelser
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((r) => {
          const stale = r.status === 'running' && isStale(r.started_at, 10);
          const dot = stale ? '#b45309' : r.status === 'success' ? '#16a34a' : r.status === 'failed' ? '#b91c1c' : '#0e7490';
          const label = JOB_LABEL[r.job_type] || r.job_type;
          const blurb = summaryBlurb(r.job_type, r.summary);
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 14px 1fr auto', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: stale ? '#b45309' : C.muted, fontFamily: 'ui-monospace, monospace' }}>{fmtRelative(r.started_at)}</span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 0 3px ${dot}22` }} />
              <span style={{ color: '#3a4b56' }}>
                <strong style={{ fontWeight: 600 }}>{label}</strong>
                {blurb && <span style={{ color: C.dim, marginLeft: 8 }}>{blurb}</span>}
                {r.error_message && <span style={{ color: '#b91c1c', marginLeft: 8 }}>· {r.error_message}</span>}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: dot, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stale ? 'möjligen stoppad' : r.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskLoopStatus({ questions, findings, latestDetect, latestGenerate, clientId, onChanged }: {
  questions: RiskQuestionsResp | null;
  findings: RiskTimelineResp | null;
  latestDetect: { status: string; started_at: string | null } | null | undefined;
  latestGenerate: { status: string; started_at: string | null } | null | undefined;
  clientId: string | null;
  onChanged: () => void;
}) {
  const [showApprover, setShowApprover] = useState(false);
  const qc = questions?.counts || { open: 0, approved: 0, rejected: 0 };
  const fc = findings?.counts || { open: 0, actioned: 0, resolved: 0, dismissed: 0 };
  const totalApproved = qc.approved;
  const hasPending = qc.open > 0;
  const hasApproved = totalApproved > 0;
  const hasOpenRisks = fc.open > 0;
  const detectStale = latestDetect?.status === 'running' && isStale(latestDetect.started_at, 10);

  // Bestäm nästa rekommenderade steg i den tredelade loopen.
  let nextStep: { label: string; tone: 'urgent' | 'normal' | 'good' };
  if (!hasApproved && !hasPending) {
    nextStep = { label: 'Generera frågor — loopen är inte aktiverad än', tone: 'urgent' };
  } else if (hasPending) {
    nextStep = { label: `Granska & godkänn ${qc.open} väntande fråga${qc.open === 1 ? '' : 'or'} — direkt här eller i Granska-fliken`, tone: 'urgent' };
  } else if (hasOpenRisks) {
    nextStep = { label: `Granska ${fc.open} öppna risk${fc.open === 1 ? '' : 'er'} — agera i Granska-fliken`, tone: 'urgent' };
  } else if (hasApproved) {
    nextStep = { label: `Loopen rullar — ${totalApproved} godkända frågor mäts varje vecka`, tone: 'good' };
  } else {
    nextStep = { label: 'Loopen är inaktiv', tone: 'normal' };
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Riskloop-status — generera → granska → mät"
        hint="Tredelad loop: risk-generate skapar frågor (kräver godkännande), risk-detect kör endast godkända frågor mot motorerna, fynd → korrigeringar → lösta efter två rena cykler."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <LoopStat label="Väntar granskning" value={qc.open} tone={hasPending ? 'urgent' : 'idle'} hint={hasPending ? 'godkänn i Granska-fliken' : 'inga'} />
        <LoopStat label="Godkända frågor" value={totalApproved} tone={hasApproved ? 'good' : 'idle'} hint={hasApproved ? 'mäts veckovis' : 'kör risk-generate'} />
        <LoopStat label="Öppna risker" value={fc.open} tone={hasOpenRisks ? 'urgent' : 'idle'} hint={`${fc.actioned} åtgärdade · ${fc.resolved} lösta`} />
        <LoopStat label="Senaste detect" value={latestDetect ? (detectStale ? 'stale' : latestDetect.status) : '—'} tone={detectStale ? 'urgent' : latestDetect?.status === 'success' ? 'good' : 'idle'} hint={latestGenerate ? `gen: ${latestGenerate.status}` : 'risk-generate ej kört'} />
      </div>

      <div style={{
        padding: '10px 14px',
        background: nextStep.tone === 'urgent' ? 'rgba(245,158,11,0.08)' : nextStep.tone === 'good' ? 'rgba(22,163,74,0.06)' : 'rgba(106,126,138,0.06)',
        border: `1px solid ${nextStep.tone === 'urgent' ? 'rgba(245,158,11,0.3)' : nextStep.tone === 'good' ? 'rgba(22,163,74,0.25)' : C.border}`,
        borderRadius: 8,
        fontSize: 12,
        color: '#3a4b56',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <strong style={{ color: nextStep.tone === 'urgent' ? '#b45309' : nextStep.tone === 'good' ? '#16a34a' : C.muted, letterSpacing: '0.02em' }}>NÄSTA STEG:</strong>
        <span>{nextStep.label}</span>
        {hasPending && clientId && (
          <button
            onClick={() => setShowApprover((s) => !s)}
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: showApprover ? '#3a4b56' : S.waiting.fg,
              background: showApprover ? '#ffffff' : S.waiting.bg,
              border: `1px solid ${showApprover ? C.border : S.waiting.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {showApprover ? 'Dölj inline-godkännande' : `Godkänn ${qc.open} fråga${qc.open === 1 ? '' : 'or'} inline →`}
          </button>
        )}
      </div>

      {showApprover && hasPending && clientId && questions && (
        <RiskQuestionsInlineApprover
          clientId={clientId}
          questions={questions.questions.filter((q) => q.status === 'open')}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function RiskQuestionsInlineApprover({ clientId, questions, onChanged }: {
  clientId: string;
  questions: RiskQuestionsResp['questions'];
  onChanged: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function decide(qid: string, decision: 'approve' | 'reject') {
    setInFlight((s) => new Set(s).add(qid));
    setErrors((e) => ({ ...e, [qid]: '' }));
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions/${qid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
    } catch (e) {
      setErrors((es) => ({ ...es, [qid]: e instanceof Error ? e.message : 'Misslyckades' }));
    } finally {
      setInFlight((s) => {
        const next = new Set(s);
        next.delete(qid);
        return next;
      });
    }
  }

  async function bulkDecide(decision: 'approve' | 'reject') {
    const ids = decision === 'reject' && checked.size === 0
      ? questions.map((q) => q.id) // "Avvisa alla" — ingen markering krävs
      : Array.from(checked);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => decide(id, decision)));
      setChecked(new Set());
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (questions.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(245,158,11,0.04)', border: `1px solid ${S.waiting.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: S.waiting.fg, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Inline-godkännande
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {checked.size > 0 ? `${checked.size} markerade · ` : ''}{questions.length} öppna frågor
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            disabled={busy || checked.size === 0}
            onClick={() => bulkDecide('approve')}
            style={inlineBtn(S.resolved, busy || checked.size === 0)}
          >
            {busy ? 'Sparar…' : `Godkänn ${checked.size || 'markerade'}`}
          </button>
          <button
            disabled={busy || checked.size === 0}
            onClick={() => bulkDecide('reject')}
            style={inlineBtn(S.open, busy || checked.size === 0)}
          >
            Avvisa markerade
          </button>
          <a
            href={`/insider-graph/review?client=${encodeURIComponent(clientId)}`}
            style={{ ...inlineBtn(S.neutral, false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            title="Öppna full Granska-flik"
          >
            Granska-fliken →
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
        {questions.map((q) => {
          const pending = inFlight.has(q.id);
          const err = errors[q.id];
          return (
            <div key={q.id} style={{
              display: 'grid',
              gridTemplateColumns: '20px 80px 70px 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '8px 6px',
              borderRadius: 6,
              background: checked.has(q.id) ? 'rgba(159,81,182,0.06)' : 'transparent',
              fontSize: 12,
              opacity: pending ? 0.5 : 1,
            }}>
              <input
                type="checkbox"
                checked={checked.has(q.id)}
                onChange={() => toggle(q.id)}
                disabled={pending || busy}
                style={{ accentColor: C.accent }}
              />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {q.persona ? PERSONA_SV[q.persona] || q.persona : '—'}
              </span>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>
                {q.type || '—'}
              </span>
              <span style={{ color: '#3a4b56', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.text || ''}>
                {q.text || '(ingen text)'}
                {err && <span style={{ color: S.open.fg, marginLeft: 8 }}>· {err}</span>}
              </span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <button
                  disabled={pending || busy}
                  onClick={async () => { await decide(q.id, 'approve'); onChanged(); }}
                  style={singleBtn(S.resolved, pending || busy)}
                  title="Godkänn"
                >
                  ✓
                </button>
                <button
                  disabled={pending || busy}
                  onClick={async () => { await decide(q.id, 'reject'); onChanged(); }}
                  style={singleBtn(S.open, pending || busy)}
                  title="Avvisa"
                >
                  ✗
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function inlineBtn(tone: { fg: string; bg: string; border: string }, disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: tone.fg,
    background: disabled ? 'transparent' : tone.bg,
    border: `1px solid ${disabled ? C.border : tone.border}`,
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.02em',
    opacity: disabled ? 0.5 : 1,
  };
}

function singleBtn(tone: { fg: string; bg: string; border: string }, disabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 22,
    fontSize: 12,
    fontWeight: 600,
    color: tone.fg,
    background: disabled ? 'transparent' : tone.bg,
    border: `1px solid ${disabled ? C.border : tone.border}`,
    borderRadius: 5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

function ApprovedQuestionsPanel({ questions, clientId, mode, onChanged }: {
  questions: RiskQuestionsResp['questions'];
  clientId: string | null;
  mode: ViewMode;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Kund-läge: bara kategorisummering, ingen drill-down och inga avvisa-knappar.
  const byPersona = new Map<string, number>();
  for (const q of questions) {
    const p = q.persona || 'okänd';
    byPersona.set(p, (byPersona.get(p) || 0) + 1);
  }

  async function reject(qid: string) {
    if (!clientId) return;
    setInFlight((s) => new Set(s).add(qid));
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions/${qid}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'reject' }),
      });
      onChanged();
    } catch {
      // tyst — refresh återställer
    } finally {
      setInFlight((s) => {
        const next = new Set(s);
        next.delete(qid);
        return next;
      });
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title={`Godkända frågor — vad AI-motorerna får frågan om`}
        hint={open
          ? "De aktiva frågorna som risk-detect kör mot motorerna varje vecka. Avvisa en fråga som visat sig vara dålig — den körs inte längre och kan ersättas med en ny via Generera frågor."
          : `${questions.length} ${questions.length === 1 ? 'godkänd fråga' : 'godkända frågor'} mäts veckovis · ${Array.from(byPersona.entries()).map(([p, n]) => `${n} ${PERSONA_SV[p] || p}`).join(' · ')}`
        }
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={`${questions.length}`}
      />

      {open && (
        mode === 'customer' ? (
          // Kund-läge: bara kategori-summering, ingen rad-för-rad-text
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(['buyer', 'candidate', 'investor'] as const).map((p) => {
              const n = byPersona.get(p) || 0;
              return (
                <div key={p} style={{ padding: '12px 14px', background: 'rgba(159,81,182,0.04)', border: `1px solid ${S.inProgress.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>
                    {PERSONA_SV[p]}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: S.inProgress.fg, letterSpacing: '-0.02em' }}>{n}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{n === 1 ? 'fråga mäts' : 'frågor mäts'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          // Ops-läge: full lista med avvisa-knapp per rad + "Lägg till egen"
          <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button
              onClick={() => setAdding(true)}
              disabled={!clientId}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                color: C.accent, background: 'rgba(159,81,182,0.08)',
                border: `1px solid ${S.inProgress.border}`, borderRadius: 6,
                cursor: clientId ? 'pointer' : 'not-allowed', letterSpacing: '0.02em',
              }}
            >
              + Lägg till egen fråga
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {questions.map((q) => {
              const busy = inFlight.has(q.id);
              const personaLabel = q.persona ? PERSONA_SV[q.persona] || q.persona : '—';
              const typeLabel = q.type === 'comparative' ? 'jämförelse' : q.type === 'open' ? 'öppen' : q.type || '';
              return (
                <div
                  key={q.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 70px 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'rgba(22,163,74,0.04)',
                    border: `1px solid ${S.resolved.border}`,
                    borderRadius: 6,
                    fontSize: 12,
                    opacity: busy ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, color: S.inProgress.fg, background: S.inProgress.bg, border: `1px solid ${S.inProgress.border}`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {personaLabel}
                  </span>
                  <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>{typeLabel}</span>
                  <span style={{ color: '#3a4b56', lineHeight: 1.5 }}>
                    {q.text || <span style={{ color: C.dim, fontStyle: 'italic' }}>(saknar fråge-text)</span>}
                    {q.custom && (
                      <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.1)', border: `1px solid ${S.inProgress.border}`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', verticalAlign: 'middle' }}>
                        Egen
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => reject(q.id)}
                    disabled={busy || !clientId}
                    title="Avvisa frågan — den körs inte längre"
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      color: S.open.fg, background: 'white',
                      border: `1px solid ${S.open.border}`, borderRadius: 5,
                      cursor: busy ? 'wait' : 'pointer', letterSpacing: '0.02em',
                    }}
                  >
                    ✗ Avvisa
                  </button>
                </div>
              );
            })}
          </div>
          </>
        )
      )}

      {adding && clientId && (
        <CustomQuestionModal
          clientId={clientId}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function CustomQuestionModal({ clientId, onClose, onCreated }: {
  clientId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [persona, setPersona] = useState<'buyer' | 'candidate' | 'investor'>('buyer');
  const [type, setType] = useState<'open' | 'comparative'>('open');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'sv' | 'en'>('sv');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) {
      setError('Frågans text kan inte vara tom');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona, type, text: text.trim(), language }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Misslyckades — försök igen');
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: '24px 26px',
          width: 'min(560px, 92vw)', boxShadow: '0 20px 60px rgba(58,75,86,0.18)',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: '#3a4b56', marginBottom: 4 }}>
          Lägg till egen risk-fråga
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
          Frågan körs direkt av risk-detect varje vecka (skippar review-grinden eftersom du själv lade in den).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormRow label="Persona — vem ställer frågan">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['buyer', 'candidate', 'investor'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  style={{
                    flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    color: persona === p ? S.inProgress.fg : C.muted,
                    background: persona === p ? S.inProgress.bg : 'transparent',
                    border: `1px solid ${persona === p ? S.inProgress.border : C.border}`,
                    borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                  }}
                >
                  {PERSONA_SV[p]}
                </button>
              ))}
            </div>
          </FormRow>

          <FormRow label="Typ">
            <div style={{ display: 'flex', gap: 6 }}>
              {([['open', 'Öppen'], ['comparative', 'Jämförelse']] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                    color: type === v ? '#3a4b56' : C.muted,
                    background: type === v ? '#f4f5f6' : 'transparent',
                    border: `1px solid ${type === v ? '#3a4b56' : C.border}`,
                    borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                  }}
                >
                  {lbl}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'sv' | 'en')}
                style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, color: '#3a4b56', background: 'white' }}
              >
                <option value="sv">Svenska</option>
                <option value="en">Engelska</option>
              </select>
            </div>
          </FormRow>

          <FormRow label="Frågans text">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="T.ex. 'Vilka företag i Sverige är ledande inom AI-säkerhet?'"
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                color: '#3a4b56', border: `1px solid ${C.border}`,
                borderRadius: 6, fontFamily: 'inherit', lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
              Skriv som om en {PERSONA_SV[persona].toLowerCase()} faktiskt skulle ställa den. Var konkret.
            </div>
          </FormRow>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '8px 12px', background: S.open.bg, border: `1px solid ${S.open.border}`, color: S.open.fg, borderRadius: 6, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              color: C.muted, background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={submitting || !text.trim()}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              color: 'white', background: S.resolved.fg,
              border: `1px solid ${S.resolved.fg}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || !text.trim()) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Lägger till…' : 'Lägg till + godkänn'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function LoopStat({ label, value, tone, hint }: { label: string; value: number | string; tone: 'urgent' | 'good' | 'idle'; hint?: string }) {
  const color = tone === 'urgent' ? '#b45309' : tone === 'good' ? '#16a34a' : C.muted;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color, letterSpacing: '-0.02em' }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

const RISK_STATUS_SV: Record<RiskStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Öppen', color: S.open.fg, bg: S.open.bg },
  actioned: { label: 'Åtgärdad', color: S.inProgress.fg, bg: S.inProgress.bg },
  resolved: { label: 'Löst', color: S.resolved.fg, bg: S.resolved.bg },
  dismissed: { label: 'Avfärdad', color: S.neutral.fg, bg: S.neutral.bg },
};

function RiskLifecycleTimeline({ data, approvedQuestions }: { data: RiskTimelineResp; approvedQuestions: number | null }) {
  const [filter, setFilter] = useState<RiskStatus | 'all'>('all');
  const rows = filter === 'all' ? data.findings : data.findings.filter((r) => r.status === filter);
  const total = data.findings.length;
  const counts = data.counts;
  // Defaulta öppen om det finns något att visa, annars kollapsad.
  const [open, setOpen] = useState(total > 0);
  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title="Riskens livscykel — detektion → åtgärd → löst"
        hint={open ? "Per risk: när AI:n först gav ett farligt svar, när mjukvaran publicerade en korrigering, och när motorn slutat upprepa problemet. Beviset att loopen sluter sig." : `${total} ${total === 1 ? 'risk' : 'risker'} totalt · ${counts.open} öppna · ${counts.resolved} lösta`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={counts.open > 0 ? `${counts.open} öppna` : undefined}
      />
      {open && (<>

      {total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <RiskFilterChip label={`Alla (${total})`} active={filter === 'all'} onClick={() => setFilter('all')} />
          {(['open', 'actioned', 'resolved', 'dismissed'] as RiskStatus[]).map((s) =>
            counts[s] > 0 ? (
              <RiskFilterChip
                key={s}
                label={`${RISK_STATUS_SV[s].label} (${counts[s]})`}
                active={filter === s}
                onClick={() => setFilter(s)}
                tone={RISK_STATUS_SV[s]}
              />
            ) : null,
          )}
        </div>
      )}

      {total === 0 ? (
        <RiskTimelineEmpty approvedQuestions={approvedQuestions} />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker i den här statusen.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((r, i) => <RiskTimelineCard key={r.id} row={r} isLast={i === rows.length - 1} />)}
        </div>
      )}
      </>)}
    </div>
  );
}

function RiskTimelineEmpty({ approvedQuestions }: { approvedQuestions: number | null }) {
  // Kontextuell tomtext beroende på var i tredelade loopen kunden står.
  if (approvedQuestions === null) {
    return <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker att visa ännu.</p>;
  }
  if (approvedQuestions === 0) {
    return (
      <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 13, color: '#3a4b56', lineHeight: 1.55 }}>
        <strong style={{ color: '#b45309' }}>Loopen är inte aktiverad än.</strong> Inga godkända frågor finns — det betyder att risk-detect kör en no-op
        ({'questions_asked: 0'}). Kör <code style={{ color: C.accent }}>risk-generate</code> i jobbraden ovan, sedan godkänn frågor i Granska-fliken;
        därefter kommer denna tidslinje fyllas allt eftersom motorerna producerar farliga svar.
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, fontSize: 13, color: '#3a4b56', lineHeight: 1.55 }}>
      <strong style={{ color: '#16a34a' }}>Inga risker hittade.</strong> {approvedQuestions} godkända fråga{approvedQuestions === 1 ? '' : 'or'} kördes
      — motorerna svarade säkert på alla. Tidslinjen fylls den vecka något bryter mönstret.
    </div>
  );
}

function RiskFilterChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: { color: string; bg: string } }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        background: active ? tone?.bg || 'rgba(159,81,182,0.14)' : 'transparent',
        color: active ? tone?.color || C.accent : C.muted,
        border: `1px solid ${active ? tone?.color || C.accent : C.border}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </button>
  );
}

function RiskTimelineCard({ row, isLast }: { row: RiskTimelineRow; isLast: boolean }) {
  const st = RISK_STATUS_SV[row.status];
  const sev = row.severity ? SEVERITY[row.severity] : null;
  const events = buildLifecycleEvents(row);
  return (
    <div style={{ padding: '14px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#3a4b56', lineHeight: 1.5 }}>{row.question || '—'}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {row.persona ? PERSONA_SV[row.persona] || row.persona : '—'}
            {row.engine && ` · ${ENGINE_SV[row.engine] || row.engine}`}
            {row.harm && ` · ${harmLabel(row.harm)}`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.color}33`, borderRadius: 6, padding: '3px 8px', letterSpacing: '0.04em' }}>{st.label}</span>
          {sev && <span style={{ fontSize: 10, fontWeight: 600, color: sev.color, background: sev.bg, border: `1px solid ${sev.color}33`, borderRadius: 6, padding: '2px 7px' }}>{sev.label}</span>}
        </div>
      </div>

      {row.engine_excerpt && (
        <div style={{ fontSize: 11, color: C.dim, fontStyle: 'italic', margin: '4px 0 8px', padding: '6px 10px', background: 'rgba(58,75,86,0.04)', borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}>
          "{row.engine_excerpt}"
        </div>
      )}

      {events.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 10, fontSize: 11 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, flex: i === events.length - 1 ? '0 0 auto' : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 90 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev.color, boxShadow: `0 0 0 3px ${ev.color}22` }} />
                <div style={{ fontSize: 10, color: ev.color, fontWeight: 600 }}>{ev.label}</div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{ev.date}</div>
                {ev.detail && <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 1.3 }}>{ev.detail}</div>}
              </div>
              {i < events.length - 1 && (
                <div style={{ flex: 1, height: 2, background: ev.color, opacity: 0.4, margin: '0 4px', marginTop: -22 }} />
              )}
            </div>
          ))}
        </div>
      )}

      {row.ammo_claim_ids.length > 0 && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          Korrigering kopplad: <code style={{ color: C.accent, fontSize: 11 }}>{row.ammo_claim_ids.join(', ')}</code>
        </div>
      )}
    </div>
  );
}

function buildLifecycleEvents(row: RiskTimelineRow): { label: string; date: string; color: string; detail?: string }[] {
  const out: { label: string; date: string; color: string; detail?: string }[] = [];
  if (row.detected_at) out.push({ label: 'Detekterad', date: fmtDate(row.detected_at), color: '#b91c1c' });
  if (row.action_at) {
    out.push({
      label: row.action_taken === 'reinforced_claim' ? 'Korrigerad' : row.status === 'dismissed' ? 'Avfärdad' : 'Åtgärdad',
      date: fmtDate(row.action_at),
      color: row.status === 'dismissed' ? '#6a7e8a' : '#9f51b6',
    });
  }
  if (row.resolved_at) {
    out.push({ label: 'Löst', date: fmtDate(row.resolved_at), color: '#16a34a', detail: `efter ${row.clean_streak} rena cykler` });
  } else if (row.status === 'actioned' && row.clean_streak > 0) {
    out.push({ label: 'Ren-streak', date: '—', color: '#0e7490', detail: `${row.clean_streak} cykler` });
  }
  return out;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em', color: color || (accent ? C.accent : '#3a4b56') }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ ...cardStyle, padding: '48px 24px', textAlign: 'center' }}>
      <Radar size={32} color={C.dim} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, color: '#3a4b56', fontWeight: 600 }}>Ingen riskrapport ännu</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Generera och godkänn ett frågebatteri, kör riskdetekteringen och bygg månadsrapporten
        (jobben <code style={{ color: C.accent }}>risk-generate</code> → <code style={{ color: C.accent }}>risk-detect</code> → <code style={{ color: C.accent }}>monthly-report</code>).
        Rapporten dyker upp här när den finns.
      </div>
    </div>
  );
}

function harmLabel(harm: string | null): string {
  if (!harm) return '—';
  const sv = HARM_SV[harm];
  return sv ? `${harm} ${sv}` : harm;
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

// Sentiment −1..1 → svensk etikett + färg.
function sentimentLabel(s: number | null | undefined): { text: string; color: string } {
  if (s == null) return { text: '—', color: C.dim };
  if (s > 0.15) return { text: `Positivt (${s.toFixed(2)})`, color: '#16a34a' };
  if (s < -0.15) return { text: `Negativt (${s.toFixed(2)})`, color: '#b91c1c' };
  return { text: `Neutralt (${s.toFixed(2)})`, color: C.muted };
}

/* --- delade stilar --- */

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '22px 26px',
  boxShadow: '0 1px 2px rgba(58,75,86,0.03)',
};

const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '0.8fr 2fr 2.5fr 1.4fr 0.9fr',
  gap: 12,
};

const catGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.5fr 1.2fr 1.4fr 0.8fr',
  gap: 12,
};

const catGridTrend: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.8fr 1.3fr 0.8fr 1.1fr',
  gap: 12,
};

const engineGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr 1.3fr 0.8fr 1.1fr',
  gap: 12,
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#eef0f1',
  color: '#3a4b56',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
};

const errorStyle: React.CSSProperties = {
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 8,
  padding: '12px 16px',
  color: '#b91c1c',
  fontSize: 12,
  marginBottom: 16,
};
