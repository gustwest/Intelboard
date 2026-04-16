'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, FunnelChart, Funnel, LabelList,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Color palette
const COLORS = {
  bg: '#0a0a0f',
  card: '#12121a',
  cardBorder: 'rgba(255,255,255,0.06)',
  accent: '#a855f7',
  accentDim: 'rgba(168,85,247,0.15)',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  text: '#f8fafc',
  textMuted: 'rgba(255,255,255,0.45)',
  textDim: 'rgba(255,255,255,0.25)',
};

const AREA_COLORS: Record<string, { color: string; emoji: string; label: string }> = {
  content: { color: '#3b82f6', emoji: '📝', label: 'Content & Engagement' },
  audience: { color: '#22c55e', emoji: '👥', label: 'Audience' },
  paid_media: { color: '#f59e0b', emoji: '💰', label: 'Betald Media' },
  recruitment: { color: '#ef4444', emoji: '🎯', label: 'Rekrytering' },
  competitors: { color: '#a855f7', emoji: '⚔️', label: 'Konkurrenter' },
  talent_market: { color: '#f97316', emoji: '🧠', label: 'Talangmarknad' },
};

const CHART_COLORS = ['#a855f7', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#6366f1'];

// ============================================================
// HELPER COMPONENTS
// ============================================================

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: '16px',
      padding: '24px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, subtitle, color, trend }: {
  label: string; value: string | number; subtitle?: string; color?: string; trend?: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '12px',
      padding: '16px 20px',
      minWidth: '140px',
      flex: '1 1 140px',
    }}>
      <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, fontWeight: 500, marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: color || COLORS.text }}>
          {value}
        </span>
        {trend && (
          <span style={{
            fontSize: '0.75rem', fontWeight: 600,
            color: trend.startsWith('+') || trend.startsWith('↑') ? COLORS.success : COLORS.danger,
          }}>
            {trend}
          </span>
        )}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.6875rem', color: COLORS.textDim, marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ emoji, title, score }: { emoji: string; title: string; score?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
      <span style={{ fontSize: '1.25rem' }}>{emoji}</span>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      {score !== undefined && (
        <div style={{
          marginLeft: 'auto',
          padding: '4px 14px',
          borderRadius: '20px',
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: score >= 70 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.danger,
          background: score >= 70 ? 'rgba(34,197,94,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${score >= 70 ? 'rgba(34,197,94,0.25)' : score >= 50 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          {score}/100
        </div>
      )}
    </div>
  );
}

function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.danger;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 800, color }}>{score}</span>
        <span style={{ fontSize: size * 0.1, color: COLORS.textDim, fontWeight: 500 }}>/100</span>
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
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString('sv-SE') : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// AREA COMPONENTS
// ============================================================

