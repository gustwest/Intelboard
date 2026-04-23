'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = { bg:'#0a0a0f', card:'#12121a', border:'rgba(255,255,255,0.06)', accent:'#a855f7', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', text:'#f8fafc', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.25)' };
const STATUS_COLORS: Record<string,string> = { excellent:'#22c55e', warning:'#f59e0b', critical:'#ef4444' };
const FILE_ICONS: Record<string,string> = { content:'📝', followers:'👥', visitors:'👁️', competitors:'⚔️', campaign_performance:'💰', demographics:'📊', companies_export:'🏢', campaign_placement:'📍', creative_performance:'🎨', unknown:'📄' };

export default function CustomerDashboard() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [tab, setTab] = useState<'data'|'scorecard'>('data');
  const [scorecard, setScorecard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Report browser state
  const [openReport, setOpenReport] = useState<string|null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{row:number,col:string}|null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchCol, setSearchCol] = useState('');

  useEffect(() => { if (id) { fetchCustomer(); fetchScorecard(); } }, [id]);

  async function fetchCustomer() {
    try { const r = await fetch(`${API}/api/customers/${id}`); setCustomer(await r.json()); }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }
  async function fetchScorecard() {
    try { const r = await fetch(`${API}/api/customers/${id}/scorecard`); setScorecard(await r.json()); } catch(e) { console.error(e); }
  }

  async function openFile(filename: string, page = 1) {
    setOpenReport(filename); setReportLoading(true); setReportPage(page);
    try {
      const r = await fetch(`${API}/api/customers/${id}/reports/${encodeURIComponent(filename)}?page=${page}&page_size=50`);
      setReportData(await r.json());
    } catch(e) { console.error(e); }
    finally { setReportLoading(false); }
  }

  async function saveEdit(rowIdx: number, col: string, val: string) {
    const globalIdx = (reportPage - 1) * 50 + rowIdx;
    await fetch(`${API}/api/customers/${id}/reports/${encodeURIComponent(openReport!)}/edit?row_index=${globalIdx}&column=${encodeURIComponent(col)}&value=${encodeURIComponent(val)}`, { method: 'PUT' });
    setEditingCell(null);
    openFile(openReport!, reportPage);
  }

  async function resetEdits() {
    await fetch(`${API}/api/customers/${id}/reports/${encodeURIComponent(openReport!)}/edits`, { method: 'DELETE' });
    openFile(openReport!, reportPage);
  }

  const handleUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData(); form.append('file', file);
      await fetch(`${API}/api/customers/${id}/upload`, { method: 'POST', body: form });
    }
    setUploading(false); fetchCustomer();
  }, [id]);

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>Laddar...</div>;
  if (!customer || customer.error) return <div style={{ padding: '60px', textAlign: 'center', color: C.danger }}>Kunden hittades inte</div>;

  const radarData = scorecard?.categories ? Object.entries(scorecard.categories).map(([, v]: [string, any]) => ({ area: v.label, score: v.score, fullMark: 100 })) : [];
  const filteredCols = reportData?.columns?.filter((c: string) => !searchCol || c.toLowerCase().includes(searchCol.toLowerCase())) || [];

  return (
    <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <a href="/kunder" style={{ fontSize: '0.875rem', color: C.muted, textDecoration: 'none' }}>← Kunder</a>
        <span style={{ color: C.dim }}>/</span>
        <span style={{ fontSize: '2rem' }}>{customer.logo_emoji}</span>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{customer.name}</h1>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {customer.tags?.map((t: string) => <span key={t} style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.625rem', fontWeight: 600, background: 'rgba(168,85,247,0.1)', color: C.accent }}>{t}</span>)}
          </div>
        </div>
        {scorecard?.overall_score != null && (
          <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: scorecard.overall_score >= 70 ? C.success : scorecard.overall_score >= 50 ? C.warning : C.danger }}>{scorecard.overall_score}</div>
            <div style={{ fontSize: '0.625rem', color: C.dim, fontWeight: 600 }}>STRATEGY SCORE</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
        {([{ key: 'data' as const, label: '📁 Rapporter', count: customer.files?.length }, { key: 'scorecard' as const, label: '🎯 Scorecard', count: scorecard?.total_kpis }]).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenReport(null); }} style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600,
            background: tab === t.key ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.02)',
            border: tab === t.key ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
            color: tab === t.key ? C.accent : C.muted, cursor: 'pointer',
          }}>{t.label} {t.count != null && <span style={{ opacity: 0.6 }}>({t.count})</span>}</button>
        ))}
      </div>

      {/* ========== DATA / REPORTS TAB ========== */}
      {tab === 'data' && !openReport && (
        <div>
          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
            onClick={() => { const i = document.createElement('input'); i.type='file'; i.multiple=true; i.accept='.csv,.xls,.xlsx'; i.onchange=(e:any)=>handleUpload(e.target.files); i.click(); }}
            style={{ background: dragOver ? 'rgba(168,85,247,0.08)' : C.card, border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: '16px', padding: '32px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', transition: 'all 0.2s' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{uploading ? '⏳' : '📤'}</div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{uploading ? 'Laddar upp...' : 'Dra & släpp CSV/XLS-filer'}</div>
          </div>

          {/* File list — clickable to open report */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontSize: '0.875rem', fontWeight: 700 }}>
              Rapporter ({customer.files?.length || 0})
            </div>
            {(!customer.files || customer.files.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', color: C.dim }}>Inga filer uppladdade ännu</div>
            ) : customer.files.map((f: any, i: number) => (
              <div key={i} onClick={() => openFile(f.name)} style={{
                padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px',
                cursor: 'pointer', transition: 'background 0.15s',
              }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: '1.25rem' }}>{FILE_ICONS[f.type] || '📄'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: '0.6875rem', color: C.dim }}>{f.type} • {(f.size / 1024).toFixed(0)} KB</div>
                </div>
                <span style={{ fontSize: '0.75rem', color: C.accent }}>Öppna →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== REPORT BROWSER ========== */}
      {tab === 'data' && openReport && (
        <div>
          {/* Report header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button onClick={() => { setOpenReport(null); setReportData(null); }} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem', background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer',
            }}>← Tillbaka</button>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{openReport}</h2>
              {reportData && <span style={{ fontSize: '0.75rem', color: C.dim }}>{reportData.file_type} • {reportData.total_rows} rader • {reportData.columns?.length} kolumner{reportData.edits_count > 0 && <span style={{ color: C.warning }}> • {reportData.edits_count} redigeringar</span>}</span>}
            </div>
            {reportData?.edits_count > 0 && (
              <button onClick={resetEdits} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.danger}30`, color: C.danger, cursor: 'pointer' }}>
                ↩ Återställ alla ändringar
              </button>
            )}
          </div>

          {/* Column search */}
          <input value={searchCol} onChange={e => setSearchCol(e.target.value)} placeholder="🔍 Filtrera kolumner..."
            style={{ width: '260px', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8125rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, marginBottom: '12px' }} />

          {/* Table */}
          {reportLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>Laddar rapport...</div>
          ) : reportData?.rows ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: C.dim, fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: C.card, zIndex: 2, width: '40px' }}>#</th>
                      {filteredCols.map((col: string) => (
                        <th key={col} style={{ padding: '10px 12px', textAlign: 'left', color: C.accent, fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.6875rem', letterSpacing: '0.02em' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((row: any, ri: number) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '6px 12px', color: C.dim, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.625rem', position: 'sticky', left: 0, background: C.card, zIndex: 1 }}>{(reportPage - 1) * 50 + ri + 1}</td>
                        {filteredCols.map((col: string) => {
                          const isEditing = editingCell?.row === ri && editingCell?.col === col;
                          return (
                            <td key={col} onDoubleClick={() => { setEditingCell({ row: ri, col }); setEditValue(row[col] || ''); }}
                              style={{ padding: '6px 12px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>
                              {isEditing ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => saveEdit(ri, col, editValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(ri, col, editValue); if (e.key === 'Escape') setEditingCell(null); }}
                                  style={{ width: '100%', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(168,85,247,0.1)', border: `1px solid ${C.accent}`, color: C.text, outline: 'none' }} />
                              ) : (
                                <span style={{ color: row[col] ? C.text : C.dim }}>{row[col] || '—'}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {reportData.total_pages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '14px', borderTop: `1px solid ${C.border}` }}>
                  <button disabled={reportPage <= 1} onClick={() => openFile(openReport!, reportPage - 1)}
                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', background: reportPage > 1 ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, color: reportPage > 1 ? C.accent : C.dim, cursor: reportPage > 1 ? 'pointer' : 'default' }}>← Förra</button>
                  <span style={{ padding: '6px 14px', fontSize: '0.75rem', color: C.muted }}>Sida {reportPage} av {reportData.total_pages}</span>
                  <button disabled={reportPage >= reportData.total_pages} onClick={() => openFile(openReport!, reportPage + 1)}
                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', background: reportPage < reportData.total_pages ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, color: reportPage < reportData.total_pages ? C.accent : C.dim, cursor: reportPage < reportData.total_pages ? 'pointer' : 'default' }}>Nästa →</button>
                </div>
              )}
            </div>
          ) : reportData?.error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.danger }}>{reportData.error}</div>
          ) : null}
          {/* Helper text */}
          <div style={{ marginTop: '12px', fontSize: '0.6875rem', color: C.dim, textAlign: 'center' }}>
            💡 Dubbelklicka på en cell för att redigera. Ändringar sparas som overlay — originalfilen är orörd.
          </div>
        </div>
      )}

      {/* ========== SCORECARD TAB ========== */}
      {tab === 'scorecard' && scorecard && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #12121a 0%, #1a1028 100%)', border: `1px solid ${C.border}`, borderRadius: '20px', padding: '28px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                {[{ l:'Kritisk', c:scorecard.status_counts?.critical||0, color:C.danger, e:'🔴' }, { l:'Varning', c:scorecard.status_counts?.warning||0, color:C.warning, e:'🟡' }, { l:'Excellent', c:scorecard.status_counts?.excellent||0, color:C.success, e:'🟢' }].map(s => (
                  <div key={s.l} style={{ textAlign: 'center' }}><div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.c}</div><div style={{ fontSize: '0.6875rem', color: C.dim }}>{s.e} {s.l}</div></div>
                ))}
              </div>
              {radarData.length > 0 && (
                <div style={{ flex: 1, minWidth: '250px', height: '200px' }}>
                  <ResponsiveContainer><RadarChart data={radarData}><PolarGrid stroke="rgba(255,255,255,0.06)" /><PolarAngleAxis dataKey="area" tick={{ fill: C.dim, fontSize: 10 }} /><PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} /><Radar dataKey="score" stroke={C.accent} fill={C.accent} fillOpacity={0.2} strokeWidth={2} /></RadarChart></ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
          {scorecard.categories && Object.entries(scorecard.categories).map(([catKey, cat]: [string, any]) => (
            <div key={catKey} style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 16px', background: `${cat.color}10`, borderRadius: '10px', border: `1px solid ${cat.color}20` }}>
                <span>{cat.emoji}</span><h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>{cat.label}</h2>
                <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', fontWeight: 700, color: cat.score >= 70 ? C.success : cat.score >= 50 ? C.warning : C.danger }}>{cat.score}/100</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {cat.kpis?.map((kpi: any) => {
                  const color = STATUS_COLORS[kpi.status] || C.muted;
                  const isIdx = kpi.unit === 'index' || kpi.unit === 'ratio';
                  const disp = isIdx ? kpi.value.toFixed(2) : `${kpi.value}${kpi.unit === '%' ? '%' : kpi.unit === 'kr' ? ' kr' : ''}`;
                  const pct = isIdx ? Math.min(kpi.value * 100, 100) : kpi.unit === '%' ? Math.min(kpi.value, 100) : Math.min((kpi.value / 10) * 100, 100);
                  return (
                    <div key={kpi.abbr} style={{ background: C.card, border: `1px solid ${color}20`, borderRadius: '14px', padding: '18px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: kpi.status === 'critical' ? 0.8 : 0.3 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div><div style={{ fontSize: '0.625rem', fontWeight: 700, color, letterSpacing: '0.05em' }}>{kpi.abbr}</div><div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '2px' }}>{kpi.name}</div></div>
                        <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.5625rem', fontWeight: 700, background: `${color}15`, color, border: `1px solid ${color}25`, height: 'fit-content' }}>{kpi.status === 'excellent' ? '🟢' : kpi.status === 'warning' ? '🟡' : '🔴'}</span>
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'monospace', marginBottom: '6px' }}>{disp}</div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: `linear-gradient(90deg, ${color}88, ${color})`, transition: 'width 1s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: C.muted, lineHeight: 1.4 }}>{kpi.insight}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'scorecard' && !scorecard && (
        <div style={{ textAlign: 'center', padding: '60px', color: C.dim }}><div style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</div><div>Ladda upp datafiler för att beräkna scorecard</div></div>
      )}
    </main>
  );
}
