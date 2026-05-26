'use client';

/**
 * LinkedIn-connector: kvartalsvis kapacitets-uppladdning (spec §4).
 *
 * Kunden laddar upp aggregerade följar- + kompetensstatistik (utan persondata).
 * Snapshottet hamnar i PENDING_INTERNAL_VERIFICATION och verifieras internt under
 * fliken Granska → LinkedIn. Talar med /api/linkedin/* (routers/linkedin.py).
 */
import { useCallback, useEffect, useState } from 'react';
import { Network, UploadCloud, CheckCircle2, AlertCircle, Clock, BellRing } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type Client = { client_id: string; company_name: string | null };
type Snapshot = {
  id: string;
  status: string;
  is_active: boolean;
  skills: string[];
  quarter: string | null;
  uploaded_at: string | null;
  verified_at: string | null;
};
type Todo = { id: string; type: string; status: string; message: string; created_at: string | null };

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING_INTERNAL_VERIFICATION: { bg: 'rgba(245,158,11,0.15)', fg: '#b45309', label: 'Väntar på verifiering' },
  VERIFIED: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a', label: 'Verifierad' },
  REJECTED: { bg: 'rgba(239,68,68,0.1)', fg: '#b91c1c', label: 'Avvisad' },
};

export default function GraphLinkedInPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [skills, setSkills] = useState('');
  const [quarter, setQuarter] = useState('');
  const [followers, setFollowers] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setBanner({ tone: 'error', text: e.message }));
  }, []);

  const load = useCallback(async (clientId: string) => {
    setSnapshots(null);
    try {
      const [snaps, td] = await Promise.all([
        graphFetch<{ snapshots: Snapshot[] }>(`/api/linkedin/${clientId}/snapshots`),
        graphFetch<{ todos: Todo[] }>(`/api/linkedin/${clientId}/todos`),
      ]);
      setSnapshots(snaps.snapshots);
      setTodos(td.todos);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      setSnapshots([]);
    }
  }, []);

  useEffect(() => {
    if (selected) load(selected);
  }, [selected, load]);

  async function upload() {
    if (!selected || !skills.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append('skills', skills);
      if (quarter.trim()) fd.append('quarter', quarter.trim());
      if (followers.trim()) fd.append('followers', followers.trim());
      if (file) fd.append('file', file);
      await graphFetch(`/api/linkedin/${selected}/snapshots`, { method: 'POST', body: fd });
      setBanner({ tone: 'ok', text: 'Uppladdat — väntar nu på intern verifiering.' });
      setSkills('');
      setQuarter('');
      setFollowers('');
      setFile(null);
      load(selected);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GraphPageShell
      title="LinkedIn-kapacitetsdata"
      icon={<Network size={22} />}
      subtitle="Kvartalsvis uppladdning av aggregerade följar- och kompetensstatistik (utan persondata)."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select value={selected || ''} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          {clients.length === 0 && <option>Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>{c.company_name || c.client_id}</option>
          ))}
        </select>
      </div>

      {banner && (
        <div style={{ background: banner.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${banner.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '10px 14px', color: banner.tone === 'ok' ? '#16a34a' : '#b91c1c', fontSize: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          {banner.tone === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {banner.text}
        </div>
      )}

      {todos.map((t) => (
        <div key={t.id} style={{ background: 'rgba(159,81,182,0.08)', border: '1px solid rgba(159,81,182,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', color: '#7a3d8c', fontSize: 13 }}>
          <BellRing size={16} /> {t.message}
        </div>
      ))}

      {/* Uppladdningsformulär */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', marginBottom: 4 }}>Ladda upp kvartalsdata</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.55 }}>
          Klistra in de aggregerade kompetenserna (komma- eller radseparerade). Bifoga gärna export/skärmklipp som underlag för verifieringen. Följarantalet är endast för intern visning — det når aldrig kunskapsgrafen.
        </div>
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={4}
          placeholder="AWS, Kubernetes, ISO 27001, Ledarskap, ESG …"
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a4b56', background: '#eef0f1', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px', lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
            Kvartal (valfritt)
            <input value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="2026-Q2" style={{ ...inpStyle, display: 'block', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
            Följarantal (valfritt, intern visning)
            <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="1200" inputMode="numeric" style={{ ...inpStyle, display: 'block', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, flex: 1, minWidth: 200 }}>
            Underlag (export/skärmklipp, valfritt)
            <input type="file" accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#3a4b56' }} />
          </label>
        </div>
        <button
          onClick={upload}
          disabled={busy || !skills.trim() || !selected}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: skills.trim() ? 'rgba(159,81,182,0.18)' : 'transparent', color: skills.trim() ? '#9f51b6' : C.muted, border: `1px solid ${skills.trim() ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy || !skills.trim() ? 'not-allowed' : 'pointer' }}
        >
          <UploadCloud size={14} /> {busy ? 'Laddar upp…' : 'Ladda upp'}
        </button>
      </div>

      {/* Historik */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', marginBottom: 12 }}>Snapshots</div>
        {snapshots === null ? (
          <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
        ) : snapshots.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted }}>Inga uppladdningar än.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {snapshots.map((s) => {
              const st = STATUS_STYLE[s.status] || { bg: '#eef0f1', fg: C.muted, label: s.status };
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <Clock size={14} color={C.muted} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#3a4b56', fontWeight: 600 }}>
                      {s.quarter || 'Snapshot'}{s.is_active ? ' · aktiv' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {s.skills.length} kompetenser
                      {s.uploaded_at ? ` · ${new Date(s.uploaded_at).toLocaleDateString('sv-SE')}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: st.bg, color: st.fg, fontWeight: 600 }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GraphPageShell>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', background: '#eef0f1', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const inpStyle: React.CSSProperties = {
  padding: '6px 10px', background: '#eef0f1', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none',
};
