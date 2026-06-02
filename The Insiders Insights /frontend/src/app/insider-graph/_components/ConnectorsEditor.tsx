'use client';

import { useEffect, useState } from 'react';
import { Plug, Plus, Trash2, Save, Check, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

type ConnectorMeta = { id: string; fetch_method: string; output_types: string[]; frequency: string; tier: string };
type RssFeed = { url: string; schema_type: string; label?: string };
type State = {
  available: ConnectorMeta[];
  active_connectors: string[];
  rss_feeds: RssFeed[];
};

const NAME: Record<string, string> = {
  linkedin: 'LinkedIn', linkedin_capacity: 'LinkedIn-kapacitet (kvartal)', rss: 'RSS-feeds',
  jobfeed: 'Platsannonser (ATS)', website: 'Webbplats', gleif: 'GLEIF (org-data)',
};
const SCHEMA_OPTIONS = ['NewsArticle', 'JobPosting', 'PodcastEpisode', 'Event'];

/** Per-kund connector-konfiguration (välj connectors + RSS-feeds). */
export default function ConnectorsEditor({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    graphFetch<State>(`/api/connectors/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setState(d);
        setActive(d.active_connectors || []);
        setFeeds(d.rss_feeds || []);
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

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eef0f1', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>
          <Plug size={16} color={C.accent} /> Connectors
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent', color: dirty ? '#9f51b6' : C.muted, border: `1px solid ${dirty ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed' }}
        >
          <Save size={12} /> {saving ? 'Sparar…' : 'Spara'}
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '8px 12px', color: msg.tone === 'ok' ? '#16a34a' : '#b91c1c', fontSize: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {state === null ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: active.includes('rss') ? 14 : 0 }}>
            {state.available.map((conn) => {
              const on = active.includes(conn.id);
              return (
                <button
                  key={conn.id}
                  onClick={() => toggle(conn.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: on ? 'rgba(34,197,94,0.14)' : 'transparent', color: on ? '#16a34a' : C.muted, border: `1px solid ${on ? 'rgba(34,197,94,0.4)' : C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {on && <Check size={12} />} {NAME[conn.id] || conn.id}
                </button>
              );
            })}
          </div>

          {active.includes('rss') && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#3a4b56' }}>RSS-feeds</span>
                <button onClick={() => { setFeeds((p) => [...p, { url: '', schema_type: 'NewsArticle', label: '' }]); setDirty(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={12} /> Lägg till
                </button>
              </div>
              {feeds.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>Inga feeds. Lägg till pressrum, karriärsida eller podcast-feed.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feeds.map((f, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 36px', gap: 8 }}>
                      <input value={f.url} onChange={(e) => updateFeed(i, { url: e.target.value })} placeholder="https://example.com/feed.xml" style={inp} />
                      <input value={f.label || ''} onChange={(e) => updateFeed(i, { label: e.target.value })} placeholder="Etikett" style={inp} />
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
    </div>
  );
}
