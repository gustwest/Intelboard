'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Plug, Rocket, Activity, Globe2,
  Quote, Inbox, Network, Radar, Leaf, Check, X, Loader2, HeartPulse, AlertTriangle, Bell, DollarSign,
} from 'lucide-react';
import GraphPageShell, { graphColors as C } from './_components/GraphPageShell';
import * as UI from './_components/ui';
import { graphFetch } from './_lib/api';

type Client = { client_id: string; active_connectors: string[]; cdn_url: string | null };
type Counts = Record<string, number>;
type InboxData = {
  total: number;
  categories: Counts;
  global_categories?: Counts;
  clients: { client_id: string; company_name: string | null; total: number }[];
};
type JobRun = {
  id: string;
  job_type: string;
  client_id: string | null;
  status: 'running' | 'success' | 'failed';
  started_at: string | null;
  duration_seconds: number | null;
  summary: Record<string, unknown>;
  error_message: string | null;
};

// Inbox-köer → vart åtgärden görs (samma logik som klockan i headern).
// `scope` styr vilken del av inbox-svaret count:en hämtas från: 'client'
// (per-kund-kategorier, default) eller 'global' (icke-kund-scopade — t.ex.
// drift-larm). En queue är synlig endast när dess summa > 0.
type Queue = {
  label: string;
  keys: string[];
  href: string;
  icon: typeof Quote;
  color: string;
  scope?: 'client' | 'global';
};
const QUEUES: Queue[] = [
  { label: 'Claims att granska', keys: ['claims'], href: '/insider-graph/review', icon: Quote, color: C.accent },
  { label: 'Inkommande att granska', keys: ['items'], href: '/insider-graph/review', icon: Inbox, color: '#3b82f6' },
  { label: 'LinkedIn att verifiera', keys: ['linkedin'], href: '/insider-graph/review', icon: Network, color: '#0ea5e9' },
  { label: 'Risk att åtgärda', keys: ['risk_findings', 'risk_questions'], href: '/insider-graph/polling', icon: Radar, color: '#f59e0b' },
  { label: 'ESG att granska', keys: ['esg_questions', 'esg_findings'], href: '/insider-graph/kunder', icon: Leaf, color: '#22c55e' },
  { label: 'Drift-larm', keys: ['ops_alerts'], href: '/insider-graph/alerts', icon: Bell, color: '#ef4444', scope: 'global' },
];

// Affärshändelser (job_type "event:<kind>") → läsbar etikett för aktivitetsflödet.
const EVENT_LABEL: Record<string, string> = {
  report_generated: 'Rapport genererad',
  evidence_verified: 'Underlag verifierat',
  evidence_rejected: 'Underlag avvisat',
};

// Jobbtyp → läsbar etikett för körningsloggen.
const RUN_LABEL: Record<string, string> = {
  scrape_active: 'Scrape (bolagsnivå)',
  scrape_website: 'Webbplats-crawl',
  xml_sync: 'Jobbannons-sync',
  polling: 'AI-synlighet (polling)',
  compile_schema: 'Schema-kompilering',
  extract_claims: 'Claims-extraktion',
  monthly_report: 'Månadsrapport',
  risk_detect: 'Risk-detektering',
  risk_generate: 'Risk-frågor',
  esg_scan: 'ESG-skanning',
  sunset_skills: 'Sunset (kompetenser)',
  quarterly_todo: 'Kvartals-To-Do',
  warmth_probes: 'Värme-probe',
  compute_trust_gap: 'Förtroendegap',
  trust_gap_report: 'Förtroendegap-rapport',
};

function runLabel(jobType: string): string {
  if (jobType.startsWith('event:')) {
    const k = jobType.slice(6);
    return EVENT_LABEL[k] || k;
  }
  return RUN_LABEL[jobType] || jobType;
}

type HealthJob = { at: string | null; age_days: number | null };
type HealthRow = {
  client_id: string;
  company_name: string;
  jobs: Record<string, HealthJob>;
  missing: string[];
  worst_age_days: number | null;
  stale: boolean;
  never_processed: boolean;
};
type HealthData = { key_jobs: string[]; stale_days: number; clients: HealthRow[] };

const HEALTH_JOB_SHORT: Record<string, string> = {
  scrape_active: 'Scrape',
  extract_claims: 'Claims',
  compile_schema: 'Kompilering',
  compute_trust_gap: 'Förtroendegap',
};

function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'nyss';
  if (s < 3600) return `${Math.floor(s / 60)} min sedan`;
  if (s < 86400) return `${Math.floor(s / 3600)} tim sedan`;
  return `${Math.floor(s / 86400)} d sedan`;
}

