'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const C = {
  bg: 'var(--brand-bg)', card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', text: '#f8fafc',
  muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  danger: '#ef4444',
};

const PALETTE = [
  'var(--brand-accent)', '#22c55e', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#a855f7',
];

type Field = { id: string; key: string; display_name: string; unit: string; data_type: string };
type Dataset = { id: string; original_filename: string; row_count: number; granularity: string; period_start?: string; period_end?: string; uploaded_at: string; ai_summary: string };
type SourceSummary = { source_key: string; source_name: string; source_platform: string; source_category: string; dataset_count: number; total_rows: number; period_start?: string; period_end?: string; granularity: string; fields: Field[]; datasets: Dataset[] };
type TimeseriesResponse = { source_key: string; source_name: string; date_field: { key: string; display_name: string } | null; granularity: string; fields: Field[]; data: Record<string, any>[] };
type DatasetDetail = { dataset_id: string; source_name: string; source_version: number; original_filename: string; columns: { field_id: string; key: string; display_name: string; unit: string }[]; rows: Record<string, any>[]; total: number };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: C.accent, color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}

function granLabel(g?: string) {
  if (g === 'daily')      return '📅 Daglig';
  if (g === 'weekly')     return '📆 Veckovis';
  if (g === 'monthly')    return '🗓️ Månatlig';
  if (g === 'quarterly')  return '📊 Kvartalsvis';
  if (g === 'yearly')     return '📈 Årsvis';
  if (g === 'aggregated') return '∑ Aggregerad';
  return '❓ Okänd';
}

function fmtNum(n: number | null | undefined, unit?: string) {
  if (n == null) return '—';
  const s = Math.abs(n) >= 10000
    ? n.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
    : n.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
  return unit ? `${s} ${unit}` : s;
}

