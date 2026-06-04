'use client';

/**
 * Per-kund platsannons-feeds (ATS-XML, spec §1). Klistra in kundens unika
 * XML/RSS-feed från rekryteringssystemet (Teamtailor, Jobylon …) här på kundkortet.
 *
 * Att spara en feed aktiverar jobfeed-connectorn automatiskt för kunden. Pratar med
 * /api/connectors/{clientId} (samma settings.job_feeds som Connectors-sidan).
 */
import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';
import * as UI from './ui';

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
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Briefcase size={15} color={C.accent} /> Platsannonser (ATS)
          <UI.Badge tone={jobfeedOn ? 'ok' : 'neutral'}>{jobfeedOn ? 'Aktiv' : 'Av'}</UI.Badge>
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
        <UI.StatusBanner
          tone={banner.tone === 'ok' ? 'ok' : 'err'}
          icon={banner.tone === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          style={{ marginBottom: 10 }}
        >
          {banner.text}
        </UI.StatusBanner>
      )}

      {feeds.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, padding: '4px 0 12px' }}>Inga feeds. Klistra in kundens ATS-XML-länk.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {feeds.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 36px', gap: 8 }}>
              <UI.Input value={f.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://kund.teamtailor.com/jobs.xml" style={{ width: '100%' }} />
              <UI.Input value={f.label || ''} onChange={(e) => update(i, { label: e.target.value })} placeholder="Etikett" style={{ width: '100%' }} />
              <button onClick={() => remove(i)} style={{ ...btnSubtle, padding: '8px', justifyContent: 'center' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <UI.SaveButton dirty={dirty} saving={saving} onClick={save} label="Spara feeds" savingLabel="Sparar…" />
    </UI.Card>
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
