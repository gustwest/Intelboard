'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Gauge, ArrowLeft, Sparkles, ChevronRight, ChevronDown, Filter, Check, Loader2 } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../../../_components/GraphPageShell';
import { graphFetch } from '../../../_lib/api';
import {
  VerdictBadge, ScoreBadge, ActionPill, BundleFlagChip, AudiencePill, HintChip, ShadowGateBadge,
  type ClaimAction,
} from '../../../_components/OutputQualityBits';

type LogSummary = {
  log_id: string; logged_at: string | null; source: string | null;
  scope: string | null; connector: string | null;
  bundle_score: number; verdict: string; claim_count: number;
  audience_count: number | null; flag_count: number; llm_unavailable: boolean;
};

type ClaimScore = {
  claim_id: string | null; statement_preview: string;
  score: number; dimensions: Record<string, number>;
  dimension_hint: string | null; best_audience: string | null;
  action: string; reasons: string[]; suggestion: string | null;
};

type GateAction = {
  claim_id: string; action: string; score: number;
  dimension_hint: string | null; redundant: boolean; mutated: boolean;
};

type LogDetail = LogSummary & {
  top_improvements: string[];
  bundle_flags: { type: string; detail: string | null; dimension_hint?: string | null; audience?: string | null }[];
  per_connector?: Record<string, { avg_score: number; claim_count: number; action_counts: Record<string, number>; origins?: Record<string, number> }>;
  per_claim?: ClaimScore[];                  // compile_schema-loggar
  actions?: GateAction[];                    // gate-loggar
  metadata: Record<string, unknown>;
};

