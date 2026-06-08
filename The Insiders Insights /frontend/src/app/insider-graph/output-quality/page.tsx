'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gauge, TrendingDown, AlertTriangle, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';
import * as UI from '../_components/ui';
import { fmtDate } from '@/lib/datetime';

type ConnectorScore = {
  connector: string;
  claim_count: number;
  avg_score: number;
  drop_rate: number;
  transform_rate: number;
  publish_rate: number;
  redundant_flag_count: number;
  n_clients: number;
  top_origins: { origin: string; count: number }[];
  promotion_candidate: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type Aggregate = {
  window_days: number;
  client_id: string | null;
  connectors: ConnectorScore[];
  log_count: number;
};

const WINDOW_OPTIONS = [7, 14, 30, 90];

export default function OutputQualityPage() {
  const [data, setData] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(14);
  // AR1 d: per-connector auto-godkänn-trösklar (källtillit).
  const [trust, setTrust] = useState<Record<string, number>>({});
  const [trustDefault, setTrustDefault] = useState(0.7);
  const [trustFloor, setTrustFloor] = useState(0.5);
  const [trustDirty, setTrustDirty] = useState(false);
  const [savingTrust, setSavingTrust] = useState(false);

  const loadTrust = useCallback(async () => {
    try {
      const r = await graphFetch<{ thresholds: Record<string, number>; default: number; floor: number }>('/api/output-quality/connector-trust');
      setTrust(r.thresholds || {});
      setTrustDefault(r.default);
      setTrustFloor(r.floor);
      setTrustDirty(false);
    } catch {
      /* trösklar är sekundärt — tyst fel */
    }
  }, []);

  function setThreshold(connector: string, value: string) {
    setTrust((prev) => {
      const next = { ...prev };
      if (value === '') delete next[connector];
      else next[connector] = Number(value);
      return next;
    });
    setTrustDirty(true);
  }

  async function saveTrust() {
    setSavingTrust(true);
    try {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(trust)) {
        if (v == null || Number.isNaN(v)) continue;
        clean[k] = Math.max(trustFloor, Math.min(1, v));
      }
      const res = await graphFetch<{ thresholds: Record<string, number> }>('/api/output-quality/connector-trust', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thresholds: clean }),
      });
      setTrust(res.thresholds || {});
      setTrustDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTrust(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphFetch<Aggregate>(`/api/output-quality/connector-scores?days=${days}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTrust();
  }, [loadTrust]);

  return (
    <GraphPageShell
      title="Output-kvalitet — per connector"
      icon={<Gauge size={22} />}
      subtitle="Rubric-poäng per connector — driver promotion-beslut shadow → active gate."
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <UI.SegmentedToggle
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={WINDOW_OPTIONS.map((d) => ({ value: String(d), label: `${d} d` }))}
        />
        <button
          onClick={load}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}
        >
          <RefreshCw size={12} style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          Uppdatera
        </button>
        {trustDirty && (
          <button
            onClick={saveTrust}
            disabled={savingTrust}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(159,81,182,0.18)', color: C.accent, border: '1px solid rgba(159,81,182,0.4)', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: savingTrust ? 'wait' : 'pointer' }}
          >
            {savingTrust ? 'Sparar…' : 'Spara trösklar'}
          </button>
        )}
      </div>

      {error && (
        <UI.StatusBanner tone="err" style={{ marginBottom: 16 }}>{error}</UI.StatusBanner>
      )}

      {/* Förklaring */}
      <div style={{ background: 'rgba(159,81,182,0.06)', border: '1px solid rgba(159,81,182,0.18)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 4 }}>
          <Sparkles size={14} color={C.accent} /> Hur du läser tabellen
        </div>
        Sorterad efter <strong>lägsta snittpoäng</strong> först — sämsta connector överst.
        Connectors markerade <strong style={{ color: C.accent }}>promotion-kandidat</strong> har konsekvent låg poäng
        och tillräckligt med data för att flyttas från shadow till active gate.
        <strong> LinkedIn-demografi är redan i active gate</strong> sedan dag 1.
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(159,81,182,0.18)' }}>
          <strong>Auto-godkänn ≥</strong> är källtillit: claims från connectorn med minst den säkerheten
          slipper granskningskön (Granska). Lägre = färre att granska men mer förlitan på connectorn.
          Tomt = standard ({trustDefault.toFixed(2)}). Golv {trustFloor.toFixed(2)}.
        </div>
      </div>

      {loading && !data ? (
        <UI.Card padding="32px" style={{ textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Laddar…
        </UI.Card>
      ) : data && data.connectors.length === 0 ? (
        <UI.Card padding="32px" style={{ textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Inga output_quality_logs ännu i fönstret ({days} dagar). Kör en kompilering på minst en kund.
        </UI.Card>
      ) : data ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: C.muted }}>
            <span>{data.log_count} loggar i fönstret ({data.window_days} d)</span>
            <span>{data.connectors.length} connectors</span>
          </div>

          <UI.Card padding="0" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f3f5' }}>
                  <Th>Connector</Th>
                  <Th align="right">Snitt</Th>
                  <Th align="right">Claims</Th>
                  <Th align="right">Drop</Th>
                  <Th align="right">Transform</Th>
                  <Th align="right">Publish</Th>
                  <Th align="right">Kunder</Th>
                  <Th>Topp-ursprung</Th>
                  <Th>Status</Th>
                  <Th align="right">Auto-godkänn ≥</Th>
                </tr>
              </thead>
              <tbody>
                {data.connectors.map((c) => (
                  <tr key={c.connector} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td>
                      <div style={{ fontWeight: 600, color: C.text }}>{c.connector}</div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                        {c.last_seen_at ? `senast ${fmtDate(c.last_seen_at)}` : ''}
                      </div>
                    </Td>
                    <Td align="right">
                      <ScoreBadge score={c.avg_score} />
                    </Td>
                    <Td align="right" mono>{c.claim_count}</Td>
                    <Td align="right" mono color={c.drop_rate > 0.3 ? '#ef4444' : undefined}>
                      {pct(c.drop_rate)}
                    </Td>
                    <Td align="right" mono>{pct(c.transform_rate)}</Td>
                    <Td align="right" mono>{pct(c.publish_rate)}</Td>
                    <Td align="right" mono>{c.n_clients}</Td>
                    <Td>
                      {c.top_origins.length === 0 ? (
                        <span style={{ color: C.dim, fontSize: 11 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {c.top_origins.map((o) => (
                            <span key={o.origin} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: C.text }}>
                              {o.origin} <span style={{ color: C.dim }}>({o.count})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {c.connector === 'linkedin_capacity' ? (
                        <UI.Badge tone="ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><ShieldCheck size={11} /> Active gate</UI.Badge>
                      ) : c.promotion_candidate ? (
                        <UI.Badge tone="accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><TrendingDown size={11} /> Promotion-kandidat</UI.Badge>
                      ) : c.redundant_flag_count > 0 ? (
                        <UI.Badge tone="warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><AlertTriangle size={11} /> Redundans</UI.Badge>
                      ) : (
                        <UI.Badge tone="neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>Shadow</UI.Badge>
                      )}
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={trustFloor}
                        max={1}
                        step={0.05}
                        value={trust[c.connector] ?? ''}
                        placeholder={trustDefault.toFixed(2)}
                        onChange={(e) => setThreshold(c.connector, e.target.value)}
                        aria-label={`Auto-godkänn-tröskel för ${c.connector}`}
                        style={{ width: 60, padding: '4px 6px', fontSize: 12, textAlign: 'right', background: '#eef0f1', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'ui-monospace, monospace', color: C.text }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </UI.Card>
        </>
      ) : null}
    </GraphPageShell>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 3.5 ? '#16a34a' : score >= 2.5 ? '#d97706' : '#ef4444';
  const bg = score >= 3.5 ? 'rgba(34,197,94,0.12)' : score >= 2.5 ? 'rgba(245,158,11,0.16)' : 'rgba(239,68,68,0.12)';
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: bg, color, fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
      {score.toFixed(2)}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{ padding: '10px 12px', textAlign: align || 'left', fontSize: 10, fontWeight: 600, color: '#6a7e8a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </th>
  );
}

function Td({ children, align, mono, color }: { children: React.ReactNode; align?: 'right'; mono?: boolean; color?: string }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: align || 'left',
      fontSize: 12,
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: color || C.text,
      verticalAlign: 'top',
    }}>
      {children}
    </td>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
