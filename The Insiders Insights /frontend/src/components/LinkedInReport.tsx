'use client';
import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, Users, Target, FileText, Video, Sparkles, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from 'lucide-react';
import { fmtDateTime } from '@/lib/datetime';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: 'var(--brand-bg)', card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type ReportData = {
  customer_id: string; customer_name: string; generated_at: string;
  sections: {
    key_metrics: any; activity_index: any;
    decision_funnel: Record<string, { label: string; strategy: string; groups: any[]; count: number }>;
    content_clusters: { clusters: any[]; anomalies: any[]; total_posts: number };
    campaign_recommendations: { avg_ctr: number | null; avg_cpc: number | null; total_spend: number; recommendations: any[]; has_campaign_data: boolean };
  };
};

function indexColor(idx: number): string {
  if (idx >= 2.5) return '#a78bfa';
  if (idx >= 1.3) return C.success;
  if (idx >= 0.7) return C.warning;
  return C.danger;
}

function funnelColor(stage: string): string {
  const map: Record<string, string> = {
    ovetandes: '#ef4444', medvetenhet: '#f59e0b', overvagande: '#3b82f6',
    konvertering: '#22c55e', ambassadorskap: '#a78bfa',
  };
  return map[stage] || C.accent;
}

export default function LinkedInReport({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedFunnel, setExpandedFunnel] = useState<Set<string>>(new Set(['overvagande', 'konvertering']));
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  async function generate() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/customers/${customerId}/linkedin-report`);
      if (!res.ok) throw new Error(await res.text());
      setReport(await res.json());
    } catch (e: any) { setError(e.message || 'Kunde inte generera rapport'); }
    finally { setLoading(false); }
  }

  async function generateInsight(section: string, data: any) {
    setAiLoading(p => ({ ...p, [section]: true }));
    try {
      const res = await fetch(`${API}/api/customers/${customerId}/linkedin-report/insights`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data }),
      });
      if (res.ok) { const j = await res.json(); setAiInsights(p => ({ ...p, [section]: j.insight })); }
    } catch { }
    finally { setAiLoading(p => ({ ...p, [section]: false })); }
  }

  function toggleFunnel(stage: string) {
    setExpandedFunnel(prev => { const n = new Set(prev); n.has(stage) ? n.delete(stage) : n.add(stage); return n; });
  }

  useEffect(() => { generate(); }, [customerId]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
      <div>Genererar strategisk rapport…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
      <AlertTriangle size={24} style={{ color: C.danger, marginBottom: 8 }} />
      <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>
      <button onClick={generate} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 10, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Försök igen</button>
    </div>
  );

  if (!report) return null;
  const { sections: s } = report;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(139,92,246,0.08))', border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Strategisk LinkedIn-rapport
            </h2>
            <p style={{ margin: '8px 0 0', color: C.muted, fontSize: 13, lineHeight: 1.6, maxWidth: 700 }}>
              Denna rapport transformerar {customerName}s LinkedIn-rådata till handlingsbara insikter för kompetensförsörjning. 
              Individualiserade åtgärder baserade på digitalt beteende och kompetensutmaningar.
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: C.dim }}>
            Genererad: {fmtDateTime(report.generated_at)}<br />
            {s.key_metrics.dataset_count} datakällor · {s.key_metrics.total_rows.toLocaleString('sv-SE')} rader
          </div>
        </div>
      </div>

      {/* Section 2: Key Metrics */}
      <Section icon={<BarChart2 size={18} />} title="Övergripande nyckeltal" onAI={() => generateInsight('key_metrics', s.key_metrics)} aiLoading={aiLoading['key_metrics']} aiInsight={aiInsights['key_metrics']}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Följare', value: s.key_metrics.metrics.followers, icon: '👥' },
            { label: 'Visningar', value: s.key_metrics.metrics.impressions, icon: '👁️' },
            { label: 'Klick', value: s.key_metrics.metrics.clicks, icon: '🖱️' },
            { label: 'Engagemang', value: s.key_metrics.metrics.engagements, icon: '💬' },
            { label: 'Inlägg', value: s.key_metrics.metrics.posts, icon: '📝' },
            { label: 'Videovisningar', value: s.key_metrics.metrics.video_views, icon: '🎬' },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{kpi.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{(kpi.value || 0).toLocaleString('sv-SE')}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
        {/* Demographics */}
        {Object.entries(s.key_metrics.demographics).map(([key, data]: [string, any]) => {
          const entries = Object.entries(data || {}).slice(0, 8);
          if (!entries.length) return null;
          const label = key === 'geography' ? '🌍 Geografi' : key === 'seniority' ? '📊 Senioritet' : '💼 Yrkesfunktion';
          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {entries.map(([name, count]: [string, any]) => (
                  <span key={name} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', color: C.text }}>
                    {name} <span style={{ color: C.accent, fontWeight: 700 }}>{count}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </Section>

      {/* Section 3: Activity Index */}
      <Section icon={<TrendingUp size={18} />} title="Aktivitetsindex" onAI={() => generateInsight('activity_index', s.activity_index)} aiLoading={aiLoading['activity_index']} aiInsight={aiInsights['activity_index']}>
        {s.activity_index.type === 'job_function' && s.activity_index.groups?.length > 0 ? (<>
          <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            <strong style={{ color: C.text }}>Hur fungerar indexet?</strong> Aktivitetsindexet mäter besöksfrekvensen i relation till yrkesgruppens storlek. 
            Index <span style={{ color: C.success }}>1.0</span> = normalvärde. Över 1.0 = överrepresenterad. Under 1.0 = underrepresenterad.
          </div>
          <div style={{ overflow: 'auto', borderRadius: 10, border: `1px solid ${C.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={th}>Yrkesfunktion</th><th style={th}>Besökare</th><th style={th}>Följare</th>
                <th style={th}>Besöksandel</th><th style={th}>Benchmark</th><th style={th}>Index</th>
              </tr></thead>
              <tbody>{s.activity_index.groups.map((row: any, i: number) => (
                <tr key={row.job_function} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={td}><span style={{ fontWeight: 600 }}>{row.job_function}</span></td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{row.visitors}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{row.followers}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{row.visitor_share}%</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: C.dim }}>{row.workforce_share}%</td>
                  <td style={td}><span style={{ fontWeight: 700, color: indexColor(row.index), fontSize: 14, padding: '2px 10px', borderRadius: 6, background: `${indexColor(row.index)}18` }}>{row.index.toFixed(2)}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>) : s.activity_index.type === 'page_sections' ? (<>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, color: C.warning, lineHeight: 1.6 }}>
            ⚠️ {s.activity_index.message}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{(s.activity_index.total_page_views || 0).toLocaleString('sv-SE')}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Totala sidvisningar</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{(s.activity_index.total_unique_visitors || 0).toLocaleString('sv-SE')}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Unika besökare</div>
            </div>
          </div>
          <div style={{ overflow: 'auto', borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={th}>Sidsektion</th><th style={th}>Sidvisningar</th><th style={th}>Unika besökare</th>
                <th style={th}>Andel</th><th style={th}>Visn/besökare</th><th style={th}>Beskrivning</th>
              </tr></thead>
              <tbody>{(s.activity_index.sections || []).map((sec: any) => (
                <tr key={sec.section} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <td style={{ ...td, fontWeight: 600 }}>{sec.section}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{sec.page_views.toLocaleString('sv-SE')}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{sec.unique_visitors.toLocaleString('sv-SE')}</td>
                  <td style={td}><span style={{ color: C.accent, fontWeight: 600 }}>{sec.share_of_total}%</span></td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{sec.views_per_visitor}</td>
                  <td style={{ ...td, color: C.muted, fontSize: 11 }}>{sec.description}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {s.activity_index.device_split && (
            <div style={{ display: 'flex', gap: 12 }}>
              {['desktop', 'mobile'].map(d => (
                <div key={d} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{d === 'desktop' ? '🖥️' : '📱'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{s.activity_index.device_split[`${d}_share`]}%</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{d === 'desktop' ? 'Desktop' : 'Mobil'} ({(s.activity_index.device_split[d] || 0).toLocaleString('sv-SE')})</div>
                </div>
              ))}
            </div>
          )}
        </>) : (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>{s.activity_index.message || 'Ingen besöksdata tillgänglig.'}</div>
        )}
      </Section>

      {/* Section 4: Decision Funnel */}
      <Section icon={<Target size={18} />} title="Målgruppskartläggning i beslutstratten" onAI={() => generateInsight('decision_funnel', s.decision_funnel)} aiLoading={aiLoading['decision_funnel']} aiInsight={aiInsights['decision_funnel']}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(s.decision_funnel).map(([stage, data]) => {
            const isOpen = expandedFunnel.has(stage);
            const color = funnelColor(stage);
            const widthPct = { ovetandes: 100, medvetenhet: 85, overvagande: 70, konvertering: 55, ambassadorskap: 40 }[stage] || 100;
            return (
              <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={() => toggleFunnel(stage)} style={{
                  width: `${widthPct}%`, padding: '14px 20px', borderRadius: 10, border: `1px solid ${color}40`,
                  background: `${color}12`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontFamily: 'inherit', color: C.text, transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color }}>{data.label}</span>
                    <span style={{ fontSize: 11, color: C.dim, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>{data.count} grupper</span>
                  </div>
                  {isOpen ? <ChevronUp size={16} style={{ color: C.dim }} /> : <ChevronDown size={16} style={{ color: C.dim }} />}
                </button>
                {isOpen && (
                  <div style={{ width: `${widthPct}%`, background: C.card, border: `1px solid ${C.border}`, borderRadius: '0 0 10px 10px', borderTop: 'none', padding: 16 }}>
                    <div style={{ fontSize: 12, color, marginBottom: 10, fontStyle: 'italic' }}>↳ {data.strategy}</div>
                    {data.groups.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <th style={th}>Yrkesfunktion</th><th style={th}>Följare</th><th style={th}>Index</th><th style={th}>Insikt</th>
                        </tr></thead>
                        <tbody>{data.groups.map((g: any) => (
                          <tr key={g.job_function} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                            <td style={td}>{g.job_function}</td>
                            <td style={{ ...td, fontFamily: 'monospace' }}>{g.followers}</td>
                            <td style={td}><span style={{ color: indexColor(g.index), fontWeight: 600 }}>{g.index.toFixed(2)}</span></td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{g.insight}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ) : <div style={{ color: C.dim, fontSize: 12 }}>Inga grupper i detta steg.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Section 5: Content Clusters */}
      <Section icon={<FileText size={18} />} title="Innehållskluster och anomalier" onAI={() => generateInsight('content', s.content_clusters)} aiLoading={aiLoading['content']} aiInsight={aiInsights['content']}>
        {s.content_clusters.clusters.length > 0 ? (
          <>
            <div style={{ overflow: 'auto', borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <th style={th}>Ämne/Typ</th><th style={th}>Antal inlägg</th><th style={th}>Snitt visningar</th><th style={th}>Snitt engagemang</th><th style={th}>Eng. rate</th>
                </tr></thead>
                <tbody>{s.content_clusters.clusters.map((c: any) => (
                  <tr key={c.topic} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.topic}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{c.post_count}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{c.avg_impressions.toLocaleString('sv-SE')}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{c.avg_engagements.toLocaleString('sv-SE')}</td>
                    <td style={td}><span style={{ color: c.engagement_rate > 3 ? C.success : c.engagement_rate > 1 ? C.warning : C.danger, fontWeight: 600 }}>{c.engagement_rate}%</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {s.content_clusters.anomalies.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.warning, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Anomalier ({s.content_clusters.anomalies.length})
                </div>
                {s.content_clusters.anomalies.map((a: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>Inlägg #{a.index + 1}</span> ({a.date || 'Okänt datum'}) — <span style={{ fontFamily: 'monospace', color: C.accent }}>{a.impressions.toLocaleString('sv-SE')}</span> visningar 
                    <span style={{ color: C.warning, marginLeft: 8 }}>+{a.deviation}σ avvikelse</span>
                    <div style={{ color: C.muted, marginTop: 4 }}>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>Ingen innehållsdata tillgänglig. Ladda upp LinkedIn Content-rapport.</div>}
      </Section>

      {/* Section 6: Campaign Manager */}
      <Section icon={<Video size={18} />} title="Video och teknisk optimering i Campaign Manager" onAI={() => generateInsight('campaign', s.campaign_recommendations)} aiLoading={aiLoading['campaign']} aiInsight={aiInsights['campaign']}>
        {s.campaign_recommendations.has_campaign_data ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Snitt CTR', value: s.campaign_recommendations.avg_ctr != null ? `${s.campaign_recommendations.avg_ctr}%` : '—' },
                { label: 'Snitt CPC', value: s.campaign_recommendations.avg_cpc != null ? `${s.campaign_recommendations.avg_cpc} kr` : '—' },
                { label: 'Total spend', value: `${s.campaign_recommendations.total_spend.toLocaleString('sv-SE')} kr` },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {s.campaign_recommendations.recommendations.map((rec: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: rec.priority === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: rec.priority === 'high' ? C.danger : '#3b82f6', flexShrink: 0 }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{rec.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{rec.description}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// -- Shared Section wrapper --
function Section({ icon, title, children, onAI, aiLoading, aiInsight }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
  onAI?: () => void; aiLoading?: boolean; aiInsight?: string;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.accent }}>{icon}</span> {title}
        </h3>
        {onAI && (
          <button onClick={onAI} disabled={aiLoading} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: aiLoading ? 'default' : 'pointer',
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: aiLoading ? 0.6 : 1,
          }}>
            {aiLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {aiLoading ? 'Genererar…' : 'AI-insikt'}
          </button>
        )}
      </div>
      {aiInsight && (
        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
          <span style={{ color: '#a78bfa', fontWeight: 600, marginRight: 6 }}>✨ AI:</span>{aiInsight}
        </div>
      )}
      {children}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: '#fff', fontSize: 12 };
const td: React.CSSProperties = { padding: '10px 14px', color: 'rgba(255,255,255,0.8)' };
