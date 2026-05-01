'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  danger: '#ef4444', success: '#22c55e',
};

const PALETTE = [
  'var(--brand-accent)', '#22c55e', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#a855f7',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Field = { id: string; key: string; display_name: string; unit: string; data_type: string };
type Dataset = { id: string; original_filename: string; row_count: number; granularity: string; period_start?: string; period_end?: string; uploaded_at: string; ai_summary: string };
type SourceSummary = { source_key: string; source_name: string; source_platform: string; source_category: string; dataset_count: number; total_rows: number; period_start?: string; period_end?: string; granularity: string; fields: Field[]; datasets: Dataset[] };
type TimeseriesResponse = { source_key: string; source_name: string; date_field: { key: string; display_name: string } | null; granularity: string; fields: Field[]; data: Record<string, any>[] };
type DatasetDetail = { dataset_id: string; source_name: string; source_version: number; original_filename: string; columns: { field_id: string; key: string; display_name: string; unit: string }[]; rows: Record<string, any>[]; total: number };
type Period = '30d' | 'prev-month' | '90d' | '180d' | '365d' | 'all';

// ─── Period options ────────────────────────────────────────────────────────────
const PERIOD_OPTIONS: { value: Period; label: string; days?: number }[] = [
  { value: '30d',        label: 'Senaste 30 dagar', days: 30 },
  { value: 'prev-month', label: 'Förra månaden' },
  { value: '90d',        label: 'Senaste kvartalet', days: 90 },
  { value: '180d',       label: 'Senaste halvåret',  days: 180 },
  { value: '365d',       label: 'Senaste året',      days: 365 },
  { value: 'all',        label: 'All data' },
];

// ─── Smart field defaults per source category ─────────────────────────────────
const CATEGORY_PATTERNS: Record<string, { priority: string[]; kpi: string[] }> = {
  'Campaign':     { priority: ['impression', 'click', 'ctr', 'conversion', 'spend', 'cost'],    kpi: ['impression', 'click', 'ctr', 'spend'] },
  'Demographics': { priority: ['count', 'percent', 'member'],                                    kpi: ['count', 'percent'] },
  'Content':      { priority: ['impression', 'view', 'engagement', 'click', 'reaction'],         kpi: ['impression', 'view', 'engagement'] },
  'Followers':    { priority: ['follower', 'gain', 'organic', 'total', 'net'],                   kpi: ['follower', 'organic', 'gain'] },
  'Visitors':     { priority: ['view', 'visitor', 'unique', 'desktop', 'mobile'],                kpi: ['view', 'unique', 'visitor'] },
  'Recruiter':    { priority: ['apply', 'view', 'inmail', 'response', 'open'],                   kpi: ['apply', 'view', 'response'] },
  'Competitors':  { priority: ['follower', 'post', 'engagement', 'total'],                       kpi: ['follower', 'post', 'engagement'] },
  'Talent':       { priority: ['talent', 'skill', 'growth', 'hire'],                             kpi: ['talent', 'skill'] },
  'Personal':     { priority: ['impression', 'view', 'reaction', 'comment', 'engagement'],       kpi: ['impression', 'view', 'reaction'] },
  'Companies':    { priority: ['employee', 'follower', 'growth', 'company'],                     kpi: ['employee', 'follower'] },
};

function matchByPatterns(fields: Field[], patterns: string[], max: number): Field[] {
  return fields
    .map(f => ({ f, score: patterns.findIndex(p => f.key.toLowerCase().includes(p) || f.display_name.toLowerCase().includes(p)) }))
    .filter(x => x.score !== -1)
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(x => x.f);
}

function getSmartDefaults(fields: Field[], category: string) {
  const numeric = fields.filter(f => f.data_type === 'int' || f.data_type === 'float');
  const config = CATEGORY_PATTERNS[category];
  if (!config) {
    return { chartFields: new Set(numeric.slice(0, 2).map(f => f.key)), kpiFields: numeric.slice(0, 4) };
  }
  const prioritized = matchByPatterns(numeric, config.priority, 3);
  const kpiMatched  = matchByPatterns(numeric, config.kpi, 4);
  return {
    chartFields: new Set((prioritized.length ? prioritized : numeric.slice(0, 2)).map(f => f.key)),
    kpiFields:   kpiMatched.length ? kpiMatched : numeric.slice(0, 4),
  };
}

// ─── Period slicing ───────────────────────────────────────────────────────────
function sliceByPeriod(data: Record<string, any>[], period: Period) {
  if (period === 'all' || data.length === 0) return { current: data, previous: [] as Record<string, any>[] };
  const now = new Date();

  if (period === 'prev-month') {
    const y = now.getFullYear(), m = now.getMonth();
    const thisMonth = new Date(y, m, 1);
    const prevMonth = new Date(y, m - 1, 1);
    const twoBack   = new Date(y, m - 2, 1);
    return {
      current:  data.filter(r => { const d = new Date(r.date); return d >= prevMonth && d < thisMonth; }),
      previous: data.filter(r => { const d = new Date(r.date); return d >= twoBack && d < prevMonth; }),
    };
  }

  const days = PERIOD_OPTIONS.find(p => p.value === period)?.days ?? 30;
  const ms = days * 86_400_000;
  const currentStart  = new Date(now.getTime() - ms);
  const previousStart = new Date(now.getTime() - 2 * ms);
  return {
    current:  data.filter(r => new Date(r.date) >= currentStart),
    previous: data.filter(r => { const d = new Date(r.date); return d >= previousStart && d < currentStart; }),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeKPI(rows: Record<string, any>[], field: Field): number | null {
  const vals = rows.map(r => r[field.key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return field.data_type === 'int' ? vals.reduce((a, b) => a + b, 0) : vals[vals.length - 1];
}

function fmtNum(n: number | null | undefined, unit?: string) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1_000_000) s = `${(n / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}M`;
  else if (abs >= 10_000) s = n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });
  else s = n.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
  return unit ? `${s} ${unit}` : s;
}

function fmtDelta(curr: number | null, prev: number | null) {
  if (curr == null || prev == null || prev === 0) return { pct: null as number | null, positive: true };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return { pct, positive: pct >= 0 };
}

function granLabel(g?: string) {
  const map: Record<string, string> = { daily: 'Daglig', weekly: 'Veckovis', monthly: 'Månatlig', quarterly: 'Kvartalsvis', yearly: 'Årsvis', aggregated: 'Aggregerad' };
  return map[g ?? ''] ?? 'Okänd';
}

function ghostBtn(): React.CSSProperties {
  return { padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, transition: 'all 0.15s' };
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' };
const tdStyle: React.CSSProperties = { padding: '10px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)' };

// ─── Sub-components ───────────────────────────────────────────────────────────
function FilesSection({ source, openDs }: { source: SourceSummary; openDs: (id: string) => void }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Uppladdade filer ({source.datasets.length})</h3>
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
                  {d.period_start && d.period_end ? `${d.period_start.slice(0, 7)} → ${d.period_end.slice(0, 7)}` : '—'}
                </td>
                <td style={{ ...tdStyle, color: C.muted, fontSize: 11 }}>
                  {new Date(d.uploaded_at).toLocaleDateString('sv-SE')}
                </td>
                <td style={tdStyle}>
                  <button type="button" onClick={e => e.stopPropagation()} style={ghostBtn()}>Rådata</button>
                </td>
              </tr>
              {d.ai_summary && (
                <tr>
                  <td colSpan={6} style={{ padding: '4px 8px 12px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                      <span style={{ color: C.accent, marginRight: 6, fontWeight: 600 }}>✨ AI</span>
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
  );
}

function ChartPanel({ data, fields, allFields }: {
  data: Record<string, any>[];
  fields: Field[];
  allFields: Field[];
}) {
  if (!data.length || !fields.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={false} width={60}
          tickFormatter={v => Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: C.muted, marginBottom: 6 }}
          formatter={(value: any, name) => {
            const key = String(name ?? '');
            const f = allFields.find(f => f.key === key);
            return [fmtNum(value, f?.unit), f?.display_name ?? key];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: C.muted, paddingTop: 12 }}
          formatter={value => { const f = allFields.find(f => f.key === value); return f?.display_name ?? value; }} />
        {fields.map((f) => (
          <Line key={f.key} type="monotone" dataKey={f.key}
            stroke={PALETTE[allFields.findIndex(nf => nf.key === f.key) % PALETTE.length]}
            strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Overview view ────────────────────────────────────────────────────────────
function OverviewView({ source, timeseries, period, setPeriod, kpiFields, chartFieldKeys }: {
  source: SourceSummary;
  timeseries: TimeseriesResponse | null;
  period: Period;
  setPeriod: (p: Period) => void;
  kpiFields: Field[];
  chartFieldKeys: Set<string>;
}) {
  const { current, previous } = useMemo(() => {
    if (!timeseries) return { current: [] as Record<string, any>[], previous: [] as Record<string, any>[] };
    return sliceByPeriod(timeseries.data, period);
  }, [timeseries, period]);

  const displayData = period === 'all' ? (timeseries?.data ?? []) : current;
  const chartFields = (timeseries?.fields ?? []).filter(f => chartFieldKeys.has(f.key));
  const numericFields = source.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');
  const latestAISummary = source.datasets.find(d => d.ai_summary)?.ai_summary;

  return (
    <>
      {/* Period picker */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setPeriod(opt.value)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            border: `1px solid ${period === opt.value ? C.accent : C.border}`,
            background: period === opt.value ? 'rgba(0,212,255,0.12)' : 'transparent',
            color: period === opt.value ? C.accent : C.muted,
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* AI-insikt hero */}
      {latestAISummary && (
        <div style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>✨ AI-insikt</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: 'rgba(255,255,255,0.85)' }}>{latestAISummary}</p>
        </div>
      )}

      {/* KPI pucks with delta */}
      {displayData.length > 0 && kpiFields.length > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
          {kpiFields.map(f => {
            const curr = computeKPI(displayData, f);
            const prev = period !== 'all' ? computeKPI(previous, f) : null;
            const { pct, positive } = fmtDelta(curr, prev);
            return (
              <div key={f.key} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                padding: '18px 22px', minWidth: 150, flex: '1 1 150px', maxWidth: 220,
              }}>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 600 }}>
                  {f.display_name}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6 }}>
                  {fmtNum(curr, f.unit)}
                </div>
                {pct != null ? (
                  <div style={{ fontSize: 12, color: positive ? C.success : C.danger, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span>{positive ? '↑' : '↓'}</span>
                    <span>{Math.abs(pct).toFixed(1)}%</span>
                    <span style={{ color: C.dim, fontWeight: 400, marginLeft: 3 }}>vs föreg.</span>
                  </div>
                ) : period !== 'all' ? (
                  <div style={{ fontSize: 11, color: C.dim }}>Ingen jämf. period</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Trend chart */}
      {displayData.length > 0 && chartFields.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            Trend
            <span style={{ color: C.dim, fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
              {chartFields.map(f => f.display_name).join(' · ')}
            </span>
          </div>
          <ChartPanel data={displayData} fields={chartFields} allFields={numericFields} />
        </div>
      )}

      {/* No data for period */}
      {displayData.length === 0 && timeseries && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 20px', marginBottom: 20, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Ingen data för vald period. Prova <strong style={{ color: C.text, cursor: 'pointer' }} onClick={() => setPeriod('all')}>All data</strong>.
        </div>
      )}
    </>
  );
}

// ─── Data explorer view ───────────────────────────────────────────────────────
function DataView({ timeseries, numericFields, selectedFields, toggleField, bucket, setBucket }: {
  timeseries: TimeseriesResponse | null;
  numericFields: Field[];
  selectedFields: Set<string>;
  toggleField: (key: string) => void;
  bucket: 'daily' | 'monthly';
  setBucket: (b: 'daily' | 'monthly') => void;
}) {
  const visibleFields = (timeseries?.fields ?? []).filter(f => selectedFields.has(f.key));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {numericFields.map(f => {
            const active = selectedFields.has(f.key);
            const color = PALETTE[numericFields.indexOf(f) % PALETTE.length];
            return (
              <button key={f.key} onClick={() => toggleField(f.key)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                border: `1px solid ${active ? color : C.border}`,
                background: active ? `${color}20` : 'transparent',
                color: active ? color : C.muted,
              }}>
                {f.display_name}{f.unit ? ` (${f.unit})` : ''}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['daily', 'monthly'] as const).map(b => (
            <button key={b} onClick={() => setBucket(b)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${bucket === b ? C.accent : C.border}`,
              background: bucket === b ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: bucket === b ? C.accent : C.muted,
            }}>
              {b === 'daily' ? 'Daglig' : 'Månatlig'}
            </button>
          ))}
        </div>
      </div>

      {!timeseries || timeseries.data.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
          {selectedFields.size === 0
            ? 'Välj minst ett fält ovan för att visa graf.'
            : 'Ingen tidsseriedata. Källan saknar kanske ett datumfält.'}
        </div>
      ) : (
        <ChartPanel data={timeseries.data} fields={visibleFields} allFields={numericFields} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SourceDetailPage() {
  const { id: customerId, sourceKey } = useParams() as { id: string; sourceKey: string };
  const router = useRouter();

  const [source, setSource]           = useState<SourceSummary | null>(null);
  const [timeseries, setTimeseries]   = useState<TimeseriesResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [activeView, setActiveView]   = useState<'overview' | 'data'>('overview');

  // Overview state
  const [period, setPeriod]               = useState<Period>('30d');
  const [overviewFieldKeys, setOverviewFieldKeys] = useState<Set<string>>(new Set());
  const [kpiFields, setKpiFields]         = useState<Field[]>([]);

  // Data view state
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [bucket, setBucket]               = useState<'daily' | 'monthly'>('monthly');

  // Dataset detail modal
  const [openDataset, setOpenDataset] = useState<string | null>(null);
  const [dsDetail, setDsDetail]       = useState<DatasetDetail | null>(null);

  // Load source summary + customer name
  useEffect(() => {
    async function load() {
      const [custRes, sourcesRes] = await Promise.all([
        fetch(`${API}/api/customers/${customerId}`),
        fetch(`${API}/api/customers/${customerId}/sources`),
      ]);
      if (custRes.ok) setCustomerName((await custRes.json()).name);
      if (sourcesRes.ok) {
        const sources: SourceSummary[] = await sourcesRes.json();
        const found = sources.find(s => s.source_key === sourceKey);
        if (found) {
          setSource(found);
          const numeric = found.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');
          const { chartFields, kpiFields: kf } = getSmartDefaults(numeric, found.source_category);
          setOverviewFieldKeys(chartFields);
          setKpiFields(kf);
          setSelectedFields(new Set(numeric.slice(0, 3).map(f => f.key)));
        }
      }
      setLoading(false);
    }
    load();
  }, [customerId, sourceKey]);

  // Fetch timeseries — different field sets per view
  const loadTimeseries = useCallback(async () => {
    if (!source) return;
    const numeric = source.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');
    const fieldsParam = activeView === 'overview'
      ? numeric.map(f => f.key).join(',')
      : [...selectedFields].join(',');
    if (!fieldsParam) { setTimeseries(null); return; }
    const params = new URLSearchParams({
      bucket: activeView === 'overview' ? 'daily' : bucket,
      fields: fieldsParam,
    });
    const res = await fetch(`${API}/api/customers/${customerId}/sources/${sourceKey}/timeseries?${params}`);
    if (res.ok) setTimeseries(await res.json());
  }, [customerId, sourceKey, selectedFields, bucket, source, activeView]);

  useEffect(() => { loadTimeseries(); }, [loadTimeseries]);

  async function openDs(id: string) {
    setOpenDataset(id);
    setDsDetail(null);
    const res = await fetch(`${API}/api/datasets/${id}`);
    if (res.ok) setDsDetail(await res.json());
  }

  const toggleField = (key: string) => setSelectedFields(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (loading) return <main style={{ padding: 40, color: C.muted }}>Laddar…</main>;
  if (!source) return <main style={{ padding: 40, color: C.muted }}>Källan hittades inte.</main>;

  const numericFields = source.fields.filter(f => f.data_type === 'int' || f.data_type === 'float');

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{source.source_name}</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
            {source.source_platform && <span>📡 {source.source_platform}</span>}
            {source.source_category && <span>🏷️ {source.source_category}</span>}
            <span>📁 {source.dataset_count} fil{source.dataset_count !== 1 ? 'er' : ''}</span>
            <span>📊 {source.total_rows.toLocaleString('sv-SE')} rader</span>
            {source.period_start && source.period_end && (
              <span>📆 {source.period_start.slice(0, 7)} → {source.period_end.slice(0, 7)}</span>
            )}
          </div>
        </div>
        <button onClick={() => router.push(`/kunder/${customerId}`)} style={ghostBtn()}>← Tillbaka</button>
      </div>

      {/* View toggle */}
      <div style={{ display: 'inline-flex', gap: 2, marginBottom: 28, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 3 }}>
        {(['overview', 'data'] as const).map(v => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            padding: '7px 22px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', border: 'none',
            background: activeView === v ? C.card : 'transparent',
            color: activeView === v ? C.text : C.muted,
            boxShadow: activeView === v ? '0 1px 6px rgba(0,0,0,0.35)' : 'none',
            transition: 'all 0.18s',
          }}>
            {v === 'overview' ? 'Översikt' : 'Data'}
          </button>
        ))}
      </div>

      {/* View content */}
      {activeView === 'overview' ? (
        <>
          <OverviewView
            source={source}
            timeseries={timeseries}
            period={period}
            setPeriod={setPeriod}
            kpiFields={kpiFields}
            chartFieldKeys={overviewFieldKeys}
          />
          <FilesSection source={source} openDs={openDs} />
        </>
      ) : (
        <>
          <DataView
            timeseries={timeseries}
            numericFields={numericFields}
            selectedFields={selectedFields}
            toggleField={toggleField}
            bucket={bucket}
            setBucket={setBucket}
          />
          <FilesSection source={source} openDs={openDs} />
        </>
      )}

      {/* Dataset detail modal */}
      {openDataset && (
        <div onClick={() => { setOpenDataset(null); setDsDetail(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '95%', maxWidth: 1200, maxHeight: '88vh', overflow: 'auto' }}>
            {!dsDetail ? <div style={{ color: C.muted }}>Laddar…</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{dsDetail.original_filename}</h3>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{dsDetail.source_name} v{dsDetail.source_version} · {dsDetail.total} rader</div>
                  </div>
                  <button onClick={() => { setOpenDataset(null); setDsDetail(null); }} style={ghostBtn()}>Stäng</button>
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
                        <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
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