function HealthOverview({ data }: { data: any }) {
  const health = data.health_score;
  if (!health) return null;

  const radarData = Object.entries(health.breakdown).map(([key, val]: [string, any]) => ({
    area: AREA_COLORS[key]?.label || key,
    score: val.score,
    fullMark: 100,
  }));

  return (
    <Card style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #12121a 0%, #1a1028 100%)' }}>
      <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Left: Score */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <ScoreGauge score={health.overall_score} size={160} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: COLORS.textMuted }}>
            INSIDERS HEALTH SCORE
          </span>
        </div>

        {/* Middle: Area scores */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(health.breakdown).map(([key, val]: [string, any]) => {
              const area = AREA_COLORS[key];
              if (!area) return null;
              const pct = val.score;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.75rem', width: '24px', textAlign: 'center' }}>{area.emoji}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500, width: '140px', color: COLORS.textMuted }}>
                    {area.label}
                  </span>
                  <div style={{
                    flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)',
                    borderRadius: '4px', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: '4px',
                      background: `linear-gradient(90deg, ${area.color}88, ${area.color})`,
                      transition: 'width 1s ease',
                    }} />
                  </div>
                  <span style={{
                    fontSize: '0.8125rem', fontWeight: 700, width: '36px', textAlign: 'right',
                    color: pct >= 70 ? COLORS.success : pct >= 50 ? COLORS.warning : COLORS.danger,
                  }}>
                    {pct}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Radar */}
        <div style={{ width: '220px', height: '200px' }}>
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="area" tick={{ fill: COLORS.textDim, fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights */}
      {health.insights?.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {health.insights.map((ins: any, i: number) => (
            <div key={i} style={{
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.8125rem',
              flex: '1 1 280px',
              background: ins.type === 'critical' ? 'rgba(239,68,68,0.08)' :
                ins.type === 'warning' ? 'rgba(245,158,11,0.08)' :
                  'rgba(34,197,94,0.08)',
              border: `1px solid ${ins.type === 'critical' ? 'rgba(239,68,68,0.2)' :
                ins.type === 'warning' ? 'rgba(245,158,11,0.2)' :
                  'rgba(34,197,94,0.2)'}`,
            }}>
              <span style={{ marginRight: '8px' }}>
                {ins.type === 'critical' ? '🔴' : ins.type === 'warning' ? '🟡' : '🟢'}
              </span>
              {ins.message}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ContentArea({ data }: { data: any }) {
  const customers = Object.entries(data);
  if (customers.length === 0) return <Card><p style={{ color: COLORS.textMuted }}>Ingen content-data tillgänglig</p></Card>;

  const [selectedCustomer, setSelectedCustomer] = useState(customers[0][0]);
  const custData: any = data[selectedCustomer] || {};

  const typeData = Object.entries(custData.content_type_breakdown || {})
    .filter(([k]) => k !== 'Total')
    .map(([name, vals]: [string, any]) => ({
      name,
      count: vals.count,
      avg_impressions: vals.avg_impressions,
      avg_engagement_rate: +(vals.avg_engagement_rate * 100).toFixed(2),
      total_impressions: vals.total_impressions,
    }));

  const timingData = Object.entries(custData.timing_analysis || {}).map(([day, vals]: [string, any]) => ({
    day,
    count: vals.count,
    avg_engagement_rate: +(vals.avg_engagement_rate * 100).toFixed(2),
    avg_impressions: vals.avg_impressions,
  }));

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timingData.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

  const pyramid = custData.engagement_pyramid || {};

  return (
    <Card>
      <SectionTitle emoji="📝" title="Content & Engagement" score={custData.score} />

      {customers.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {customers.map(([name]) => (
            <button key={name} onClick={() => setSelectedCustomer(name)} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600,
              border: selectedCustomer === name ? `1px solid ${COLORS.accent}` : '1px solid rgba(255,255,255,0.08)',
              background: selectedCustomer === name ? COLORS.accentDim : 'transparent',
              color: selectedCustomer === name ? COLORS.accent : COLORS.textMuted,
              cursor: 'pointer',
            }}>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="Totala poster" value={custData.total_posts || 0} />
        <StatBox label="Totala impressions" value={(custData.total_impressions || 0).toLocaleString('sv-SE')} />
        <StatBox label="Snitt impressions/post" value={(custData.avg_impressions_per_post || 0).toLocaleString('sv-SE')} />
        <StatBox label="Snitt Engagement Rate" value={`${((custData.avg_engagement_rate || 0) * 100).toFixed(1)}%`} color={COLORS.info} />
        <StatBox label="Engagement Depth" value={`${((pyramid.engagement_depth || 0) * 100).toFixed(1)}%`} subtitle="Comments + Shares / Total" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Content Type Performance */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Engagement Rate per Content Type
          </h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer>
              <BarChart data={typeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: COLORS.textDim, fontSize: 11 }} unit="%" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avg_engagement_rate" name="Eng. Rate %" fill={COLORS.info} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Timing Analysis */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Engagement per veckodag
          </h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer>
              <BarChart data={timingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avg_engagement_rate" name="Eng. Rate %" fill={COLORS.accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      {custData.monthly_trend?.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Månadsvis trend
          </h3>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer>
              <AreaChart data={custData.monthly_trend}>
                <defs>
                  <linearGradient id="gradImp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.info} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total_impressions" name="Impressions" stroke={COLORS.info} fill="url(#gradImp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Engagement Pyramid */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
          Engagement Pyramid
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {[
            { label: '💬 Comments', value: pyramid.comments, color: '#ef4444' },
            { label: '🔄 Shares', value: pyramid.shares, color: '#f59e0b' },
            { label: '👍 Reactions', value: pyramid.reactions, color: '#3b82f6' },
            { label: '🖱️ Clicks', value: pyramid.clicks, color: '#22c55e' },
            { label: '👁️ Impressions', value: pyramid.impressions, color: '#6366f1' },
          ].map((level, i) => (
            <div key={i} style={{
              width: `${40 + i * 15}%`,
              padding: '8px 16px',
              background: `${level.color}18`,
              border: `1px solid ${level.color}30`,
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8125rem',
            }}>
              <span style={{ color: COLORS.textMuted }}>{level.label}</span>
              <span style={{ fontWeight: 700, color: level.color }}>{(level.value || 0).toLocaleString('sv-SE')}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AudienceArea({ data }: { data: any }) {
  const customers = Object.entries(data);
  if (customers.length === 0) return <Card><p style={{ color: COLORS.textMuted }}>Ingen audience-data</p></Card>;

  const [selectedCustomer, setSelectedCustomer] = useState(customers[0][0]);
  const custData: any = data[selectedCustomer] || {};
  const followers = custData.followers || {};
  const visitors = custData.visitors || {};
  const demographics = custData.demographics || {};

  // Find the best demographic dimension to display
  const demoKeys = Object.keys(demographics);
  const [selectedDemo, setSelectedDemo] = useState(demoKeys[0] || '');

  const demoData = (demographics[selectedDemo] || []).slice(0, 8).map((item: any) => ({
    name: item.label?.length > 20 ? item.label.slice(0, 20) + '…' : item.label,
    value: item.value,
  }));

  return (
    <Card>
      <SectionTitle emoji="👥" title="Audience (Följare + Besökare)" score={custData.score} />

      {customers.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {customers.map(([name]) => (
            <button key={name} onClick={() => setSelectedCustomer(name)} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600,
              border: selectedCustomer === name ? `1px solid ${COLORS.success}` : '1px solid rgba(255,255,255,0.08)',
              background: selectedCustomer === name ? 'rgba(34,197,94,0.12)' : 'transparent',
              color: selectedCustomer === name ? COLORS.success : COLORS.textMuted,
              cursor: 'pointer',
            }}>
              {name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="Totala Följare" value={(followers.current_total || 0).toLocaleString('sv-SE')} color={COLORS.success} />
        <StatBox label="Nya (org/spon)" value={`${(followers.new_organic || 0).toLocaleString('sv-SE')} / ${(followers.new_sponsored || 0).toLocaleString('sv-SE')}`} />
        <StatBox label="Organic Ratio" value={`${((followers.organic_ratio || 0) * 100).toFixed(0)}%`} subtitle="Organisk andel av tillväxt" />
        <StatBox label="Sidvisningar" value={(visitors.total_page_views || 0).toLocaleString('sv-SE')} />
        <StatBox label="Jobs Page" value={`${((visitors.jobs_ratio || 0) * 100).toFixed(1)}%`} subtitle="Rekryteringsintresse" />
        <StatBox label="Mobil" value={`${((visitors.mobile_share || 0) * 100).toFixed(0)}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {/* Follower Growth */}
        {followers.monthly_growth?.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
              Följartillväxt per månad
            </h3>
            <div style={{ height: '240px' }}>
              <ResponsiveContainer>
                <BarChart data={followers.monthly_growth.slice(-12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                  <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="organic" name="Organisk" fill={COLORS.success} radius={[4, 4, 0, 0]} stackId="growth" />
                  <Bar dataKey="sponsored" name="Sponsrad" fill={COLORS.info} radius={[4, 4, 0, 0]} stackId="growth" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Demographics */}
        {demoKeys.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: COLORS.textMuted, margin: 0 }}>
                Demografi
              </h3>
              <select
                value={selectedDemo}
                onChange={e => setSelectedDemo(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: COLORS.text, border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem',
                }}
              >
                {demoKeys.map(k => (
                  <option key={k} value={k}>{k.replace(/_/g, ' ').replace('followers ', '').replace('visitors ', '')}</option>
                ))}
              </select>
            </div>
            <div style={{ height: '240px' }}>
              <ResponsiveContainer>
                <BarChart data={demoData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Antal" fill={COLORS.success} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PaidMediaArea({ data }: { data: any }) {
  const summary = data.summary || {};
  const companies = data.companies || {};
  const campaigns = data.campaigns || {};

  const objectiveData = Object.entries(campaigns.by_objective || {}).map(([name, vals]: [string, any]) => ({
    name: name.replace(/_/g, ' '),
    spend: Math.round(vals.spend),
    impressions: vals.impressions,
    clicks: vals.clicks,
    ctr: +(vals.ctr * 100).toFixed(2),
    cpm: vals.cpm,
    count: vals.count,
  }));

  const trendData = (campaigns.monthly_trend || []).slice(-24);

  const engDist = companies.engagement_distribution || {};
  const engData = ['Very High', 'High', 'Medium', 'Low', 'Very Low']
    .filter(k => engDist[k])
    .map(name => ({ name, value: engDist[name] }));

  return (
    <Card>
      <SectionTitle emoji="💰" title="Betald Media (Campaign Manager)" score={data.score} />

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="Total Spend" value={`${Math.round(summary.total_spend || 0).toLocaleString('sv-SE')} kr`} color={COLORS.warning} />
        <StatBox label="Impressions" value={(summary.total_impressions || 0).toLocaleString('sv-SE')} />
        <StatBox label="Clicks" value={(summary.total_clicks || 0).toLocaleString('sv-SE')} />
        <StatBox label="CTR" value={`${((summary.ctr || 0) * 100).toFixed(2)}%`} color={COLORS.info} />
        <StatBox label="CPC" value={`${(summary.cpc || 0).toFixed(2)} kr`} />
        <StatBox label="CPM" value={`${(summary.cpm || 0).toFixed(2)} kr`} />
        <StatBox label="Annonser" value={summary.num_ad_sets || 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Objective Breakdown */}
        {objectiveData.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
              CTR per kampanjmål
            </h3>
            <div style={{ height: '260px' }}>
              <ResponsiveContainer>
                <BarChart data={objectiveData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" unit="%" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ctr" name="CTR %" fill={COLORS.warning} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Company Engagement Distribution */}
        {engData.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
              {(companies.total_companies || 0).toLocaleString('sv-SE')} Företag — Engagement-nivå
            </h3>
            <div style={{ height: '260px' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={engData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100} paddingAngle={3}>
                    {engData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend formatter={(val) => <span style={{ color: COLORS.textMuted, fontSize: '0.75rem' }}>{val}</span>} />
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      {trendData.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Månadsvis invest & trafik
          </h3>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.warning} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.warning} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: COLORS.textDim, fontSize: 9 }} interval={2} />
                <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="impressions" name="Impressions" stroke={COLORS.warning} fill="url(#gradSpend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Engaged Companies */}
      {companies.top_engaged?.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Top 10 mest engagerade företag
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Företag', 'Nivå', 'Org. Impressions', 'Org. Engagements', 'Paid Impr.', 'Paid Clicks'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: COLORS.textMuted, fontWeight: 600, fontSize: '0.75rem' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.top_engaged.slice(0, 10).map((c: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c['Company Name']}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: 600,
                        background: c['Engagement Level'] === 'Very High' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                        color: c['Engagement Level'] === 'Very High' ? COLORS.success : COLORS.warning,
                      }}>
                        {c['Engagement Level']}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{(c['Organic Impressions'] || 0).toLocaleString('sv-SE')}</td>
                    <td style={{ padding: '8px 12px', color: COLORS.success }}>{(c['Organic Engagements'] || 0).toLocaleString('sv-SE')}</td>
                    <td style={{ padding: '8px 12px' }}>{(c['Paid Impressions'] || 0).toLocaleString('sv-SE')}</td>
                    <td style={{ padding: '8px 12px' }}>{(c['Paid Clicks'] || 0).toLocaleString('sv-SE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function RecruitmentArea({ data }: { data: any }) {
  const inmail = data.inmail?.overall || {};
  const pipeline = data.pipeline?.stages || [];
  const funnel = data.funnel?.stages || [];

  // Funnel visualization data
  const funnelVis = funnel.map((s: any, i: number) => ({
    name: s.stage,
    value: s.candidates,
    fill: CHART_COLORS[i],
  }));

  return (
    <Card>
      <SectionTitle emoji="🎯" title="Rekrytering" score={data.score} />

      {/* InMail Stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="InMails Skickade" value={(inmail.sends || 0).toLocaleString('sv-SE')} color={COLORS.danger} />
        <StatBox label="Response Rate" value={`${inmail.response_rate || 0}%`}
          subtitle={`Benchmark: ${inmail.response_rate_benchmark || 0}%`}
          color={COLORS.danger} />
        <StatBox label="Gap vs Benchmark" value={`${inmail.response_gap_pp || 0}pp`}
          color={COLORS.danger} />
        <StatBox label="Accept Rate" value={`${inmail.accept_rate || 0}%`}
          subtitle={`Benchmark: ${inmail.accept_rate_benchmark || 0}%`} />
        <StatBox label="Tid till Accept" value={`${(inmail.time_to_accept || 0).toFixed(0)}h`} />
        <StatBox label="Seats" value={`${data.inmail?.active_seats || 0} / ${data.inmail?.total_seats || 0}`} subtitle="Aktiva / Totala" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Hiring Funnel */}
        {funnelVis.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
              Hiring Funnel
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {funnel.map((stage: any, i: number) => {
                const maxVal = funnel[0]?.candidates || 1;
                const pct = (stage.candidates / maxVal) * 100;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8125rem', width: '100px', color: COLORS.textMuted, textAlign: 'right' }}>
                      {stage.stage}
                    </span>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{
                        width: `${Math.max(pct, 2)}%`, height: '32px',
                        background: `linear-gradient(90deg, ${CHART_COLORS[i]}66, ${CHART_COLORS[i]})`,
                        borderRadius: '6px',
                        display: 'flex', alignItems: 'center', paddingLeft: '10px',
                        transition: 'width 1s ease',
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          {stage.candidates.toLocaleString('sv-SE')}
                        </span>
                      </div>
                    </div>
                    {stage.next_stage_conversion > 0 && (
                      <span style={{ fontSize: '0.6875rem', color: COLORS.warning, fontWeight: 600, width: '50px' }}>
                        {stage.next_stage_conversion}% ↓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pipeline Stages */}
        {pipeline.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
              Pipeline Stages
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Stage', 'Kandidater', 'Konv.rate', 'Snitt dagar', 'Arkiverade'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: COLORS.textMuted, fontWeight: 600, fontSize: '0.6875rem' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((s: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.stage}</td>
                      <td style={{ padding: '8px 10px' }}>{(s.moved_into || 0).toLocaleString('sv-SE')}</td>
                      <td style={{ padding: '8px 10px', color: s.conversion_rate > 0.2 ? COLORS.success : COLORS.warning }}>
                        {(s.conversion_rate * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px 10px' }}>{s.avg_time_days}d</td>
                      <td style={{ padding: '8px 10px', color: COLORS.danger }}>{(s.archived || 0).toLocaleString('sv-SE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* InMail Benchmark Gap Visual */}
      <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(239,68,68,0.06)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.15)' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '16px', color: COLORS.danger }}>
          ⚠️ InMail Performance Gap
        </h3>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginBottom: '6px' }}>Response Rate</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', position: 'relative' }}>
                  <div style={{ width: `${(inmail.response_rate || 0) / 50 * 100}%`, height: '100%', background: COLORS.danger, borderRadius: '6px' }} />
                  <div style={{
                    position: 'absolute', left: `${(inmail.response_rate_benchmark || 0) / 50 * 100}%`, top: '-4px',
                    width: '2px', height: '20px', background: COLORS.success,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.6875rem' }}>
                  <span style={{ color: COLORS.danger }}>{inmail.response_rate}% (er)</span>
                  <span style={{ color: COLORS.success }}>{inmail.response_rate_benchmark}% (benchmark)</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(239,68,68,0.12)', borderRadius: '10px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COLORS.danger }}>{inmail.response_gap_pp}pp</div>
            <div style={{ fontSize: '0.6875rem', color: COLORS.textMuted }}>under benchmark</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CompetitorArea({ data }: { data: any }) {
  const customers = Object.entries(data);
  if (customers.length === 0) return <Card><p style={{ color: COLORS.textMuted }}>Ingen konkurrentdata</p></Card>;

  const [selectedCustomer, setSelectedCustomer] = useState(customers[0][0]);
  const custData: any = data[selectedCustomer] || {};
  const leaderboard = custData.leaderboard || [];

  const chartData = leaderboard.map((c: any) => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    engagements: c.total_engagements,
    eng_per_post: c.engagement_per_post,
    sov: +((c.sov_engagement || 0) * 100).toFixed(1),
  }));

  return (
    <Card>
      <SectionTitle emoji="⚔️" title="Konkurrenter & Benchmark" score={custData.score} />

      {customers.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {customers.map(([name]) => (
            <button key={name} onClick={() => setSelectedCustomer(name)} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600,
              border: selectedCustomer === name ? `1px solid ${COLORS.accent}` : '1px solid rgba(255,255,255,0.08)',
              background: selectedCustomer === name ? COLORS.accentDim : 'transparent',
              color: selectedCustomer === name ? COLORS.accent : COLORS.textMuted,
              cursor: 'pointer',
            }}>
              {name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="Ranking" value={`#${custData.own_rank || '?'} av ${custData.total_competitors || '?'}`} color={COLORS.accent} />
        <StatBox label="Share of Voice" value={`${((custData.own_sov_engagement || 0) * 100).toFixed(1)}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Share of Voice */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Share of Voice (Engagement)
          </h3>
          <div style={{ height: '280px' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="sov" nameKey="name" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={100} paddingAngle={2}>
                  {chartData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(val) => <span style={{ color: COLORS.textMuted, fontSize: '0.6875rem' }}>{val}</span>} />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement per Post */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
            Engagement per Post (kvalitet)
          </h3>
          <div style={{ height: '280px' }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="eng_per_post" name="Eng/Post" fill={COLORS.accent} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: COLORS.textMuted }}>
          Leaderboard
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Rank', 'Sida', 'Följare', 'Nya Följare', 'Engagements', 'Poster', 'Eng/Post', 'SoV'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: COLORS.textMuted, fontWeight: 600, fontSize: '0.6875rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((c: any, i: number) => (
                <tr key={i} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: c.rank === custData.own_rank ? 'rgba(168,85,247,0.08)' : 'transparent',
                }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: c.rank <= 3 ? COLORS.warning : COLORS.textMuted }}>
                    #{c.rank}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '8px 10px' }}>{(c.total_followers || 0).toLocaleString('sv-SE')}</td>
                  <td style={{ padding: '8px 10px', color: COLORS.success }}>+{(c.new_followers || 0).toLocaleString('sv-SE')}</td>
                  <td style={{ padding: '8px 10px' }}>{(c.total_engagements || 0).toLocaleString('sv-SE')}</td>
                  <td style={{ padding: '8px 10px' }}>{c.total_posts}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: COLORS.info }}>{c.engagement_per_post}</td>
                  <td style={{ padding: '8px 10px' }}>{((c.sov_engagement || 0) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function TalentMarketArea({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0)
    return <Card><p style={{ color: COLORS.textMuted }}>Ingen talangmarknadsdata</p></Card>;

  const listItems = (str: string) =>
    str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <Card>
      <SectionTitle emoji="🧠" title="Talangmarknad (Talent Insights)" />

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatBox label="Pool Size" value={data.pool_size || 0} color="#f97316" />
        <StatBox label="Tillväxt" value={data.growth || '?'} />
        <StatBox label="Job Changers" value={data.job_changers || 0} subtitle="Bytt jobb senast" />
        <StatBox label="Engaged Talent" value={data.engaged_talent || 0} subtitle="Aktivt sökande" />
        <StatBox label="Hiring Demand" value={data.hiring_demand || '?'} color={COLORS.danger} />
        <StatBox label="Könsdiversitet ♀" value={data.gender_diversity_female || '?'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {[
          { title: '🏢 Top Employers', items: listItems(data.top_employers || '') },
          { title: '🎯 Untapped Companies', items: listItems(data.untapped_companies || '') },
          { title: '💡 Top Skills', items: listItems(data.top_skills || '') },
          { title: '📚 Top Universities', items: listItems(data.top_universities || '') },
          { title: '🏭 Top Industries', items: listItems(data.top_industries || '') },
          { title: '📋 Top Titles', items: listItems(data.top_titles || '') },
        ].map((section, si) => (
          <div key={si} style={{
            padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
          }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '10px' }}>{section.title}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {section.items.slice(0, 10).map((item, i) => (
                <span key={i} style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem',
                  background: 'rgba(249,115,22,0.12)', color: '#fb923c',
                  border: '1px solid rgba(249,115,22,0.2)',
                }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {data.demand_signal && (
        <div style={{
          marginTop: '16px', padding: '12px 16px', borderRadius: '10px',
          background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)',
          fontSize: '0.8125rem',
        }}>
          <strong>📡 Marknadssignal:</strong> {data.demand_signal}
        </div>
      )}
    </Card>
  );
}


// ============================================================
// MAIN PAGE
// ============================================================

const AREA_TABS = [
  { key: 'overview', label: 'Översikt', emoji: '📊' },
  { key: 'content', label: 'Content', emoji: '📝' },
  { key: 'audience', label: 'Audience', emoji: '👥' },
  { key: 'paid_media', label: 'Betald Media', emoji: '💰' },
  { key: 'recruitment', label: 'Rekrytering', emoji: '🎯' },
  { key: 'competitors', label: 'Konkurrenter', emoji: '⚔️' },
  { key: 'talent_market', label: 'Talangmarknad', emoji: '🧠' },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/analytics`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAnalysis() {
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/api/analytics/run`, { method: 'POST' });
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '80vh', fontSize: '1rem', color: COLORS.textMuted,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>📊</div>
          <div>Laddar analys...</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
        <div style={{ color: COLORS.danger, marginBottom: '12px' }}>{error || 'Ingen data'}</div>
        <button onClick={fetchAnalytics} style={{
          padding: '10px 20px', borderRadius: '10px', background: COLORS.accent,
          color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>
          Försök igen
        </button>
      </div>
    );
  }

  const areas = data.areas || {};

  return (
    <main style={{
      maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            📊 LinkedIn Analytics Dashboard
          </h1>
          <p style={{ fontSize: '0.8125rem', color: COLORS.textMuted, margin: '4px 0 0' }}>
            {data.files_processed} filer analyserade • {data.generated_at ? new Date(data.generated_at).toLocaleString('sv-SE') : ''}
          </p>
        </div>
        <button
          onClick={refreshAnalysis}
          disabled={refreshing}
          style={{
            padding: '8px 16px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600,
            background: refreshing ? 'rgba(255,255,255,0.05)' : COLORS.accentDim,
            color: refreshing ? COLORS.textMuted : COLORS.accent,
            border: `1px solid ${refreshing ? 'rgba(255,255,255,0.06)' : 'rgba(168,85,247,0.25)'}`,
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? '⏳ Kör analys...' : '🔄 Kör ny analys'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px', overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {AREA_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600,
              whiteSpace: 'nowrap',
              border: activeTab === tab.key ? `1px solid ${COLORS.accent}` : '1px solid rgba(255,255,255,0.06)',
              background: activeTab === tab.key ? COLORS.accentDim : 'rgba(255,255,255,0.02)',
              color: activeTab === tab.key ? COLORS.accent : COLORS.textMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {(activeTab === 'overview') && (
          <>
            <HealthOverview data={data} />
            <ContentArea data={areas.content || {}} />
            <AudienceArea data={areas.audience || {}} />
            <PaidMediaArea data={areas.paid_media || {}} />
            <RecruitmentArea data={areas.recruitment || {}} />
            <CompetitorArea data={areas.competitors || {}} />
            <TalentMarketArea data={areas.talent_market || {}} />
          </>
        )}
        {activeTab === 'content' && <ContentArea data={areas.content || {}} />}
        {activeTab === 'audience' && <AudienceArea data={areas.audience || {}} />}
        {activeTab === 'paid_media' && <PaidMediaArea data={areas.paid_media || {}} />}
        {activeTab === 'recruitment' && <RecruitmentArea data={areas.recruitment || {}} />}
        {activeTab === 'competitors' && <CompetitorArea data={areas.competitors || {}} />}
        {activeTab === 'talent_market' && <TalentMarketArea data={areas.talent_market || {}} />}
      </div>
    </main>
  );
}
