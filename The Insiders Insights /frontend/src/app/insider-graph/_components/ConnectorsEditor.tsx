'use client';

import { useEffect, useState } from 'react';
import { Plug, Plus, Trash2, Check, AlertCircle, Globe } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';
import { fmtRelative } from '../_lib/jobRuns';
import { CONNECTOR_NAME as NAME } from '../_lib/connectors';
import * as UI from './ui';

type InputFieldMeta = { name: string; label: string; type: string; required: boolean; placeholder?: string; help?: string };
type ConnectorMeta = { id: string; fetch_method: string; output_types: string[]; frequency: string; tier: string; input_fields: InputFieldMeta[] };
type RssFeed = { url: string; schema_type: string; label?: string };
// Datatillstånd per connector (från backend): speglar VAD vi har, inte bara att toggeln är på.
type ConnStatus = { state: 'live' | 'staged' | 'idle'; last_at: string | null; detail?: string; ok?: boolean };
type State = {
  available: ConnectorMeta[];
  active_connectors: string[];
  rss_feeds: RssFeed[];
  connector_params: Record<string, string | null>;
  connector_status?: Record<string, ConnStatus>;
};

const SCHEMA_OPTIONS = ['NewsArticle', 'JobPosting', 'PodcastEpisode', 'Event'];

/** Chip-utseende per tri-state: live (grön, i leverans), staged (amber, uppladdad men
 *  väntar), idle (påslagen men ingen data) och off (avslagen). Underraden bär datumet. */
function chipVisual(on: boolean, st?: ConnStatus) {
  if (!on) return { bg: 'transparent', fg: C.muted, border: C.border, dot: 'rgba(0,0,0,0.18)', sub: '' };
  const rel = fmtRelative(st?.last_at);
  if (st?.state === 'live')
    return { bg: 'rgba(34,197,94,0.14)', fg: '#16a34a', border: 'rgba(34,197,94,0.4)', dot: '#22c55e', sub: rel ? `uppdaterad ${rel}` : 'i leverans' };
  if (st?.state === 'staged')
    return { bg: 'rgba(245,158,11,0.14)', fg: '#b45309', border: 'rgba(245,158,11,0.45)', dot: '#f59e0b', sub: rel ? `uppladdad ${rel} · väntar` : 'väntar på inkludering' };
  // idle: påslagen men ingen färsk/inkluderad data (ev. misslyckad körning).
  const failed = st?.ok === false;
  return { bg: 'transparent', fg: C.text, border: C.border, dot: failed ? '#dc2626' : 'rgba(0,0,0,0.25)', sub: failed && rel ? `körning ${rel} · fel` : 'ingen data ännu' };
}

