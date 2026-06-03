'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, TrendingUp, Layers, Users, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type ModelUsage = {
  model_id: string;
  input: number;
  output: number;
  calls: number;
  usd: number;
};

type ClientUsage = {
  client_id: string;
  input: number;
  output: number;
  calls: number;
  usd: number;
};

type DailyPoint = { date: string; usd: number };

type Price = {
  model_id: string;
  label: string;
  vendor: string;
  input_per_million_usd: number;
  output_per_million_usd: number;
};

type CostSummary = {
  period: 'today' | '7d' | '30d' | 'mtd';
  start: string;
  end: string;
  total_usd: number;
  n_days_with_data: number;
  forecast_usd: number | null;
  daily: DailyPoint[];
  top_models: ModelUsage[];
  top_clients: ClientUsage[];
  unknown_models: string[];
  thresholds: {
    daily_warning_usd: number;
    per_client_daily_usd: number;
    monthly_forecast_usd: number;
  };
  prices: Price[];
};

const VENDOR_COLOR: Record<string, string> = {
  google: '#4285f4',
  anthropic: '#d97706',
  openai: '#10b981',
  mistral: '#9333ea',
  perplexity: '#0ea5e9',
};

function vendorColor(modelId: string, prices: Price[]): string {
  const p = prices.find((x) => x.model_id === modelId);
  return p ? VENDOR_COLOR[p.vendor] || C.muted : C.muted;
}