function summaryText(run: JobRun): string | null {
  const s = run.summary || {};
  const parts: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'changed' && v === true) parts.push('ändrad');
    else if (k === 'uploaded' && v === true) parts.push('uppladdad');
    else if (typeof v === 'number') parts.push(`${v} ${k}`);
    else if (typeof v === 'boolean') parts.push(k);
    else parts.push(`${k}: ${v}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export default function InsiderGraphHomePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [inbox, setInbox] = useState<InboxData | null>(null);
  const [runs, setRuns] = useState<JobRun[] | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  // Fel-tillstånd per panel — skilt från "laddar" (null) och "tomt" ([] / inga köer),
  // så ett backend-avbrott aldrig maskeras som "inget väntar på dig".
  const [err, setErr] = useState<{ clients?: boolean; inbox?: boolean; runs?: boolean; health?: boolean }>({});

  const loadClients = useCallback(() => {
    setErr((e) => ({ ...e, clients: false }));
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => setClients(d.clients))
      .catch(() => { setClients(null); setErr((e) => ({ ...e, clients: true })); });
  }, []);
  const loadInbox = useCallback(() => {
    setErr((e) => ({ ...e, inbox: false }));
    graphFetch<InboxData>('/api/inbox')
      .then((d) => setInbox(d))
      .catch(() => { setInbox(null); setErr((e) => ({ ...e, inbox: true })); });
  }, []);
  const loadRuns = useCallback(() => {
    setErr((e) => ({ ...e, runs: false }));
    graphFetch<{ runs: JobRun[] }>('/api/jobs/runs?limit=12')
      .then((d) => setRuns(d.runs))
      .catch(() => { setRuns(null); setErr((e) => ({ ...e, runs: true })); });
  }, []);
  const loadHealth = useCallback(() => {
    setErr((e) => ({ ...e, health: false }));
    graphFetch<HealthData>('/api/jobs/health')
      .then((d) => setHealth(d))
      .catch(() => { setHealth(null); setErr((e) => ({ ...e, health: true })); });
  }, []);

  useEffect(() => {
    loadClients(); loadInbox(); loadRuns(); loadHealth();
  }, [loadClients, loadInbox, loadRuns, loadHealth]);

  const activeClients = clients?.length ?? null;
  const connectorInstances = clients ? clients.reduce((n, c) => n + (c.active_connectors?.length || 0), 0) : null;
  const delivered = clients ? clients.filter((c) => c.cdn_url).length : null;
  const todo = inbox?.total ?? null;

  const queues = QUEUES.map((q) => {
    const src = q.scope === 'global' ? inbox?.global_categories : inbox?.categories;
    return {
      ...q,
      count: src ? q.keys.reduce((s, k) => s + (src[k] || 0), 0) : 0,
    };
  }).filter((q) => q.count > 0);

  return (
    <GraphPageShell
      title="geogiraph — översikt"
      icon={<LayoutDashboard size={22} />}
      subtitle="Kommandocentral: vad väntar på dig, vad har körts och var står kunderna."
    >
      {/* Nyckeltal (live) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat icon={<Users size={15} />} label="Aktiva kunder" value={activeClients} />
        <Stat icon={<Plug size={15} />} label="Connectors aktiva" value={connectorInstances} sub="instanser över alla kunder" />
        <Stat icon={<Inbox size={15} />} label="Att göra" value={todo} sub="väntar på granskning" tone={todo ? 'attention' : 'ok'} />
        <Stat icon={<Rocket size={15} />} label="Levererade" value={delivered} sub="kunder med JSON-LD live" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Att göra-inkorg */}
        <Panel icon={<Inbox size={16} color={C.accent} />} title="Att göra">
          {err.inbox ? (
            <ErrorState onRetry={loadInbox} />
          ) : inbox === null ? (
            <Empty text="Laddar…" />
          ) : queues.length === 0 ? (
            <Empty text="Inget väntar på dig 🎉" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {queues.map((q) => {
                const Icon = q.icon;
                return (
                  <UI.Button key={q.label} variant="row" style={{ gap: 10 }} onClick={() => router.push(q.href)}>
                    <Icon size={15} color={q.color} />
                    <span style={{ flex: 1, color: C.text }}>{q.label}</span>
                    <UI.Pill>{q.count}</UI.Pill>
                  </UI.Button>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Senaste körningar */}
        <Panel icon={<Activity size={16} color={C.accent} />} title="Senaste körningar">
          {err.runs ? (
            <ErrorState onRetry={loadRuns} />
          ) : runs === null ? (
            <Empty text="Laddar…" />
          ) : runs.length === 0 ? (
            <Empty text="Inga körningar än" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {runs.map((run) => {
                const sum = summaryText(run);
                return (
                  <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>
                    <RunStatus status={run.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {runLabel(run.job_type)}
                        {run.client_id && <span style={{ color: C.muted, fontWeight: 400 }}> · {run.client_id}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: run.status === 'failed' ? '#dc2626' : C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.status === 'failed' ? (run.error_message || 'Misslyckades') : sum || (run.status === 'running' ? 'Pågår…' : 'Klar')}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, textAlign: 'right', flexShrink: 0 }}>
                      <div>{fmtRelative(run.started_at)}</div>
                      {run.duration_seconds != null && run.status !== 'running' && <div>{run.duration_seconds}s</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Kundhälsa — har varje kunds data bearbetats nyligen? (tvärgående översikt) */}
      <div style={{ marginTop: 16 }}>
        <Panel icon={<HeartPulse size={16} color={C.accent} />} title="Kundhälsa — pipeline-färskhet">
          {err.health ? (
            <ErrorState onRetry={loadHealth} />
          ) : health === null ? (
            <Empty text="Laddar…" />
          ) : health.clients.length === 0 ? (
            <Empty text="Inga kunder än" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                Senaste lyckade körning per nyckeljobb. Gult/rött = äldre än {health.stale_days} dagar eller saknas — något kan ha stannat.
              </div>
              {health.clients.map((row) => (
                <UI.Button
                  key={row.client_id}
                  variant="row"
                  style={{ gap: 10 }}
                  onClick={() => router.push(`/insider-graph/kunder/${row.client_id}`)}
                >
                  <HealthBadge row={row} />
                  <span style={{ flex: 1, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.company_name}
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {health.key_jobs.map((jt) => (
                      <JobFreshness key={jt} label={HEALTH_JOB_SHORT[jt] || jt} job={row.jobs[jt]} staleDays={health.stale_days} />
                    ))}
                  </span>
                </UI.Button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Så här fungerar (kontext) */}
      <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Globe2 size={16} color={C.accent} />
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text }}>Så här fungerar geogiraph</h2>
        </div>
        <ol style={{ paddingLeft: 18, margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
          <li>Kund onboardas (företagsuppgifter, ev. medarbetare), connectors väljs.</li>
          <li>Connectors hämtar profiler, inlägg, jobb, events → claims granskas.</li>
          <li>Schema-motorn kompilerar JSON-LD per kund och levererar via CDN.</li>
          <li>Polling mäter AI-synlighet och risk löpande.</li>
        </ol>
      </div>
    </GraphPageShell>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: number | null; sub?: string; tone?: 'ok' | 'attention' }) {
  return <UI.StatTile icon={icon} label={label} value={value} sub={sub} tone={tone} />;
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <UI.Card icon={icon} title={title}>{children}</UI.Card>;
}

function RunStatus({ status }: { status: JobRun['status'] }) {
  if (status === 'success') return <span style={dot('#22c55e')}><Check size={11} color="#fff" strokeWidth={3} /></span>;
  if (status === 'failed') return <span style={dot('#ef4444')}><X size={11} color="#fff" strokeWidth={3} /></span>;
  return <span style={dot('#f59e0b')}><Loader2 size={11} color="#fff" /></span>;
}

function Empty({ text }: { text: string }) {
  return <UI.Empty>{text}</UI.Empty>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px' }}>
      <AlertTriangle size={15} color="#dc2626" />
      <span style={{ flex: 1, fontSize: 12, color: '#dc2626' }}>Kunde inte ladda — kontrollera anslutningen.</span>
      <button
        onClick={onRetry}
        style={{ font: 'inherit', fontSize: 12, fontWeight: 600, color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
      >
        Försök igen
      </button>
    </div>
  );
}

function HealthBadge({ row }: { row: HealthRow }) {
  if (row.never_processed) {
    return <span title="Aldrig bearbetad" style={dot('#ef4444')}><X size={11} color="#fff" strokeWidth={3} /></span>;
  }
  if (row.stale) {
    return <span title="Något jobb är gammalt eller saknas" style={dot('#f59e0b')}><AlertTriangle size={10} color="#fff" /></span>;
  }
  return <span title="Färsk" style={dot('#22c55e')}><Check size={11} color="#fff" strokeWidth={3} /></span>;
}

function JobFreshness({ label, job, staleDays }: { label: string; job: HealthJob | undefined; staleDays: number }) {
  const age = job?.age_days ?? null;
  const missing = !job?.at;
  const color = missing ? '#ef4444' : age != null && age > staleDays ? '#f59e0b' : '#22c55e';
  const ageText = missing ? 'saknas' : age != null && age < 1 ? '<1d' : `${Math.round(age ?? 0)}d`;
  return (
    <span title={`${label}: ${ageText}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function dot(color: string): React.CSSProperties {
  return { width: 18, height: 18, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
}