export default function SourceDetailPage() {
  const { id: customerId, sourceKey } = useParams() as { id: string; sourceKey: string };
  const router = useRouter();

  const [source, setSource] = useState<SourceSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [bucket, setBucket] = useState<'daily' | 'monthly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');

  // Dataset detail modal
  const [openDataset, setOpenDataset] = useState<string | null>(null);
  const [dsDetail, setDsDetail] = useState<DatasetDetail | null>(null);

  // Load source summary + customer name
  useEffect(() => {
    async function load() {
      const [custRes, sourcesRes] = await Promise.all([
        fetch(`${API}/api/customers/${customerId}`),
        fetch(`${API}/api/customers/${customerId}/sources`),
      ]);
      if (custRes.ok) {
        const c = await custRes.json();
        setCustomerName(c.name);
      }
      if (sourcesRes.ok) {
        const sources: SourceSummary[] = await sourcesRes.json();
        const found = sources.find(s => s.source_key === sourceKey);
        if (found) {
          setSource(found);
          // Default: select first 3 numeric fields
          const numeric = found.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');
          setSelectedFields(new Set(numeric.slice(0, 3).map(f => f.key)));
        }
      }
      setLoading(false);
    }
    load();
  }, [customerId, sourceKey]);

  // Load timeseries whenever field selection or bucket changes
  const loadTimeseries = useCallback(async () => {
    if (!source || selectedFields.size === 0) { setTimeseries(null); return; }
    const params = new URLSearchParams({ bucket });
    if (selectedFields.size > 0) params.set('fields', [...selectedFields].join(','));
    const res = await fetch(`${API}/api/customers/${customerId}/sources/${sourceKey}/timeseries?${params}`);
    if (res.ok) setTimeseries(await res.json());
  }, [customerId, sourceKey, selectedFields, bucket, source]);

  useEffect(() => { loadTimeseries(); }, [loadTimeseries]);

  async function openDs(id: string) {
    setOpenDataset(id);
    setDsDetail(null);
    const res = await fetch(`${API}/api/datasets/${id}`);
    if (res.ok) setDsDetail(await res.json());
  }

  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) return <main style={{ padding: 40, color: C.muted }}>Laddar…</main>;
  if (!source)  return <main style={{ padding: 40, color: C.muted }}>Källan hittades inte.</main>;

  const numericFields = source.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');

  // Summaries for KPI pucks — last data point or sum
  const latestRow = timeseries?.data?.at(-1);
  const totalRow = timeseries?.data?.reduce((acc, row) => {
    for (const f of (timeseries?.fields ?? [])) {
      acc[f.key] = (acc[f.key] ?? 0) + (row[f.key] ?? 0);
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: 'var(--brand-font-sans)', color: C.text }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span onClick={() => router.push('/kunder')} style={{ cursor: 'pointer', color: C.muted }}>Kunder</span>
        <span>›</span>
        <span onClick={() => router.push(`/kunder/${customerId}`)} style={{ cursor: 'pointer', color: C.muted }}>{customerName || customerId}</span>
        <span>›</span>
        <span style={{ color: C.text, fontWeight: 600 }}>{source.source_name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{source.source_name}</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
            {source.source_platform && <span>📡 {source.source_platform}</span>}
            {source.source_category && <span>🏷️ {source.source_category}</span>}
            <span>📁 {source.dataset_count} fil{source.dataset_count !== 1 ? 'er' : ''}</span>
            <span>📊 {source.total_rows.toLocaleString('sv-SE')} rader</span>
            {source.period_start && source.period_end && (
              <span>📆 {source.period_start.slice(0,7)} → {source.period_end.slice(0,7)}</span>
            )}
            <span>{granLabel(source.granularity)}</span>
          </div>
        </div>
        <button onClick={() => router.push(`/kunder/${customerId}`)} style={btn('ghost')}>← Tillbaka</button>
      </div>

      {/* KPI pucks — sum across all loaded data */}
      {timeseries && timeseries.data.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {timeseries.fields.filter(f => selectedFields.has(f.key)).map(f => {
            const total = totalRow?.[f.key];
            const latest = latestRow?.[f.key];
            return (
              <div key={f.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 20px', minWidth: 140 }}>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{f.display_name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtNum(f.data_type === 'int' ? total : latest, f.unit)}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{f.data_type === 'int' ? 'totalt' : 'senast'}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart section */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {numericFields.map((f, i) => {
              const active = selectedFields.has(f.key);
              const color = PALETTE[numericFields.indexOf(f) % PALETTE.length];
              return (
                <button
                  key={f.key}
                  onClick={() => toggleField(f.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    border: `1px solid ${active ? color : C.border}`,
                    background: active ? `${color}20` : 'transparent',
                    color: active ? color : C.muted,
                  }}
                >
                  {f.display_name}{f.unit ? ` (${f.unit})` : ''}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['daily', 'monthly'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${bucket === b ? C.accent : C.border}`,
                  background: bucket === b ? 'rgba(0,212,255,0.12)' : 'transparent',
                  color: bucket === b ? C.accent : C.muted,
                }}
              >
                {b === 'daily' ? 'Daglig' : 'Månatlig'}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        {!timeseries || timeseries.data.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
            {selectedFields.size === 0
              ? 'Välj minst ett fält ovan för att visa graf.'
              : 'Ingen tidsseriedata hittades. Kontrollera att källan innehåller ett datumfält.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeseries.data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={v => v >= 10000 ? `${(v/1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: C.muted, marginBottom: 6 }}
                formatter={(value: any, name) => {
                  const key = String(name ?? '');
                  const f = timeseries.fields.find(f => f.key === key);
                  return [fmtNum(value, f?.unit), f?.display_name ?? key];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: C.muted, paddingTop: 12 }}
                formatter={(value) => {
                  const f = timeseries.fields.find(f => f.key === value);
                  return f?.display_name ?? value;
                }}
              />
              {timeseries.fields
                .filter(f => selectedFields.has(f.key))
                .map((f, i) => (
                  <Line
                    key={f.key}
                    type="monotone"
                    dataKey={f.key}
                    stroke={PALETTE[numericFields.findIndex(nf => nf.key === f.key) % PALETTE.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Uploaded files */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Uppladdade filer ({source.datasets.length})</h3>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
              <th style={thStyle}>Fil</th>
              <th style={thStyle}>Kornighet</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Rader</th>
              <th style={thStyle}>Period</th>
              <th style={thStyle}>Laddat upp</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {source.datasets.map(d => (
              <React.Fragment key={d.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => openDs(d.id)}>
                  <td style={tdStyle}>{d.original_filename}</td>
                  <td style={tdStyle}>{granLabel(d.granularity)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{d.row_count.toLocaleString('sv-SE')}</td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 11 }}>
                    {d.period_start && d.period_end ? `${d.period_start.slice(0,7)} → ${d.period_end.slice(0,7)}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 11 }}>
                    {new Date(d.uploaded_at).toLocaleDateString('sv-SE')}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={e => e.stopPropagation()} style={btn('ghost')}>Rådata</button>
                  </td>
                </tr>
                {d.ai_summary && (
                  <tr>
                    <td colSpan={6} style={{ padding: '4px 12px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
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
      </div>

      {/* Dataset detail modal */}
      {openDataset && (
        <div
          onClick={() => { setOpenDataset(null); setDsDetail(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '95%', maxWidth: 1200, maxHeight: '88vh', overflow: 'auto' }}
          >
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
                      <tr style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
                        {dsDetail.columns.map(col => (
                          <th key={col.key} style={{ textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, color: '#fff' }}>
                            {col.display_name}{col.unit && <span style={{ color: C.dim, fontWeight: 400 }}> ({col.unit})</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dsDetail.rows.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent', borderBottom: 'none' }}>
                          {dsDetail.columns.map(col => (
                            <td key={col.key} style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.8)' }}>{String(r[col.key] ?? '')}</td>
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

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)' };
const tdStyle: React.CSSProperties = { padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)' };
