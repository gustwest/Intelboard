'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plug, Play, Plus, Trash2, Save, AlertCircle, CheckCircle2, Users, ArrowRight, Loader2, Check, X, Clock } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';
import { useJobRuns, fmtRelative } from '../_lib/jobRuns';

type ConnectorMeta = {
  id: string;
  fetch_method: string;
  output_types: string[];
  frequency: string;
  tier: 'standard' | 'optional' | 'custom';
};

type Client = { client_id: string; company_name: string | null };

type RssFeed = { url: string; schema_type: string; label?: string };
type JobFeed = { url: string; label?: string };

type ClientConnectors = {
  client_id: string;
  available: ConnectorMeta[];
  active_connectors: string[];
  rss_feeds: RssFeed[];
  job_feeds: JobFeed[];
  scrape_employee_profiles: boolean;
};

const STATIC_PLANNED: ConnectorMeta[] = [
  { id: 'pressrum', fetch_method: 'rss', output_types: ['NewsArticle'], frequency: 'daily', tier: 'standard' },
  { id: 'careers', fetch_method: 'rss', output_types: ['JobPosting'], frequency: 'daily', tier: 'standard' },
  { id: 'email', fetch_method: 'email', output_types: ['Event', 'NewsArticle'], frequency: 'realtime', tier: 'standard' },
  { id: 'instagram', fetch_method: 'api', output_types: ['SocialMediaPosting'], frequency: 'daily', tier: 'optional' },
  { id: 'youtube', fetch_method: 'api', output_types: ['VideoObject'], frequency: 'daily', tier: 'optional' },
  { id: 'facebook', fetch_method: 'api', output_types: ['SocialMediaPosting'], frequency: 'daily', tier: 'optional' },
  { id: 'substack', fetch_method: 'rss', output_types: ['NewsArticle'], frequency: 'daily', tier: 'optional' },
  { id: 'podcast', fetch_method: 'rss', output_types: ['PodcastEpisode'], frequency: 'daily', tier: 'optional' },
  { id: 'glassdoor', fetch_method: 'scrape', output_types: ['EmployerReview'], frequency: 'weekly', tier: 'optional' },
  { id: 'github', fetch_method: 'api', output_types: ['SoftwareSourceCode'], frequency: 'weekly', tier: 'optional' },
  { id: 'crunchbase', fetch_method: 'api', output_types: ['Organization'], frequency: 'monthly', tier: 'optional' },
  { id: 'scholar', fetch_method: 'scrape', output_types: ['ScholarlyArticle'], frequency: 'monthly', tier: 'optional' },
  { id: 'prv', fetch_method: 'api', output_types: ['CreativeWork'], frequency: 'monthly', tier: 'optional' },
  { id: 'vinnova', fetch_method: 'api', output_types: ['Grant'], frequency: 'monthly', tier: 'optional' },
];

const NAME: Record<string, string> = {
  linkedin: 'LinkedIn',
  linkedin_capacity: 'LinkedIn-kapacitet (kvartal)',
  rss: 'RSS-feeds (kund)',
  jobfeed: 'Platsannonser (ATS)',
  pressrum: 'Pressrum',
  careers: 'Karriärsida',
  email: 'E-post (episodisk)',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  substack: 'Substack',
  podcast: 'Podcast',
  glassdoor: 'Glassdoor',
  github: 'GitHub',
  crunchbase: 'Crunchbase',
  scholar: 'Google Scholar',
  prv: 'PRV / Patent',
  vinnova: 'Vinnova',
};

const SCHEMA_OPTIONS = ['NewsArticle', 'JobPosting', 'PodcastEpisode', 'Event'];

