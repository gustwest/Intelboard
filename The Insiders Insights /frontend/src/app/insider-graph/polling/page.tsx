'use client';

import { useEffect, useState } from 'react';
import { Radar, RefreshCw, Play, Loader2, Check, X, Clock } from 'lucide-react';
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

type PollingWeek = {
  week_id: string;
  share_of_voice: number | null;
  sentiment_score: number | null;
  parity_index: number | null;
  category_results: Record<string, CategoryResult> | null;
  total_answers: number | null;
  answers_with_mention: number | null;
  models_used: string[] | null;
};

const CATEGORY_SV: Record<string, string> = {
  affar: 'Affär',
  finans: 'Finans',
  innovation: 'Innovation',
  hr: 'HR',
};

// --- Humaniseringsbild (speglar services/trust_gap_report.py — översättningslagret §10.1) ---

type HumanizationDim = {
  dimension: string;
  label: string;
  evidence_plain: string;
  perception_plain: string;
  perception_by_engine: string[];
  action: string;
  confidence_note: string | null;
};
type Humanization = {
  available: boolean;
  coverage_plain?: string;
  dimensions?: HumanizationDim[];
  ranked_actions?: { label: string; why: string; action: string }[];
  opportunities_and_risks?: string[];
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
  const [humanization, setHumanization] = useState<Humanization | null>(null);
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
        {renderJobBtn('Kör risk-detect', 'risk', `/api/jobs/risk-detect/${selected}`, 'risk_detect', { needsClient: true })}
        {renderJobBtn('Bygg månadsrapport', 'report', `/api/jobs/monthly-report/${selected}`, 'monthly_report', { needsClient: true, onDone: () => setRefreshTick((t) => t + 1) })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: C.muted, marginLeft: 8 }}>
          {([['polling', 'Polling'], ['risk_detect', 'Risk-detect'], ['monthly_report', 'Rapport']] as [string, string][]).map(([type, label]) => {
            const run = latest(type);
            return (
              <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock size={12} color={C.dim} />
                <strong style={{ color: '#3a4b56', fontWeight: 600 }}>{label}:</strong>
                {run ? (
                  <>
                    <span>{fmtRelative(run.started_at)}</span>
                    {run.status === 'success' && <Check size={12} color="#16a34a" />}
                    {run.status === 'failed' && <X size={12} color="#dc2626" />}
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

      {/* Veckovis synlighet — det löpande, automatiska måttet (visas oavsett månadsrapport) */}
      {polling && polling.length > 0 && <WeeklyVisibility weeks={polling} />}

      {/* Humaniseringsbild — hur AI uppfattar kundens mänsklighet (kultur-/värmedimensioner) */}
      {humanization?.available && <HumanizationView model={humanization} />}

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

function WeeklyVisibility({ weeks }: { weeks: PollingWeek[] }) {
  const latest = weeks[0];
  // Trenden ritas äldst → nyast (API:t ger nyast först).
  const sovSeries = [...weeks].reverse().filter((w) => w.share_of_voice != null) as (PollingWeek & { share_of_voice: number })[];
  const sent = sentimentLabel(latest.sentiment_score);
  const cats = latest.category_results
    ? Object.entries(latest.category_results).sort((a, b) => b[1].share_of_voice - a[1].share_of_voice)
    : [];

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
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Per kategori — senaste veckan</div>
          <div style={{ ...catGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
            <span>Kategori</span>
            <span>Share of Voice</span>
            <span>Sentiment</span>
            <span>Svar</span>
          </div>
          {cats.map(([cat, r]) => {
            const cs = sentimentLabel(r.sentiment_score);
            return (
              <div key={cat} style={{ ...catGrid, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'center' }}>
                <span style={{ color: '#3a4b56' }}>{CATEGORY_SV[cat] || cat}</span>
                <span style={{ color: '#3a4b56' }}>{Math.round(r.share_of_voice * 100)}%</span>
                <span style={{ color: cs.color }}>{cs.text}</span>
                <span style={{ color: C.dim }}>{Math.round(r.mention_count)}/{Math.round(r.answer_count)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HumanizationView({ model }: { model: Humanization }) {
  const dims = model.dimensions || [];
  const flags = model.opportunities_and_risks || [];
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Hur AI uppfattar er mänsklighet"
        hint="AI-motorernas bild av er på kultur- och värdedimensionerna — synlighet och omdöme hålls isär. Detta är PERCEPTION (vad motorerna säger), inte poängen: bevis räknas separat, perception vägs aldrig in."
      />
      <p style={{ fontSize: 13, color: '#3a4b56', margin: '0 0 14px', lineHeight: 1.6 }}>{model.coverage_plain}</p>

      {flags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Möjligheter &amp; risker</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#3a4b56', fontSize: 13, lineHeight: 1.6 }}>
            {flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dims.map((d) => (
          <div key={d.dimension} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>{d.label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{d.perception_plain}</div>
            {d.perception_by_engine.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: C.dim, fontSize: 11, lineHeight: 1.5 }}>
                {d.perception_by_engine.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
            {d.confidence_note && <div style={{ fontSize: 11, color: C.dim, marginTop: 3, fontStyle: 'italic' }}>{d.confidence_note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
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
