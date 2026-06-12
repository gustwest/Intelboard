'use client';

import { useEffect, useState } from 'react';
import { Plug, Check, X, Clock, Globe } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';
import { useJobRuns, fmtRelative } from '../_lib/jobRuns';

type ConnectorMeta = {
  id: string;
  fetch_method: string;
  output_types: string[];
  frequency: string;
  tier: 'standard' | 'optional' | 'custom';
};

type Client = { client_id: string; active_connectors: string[] };

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
  linkedin: 'LinkedIn', linkedin_capacity: 'LinkedIn-kapacitet (kvartal)', rss: 'RSS-feeds (kund)',
  jobfeed: 'Platsannonser (ATS)', website: 'Webbplats', gleif: 'GLEIF (org-data)',
  pressrum: 'Pressrum', careers: 'Karriärsida', instagram: 'Instagram',
  youtube: 'YouTube', facebook: 'Facebook', substack: 'Substack', podcast: 'Podcast', glassdoor: 'Glassdoor',
  github: 'GitHub', crunchbase: 'Crunchbase', scholar: 'Google Scholar', prv: 'PRV / Patent', vinnova: 'Vinnova',
};

// Globala/batch-jobb (körs för alla kunder) — hör hemma på den här globala sidan.
const GLOBAL_JOBS: { label: string; key: string; path: string; type: string }[] = [
  { label: 'Scrape (bolagsnivå)', key: 'scrape', path: '/api/jobs/scrape-active', type: 'scrape_active' },
  { label: 'Jobbannons-sync', key: 'xml', path: '/api/jobs/xml-sync', type: 'xml_sync' },
  { label: 'AI-synlighet (polling)', key: 'polling', path: '/api/jobs/polling', type: 'polling' },
  { label: 'Sunset (kompetenser)', key: 'sunset', path: '/api/jobs/sunset-skills', type: 'sunset_skills' },
  { label: 'Kvartals-To-Do', key: 'todo', path: '/api/jobs/quarterly-todo', type: 'quarterly_todo' },
];

export default function GraphConnectorsPage() {
  const [available, setAvailable] = useState<ConnectorMeta[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const { latest, active: jobActive, trigger: runJob } = useJobRuns(null); // null → globalt

  useEffect(() => {
    graphFetch<{ connectors: ConnectorMeta[] }>('/api/connectors').then((d) => setAvailable(d.connectors)).catch(() => setAvailable([]));
    graphFetch<{ clients: Client[] }>('/api/clients').then((d) => setClients(d.clients)).catch(() => setClients([]));
  }, []);

  const liveIds = new Set(available.map((c) => c.id));
  const allConnectors: ConnectorMeta[] = [...available, ...STATIC_PLANNED.filter((s) => !liveIds.has(s.id))];
  const usageCount = (id: string) => clients.filter((c) => (c.active_connectors || []).includes(id)).length;

  function renderJobBtn(j: { label: string; key: string; path: string; type: string }) {
    const run = latest(j.type);
    return (
      <div key={j.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{j.label}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Clock size={11} color={C.dim} />
            {run ? (
              <>senast {fmtRelative(run.started_at)} {run.status === 'failed' ? <X size={11} color="#dc2626" /> : <Check size={11} color="#16a34a" />}</>
            ) : 'aldrig körd'}
          </div>
        </div>
        <UI.JobRunButton
          status={jobActive[j.key] || 'idle'}
          label="Kör"
          onClick={() => runJob(j.key, j.path, j.type)}
          style={{ flexShrink: 0 }}
        />
      </div>
    );
  }

  return (
    <GraphPageShell
      title="Connectors"
      icon={<Plug size={22} />}
      subtitle="Datakällornas katalog och globala körningar. Vilka connectors en enskild kund använder ställs in på kundkortet."
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Globala jobb */}
      <UI.Card
        padding="18px 22px"
        style={{ marginBottom: 16 }}
        title="Globala körningar"
        hint="Batch-jobb som körs för alla kunder. Schemaläggs via Cloud Scheduler — kör en runda direkt här."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {GLOBAL_JOBS.map(renderJobBtn)}
        </div>
      </UI.Card>

      {/* Katalog */}
      <UI.Card padding="0" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1.6fr 1fr', gap: 12, padding: '12px 20px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>
          <span>Connector</span><span>Metod</span><span>Frekvens</span><span>Tier</span><span>Output</span><span style={{ textAlign: 'right' }}>Används av</span>
        </div>
        {allConnectors.map((c) => {
          const isLive = liveIds.has(c.id);
          const used = usageCount(c.id);
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1.6fr 1fr', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 13, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#22c55e' : 'rgba(0,0,0,0.2)' }} />
                <span style={{ color: C.text, fontWeight: 500 }}>{NAME[c.id] || c.id}</span>
              </span>
              <span style={{ color: C.muted }}>{c.fetch_method}</span>
              <span style={{ color: C.muted }}>{c.frequency}</span>
              <span>
                <UI.Badge tone={c.tier === 'standard' ? 'ok' : 'info'}>{c.tier}</UI.Badge>
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.output_types.map((o) => (
                  <span key={o} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(224, 142, 121,0.12)', color: C.accent, fontWeight: 500 }}>{o}</span>
                ))}
              </span>
              <span style={{ textAlign: 'right', color: isLive ? C.text : C.dim, fontWeight: 600, fontSize: 12 }}>
                {isLive ? (used > 0 ? `${used} kund${used === 1 ? '' : 'er'}` : '0 kunder') : <span style={{ fontStyle: 'italic', fontWeight: 400 }}>Ej implementerad</span>}
              </span>
            </div>
          );
        })}
      </UI.Card>

      {/* Hur webbplats-crawlern väljer sidor — speglar förklaringen på kundkortet (Datakällor). */}
      <UI.Card
        padding="18px 22px"
        style={{ marginTop: 16 }}
        icon={<Globe size={15} color={C.accent} />}
        title="Så väljer webbplats-crawlern sidor"
        hint="Hela sajten scrapas inte — vi väljer. Samma förklaring visas på kundkortets Datakällor-flik."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
          <li>Startar på kundens start-URL och följer interna länkar (sitemap.xml om den finns, annars ~50 sidor, 2 nivåer djupt).</li>
          <li>Prioriterar startsida + faktasidor: om&nbsp;oss, team, tjänster, kunder, kontakt, press, karriär — de hinner med även när chunk-budgeten tar slut.</li>
          <li>Hoppar över brus: cookie-/villkors-/inloggningssidor och SEO-arkiv (tagg, kategori, paginering, författararkiv).</li>
          <li>En LLM-grind behåller bara sidor med riktiga företagsfakta. Körs veckovis.</li>
        </ul>
      </UI.Card>
    </GraphPageShell>
  );
}
