'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Gauge from '@/components/Gauge';
import NotesTab from '@/components/NotesTab';
import GoalsTab from '@/components/GoalsTab';
import DashboardCharts from '@/components/DashboardCharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0f0e12', card: '#151218', border: 'rgba(255,255,255,0.08)',
  accent: '#b14ef4', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Dataset = { id: string; source_id: string; source_key: string; source_name: string; source_version: number; original_filename: string; row_count: number; ai_summary?: string; granularity?: string; period_start?: string; period_end?: string; uploaded_at: string };
type Customer = { id: string; slug: string; name: string; logo_emoji: string; tags: string[]; icp: any; datasets?: Dataset[] };
type DatasetDetail = { dataset_id: string; source_name: string; source_version: number; original_filename: string; row_count: number; columns: { field_id: string; key: string; display_name: string; unit: string }[]; rows: Record<string, any>[]; page: number; total_pages: number; total: number };
type Module = { id: string; name: string; abbr: string; category: string; description: string; customer_id: string | null; field_refs: any[]; formula: any; thresholds: any; visualization: string; inverted: boolean };
type EvalResult = { value: number | null; context: Record<string, number>; aliases: Record<string, any>; error: string | null };

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

  // Module state
  const [modules, setModules] = useState<Module[]>([]);
  const [evalResults, setEvalResults] = useState<Record<string, EvalResult | 'loading'>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'goals'>('overview');

  async function refresh() {
    const res = await fetch(`${API}/api/customers/${params.id}`);
    if (res.ok) setCustomer(await res.json());
  }

  async function fetchModules() {
    const res = await fetch(`${API}/api/modules?customer_id=${params.id}&include_global=true`);
    if (res.ok) setModules(await res.json());
  }

  useEffect(() => { refresh(); fetchModules(); }, [params.id]);

  async function runModule(moduleId: string, customerId: string) {
    setEvalResults(prev => ({ ...prev, [moduleId]: 'loading' }));
    const res = await fetch(`${API}/api/modules/${moduleId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ids: [customerId] }),
    });
    if (res.ok) {
      const data = await res.json();
      const r = data.results?.[0];
      setEvalResults(prev => ({
        ...prev,
        [moduleId]: r ? { value: r.value, context: r.context, aliases: r.aliases, error: r.error } : { value: null, context: {}, aliases: {}, error: 'No result' },
      }));
    }
  }

  async function runAllModules() {
    if (!customer || modules.length === 0) return;
    const loadingState = Object.fromEntries(modules.map(m => [m.id, 'loading' as const]));
    setEvalResults(prev => ({ ...prev, ...loadingState }));
    const res = await fetch(`${API}/api/customers/${customer.id}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: modules.map(m => m.id) }),
    });
    if (res.ok) {
      const data = await res.json();
      const updates: Record<string, EvalResult> = {};
      for (const r of (data.results || [])) {
        updates[r.module_id] = { value: r.value, context: r.context, aliases: r.aliases, error: r.error };
      }
      setEvalResults(prev => ({ ...prev, ...updates }));
    }
  }

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

  const customerModules = modules.filter(m => m.customer_id !== null);
  const globalModules = modules.filter(m => m.customer_id === null);

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "var(--brand-font-sans)", color: C.text }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '2.5rem' }}>{customer.logo_emoji}</span>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>{customer.name}</h1>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>slug: <code>{customer.slug}</code> · {customer.datasets?.length || 0} dataset · {modules.length} moduler</div>
          </div>
        </div>
        <button onClick={deleteCustomer} style={btn('danger')}>Ta bort kund</button>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.card, borderRadius: 12, padding: 4, border: `1px solid ${C.border}` }}>
        {[
          { key: 'overview' as const, label: '📊 Översikt' },
          { key: 'notes' as const, label: '📝 Anteckningar' },
          { key: 'goals' as const, label: '🎯 Mål' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit',
            transition: 'all 0.15s',
            background: activeTab === tab.key ? 'rgba(177,78,244,0.12)' : 'transparent',
            color: activeTab === tab.key ? C.accent : C.muted,
            borderColor: activeTab === tab.key ? 'rgba(177,78,244,0.25)' : 'transparent',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Notes tab */}
      {activeTab === 'notes' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <NotesTab customerId={params.id} />
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <GoalsTab customerId={params.id} />
        </div>
      )}

      {/* Overview tab */}
      {activeTab === 'overview' && <>
      {/* Dashboard Charts */}
      <DashboardCharts customerId={params.id} />

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0]; if (f) upload(f);
        }}
        onClick={() => fileInput.current?.click()}
        style={{
          background: dragOver ? 'rgba(177,78,244,0.1)' : C.card,
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

      {/* Datasets */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Dataset ({customer.datasets?.length || 0})</h3>
        {!customer.datasets?.length ? (
          <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>
            Inga dataset ännu. Ladda upp en fil för att komma igång.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                <th style={th}>Fil</th><th style={th}>Källa</th><th style={th}>Version</th><th style={th}>Kornighet</th>
                <th style={{ ...th, textAlign: 'right' }}>Rader</th><th style={th}>Period</th><th></th>
              </tr>
            </thead>
            <tbody>
              {customer.datasets.map(d => (
                <React.Fragment key={d.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => openDs(d.id)}>
                    <td style={td}>{d.original_filename}</td>
                    <td style={td}>{d.source_name}</td>
                    <td style={td}>v{d.source_version}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                        background: d.granularity === 'daily' ? 'rgba(34,197,94,0.15)' :
                                    d.granularity === 'monthly' ? 'rgba(59,130,246,0.15)' :
                                    d.granularity === 'aggregated' ? 'rgba(245,158,11,0.15)' :
                                    'rgba(255,255,255,0.05)',
                        color: d.granularity === 'daily' ? '#22c55e' :
                               d.granularity === 'monthly' ? '#3b82f6' :
                               d.granularity === 'aggregated' ? '#f59e0b' : C.dim,
                      }}>
                        {d.granularity === 'daily' ? '📅 Daglig' :
                         d.granularity === 'weekly' ? '📆 Veckovis' :
                         d.granularity === 'monthly' ? '🗓️ Månatlig' :
                         d.granularity === 'quarterly' ? '📊 Kvartalsvis' :
                         d.granularity === 'yearly' ? '📈 Årsvis' :
                         d.granularity === 'aggregated' ? '∑ Aggregerad' : '❓ Okänd'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{d.row_count}</td>
                    <td style={{ ...td, color: C.muted, fontSize: 11 }}>
                      {d.period_start && d.period_end ? `${d.period_start.slice(0,7)} → ${d.period_end.slice(0,7)}` : '—'}
                    </td>
                    <td style={td}><button onClick={e => { e.stopPropagation(); deleteDs(d.id); }} style={btn('ghost')}>Ta bort</button></td>
                  </tr>
                  {d.ai_summary && (
                    <tr>
                      <td colSpan={7} style={{ padding: '4px 12px 14px', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ background: 'rgba(177, 78, 244, 0.08)', border: '1px solid rgba(177, 78, 244, 0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                          <span style={{ color: C.accent, marginRight: 6 }}>✨ AI</span>
                          {d.ai_summary}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Module overview */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Moduler ({modules.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={runAllModules} style={btn('accent')} disabled={modules.length === 0}>
              ▶ Kör alla
            </button>
            <a href="/moduler" style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Hantera moduler →
            </a>
          </div>
        </div>

        {modules.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>
            Inga moduler. Klona en global mall från <a href="/moduler" style={{ color: C.accent }}>Moduler</a>.
          </div>
        ) : (
          <>
            {customerModules.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>Kundspecifika</div>
                <ModuleGrid modules={customerModules} customerId={customer.id} evalResults={evalResults} onRun={runModule} />
              </div>
            )}
            {globalModules.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>Globala mallar</div>
                <ModuleGrid modules={globalModules} customerId={customer.id} evalResults={evalResults} onRun={runModule} />
              </div>
            )}
          </>
        )}
      </div>

      </>}

      {/* Dataset detail modal */}
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

function ModuleGrid({ modules, customerId, evalResults, onRun }: {
  modules: Module[];
  customerId: string;
  evalResults: Record<string, EvalResult | 'loading'>;
  onRun: (moduleId: string, customerId: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {modules.map(m => {
        const result = evalResults[m.id];
        const isLoading = result === 'loading';
        const hasResult = result && result !== 'loading';
        const evalResult = hasResult ? (result as EvalResult) : null;
        const unit = m.thresholds?.unit || '';
        return (
          <div key={m.id} style={{
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{m.name}</div>
                {m.abbr && <div style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace', marginTop: 2 }}>{m.abbr}</div>}
                {m.category && <div style={{ fontSize: 10, color: C.accent, marginTop: 2 }}>{m.category}</div>}
              </div>
              <button
                onClick={() => onRun(m.id, customerId)}
                disabled={isLoading}
                style={{
                  ...btn('accent'),
                  padding: '4px 12px', fontSize: 12,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? '…' : '▶'}
              </button>
            </div>

            {evalResult && (
              <>
                {evalResult.error ? (
                  <div style={{ fontSize: 11, color: C.danger, background: 'rgba(239,68,68,0.1)', borderRadius: 6, padding: '6px 8px' }}>
                    {evalResult.error}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Gauge
                      value={evalResult.value ?? 0}
                      thresholds={m.thresholds}
                      inverted={m.inverted}
                      unit={unit}
                      size="sm"
                    />
                    {evalResult.context && Object.keys(evalResult.context).length > 0 && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4, width: '100%' }}>
                        {Object.entries(evalResult.context).map(([k, v]) => (
                          <span key={k} style={{ marginRight: 10 }}>
                            <span style={{ color: C.dim }}>{k}=</span>
                            <span style={{ fontFamily: 'monospace' }}>{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {m.field_refs.length > 0 && !evalResult && (
              <div style={{ fontSize: 10, color: C.dim }}>
                {m.field_refs.length} datapunkt{m.field_refs.length > 1 ? 'er' : ''}
                {m.field_refs.map((r: any) => r.alias).join(', ') && ': ' + m.field_refs.map((r: any) => r.alias).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
