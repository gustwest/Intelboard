'use client';

/**
 * Per-kund LinkedIn-kapacitetsdata (spec §4) — på kundkortet, låst till client_id.
 *
 * Vi samlar in datan själva: dra in skärmklipp/export här. Kompetenserna kan anges
 * direkt eller fyllas vid den interna verifieringen (Granska → LinkedIn). Att ladda
 * upp slår på linkedin_capacity-connectorn för kunden. Talar med /api/linkedin/* +
 * /api/connectors/{clientId}.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Network, UploadCloud, CheckCircle2, AlertCircle, FileCheck2, X, BellRing } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

type Snapshot = { id: string; status: string; is_active: boolean; skills: string[]; quarter: string | null; uploaded_at: string | null };
type Todo = { id: string; type: string; status: string; message: string; created_at: string | null };

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING_INTERNAL_VERIFICATION: { bg: 'rgba(245,158,11,0.15)', fg: '#b45309', label: 'Väntar på verifiering' },
  VERIFIED: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a', label: 'Verifierad' },
  REJECTED: { bg: 'rgba(239,68,68,0.1)', fg: '#b91c1c', label: 'Avvisad' },
};

export default function LinkedInCapacityUpload({ clientId }: { clientId: string }) {
  const [active, setActive] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState('');
  const [quarter, setQuarter] = useState('');
  const [followers, setFollowers] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [snaps, conn, td] = await Promise.all([
        graphFetch<{ snapshots: Snapshot[] }>(`/api/linkedin/${clientId}/snapshots`),
        graphFetch<{ active_connectors: string[] }>(`/api/connectors/${clientId}`),
        graphFetch<{ todos: Todo[] }>(`/api/linkedin/${clientId}/todos`),
      ]);
      setSnapshots(snaps.snapshots);
      setActive(conn.active_connectors || []);
      setTodos(td.todos || []);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!file && !skills.trim()) {
      setBanner({ tone: 'error', text: 'Dra in ett skärmklipp/export eller ange minst en kompetens.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append('skills', skills);
      if (quarter.trim()) fd.append('quarter', quarter.trim());
      if (followers.trim()) fd.append('followers', followers.trim());
      if (file) fd.append('file', file);
      const res = await graphFetch<{ extracted_from_file?: number }>(`/api/linkedin/${clientId}/snapshots`, { method: 'POST', body: fd });
      const extracted = res?.extracted_from_file || 0;
      // Uppladdning = enrollment → slå på connectorn för kunden.
      if (!active.includes('linkedin_capacity')) {
        const next = [...active, 'linkedin_capacity'];
        await graphFetch(`/api/connectors/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_connectors: next }),
        });
        setActive(next);
      }
      setBanner({ tone: 'ok', text: extracted > 0 ? `Uppladdat — läste ${extracted} kompetenser ur filen. Väntar på verifiering.` : 'Uppladdat — väntar på intern verifiering.' });
      setFile(null);
      setSkills('');
      setQuarter('');
      setFollowers('');
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const on = active.includes('linkedin_capacity');

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Network size={15} color={C.accent} /> LinkedIn-kapacitetsdata (kvartal)
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: on ? 'rgba(34,197,94,0.15)' : '#eef0f1', color: on ? '#16a34a' : C.muted }}>
          {on ? 'Aktiv' : 'Av'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Vi samlar in datan själva. Dra in export/skärmklipp över bolagets samlade kompetensstatistik
        (utan persondata). <strong>CSV/XLSX läses automatiskt</strong> — kompetenserna kan annars anges
        nedan eller fyllas vid verifieringen. Bild/PDF lagras som underlag.
      </div>

      {todos.map((t) => (
        <div key={t.id} style={{ background: 'rgba(159,81,182,0.08)', border: '1px solid rgba(159,81,182,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', color: '#7a3d8c', fontSize: 12 }}>
          <BellRing size={14} /> {t.message}
        </div>
      ))}

      {banner && (
        <div style={{ background: banner.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${banner.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '8px 12px', color: banner.tone === 'ok' ? '#16a34a' : '#b91c1c', fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          {banner.tone === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {banner.text}
        </div>
      )}

      {/* drag-drop-zon */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
        onClick={() => !busy && fileInput.current?.click()}
        style={{ background: dragOver ? 'rgba(159,81,182,0.08)' : '#f7f8f9', border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: 10, padding: '18px 16px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', transition: 'all 0.15s', marginBottom: 10 }}
      >
        {file ? (
          <div style={{ fontSize: 12, color: '#3a4b56', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <FileCheck2 size={16} color={C.accent} /> {file.name}
            <button onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInput.current) fileInput.current.value = ''; }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, display: 'inline-flex' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud size={22} color={C.muted} />
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4b56', marginTop: 4 }}>Dra skärmklipp/export hit eller klicka för att välja</div>
          </>
        )}
        <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.csv,.xlsx,.xls,.pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
      </div>

      <textarea value={skills} onChange={(e) => setSkills(e.target.value)} rows={2}
        placeholder="Aggregerade kompetenser (valfritt): AWS, Kubernetes, ESG …"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#3a4b56', background: '#eef0f1', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="Kvartal (2026-Q2)" style={inp} />
        <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="Följarantal (intern)" inputMode="numeric" style={inp} />
      </div>

      <button onClick={upload} disabled={busy || (!file && !skills.trim())}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: (file || skills.trim()) ? 'rgba(159,81,182,0.18)' : 'transparent', color: (file || skills.trim()) ? '#9f51b6' : C.muted, border: `1px solid ${(file || skills.trim()) ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
        <UploadCloud size={14} /> {busy ? 'Laddar upp…' : 'Ladda upp'}
      </button>

      {snapshots.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {snapshots.slice(0, 4).map((s) => {
            const st = STATUS[s.status] || { bg: '#eef0f1', fg: C.muted, label: s.status };
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: C.muted }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {s.quarter || 'Snapshot'}{s.is_active ? ' · aktiv' : ''} · {s.skills.length} kompetenser
                  {s.uploaded_at ? ` · ${new Date(s.uploaded_at).toLocaleDateString('sv-SE')}` : ''}
                </span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.fg, fontWeight: 600 }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  padding: '8px 12px',
  background: '#eef0f1',
  color: '#3a4b56',
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 12,
  outline: 'none',
};
