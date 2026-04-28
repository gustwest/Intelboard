'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { Eye, MousePointerClick, MessageCircle, Heart, MessageSquare, Repeat, Calendar, TrendingUp, BarChart2, PieChart as PieChartIcon, Sparkles, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const C = {
  bg: 'var(--brand-bg)', card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

const CHART_COLORS = ['var(--brand-accent)', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#a855f7'];

type DashboardData = {
  customer_id: string;
  customer_name: string;
  dataset_count: number;
  total_rows: number;
  date_range: { from: string | null; to: string | null };
  summary_stats: Record<string, number>;
  time_series: Array<Record<string, any>>;
  source_breakdown: Array<Record<string, any>>;
  ai_summaries: Array<{ source_name: string; filename: string; summary: string; row_count: number }>;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}12, ${color}06)`,
      border: `1px solid ${color}30`,
      borderRadius: 14, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}20`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', color: color }}>{icon}</span>
        <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.03em' }}>{value}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15,14,18,0.95)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(12px)',
    }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: C.muted }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === 'number' ? formatNumber(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardCharts({ customerId }: { customerId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeChart, setActiveChart] = useState<'impressions' | 'engagement' | 'spend'>('impressions');

  async function fetchDashboard() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params}` : '';
    try {
      const r = await fetch(`${API}/api/customers/${customerId}/dashboard${qs}`);
      if (r.ok) setData(await r.json());
    } catch (e) {
      console.error('Dashboard fetch failed', e);
    }
    setLoading(false);
  }

  useEffect(() => { fetchDashboard(); }, [customerId, dateFrom, dateTo]);

  // Prepare pie chart data from source breakdown
  const pieData = useMemo(() => {
    if (!data?.source_breakdown) return [];
    return data.source_breakdown
      .filter(s => (s.impressions || 0) > 0)
      .map(s => ({ name: s.source, value: s.impressions || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40,
        textAlign: 'center', color: C.muted, marginBottom: 20,
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <Loader2 size={32} className="brand-text-accent" style={{ animation: 'spin 2s linear infinite' }} />
        </div>
        <div>Laddar dashboard-data...</div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data.summary_stats;
  const hasTrends = data.time_series.length > 0;

  const chartMetrics: Record<string, { keys: string[]; colors: string[]; labels: string[] }> = {
    impressions: {
      keys: ['impressions', 'clicks'],
      colors: ['#3b82f6', '#22c55e'],
      labels: ['Impressions', 'Klick'],
    },
    engagement: {
      keys: ['reactions', 'comments', 'shares'],
      colors: ['var(--brand-accent)', '#f59e0b', '#ec4899'],
      labels: ['Reaktioner', 'Kommentarer', 'Delningar'],
    },
    spend: {
      keys: ['total-spent', 'total-engagements'],
      colors: ['#ef4444', '#06b6d4'],
      labels: ['Totalt spenderat', 'Engagemang'],
    },
  };

  const currentChart = chartMetrics[activeChart];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
      {/* Date filter bar */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={16} className="brand-text-accent" /> Datumfilter
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: C.muted }}>Från:</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={dateInputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: C.muted }}>Till:</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={dateInputStyle} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{
              padding: '4px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', color: C.danger, border: `1px solid rgba(239,68,68,0.25)`,
              fontFamily: 'inherit', fontWeight: 600,
            }}>✕ Rensa</button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: C.dim }}>
          {data.dataset_count} dataset · {formatNumber(data.total_rows)} rader
        </div>
      </div>

      {/* KPI stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Impressions" value={formatNumber(stats.impressions || 0)} icon={<Eye size={18} />} color="#3b82f6" />
        <StatCard label="Klick" value={formatNumber(stats.clicks || 0)} icon={<MousePointerClick size={18} />} color="#22c55e" />
        <StatCard label="Engagemang" value={formatNumber(stats['total-engagements'] || 0)} icon={<MessageCircle size={18} />} color="var(--brand-accent)" />
        <StatCard label="Reaktioner" value={formatNumber(stats.reactions || 0)} icon={<Heart size={18} />} color="#ec4899" />
        <StatCard label="Kommentarer" value={formatNumber(stats.comments || 0)} icon={<MessageSquare size={18} />} color="#f59e0b" />
        <StatCard label="Delningar" value={formatNumber(stats.shares || 0)} icon={<Repeat size={18} />} color="#06b6d4" />
      </div>

      {/* Charts area */}
      {hasTrends && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          {/* Chart toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={16} className="brand-text-accent" /> Trender per månad
            </h3>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
              {[
                { key: 'impressions' as const, label: 'Räckvidd' },
                { key: 'engagement' as const, label: 'Engagemang' },
                { key: 'spend' as const, label: 'Spend' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveChart(tab.key)} style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  background: activeChart === tab.key ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: activeChart === tab.key ? C.accent : C.muted,
                  borderColor: activeChart === tab.key ? 'rgba(0,212,255,0.3)' : 'transparent',
                }}>{tab.label}</button>
              ))}
            </div>
          </div>

          {/* Area chart */}
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.time_series} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                {currentChart.colors.map((color, i) => (
                  <linearGradient key={i} id={`grad-${activeChart}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="period" stroke={C.dim} fontSize={10} tickLine={false} />
              <YAxis stroke={C.dim} fontSize={10} tickLine={false} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: C.muted }}
                iconType="circle"
                iconSize={8}
              />
              {currentChart.keys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={currentChart.labels[i]}
                  stroke={currentChart.colors[i]}
                  strokeWidth={2}
                  fill={`url(#grad-${activeChart}-${i})`}
                  dot={false}
                  activeDot={{ r: 4, fill: currentChart.colors[i] }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Source breakdown + Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: pieData.length > 0 ? '1fr 300px' : '1fr', gap: 16 }}>
        {/* Bar chart - source breakdown */}
        {data.source_breakdown.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BarChart2 size={16} className="brand-text-accent" /> Per källa
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(200, data.source_breakdown.length * 35)}>
              <BarChart data={data.source_breakdown} layout="vertical" margin={{ left: 120, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke={C.dim} fontSize={10} tickFormatter={(v: number) => formatNumber(v)} />
                <YAxis type="category" dataKey="source" stroke={C.dim} fontSize={10} width={110} tick={{ fill: C.muted }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="impressions" name="Impressions" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                <Bar dataKey="clicks" name="Klick" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie chart */}
        {pieData.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PieChartIcon size={16} className="brand-text-accent" /> Impressions-fördelning
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  paddingAngle={3} dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${(name || '').slice(0, 12)} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={{ stroke: C.dim, strokeWidth: 1 }}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatNumber(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* AI Insights summary */}
      {data.ai_summaries.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} className="brand-text-accent" /> AI-insikter
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 12 }}>
            {data.ai_summaries.slice(0, 6).map((s, i) => (
              <div key={i} style={{
                background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)',
                borderRadius: 12, padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(0,212,255,0.15)', color: C.accent, fontWeight: 700,
                  }}>{s.source_name}</span>
                  <span style={{ fontSize: 11, color: C.dim }}>{s.row_count} rader</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                  {s.summary.slice(0, 200)}{s.summary.length > 200 ? '...' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 8, fontSize: 12,
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
  color: C.text, fontFamily: 'inherit', outline: 'none',
};
