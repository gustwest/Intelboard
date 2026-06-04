'use client';

/**
 * Per-kund platsannons-feeds (ATS-XML, spec §1). Klistra in kundens unika
 * XML/RSS-feed från rekryteringssystemet (Teamtailor, Jobylon …) här på kundkortet.
 *
 * Att spara en feed aktiverar jobfeed-connectorn automatiskt för kunden. Pratar med
 * /api/connectors/{clientId} (samma settings.job_feeds som Connectors-sidan).
 */
import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Plus, Trash2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

type JobFeed = { url: string; label?: string };
type ClientConnectors = { active_connectors: string[]; job_feeds: JobFeed[] };

export default function JobFeedsEditor({ clientId }: { clientId: string }) {
  const [active, setActive] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<JobFeed[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await graphFetch<ClientConnectors>(`/api/connectors/${clientId}`);
      setActive(d.active_connectors || []);
      setFeeds(d.job_feeds || []);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function update(i: number, patch: Partial<JobFeed>) {
    setFeeds((p) => p.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setDirty(true);
  }
  function add() {
    setFeeds((p) => [...p, { url: '', label: '' }]);
    setDirty(true);
  }
  function remove(i: number) {
    setFeeds((p) => p.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setBanner(null);
    const clean = feeds.filter((f) => f.url.trim());
    // Att lägga in en feed slår på jobfeed-connectorn automatiskt.
    const nextActive = clean.length && !active.includes('jobfeed') ? [...active, 'jobfeed'] : active;
    try {
      await graphFetch(`/api/connectors/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_feeds: clean, active_connectors: nextActive }),
      });
      setActive(nextActive);
      setFeeds(clean);
      setDirty(false);
      setBanner({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const jobfeedOn = active.includes('jobfeed');

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Briefcase size={15} color={C.accent} /> Platsannonser (ATS)
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: jobfeedOn ? 'rgba(34,197,94,0.15)' : '#eef0f1', color: jobfeedOn ? '#16a34a' : C.muted }}>
            {jobfeedOn ? 'Aktiv' : 'Av'}
          </span>
        </div>
        <button onClick={add} style={btnSubtle}>
          <Plus size={12} /> Lägg till
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Klistra in kundens XML/RSS-feed från rekryteringssystemet (Teamtailor, Jobylon …). Stängda
        annonser upptäcks automatiskt och deras kompetenser klingar av över tid. Att spara en feed
        aktiverar connectorn.
      </div>

      {banner && (
        <div style={{ background: banner.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${banner.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '8px 12px', color: banner.tone === 'ok' ? '#16a34a' : '#b91c1c', fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          {banner.tone === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {banner.text}
        </div>
      )}

      {feeds.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, padding: '4px 0 12px' }}>Inga feeds. Klistra in kundens ATS-XML-länk.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {feeds.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 36px', gap: 8 }}>
              <input value={f.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://kund.teamtailor.com/jobs.xml" style={inp} />
              <input value={f.label || ''} onChange={(e) => update(i, { label: e.target.value })} placeholder="Etikett" style={inp} />
              <button onClick={() => remove(i)} style={{ ...btnSubtle, padding: '8px', justifyContent: 'center' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={save} disabled={!dirty || saving} style={{ ...btnSubtle, background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent', color: dirty ? C.accent : C.muted, borderColor: dirty ? 'rgba(159,81,182,0.3)' : C.border }}>
        <Save size={12} /> {saving ? 'Sparar…' : 'Spara feeds'}
      </button>
    </div>
  );
}

const btnSubtle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'transparent',
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const inp: React.CSSProperties = {
  padding: '8px 12px',
  background: '#eef0f1',
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 12,
  outline: 'none',
};