/** Per-kund connector-konfiguration (välj connectors + RSS-feeds). */
export default function ConnectorsEditor({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  UI.useUnsavedWarning(dirty);
  UI.useAutoDismiss(msg?.tone === 'ok', () => setMsg(null));

  useEffect(() => {
    let cancelled = false;
    graphFetch<State>(`/api/connectors/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setState(d);
        setActive(d.active_connectors || []);
        setFeeds(d.rss_feeds || []);
        setParams(Object.fromEntries(Object.entries(d.connector_params || {}).map(([k, v]) => [k, v ?? ''])));
        setDirty(false);
      })
      .catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  function toggle(id: string) {
    setActive((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setDirty(true);
  }
  function updateFeed(i: number, patch: Partial<RssFeed>) {
    setFeeds((p) => p.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setDirty(true);
  }
  function updateParam(name: string, value: string) {
    setParams((p) => ({ ...p, [name]: value }));
    setDirty(true);
  }

  // Text-input-fält (wikidata_id, lei …) för de connectors som är påslagna.
  // feed_list/url har egna UI:n (RSS-editor, onboarding) och hanteras ej här.
  const textFields = (state?.available || [])
    .filter((c) => active.includes(c.id))
    .flatMap((c) => (c.input_fields || []).filter((f) => f.type === 'text').map((f) => ({ ...f, connector: c.id })));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await graphFetch(`/api/connectors/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_connectors: active,
          rss_feeds: feeds.filter((f) => f.url.trim()),
          connector_params: params,
        }),
      });
      setDirty(false);
      setMsg({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <Plug size={16} color={C.accent} /> Connectors
        </div>
        <UI.SaveButton dirty={dirty} saving={saving} onClick={save} />
      </div>

      {msg && (
        <UI.StatusBanner
          tone={msg.tone === 'ok' ? 'ok' : 'err'}
          icon={msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          style={{ marginBottom: 12 }}
        >
          {msg.text}
        </UI.StatusBanner>
      )}

      {state === null ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: active.includes('rss') ? 14 : 0 }}>
            {state.available.map((conn) => {
              const on = active.includes(conn.id);
              const st = on ? state.connector_status?.[conn.id] : undefined;
              const v = chipVisual(on, st);
              return (
                <button
                  key={conn.id}
                  onClick={() => toggle(conn.id)}
                  title={st?.detail || (on ? 'Påslagen' : 'Avslagen')}
                  style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '6px 12px', borderRadius: 12, background: v.bg, color: v.fg, border: `1px solid ${v.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1.2 }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
                    {NAME[conn.id] || conn.id}
                  </span>
                  {v.sub && <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, paddingLeft: 13 }}>{v.sub}</span>}
                </button>
              );
            })}
          </div>

          {active.includes('website') && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                <Globe size={13} color={C.accent} /> Så crawlas webbplatsen
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                <li>Startar på start-URL:en och följer interna länkar (sitemap.xml om den finns, annars ~50 sidor, 2 nivåer djupt).</li>
                <li>Prioriterar startsida + faktasidor: om&nbsp;oss, team, tjänster, kunder, kontakt, press, karriär — de hinner med även när budgeten tar slut.</li>
                <li>Hoppar över brus: cookie-/villkors-/inloggningssidor och SEO-arkiv (tagg, kategori, paginering, författararkiv).</li>
                <li>En LLM-grind behåller bara sidor med riktiga företagsfakta. Hela sajten scrapas alltså inte — vi väljer. Körs veckovis.</li>
              </ul>
            </div>
          )}

          {textFields.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {textFields.map((f) => (
                <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {f.label} <span style={{ color: C.muted, fontWeight: 400 }}>· {NAME[f.connector] || f.connector}</span>
                  </label>
                  <UI.Input
                    value={params[f.name] ?? ''}
                    onChange={(e) => updateParam(f.name, e.target.value)}
                    placeholder={f.placeholder || ''}
                    style={{ maxWidth: 320 }}
                  />
                  {f.help && <span style={{ fontSize: 11, color: C.muted }}>{f.help}</span>}
                </div>
              ))}
            </div>
          )}

          {active.includes('rss') && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>RSS-feeds</span>
                <button onClick={() => { setFeeds((p) => [...p, { url: '', schema_type: 'NewsArticle', label: '' }]); setDirty(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={12} /> Lägg till
                </button>
              </div>
              {feeds.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>Inga feeds. Lägg till pressrum, karriärsida eller podcast-feed.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feeds.map((f, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 36px', gap: 8 }}>
                      <UI.Input value={f.url} onChange={(e) => updateFeed(i, { url: e.target.value })} placeholder="https://example.com/feed.xml" style={{ width: '100%' }} />
                      <UI.Input value={f.label || ''} onChange={(e) => updateFeed(i, { label: e.target.value })} placeholder="Etikett" style={{ width: '100%' }} />
                      <select value={f.schema_type} onChange={(e) => updateFeed(i, { schema_type: e.target.value })} style={inp}>
                        {SCHEMA_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => { setFeeds((p) => p.filter((_, idx) => idx !== i)); setDirty(true); }} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </UI.Card>
  );
}

// Behållen lokal stil för <select> och trash-knappen (ej UI.Input-mål).
const inp: React.CSSProperties = { padding: '8px 12px', background: '#eceae3', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none' };
