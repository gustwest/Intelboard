'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0a0a0f', card: '#12121a', border: 'rgba(255,255,255,0.08)',
  accent: '#a855f7', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Dataset = { id: string; source_id: string; source_key: string; source_name: string; source_version: number; original_filename: string; row_count: number; uploaded_at: string };
type Customer = { id: string; slug: string; name: string; logo_emoji: string; tags: string[]; icp: any; datasets?: Dataset[] };
type DatasetDetail = { dataset_id: string; source_name: string; source_version: number; original_filename: string; row_count: number; columns: { field_id: string; key: string; display_name: string; unit: string }[]; rows: Record<string, any>[]; page: number; total_pages: number; total: number };

export default function CustomerDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [uploadStatus, setUploadStatus] = useState<any>(null);
  const [openDataset, setOpenDataset] = useState<string | null>(null);
  const [dsDetail, setDsDetail] = useState<DatasetDetail | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const lastFile = useRef<File | null>(null);

  async function refresh() {
    const res = await fetch(`${API}/api/customers/${params.id}`);
    if (res.ok) setCustomer(await res.json());
  }
  useEffect(() => { refresh(); }, [params.id]);

  async function upload(file: File) {
    lastFile.current = file;
    setUploadStatus({ pending: true, filename: file.name });
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/api/customers/${params.id}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    setUploadStatus(data);
    if (data.status === 'matched') refresh();
  }

  async function forceIngest(source_version_id: string) {
    const f = lastFile.current;
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('source_version_id', source_version_id);
    const res = await fetch(`${API}/api/customers/${params.id}/upload/force`, { method: 'POST', body: fd });
    const data = await res.json();
    setUploadStatus({ ...data, forced: true });
    if (res.ok) refresh();
  }

  async function openDs(id: string) {
    setOpenDataset(id);
    setDsDetail(null);
    const res = await fetch(`${API}/api/datasets/${id}`);
    if (res.ok) setDsDetail(await res.json());
  }

  async function deleteDs(id: string) {
    if (!confirm('Ta bort datasetet?')) return;
    await fetch(`${API}/api/datasets/${id}`, { method: 'DELETE' });
    setOpenDataset(null); setDsDetail(null);
    refresh();
  }

  async function deleteCustomer() {
    if (!confirm(`Radera kund "${customer?.name}"? Alla dataset och moduler för kunden raderas också.`)) return;
    await fetch(`${API}/api/customers/${params.id}`, { method: 'DELETE' });
    router.push('/kunder');
  }

  if (!customer) return <main style={{ padding: 40, color: C.muted }}>Laddar…</main>;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '2.5rem' }}>{customer.logo_emoji}</span>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{customer.name}</h1>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>slug: <code>{customer.slug}</code> · {customer.datasets?.length || 0} dataset</div>
          </div>
        </div>
        <button onClick={deleteCustomer} style={btn('danger')}>Ta bort kund</button>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0]; if (f) upload(f);
        }}
        onClick={() => fileInput.current?.click()}
        style={{
          background: dragOver ? 'rgba(168,85,247,0.1)' : C.card,
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          borderRadius: 16, padding: 28, marginBottom: 20, textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 6 }}>📥</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Dra CSV / Excel hit eller klicka för att välja</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Systemet identifierar automatiskt vilken registrerad källa filen tillhör.
        </div>
        <input ref={fileInput} type="file" style={{ display: 'none' }} accept=".csv,.xlsx,.xls,.tsv,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>

      {uploadStatus && (
        <UploadStatusPanel status={uploadStatus} onDismiss={() => setUploadStatus(null)} onForceIngest={forceIngest} />
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Dataset ({customer.datasets?.length || 0})</h3>
        {!customer.datasets?.length ? (
          <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>
            Inga dataset ännu. Ladda upp en fil för att komma igång.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                <th style={th}>Fil</th><th style={th}>Källa</th><th style={th}>Version</th>
                <th style={{ ...th, textAlign: 'right' }}>Rader</th><th style={th}>Uppladdad</th><th></th>
              </tr>
            </thead>
            <tbody>
              {customer.datasets.map(d => (
                <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => openDs(d.id)}>
                  <td style={td}>{d.original_filename}</td>
                  <td style={td}>{d.source_name}</td>
                  <td style={td}>v{d.source_version}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{d.row_count}</td>
                  <td style={{ ...td, color: C.muted }}>{new Date(d.uploaded_at).toLocaleString()}</td>
                  <td style={td}><button onClick={e => { e.stopPropagation(); deleteDs(d.id); }} style={btn('ghost')}>Ta bort</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openDataset && (
        <div onClick={() => { setOpenDataset(null); setDsDetail(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '95%', maxWidth: 1200, maxHeight: '88vh', overflow: 'auto' }}>
            {!dsDetail ? <div style={{ color: C.muted }}>Laddar…</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{dsDetail.original_filename}</h3>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{dsDetail.source_name} v{dsDetail.source_version} · {dsDetail.total} rader</div>
                  </div>
                  <button onClick={() => { setOpenDataset(null); setDsDetail(null); }} style={btn('ghost')}>Stäng</button>
                </div>
                <div style={{ overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, background: C.card }}>
                        {dsDetail.columns.map(c => (
                          <th key={c.key} style={{ ...th, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
                            {c.display_name} {c.unit && <span style={{ color: C.dim }}>({c.unit})</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dsDetail.rows.map((r, i) => (
                        <tr key={i}>
                          {dsDetail.columns.map(c => (
                            <td key={c.key} style={{ ...td, padding: '8px 12px' }}>{String(r[c.key] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function UploadStatusPanel({ status, onDismiss, onForceIngest }: { status: any; onDismiss: () => void; onForceIngest: (svid: string) => void }) {
  const color = status.status === 'matched' ? C.success : status.status === 'drift' ? C.warning : C.danger;
  const icon = status.status === 'matched' ? '✅' : status.status === 'drift' ? '⚠️' : status.status === 'no_match' ? '❌' : '⏳';
  const bg = `${color}15`;
  return (
    <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{icon} {status.message || (status.status === 'matched' ? 'Uppladdning lyckades' : status.status)}</div>
          {status.status === 'matched' && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              {status.row_count} rader importerade till <b>{status.source_key}</b> v{status.source_version}
            </div>
          )}
          {status.status === 'drift' && (
            <>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Saknade kolumner: {status.missing_columns?.join(', ') || '—'}<br />
                Extra kolumner: {status.extra_columns?.join(', ') || '—'}
              </div>
              <button onClick={() => onForceIngest(status.source_version_id)} style={{ ...btn('accent'), marginTop: 10 }}>
                Ingest ändå mot v{status.source_version}
              </button>
            </>
          )}
          {status.status === 'no_match' && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              Kolumner i filen: {(status.file_columns || []).slice(0, 12).join(', ')}{(status.file_columns || []).length > 12 ? '…' : ''}
            </div>
          )}
        </div>
        <button onClick={onDismiss} style={btn('ghost')}>Stäng</button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)' };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: C.accent, color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
