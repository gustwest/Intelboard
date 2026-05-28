'use client';

import { useEffect, useState } from 'react';
import { Radar, RefreshCw, Play, Loader2, Check, X, Clock, Pause, CalendarClock } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';
import { useJobRuns, fmtRelative } from '../_lib/jobRuns';

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

type PollingWeek = {
  week_id: string;
  share_of_voice: number | null;
  sentiment_score: number | null;
  parity_index: number | null;
  category_results: Record<string, CategoryResult> | null;
  per_engine: Record<string, EngineResult> | null;
  total_answers: number | null;
  answers_with_mention: number | null;
  models_used: string[] | null;
};

const ENGINE_SV: Record<string, string> = {
  'gpt-4o': 'ChatGPT',
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
  questions: { id: string; persona: string | null; type: string | null; text: string | null; status: string }[];
  counts: { open: number; approved: number; rejected: number };
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
type HumanizationDim = {
  dimension: string;
  label: string;
  evidence_plain: string;
  perception_plain: string;
  perception_by_engine: string[];
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

const SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'Hög', color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
  medium: { label: 'Medel', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  low: { label: 'Låg', color: '#6a7e8a', bg: 'rgba(106,126,138,0.12)' },
};

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
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { latest, active: jobActive, trigger: runJob } = useJobRuns(selected);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients.length && !selected) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setError(e.message));
  }, []);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select value={selected || ''} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          {clients.length === 0 && <option value="">Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>

        {months && months.length > 0 && (
          <>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Rapport:</label>
            <select value={month || ''} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          onClick={() => month && selected && graphFetch<Report>(`/api/reports/${selected}/${month}`).then(setReport).catch((e) => setError(e.message))}
          title="Uppdatera"
          style={{ padding: '8px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
        >
          <RefreshCw size={14} />
        </button>

        {report?.is_draft && (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.12)', border: '1px solid rgba(159,81,182,0.3)', borderRadius: 6, padding: '4px 8px' }}>
            Internt utkast
          </span>
        )}
      </div>

      {/* Jobbkontroller + senast körd */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {renderJobBtn('Kör polling', 'polling', '/api/jobs/polling', 'polling', { onDone: () => setRefreshTick((t) => t + 1) })}
        {renderJobBtn('Generera frågor', 'generate', `/api/jobs/risk-generate/${selected}`, 'risk_generate', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        {renderJobBtn('Kör risk-detect', 'risk', `/api/jobs/risk-detect/${selected}`, 'risk_detect', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        {renderJobBtn('Bygg månadsrapport', 'report', `/api/jobs/monthly-report/${selected}`, 'monthly_report', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: C.muted, marginLeft: 8 }}>
          {([['polling', 'Polling'], ['risk_generate', 'Frågor'], ['risk_detect', 'Risk-detect'], ['monthly_report', 'Rapport']] as [string, string][]).map(([type, label]) => {
            const run = latest(type);
            const stale = run?.status === 'running' && isStale(run.started_at, 10);
            return (
              <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock size={12} color={stale ? '#b45309' : C.dim} />
                <strong style={{ color: '#3a4b56', fontWeight: 600 }}>{label}:</strong>
                {run ? (
                  <>
                    <span style={{ color: stale ? '#b45309' : undefined }}>{fmtRelative(run.started_at)}</span>
                    {run.status === 'success' && <Check size={12} color="#16a34a" />}
                    {run.status === 'failed' && <X size={12} color="#dc2626" />}
                    {stale && <span title={`Kör fortfarande sedan ${run.started_at} — sannolikt zombie efter revision-rollover`} style={{ fontSize: 10, color: '#b45309', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5, padding: '1px 6px', fontWeight: 600 }}>möjligen stoppad</span>}
                  </>
                ) : (
                  <span style={{ color: C.dim }}>aldrig körd</span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Schemalagda körningar — verkligt Cloud Scheduler-läge + paus/återuppta */}
      {schedules?.available && schedules.schedules.length > 0 && (
        <SchedulesPanel rows={schedules.schedules} onToggle={toggleSchedule} />
      )}

      {/* Riskloop-status — synliggör tredelade loopen generate → review → detect */}
      {(riskQuestions || riskTimeline) && (
        <RiskLoopStatus
          questions={riskQuestions}
          findings={riskTimeline}
          latestDetect={latest('risk_detect')}
          latestGenerate={latest('risk_generate')}
        />
      )}

      {/* Veckovis synlighet — det löpande, automatiska måttet (visas oavsett månadsrapport) */}
      {polling && polling.length > 0 && <WeeklyVisibility weeks={polling} />}

      {/* Förtroendegap-cockpit — säger / belägger / AI uppfattar, per dimension */}
      {humanization?.available && <TrustGapCockpit model={humanization} />}

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

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>{title}</h2>
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0', lineHeight: 1.5 }}>{hint}</p>}
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
          {cats.map(([cat, r]) => {
            const cs = sentimentLabel(r.sentiment_score);
            return (
              <div key={cat} style={{ ...catGridTrend, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'center' }}>
                <span style={{ color: '#3a4b56' }}>{CATEGORY_SV[cat] || cat}</span>
                <span style={{ color: '#3a4b56' }}>{Math.round(r.share_of_voice * 100)}%</span>
                <span style={{ color: cs.color }}>{cs.text}</span>
                <span style={{ color: C.dim }}>{Math.round(r.mention_count)}/{Math.round(r.answer_count)}</span>
                <Sparkline series={catTrend[cat]} />
              </div>
            );
          })}
        </div>
      )}

      {engineEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Per AI-motor — senaste veckan + trend</div>
          <div style={{ ...engineGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
            <span>Motor</span>
            <span>SoV</span>
            <span>Sentiment</span>
            <span>Nämner</span>
            <span>Trend (12v)</span>
          </div>
          {engineEntries.map(([eng, r]) => {
            const es = sentimentLabel(r.sentiment_score);
            return (
              <div key={eng} style={{ ...engineGrid, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'center' }}>
                <span style={{ color: '#3a4b56', fontWeight: 600 }}>{ENGINE_SV[eng] || eng}</span>
                <span style={{ color: '#3a4b56' }}>{Math.round(r.share_of_voice * 100)}%</span>
                <span style={{ color: es.color }}>{es.text}</span>
                <span style={{ color: C.dim }}>{r.mention_count}/{r.answer_count}</span>
                <Sparkline series={engineTrend[eng]} />
              </div>
            );
          })}
        </div>
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

function TrustGapCockpit({ model }: { model: Humanization }) {
  const dims = model.dimensions || [];
  const flags = model.opportunities_and_risks || [];
  const ranked = model.ranked_actions || [];
  const trend = model.trend;
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Förtroendegap — säger, belägger, AI uppfattar"
        hint="Tre lager per dimension: vad ni SÄGER om er själva, vad ni BELÄGGER med oberoende underlag, och hur AI UPPFATTAR er. Gap där emellan är handlingen — perception vägs aldrig in i poängen."
      />
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
        {dims.map((d) => <DimensionRow key={d.dimension} dim={d} />)}
      </div>
    </div>
  );
}

function DimensionRow({ dim }: { dim: HumanizationDim }) {
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
      <div style={{ fontSize: 12, color: '#3a4b56', marginTop: 4, lineHeight: 1.5 }}>{dim.evidence_plain}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{dim.perception_plain}</div>
      {dim.perception_by_engine.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: C.dim, fontSize: 11, lineHeight: 1.5 }}>
          {dim.perception_by_engine.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
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

function isStale(startedAt: string | null | undefined, minutes: number): boolean {
  if (!startedAt) return false;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > minutes * 60 * 1000;
}

function RiskLoopStatus({ questions, findings, latestDetect, latestGenerate }: {
  questions: RiskQuestionsResp | null;
  findings: RiskTimelineResp | null;
  latestDetect: { status: string; started_at: string | null } | null | undefined;
  latestGenerate: { status: string; started_at: string | null } | null | undefined;
}) {
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
    nextStep = { label: `Granska & godkänn ${qc.open} väntande fråga${qc.open === 1 ? '' : 'or'} i Granska-fliken`, tone: 'urgent' };
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
      }}>
        <strong style={{ color: nextStep.tone === 'urgent' ? '#b45309' : nextStep.tone === 'good' ? '#16a34a' : C.muted, letterSpacing: '0.02em' }}>NÄSTA STEG:</strong>
        <span>{nextStep.label}</span>
      </div>
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
  open: { label: 'Öppen', color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
  actioned: { label: 'Åtgärdad', color: '#9f51b6', bg: 'rgba(159,81,182,0.14)' },
  resolved: { label: 'Löst', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  dismissed: { label: 'Avfärdad', color: '#6a7e8a', bg: 'rgba(106,126,138,0.14)' },
};

function RiskLifecycleTimeline({ data, approvedQuestions }: { data: RiskTimelineResp; approvedQuestions: number | null }) {
  const [filter, setFilter] = useState<RiskStatus | 'all'>('all');
  const rows = filter === 'all' ? data.findings : data.findings.filter((r) => r.status === filter);
  const total = data.findings.length;
  const counts = data.counts;
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Riskens livscykel — detektion → åtgärd → löst"
        hint="Per risk: när AI:n först gav ett farligt svar, när mjukvaran publicerade en korrigering, och när motorn slutat upprepa problemet. Beviset att loopen sluter sig."
      />

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
  padding: '18px 22px',
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