export default function OutputQualityDetailPage() {
  const params = useParams<{ client_id: string }>();
  const clientId = params.client_id;

  const [logs, setLogs] = useState<LogSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filter på per-claim-tabellen
  const [actionFilter, setActionFilter] = useState<ClaimAction | 'all'>('all');
  const [connectorFilter, setConnectorFilter] = useState<string>('all');
  const [hintFilter, setHintFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Status per claim när användaren applicerar förslaget: idle | applying | applied | error
  const [applyState, setApplyState] = useState<Record<string, 'idle' | 'applying' | 'applied' | 'error'>>({});
  const [applyError, setApplyError] = useState<Record<string, string>>({});

  async function applySuggestion(claimId: string, suggestion: string) {
    setApplyState((p) => ({ ...p, [claimId]: 'applying' }));
    setApplyError((p) => ({ ...p, [claimId]: '' }));
    try {
      const r = await graphFetch<{ status: string }>(
        `/api/output-quality/apply-suggestion/${clientId}/${claimId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestion, source_log_id: selectedId }),
        },
      );
      setApplyState((p) => ({ ...p, [claimId]: r.status === 'noop' ? 'applied' : 'applied' }));
    } catch (e) {
      setApplyState((p) => ({ ...p, [claimId]: 'error' }));
      setApplyError((p) => ({ ...p, [claimId]: e instanceof Error ? e.message : String(e) }));
    }
  }

  const loadLogs = useCallback(async () => {
    setError(null);
    try {
      const r = await graphFetch<{ items: LogSummary[] }>(`/api/output-quality/logs/${clientId}?limit=50`);
      setLogs(r.items);
      if (r.items.length > 0 && !selectedId) setSelectedId(r.items[0].log_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId, selectedId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    graphFetch<LogDetail>(`/api/output-quality/logs/${clientId}/${selectedId}`)
      .then((d) => { if (!cancelled) { setDetail(d); setDetailLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setDetailLoading(false); } });
    return () => { cancelled = true; };
  }, [clientId, selectedId]);

  const perClaim = detail?.per_claim || [];
  const claimMeta = (detail as unknown as { claim_meta?: { claim_id: string; connector: string }[] })?.claim_meta || [];
  // Joining: claim_meta indexerat på samma sätt som per_claim
  const claimWithConnector = perClaim.map((c, i) => ({
    ...c,
    connector: claimMeta[i]?.connector || 'unknown',
  }));

  // Unika filtervärden
  const allConnectors = Array.from(new Set(claimWithConnector.map((c) => c.connector))).sort();
  const allHints = Array.from(new Set(perClaim.map((c) => c.dimension_hint).filter(Boolean) as string[])).sort();

  const filtered = claimWithConnector.filter((c) => {
    if (actionFilter !== 'all' && c.action !== actionFilter) return false;
    if (connectorFilter !== 'all' && c.connector !== connectorFilter) return false;
    if (hintFilter !== 'all' && c.dimension_hint !== hintFilter) return false;
    return true;
  });

  return (
    <GraphPageShell
      title="Output-kvalitet"
      icon={<Gauge size={22} />}
      subtitle={`Rubric-loggar för ${clientId}`}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <Link
        href={`/insider-graph/kunder/${clientId}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Tillbaka till kundkortet
      </Link>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Logg-väljare */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Senaste loggar
          </div>
          {logs === null ? (
            <div style={{ padding: 12, fontSize: 12, color: C.muted }}>Laddar…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: C.muted }}>Inga loggar än.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {logs.map((log) => {
                const active = log.log_id === selectedId;
                return (
                  <button
                    key={log.log_id}
                    onClick={() => setSelectedId(log.log_id)}
                    style={{
                      textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                      background: active ? 'rgba(159,81,182,0.10)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(159,81,182,0.3)' : 'transparent'}`,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#3a4b56' }}>
                      <ScoreBadge score={log.bundle_score} size="sm" />
                      <ShadowGateBadge source={log.source} />
                    </div>
                    <div style={{ fontSize: 10, color: C.dim }}>
                      {log.logged_at ? new Date(log.logged_at).toLocaleString('sv-SE') : '—'}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>
                      {log.claim_count} claims · {log.flag_count} flagg
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalj */}
        <div>
          {!selectedId || !detail ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>
              {detailLoading ? 'Laddar…' : 'Välj en logg i listan.'}
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  <ScoreBadge score={detail.bundle_score} size="lg" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <VerdictBadge verdict={detail.verdict} />
                      <ShadowGateBadge source={detail.source} />
                      {detail.scope && (
                        <span style={{ fontSize: 11, color: C.muted }}>scope: <strong>{detail.scope}</strong></span>
                      )}
                      {detail.connector && (
                        <span style={{ fontSize: 11, color: C.muted }}>connector: <strong>{detail.connector}</strong></span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      {detail.claim_count} claims · {detail.bundle_flags.length} flagg{detail.bundle_flags.length === 1 ? 'a' : 'or'}
                      {detail.audience_count != null && <> · audience {detail.audience_count > 0 ? '✓' : '⨯'}</>}
                      {detail.logged_at && <> · {new Date(detail.logged_at).toLocaleString('sv-SE')}</>}
                    </div>
                  </div>
                </div>

                {detail.llm_unavailable && (
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#92400e', marginBottom: 12 }}>
                    Validator-LLM:n var otillgänglig — poängen är inte att lita på.
                  </div>
                )}

                {detail.bundle_flags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {detail.bundle_flags.map((f, i) => <BundleFlagChip key={i} flag={f} />)}
                  </div>
                )}

                {detail.top_improvements?.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      <Sparkles size={11} /> Åtgärdsförslag
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#3a4b56', lineHeight: 1.6 }}>
                      {detail.top_improvements.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Per-connector */}
              {detail.per_connector && Object.keys(detail.per_connector).length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 12 }}>Per connector</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f1f3f5' }}>
                        <th style={th}>Connector</th>
                        <th style={{ ...th, textAlign: 'right' }}>Snitt</th>
                        <th style={{ ...th, textAlign: 'right' }}>Claims</th>
                        <th style={{ ...th, textAlign: 'right' }}>Publish</th>
                        <th style={{ ...th, textAlign: 'right' }}>Transform</th>
                        <th style={{ ...th, textAlign: 'right' }}>Drop</th>
                        <th style={th}>Topp-ursprung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(detail.per_connector)
                        .sort((a, b) => a[1].avg_score - b[1].avg_score)
                        .map(([name, v]) => {
                          const origins = Object.entries(v.origins || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
                          return (
                            <tr key={name} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{name}</td>
                              <td style={{ ...td, textAlign: 'right' }}><ScoreBadge score={v.avg_score} size="sm" /></td>
                              <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{v.claim_count}</td>
                              <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: '#16a34a' }}>{v.action_counts?.publish ?? 0}</td>
                              <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: '#d97706' }}>{v.action_counts?.transform ?? 0}</td>
                              <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: '#ef4444' }}>{v.action_counts?.drop ?? 0}</td>
                              <td style={td}>
                                {origins.length === 0 ? <span style={{ color: C.dim }}>—</span> : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {origins.map(([o, n]) => (
                                      <span key={o} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
                                        {o} <span style={{ color: C.dim }}>({n})</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Per-claim-tabell (endast för compile_schema-loggar) */}
              {perClaim.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>
                      Per claim ({filtered.length} av {perClaim.length})
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Filter size={12} color={C.muted} />
                      <FilterSelect label="Action" value={actionFilter} onChange={(v) => setActionFilter(v as ClaimAction | 'all')}
                        options={[{ value: 'all', label: 'Alla' }, { value: 'publish', label: 'Publish' }, { value: 'transform', label: 'Transform' }, { value: 'drop', label: 'Drop' }]} />
                      <FilterSelect label="Connector" value={connectorFilter} onChange={setConnectorFilter}
                        options={[{ value: 'all', label: 'Alla' }, ...allConnectors.map((c) => ({ value: c, label: c }))]} />
                      <FilterSelect label="Dimension" value={hintFilter} onChange={setHintFilter}
                        options={[{ value: 'all', label: 'Alla' }, ...allHints.map((h) => ({ value: h, label: h }))]} />
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f1f3f5' }}>
                        <th style={{ ...th, width: 28 }}></th>
                        <th style={th}>Claim</th>
                        <th style={{ ...th, width: 110 }}>Dimension</th>
                        <th style={{ ...th, width: 110 }}>Audience</th>
                        <th style={{ ...th, textAlign: 'right', width: 60 }}>Score</th>
                        <th style={{ ...th, width: 100 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => {
                        const key = c.claim_id || `c${i}`;
                        const isOpen = !!expanded[key];
                        return (
                          <Row key={key}>
                            <tr style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                                onClick={() => setExpanded((p) => ({ ...p, [key]: !isOpen }))}>
                              <td style={td}>{isOpen ? <ChevronDown size={14} color={C.muted} /> : <ChevronRight size={14} color={C.muted} />}</td>
                              <td style={td}>
                                <div style={{ color: '#3a4b56' }}>{c.statement_preview}</div>
                                <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{c.connector}</div>
                              </td>
                              <td style={td}><HintChip hint={c.dimension_hint} /></td>
                              <td style={td}><AudiencePill audience={c.best_audience} /></td>
                              <td style={{ ...td, textAlign: 'right' }}><ScoreBadge score={c.score} size="sm" /></td>
                              <td style={td}><ActionPill action={c.action} /></td>
                            </tr>
                            {isOpen && (
                              <tr style={{ background: '#fafbfc' }}>
                                <td></td>
                                <td colSpan={5} style={{ padding: '10px 14px 14px' }}>
                                  {c.reasons?.length > 0 && (
                                    <div style={{ marginBottom: 8 }}>
                                      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Skäl</div>
                                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#3a4b56', lineHeight: 1.5 }}>
                                        {c.reasons.map((r, ri) => <li key={ri}>{r}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                  {c.suggestion && (
                                    <div style={{ marginBottom: 8 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Föreslagen omformulering</div>
                                        {c.claim_id && (() => {
                                          const st = applyState[c.claim_id] || 'idle';
                                          if (st === 'applied') {
                                            return (
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(34,197,94,0.12)', color: '#16a34a', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                                <Check size={12} /> Applicerat
                                              </span>
                                            );
                                          }
                                          return (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); applySuggestion(c.claim_id!, c.suggestion!); }}
                                              disabled={st === 'applying'}
                                              style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '4px 10px', background: st === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(159,81,182,0.16)',
                                                color: st === 'error' ? '#b91c1c' : '#9f51b6',
                                                border: `1px solid ${st === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(159,81,182,0.3)'}`,
                                                borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                cursor: st === 'applying' ? 'wait' : 'pointer',
                                              }}
                                            >
                                              {st === 'applying' ? (
                                                <><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Applicerar…</>
                                              ) : st === 'error' ? (
                                                <>✕ Försök igen</>
                                              ) : (
                                                <><Check size={12} /> Applicera förslag</>
                                              )}
                                            </button>
                                          );
                                        })()}
                                      </div>
                                      <div style={{ fontSize: 12, color: '#3a4b56', fontStyle: 'italic', padding: '8px 12px', background: 'rgba(159,81,182,0.08)', borderLeft: '3px solid #9f51b6', borderRadius: 4 }}>
                                        {c.suggestion}
                                      </div>
                                      {c.claim_id && applyError[c.claim_id] && (
                                        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>{applyError[c.claim_id]}</div>
                                      )}
                                      {c.claim_id && applyState[c.claim_id] === 'applied' && (
                                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>
                                          Sparat. Nästa publicering (compile_schema) hämtar texten — triggas i bakgrunden.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {c.dimensions && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Per-dimension (0-5)</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: 11 }}>
                                        {Object.entries(c.dimensions).map(([k, v]) => (
                                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                                            <span style={{ color: C.muted }}>{k}</span>
                                            <span style={{ fontFamily: 'ui-monospace, monospace', color: '#3a4b56', fontWeight: 600 }}>{Number(v).toFixed(1)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Row>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Gate-loggar: per-action-tabell istället för per_claim (gaten har inte full per_claim) */}
              {detail.actions && detail.actions.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 12 }}>Gate-åtgärder ({detail.actions.length})</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f1f3f5' }}>
                        <th style={th}>Claim-id</th>
                        <th style={{ ...th, width: 110 }}>Dimension</th>
                        <th style={{ ...th, textAlign: 'right', width: 60 }}>Score</th>
                        <th style={{ ...th, width: 100 }}>Action</th>
                        <th style={{ ...th, width: 90 }}>Redundant</th>
                        <th style={{ ...th, width: 90 }}>Muterad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.actions.map((a) => (
                        <tr key={a.claim_id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{a.claim_id}</td>
                          <td style={td}><HintChip hint={a.dimension_hint} /></td>
                          <td style={{ ...td, textAlign: 'right' }}><ScoreBadge score={a.score} size="sm" /></td>
                          <td style={td}><ActionPill action={a.action} /></td>
                          <td style={td}>{a.redundant ? '✓' : '—'}</td>
                          <td style={td}>{a.mutated ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </GraphPageShell>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#6a7e8a', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top', color: '#3a4b56' };

// Wrap-helper för att rendera en row + extra-row utan extra <React.Fragment>-warning
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}>
      {label}:
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: '4px 8px', fontSize: 11, background: '#eef0f1', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 6 }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