function fmtUsd(n: number, decimals = 2): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `<$0.01`;
  return `$${n.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

export default function CostsPage() {
  const [data, setData] = useState<CostSummary | null>(null);
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'mtd'>('mtd');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    graphFetch<CostSummary>(`/api/ops/cost-summary?period=${period}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Kunde inte hämta kostnadsdata'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const dailyMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(0.01, ...data.daily.map((p) => p.usd));
  }, [data]);

  return (
    <GraphPageShell
      title="Kostnader"
      icon={<DollarSign size={22} />}
      subtitle="Intern uppskattning från token-mätare × publika listpriser. Cloud Billing är fortfarande sanningen men ger inte den här drilldown:en."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {(['today', '7d', '30d', 'mtd'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${period === p ? C.accent : C.border}`,
              background: period === p ? 'rgba(159,81,182,0.08)' : C.card,
              color: period === p ? C.accent : C.text,
              cursor: 'pointer',
              fontWeight: period === p ? 600 : 400,
            }}
          >
            {p === 'today' ? 'Idag' : p === 'mtd' ? 'Hittills denna månad' : `Senaste ${p === '7d' ? '7' : '30'}d`}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            padding: '6px 8px',
            border: `1px solid ${C.border}`,
            background: C.card,
            borderRadius: 6,
            cursor: loading ? 'wait' : 'pointer',
            color: C.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : undefined} /> Uppdatera
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.8s linear infinite; transform-origin: center }`}</style>

      {error && (
        <Banner color="#b91c1c">{error}</Banner>
      )}

      {data && data.n_days_with_data === 0 && (
        <Banner color="#b45309">
          Ingen kostnadsdata för perioden ännu. <code style={code}>cost-rollup-daily</code> behöver
          ha körts minst en gång. Trigga manuellt:{' '}
          <code style={code}>POST /api/ops/cost-summary/rollup-now</code>.
        </Banner>
      )}

      {data && (
        <>
          {/* Stat-cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat icon={<DollarSign size={15} />} label="Total spend (period)" value={fmtUsd(data.total_usd)} sub={`${data.start} – ${data.end}`} />
            <Stat
              icon={<TrendingUp size={15} />}
              label="Månadsprognos"
              value={data.forecast_usd != null ? fmtUsd(data.forecast_usd) : '—'}
              sub={data.forecast_usd != null ? `Tröskel: ${fmtUsd(data.thresholds.monthly_forecast_usd, 0)}` : 'Behöver ≥1 dag MTD-data'}
              tone={data.forecast_usd != null && data.forecast_usd > data.thresholds.monthly_forecast_usd ? 'attention' : 'ok'}
            />
            <Stat icon={<Layers size={15} />} label="Modeller använda" value={String(data.top_models.length)} sub={data.unknown_models.length ? `${data.unknown_models.length} utan pris` : 'alla prissatta'} />
            <Stat icon={<Users size={15} />} label="Kunder med spend" value={String(data.top_clients.length)} sub={`tröskel: ${fmtUsd(data.thresholds.per_client_daily_usd)}/dygn`} />
          </div>

          {/* Saknade priser-banner */}
          {data.unknown_models.length > 0 && (
            <Banner color="#b45309">
              <Info size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} />{' '}
              {data.unknown_models.length} modell(er) saknar pris i tabellen och räknas som $0:{' '}
              <code style={code}>{data.unknown_models.join(', ')}</code>. Lägg in i{' '}
              <code style={code}>services/cost_estimator.PRICE_TABLE</code>.
            </Banner>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Topp modeller */}
            <Panel icon={<Layers size={16} color={C.accent} />} title="Topp modeller">
              {data.top_models.length === 0 ? (
                <Empty text="Inga modellanrop i perioden" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {data.top_models.map((m) => {
                    const share = data.total_usd > 0 ? (m.usd / data.total_usd) * 100 : 0;
                    return (
                      <div key={m.model_id} style={rowStyle}>
                        <span style={{ ...dotStyle, background: vendorColor(m.model_id, data.prices) }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {data.prices.find((p) => p.model_id === m.model_id)?.label || m.model_id}
                          </div>
                          <div style={{ fontSize: 11, color: C.dim }}>
                            {fmtTokens(m.input)} in · {fmtTokens(m.output)} ut · {m.calls} anrop
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtUsd(m.usd)}</div>
                          <div style={{ fontSize: 10, color: C.dim }}>{share.toFixed(0)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Topp kunder */}
            <Panel icon={<Users size={16} color={C.accent} />} title="Topp kunder">
              {data.top_clients.length === 0 ? (
                <Empty text="Inga kunder med spend i perioden" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {data.top_clients.map((c) => {
                    const periodDays = Math.max(1, data.daily.length);
                    const dailyAvg = c.usd / periodDays;
                    const overThreshold = dailyAvg > data.thresholds.per_client_daily_usd;
                    return (
                      <div key={c.client_id} style={rowStyle}>
                        {overThreshold ? (
                          <AlertTriangle size={14} color="#f59e0b" />
                        ) : (
                          <span style={{ ...dotStyle, background: C.dim }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.client_id}
                          </div>
                          <div style={{ fontSize: 11, color: C.dim }}>
                            {fmtTokens(c.input + c.output)} tokens · {c.calls} anrop · snitt {fmtUsd(dailyAvg, 2)}/dygn
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: overThreshold ? '#b45309' : C.text }}>{fmtUsd(c.usd)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Daglig trend */}
          <Panel icon={<TrendingUp size={16} color={C.accent} />} title="Daglig spend">
            {data.daily.length === 0 ? (
              <Empty text="Ingen data" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '8px 4px' }}>
                {data.daily.map((p) => {
                  const h = dailyMax > 0 ? (p.usd / dailyMax) * 100 : 0;
                  const overThreshold = p.usd > data.thresholds.daily_warning_usd;
                  return (
                    <div key={p.date} title={`${p.date}: ${fmtUsd(p.usd)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                      <div
                        style={{
                          width: '100%',
                          minHeight: 2,
                          height: `${h}%`,
                          background: overThreshold ? '#f59e0b' : C.accent,
                          borderRadius: '3px 3px 0 0',
                          opacity: p.usd > 0 ? 1 : 0.15,
                        }}
                      />
                      <div style={{ fontSize: 9, color: C.dim, transform: 'rotate(-45deg)', transformOrigin: 'top right', whiteSpace: 'nowrap' }}>
                        {p.date.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 16, display: 'flex', gap: 16 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.accent, borderRadius: 2, marginRight: 4 }} /> normal</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f59e0b', borderRadius: 2, marginRight: 4 }} /> över dygnstöskel ({fmtUsd(data.thresholds.daily_warning_usd, 0)})</span>
            </div>
          </Panel>
        </>
      )}
    </GraphPageShell>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'attention' | 'ok' }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: tone === 'attention' ? '#d97706' : C.text, marginTop: 8, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: C.muted, padding: '16px 4px', textAlign: 'center' }}>{text}</div>;
}

function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: `${color}14`,
        border: `1px solid ${color}40`,
        borderRadius: 8,
        color,
        fontSize: 12,
        marginBottom: 16,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 4px',
  borderBottom: `1px solid ${C.border}`,
};

const dotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
};

const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 11,
  padding: '1px 5px',
  background: 'rgba(0,0,0,0.05)',
  borderRadius: 3,
};