export default function GraphConnectorsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<ClientConnectors | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [scrapeEmployees, setScrapeEmployees] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { latest, active: jobActive, trigger: runJob } = useJobRuns(selected);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setBanner({ tone: 'error', text: e.message }));
  }, []);

  useEffect(() => {
    if (!selected) return;
    graphFetch<ClientConnectors>(`/api/connectors/${selected}`)
      .then((d) => {
        setState(d);
        setActive(d.active_connectors);
        setFeeds(d.rss_feeds || []);
        setScrapeEmployees(!!d.scrape_employee_profiles);
        setDirty(false);
      })
      .catch((e) => setBanner({ tone: 'error', text: e.message }));
  }, [selected]);

  function toggle(id: string) {
    setActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setDirty(true);
  }

  function updateFeed(i: number, patch: Partial<RssFeed>) {
    setFeeds((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function addFeed() {
    setFeeds((prev) => [...prev, { url: '', schema_type: 'NewsArticle', label: '' }]);
    setDirty(true);
  }

  function removeFeed(i: number) {
    setFeeds((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setBanner(null);
    try {
      await graphFetch(`/api/connectors/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_connectors: active,
          rss_feeds: feeds.filter((f) => f.url),
          scrape_employee_profiles: scrapeEmployees,
        }),
      });
      setDirty(false);
      setBanner({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  // Jobbknapp med riktig progress (spinner → klar/fel) via körningsspåret.
  function renderJobBtn(label: string, key: string, path: string, jobType: string, needsClient = false) {
    const st = jobActive[key] || 'idle';
    const Icon = st === 'running' ? Loader2 : st === 'success' ? Check : st === 'failed' ? X : Play;
    const color = st === 'failed' ? '#dc2626' : st === 'success' ? '#16a34a' : undefined;
    return (
      <button
        onClick={() => runJob(key, path, jobType)}
        disabled={(needsClient && !selected) || st === 'running'}
        style={btn(C, st === 'success' ? 'primary' : 'subtle')}
      >
        <Icon size={12} color={color} style={st === 'running' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        {st === 'running' ? 'Kör…' : label}
      </button>
    );
  }

  const JOB_STRIP: { label: string; type: string }[] = [
    { label: 'Scrape', type: 'scrape_active' },
    { label: 'XML-sync', type: 'xml_sync' },
    { label: 'Kompilering', type: 'compile_schema' },
  ];

  const liveIds = new Set((state?.available || []).map((c) => c.id));
  const allConnectors: ConnectorMeta[] = [
    ...(state?.available || []),
    ...STATIC_PLANNED.filter((s) => !liveIds.has(s.id)),
  ];

  return (
    <GraphPageShell
      title="Connectors"
      icon={<Plug size={22} />}
      subtitle="Live-connectors syns med grön status. Aktivera per kund + konfigurera RSS-feeds."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            padding: '8px 12px',
            background: '#eef0f1',
            color: '#3a4b56',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
          }}
        >
          {clients.length === 0 && <option>Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {renderJobBtn('Kör scrape', 'scrape', '/api/jobs/scrape-active', 'scrape_active')}
        {renderJobBtn('Kör xml-sync', 'xml', '/api/jobs/xml-sync', 'xml_sync')}
        {renderJobBtn('Kompilera', 'compile', `/api/jobs/compile/${selected}`, 'compile_schema', true)}
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={btn(C, dirty ? 'primary' : 'subtle')}
        >
          <Save size={12} /> {saving ? 'Sparar…' : 'Spara'}
        </button>
      </div>

      {/* Senast körd per jobb (för vald kund) */}
      {selected && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: 12, color: C.muted }}>
          {JOB_STRIP.map(({ label, type }) => {
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
                    {run.status === 'running' && <Loader2 size={12} color="#f59e0b" style={{ animation: 'spin 0.8s linear infinite' }} />}
                  </>
                ) : (
                  <span style={{ color: C.dim }}>aldrig körd</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {banner && (
        <div
          style={{
            background: banner.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${banner.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 8,
            padding: '10px 14px',
            color: banner.tone === 'ok' ? '#86efac' : '#fca5a5',
            fontSize: 12,
            marginBottom: 16,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {banner.tone === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {banner.text}
        </div>
      )}

      <div
        style={{
          background: C.card,
          border: `1px solid ${scrapeEmployees ? 'rgba(159,81,182,0.4)' : C.border}`,
          borderRadius: 12,
          padding: '18px 22px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span style={{ color: scrapeEmployees ? '#9f51b6' : C.muted, marginTop: 2, flexShrink: 0 }}>
            <Users size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>
              Hämta medarbetares LinkedIn-profiler
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
              Avstängt som standard — då hämtas <strong>ingen</strong> information om enskilda
              medarbetare automatiskt, bara bolagets egen LinkedIn-sida. Slås det på hämtas profiler
              endast för medarbetare märkta <code>aktiv</code> (t.ex. ledningen).
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setScrapeEmployees((v) => !v);
            setDirty(true);
          }}
          disabled={!selected}
          style={{
            flexShrink: 0,
            padding: '6px 16px',
            borderRadius: 999,
            background: scrapeEmployees ? 'rgba(159,81,182,0.18)' : 'transparent',
            color: scrapeEmployees ? '#9f51b6' : C.muted,
            border: `1px solid ${scrapeEmployees ? 'rgba(159,81,182,0.4)' : C.border}`,
            fontSize: 12,
            fontWeight: 600,
            cursor: selected ? 'pointer' : 'not-allowed',
          }}
        >
          {scrapeEmployees ? 'På' : 'Av'}
        </button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1.6fr 1fr', gap: 12, padding: '12px 20px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>
          <span>Connector</span>
          <span>Metod</span>
          <span>Frekvens</span>
          <span>Tier</span>
          <span>Output</span>
          <span style={{ textAlign: 'right' }}>Aktiv</span>
        </div>
        {allConnectors.map((c) => {
          const isLive = liveIds.has(c.id);
          const isActive = active.includes(c.id);
          return (
            <div
              key={c.id}
              style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1.6fr 1fr', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 13, alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#22c55e' : 'rgba(0,0,0,0.2)' }} />
                <span style={{ color: '#3a4b56', fontWeight: 500 }}>{NAME[c.id] || c.id}</span>
              </span>
              <span style={{ color: C.muted }}>{c.fetch_method}</span>
              <span style={{ color: C.muted }}>{c.frequency}</span>
              <span>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: c.tier === 'standard' ? 'rgba(45,212,191,0.12)' : 'rgba(96,165,250,0.12)', color: c.tier === 'standard' ? '#2dd4bf' : '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {c.tier}
                </span>
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.output_types.map((o) => (
                  <span key={o} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(159,81,182,0.12)', color: '#9f51b6', fontWeight: 500 }}>
                    {o}
                  </span>
                ))}
              </span>
              <span style={{ textAlign: 'right' }}>
                {isLive ? (
                  <button
                    onClick={() => toggle(c.id)}
                    disabled={!selected}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: isActive ? 'rgba(34,197,94,0.18)' : 'transparent',
                      color: isActive ? '#86efac' : C.muted,
                      border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : C.border}`,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isActive ? 'På' : 'Av'}
                  </button>
                ) : (
                  <span style={{ fontSize: 10, color: C.dim, fontStyle: 'italic' }}>Ej implementerad</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {active.includes('rss') && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>RSS-feeds för {state?.client_id}</h2>
            <button onClick={addFeed} style={btn(C, 'subtle')}>
              <Plus size={12} /> Lägg till
            </button>
          </div>
          {feeds.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>Inga feeds. Lägg till pressrum, karriärsida eller podcast-feed.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {feeds.map((f, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 160px 40px', gap: 8 }}>
                  <input
                    value={f.url}
                    onChange={(e) => updateFeed(i, { url: e.target.value })}
                    placeholder="https://example.com/feed.xml"
                    style={inp(C)}
                  />
                  <input
                    value={f.label || ''}
                    onChange={(e) => updateFeed(i, { label: e.target.value })}
                    placeholder="Etikett"
                    style={inp(C)}
                  />
                  <select value={f.schema_type} onChange={(e) => updateFeed(i, { schema_type: e.target.value })} style={inp(C)}>
                    {SCHEMA_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => removeFeed(i)} style={{ ...btn(C, 'subtle'), padding: '8px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {active.includes('jobfeed') && selected && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>Platsannons-feeds (ATS)</h2>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
              Feeds klistras in per kund på kundkortet — låsta till rätt kund och inte åtkomliga via
              en delad rullgardin.
            </div>
          </div>
          <Link href={`/insider-graph/kunder/${selected}`} style={{ ...btn(C, 'primary'), textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Konfigurera på kundkortet <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {active.includes('linkedin_capacity') && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>LinkedIn-kapacitetsdata för {state?.client_id}</h2>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
              Vi samlar in och laddar upp kundens kvartalsvisa kompetensstatistik själva,
              verifierar den internt och korsvaliderar mot platsannonserna. Påslaget styr den
              kvartalsvisa interna påminnelsen.
            </div>
          </div>
          <Link href="/insider-graph/linkedin" style={{ ...btn(C, 'primary'), textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Öppna LinkedIn-flödet <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </GraphPageShell>
  );
}

function btn(C: Record<string, string>, variant: 'primary' | 'subtle') {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: variant === 'primary' ? 'rgba(159,81,182,0.18)' : 'transparent',
    color: variant === 'primary' ? '#9f51b6' : '#3a4b56',
    border: `1px solid ${variant === 'primary' ? 'rgba(159,81,182,0.3)' : C.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function inp(C: Record<string, string>) {
  return {
    padding: '8px 12px',
    background: '#eef0f1',
    color: '#3a4b56',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 12,
    outline: 'none',
  };
}
