'use client';

import { useState, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ============================================================
// DESIGN TOKENS
// ============================================================
const C = {
  bg: '#0a0a0f',
  card: '#12121a',
  border: 'rgba(255,255,255,0.06)',
  accent: '#a855f7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#f8fafc',
  muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.25)',
};

const STATUS_COLORS: Record<string, string> = {
  excellent: C.success,
  warning: C.warning,
  critical: C.danger,
};

const STATUS_LABELS: Record<string, string> = {
  excellent: '🟢 Excellent',
  warning: '🟡 Varning',
  critical: '🔴 Kritisk',
};

// ============================================================
// COMPONENTS
// ============================================================

function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? C.success : score >= 50 ? C.warning : C.danger;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 1.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 800, color }}>{score}</span>
        <span style={{ fontSize: size * 0.09, color: C.dim, fontWeight: 500 }}>/100</span>
      </div>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: any }) {
  const color = STATUS_COLORS[kpi.status] || C.muted;
  const isIndex = kpi.unit === 'index' || kpi.unit === 'ratio';
  const displayVal = isIndex ? kpi.value.toFixed(2) : `${kpi.value}${kpi.unit === '%' ? '%' : kpi.unit === 'kr' ? ' kr' : ''}`;

  // Progress bar percentage (normalized)
  let pct = 0;
  if (isIndex) pct = Math.min(kpi.value * 100, 100);
  else if (kpi.unit === '%') pct = Math.min(kpi.value, 100);
  else pct = Math.min((kpi.value / 10) * 100, 100);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${color}25`,
      borderRadius: '16px',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.3s',
    }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: kpi.status === 'critical' ? 0.8 : 0.4,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color, letterSpacing: '0.05em' }}>
            {kpi.abbr}
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.text, marginTop: '2px' }}>
            {kpi.name}
          </div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 700,
          background: `${color}18`, color, border: `1px solid ${color}30`,
        }}>
          {STATUS_LABELS[kpi.status]}
        </span>
      </div>

      {/* Value */}
      <div style={{ fontSize: '2rem', fontWeight: 800, color: C.text, fontFamily: 'monospace', marginBottom: '8px' }}>
        {displayVal}
      </div>

      {/* Progress bar */}
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '3px',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 1.5s ease',
        }} />
      </div>

      {/* Insight */}
      <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.5 }}>
        {kpi.insight}
      </div>

      {/* Source */}
      <div style={{ fontSize: '0.625rem', color: C.dim, marginTop: '8px' }}>
        📊 {kpi.source}
      </div>
    </div>
  );
}

function CategorySection({ catKey, category }: { catKey: string; category: any }) {
  const kpis = category.kpis || [];
  const score = category.score || 0;
  const color = category.color || C.accent;

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Category header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
        padding: '12px 20px', background: `${color}10`, borderRadius: '12px',
        border: `1px solid ${color}20`,
      }}>
        <span style={{ fontSize: '1.25rem' }}>{category.emoji}</span>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{category.label}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            padding: '4px 14px', borderRadius: '20px', fontSize: '0.8125rem', fontWeight: 700,
            color: score >= 70 ? C.success : score >= 50 ? C.warning : C.danger,
            background: score >= 70 ? 'rgba(34,197,94,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${score >= 70 ? 'rgba(34,197,94,0.25)' : score >= 50 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            {score}/100
          </span>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px',
      }}>
        {kpis.map((kpi: any) => (
          <KpiCard key={kpi.abbr} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '10px 14px', fontSize: '0.75rem',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: '8px' }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// CATEGORY TABS
// ============================================================
const CATEGORY_ORDER = [
  'demografi', 'kampanj', 'innehåll', 'beslutstratt', 'video', 'målgrupp', 'konkurrenter', 'budget',
];

// ============================================================
// MAIN PAGE
// ============================================================

export default function ScorecardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchScorecard();
  }, []);

  async function fetchScorecard() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/scorecard`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '80vh', color: C.muted,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'pulse 2s ease-in-out infinite' }}>🎯</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Beräknar 22 strategiska KPI:er...</div>
          <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
        <div style={{ color: C.danger, marginBottom: '12px' }}>{error || 'Ingen data'}</div>
        <button onClick={fetchScorecard} style={{
          padding: '10px 20px', borderRadius: '10px', background: C.accent,
          color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>
          Försök igen
        </button>
      </div>
    );
  }

  const categories = data.categories || {};
  const radarData = CATEGORY_ORDER
    .filter(k => categories[k])
    .map(k => ({
      area: categories[k].label,
      score: categories[k].score,
      fullMark: 100,
    }));

  const statusCounts = data.status_counts || {};
  const filteredCategories = activeCategory === 'all'
    ? CATEGORY_ORDER.filter(k => categories[k])
    : [activeCategory].filter(k => categories[k]);

  return (
    <main style={{
      maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            🎯 Strategic LinkedIn Scorecard
          </h1>
          <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
            {data.total_kpis} KPI:er • {data.customer}
          </p>
        </div>
        <button onClick={fetchScorecard} style={{
          padding: '8px 16px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600,
          background: 'rgba(168,85,247,0.15)', color: C.accent,
          border: '1px solid rgba(168,85,247,0.25)', cursor: 'pointer',
        }}>
          🔄 Uppdatera
        </button>
      </div>

      {/* OVERVIEW SECTION */}
      <div style={{
        background: 'linear-gradient(135deg, #12121a 0%, #1a1028 100%)',
        border: `1px solid ${C.border}`, borderRadius: '20px',
        padding: '32px', marginBottom: '28px',
      }}>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Score Gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <ScoreGauge score={data.overall_score} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.muted }}>
              STRATEGY SCORE
            </span>
          </div>

          {/* Status counts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '160px' }}>
            {[
              { label: 'Kritisk', count: statusCounts.critical || 0, color: C.danger, emoji: '🔴' },
              { label: 'Varning', count: statusCounts.warning || 0, color: C.warning, emoji: '🟡' },
              { label: 'Excellent', count: statusCounts.excellent || 0, color: C.success, emoji: '🟢' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>{s.emoji}</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color, width: '28px' }}>{s.count}</span>
                <span style={{ fontSize: '0.8125rem', color: C.muted }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Radar */}
          <div style={{ flex: 1, minWidth: '260px', height: '220px' }}>
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="area" tick={{ fill: C.dim, fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke={C.accent} fill={C.accent} fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Category bar chart */}
          <div style={{ flex: 1, minWidth: '280px', height: '220px' }}>
            <ResponsiveContainer>
              <BarChart data={radarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: C.dim, fontSize: 10 }} />
                <YAxis dataKey="area" type="category" width={100} tick={{ fill: C.muted, fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="score" name="Score" radius={[0, 6, 6, 0]}
                  fill={C.accent}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recommendations */}
        {data.recommendations?.length > 0 && (
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {data.recommendations.map((rec: any, i: number) => (
              <div key={i} style={{
                padding: '10px 16px', borderRadius: '10px', fontSize: '0.8125rem',
                flex: '1 1 300px',
                background: rec.type === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${rec.type === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: C.text,
              }}>
                <span style={{ marginRight: '8px' }}>{rec.type === 'critical' ? '🔴' : '🟢'}</span>
                <strong style={{ color: rec.type === 'critical' ? C.danger : C.success }}>{rec.kpi}</strong>
                {' — '}{rec.message.split(' — ').slice(1).join(' — ') || rec.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CATEGORY TABS */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px',
      }}>
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            padding: '8px 16px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600,
            whiteSpace: 'nowrap',
            border: activeCategory === 'all' ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
            background: activeCategory === 'all' ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.02)',
            color: activeCategory === 'all' ? C.accent : C.muted,
            cursor: 'pointer',
          }}
        >
          📊 Alla ({data.total_kpis})
        </button>
        {CATEGORY_ORDER.filter(k => categories[k]).map(catKey => {
          const cat = categories[catKey];
          return (
            <button
              key={catKey}
              onClick={() => setActiveCategory(catKey)}
              style={{
                padding: '8px 16px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600,
                whiteSpace: 'nowrap',
                border: activeCategory === catKey ? `1px solid ${cat.color}` : `1px solid ${C.border}`,
                background: activeCategory === catKey ? `${cat.color}15` : 'rgba(255,255,255,0.02)',
                color: activeCategory === catKey ? cat.color : C.muted,
                cursor: 'pointer',
              }}
            >
              {cat.emoji} {cat.label} ({cat.kpis?.length || 0})
            </button>
          );
        })}
      </div>

      {/* KPI SECTIONS */}
      {filteredCategories.map(catKey => (
        <CategorySection key={catKey} catKey={catKey} category={categories[catKey]} />
      ))}
    </main>
  );
}
