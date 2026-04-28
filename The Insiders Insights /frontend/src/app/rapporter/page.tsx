'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart2, TrendingUp, MapPin, Play, Save, Plus, X, LineChart } from 'lucide-react';
import Gauge from '../../components/Gauge';
import TrendChart from '../../components/TrendChart';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: 'var(--brand-bg)', card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Customer = { id: string; name: string; slug: string; logo_emoji: string; dataset_count: number };
type FieldRef = { id: string; source_field_id: string; alias: string; field_key: string; field_display_name: string; source_id: string; source_key: string };
type Module = { id: string; customer_id: string | null; name: string; abbr: string; category: string; formula: any; thresholds: any; inverted: boolean; field_refs: FieldRef[] };
type EvalResult = { module_id: string; module_name: string; module_abbr: string; expression: string; results: any[] };
type Report = { id: string; customer_id: string | null; name: string; description: string; config: any; created_at: string };
type SourceField = { id: string; key: string; display_name: string; data_type: string; unit: string };
type Source = { id: string; key: string; name: string; fields: SourceField[] };
type DatapointSpec = { source_field_id: string; alias?: string; aggregation: string };
type DatapointResult = {
  panel_kind: 'datapoint';
  source_field_id: string; field_key: string; field_display_name: string; field_unit: string;
  alias: string; aggregation: string;
  results: { customer_id: string; customer_name: string; value: number | null; error?: string | null }[];
};
type TrendSeries = { customer_id: string; customer_name: string; points: { period: string; value: number | null; error?: string | null }[] };
type TrendData = { module_id: string; module_name: string; module_abbr: string; granularity: string; periods: string[]; series: TrendSeries[] };

export default function RapporterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [datapoints, setDatapoints] = useState<DatapointSpec[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [datapointResults, setDatapointResults] = useState<DatapointResult[]>([]);
  const [running, setRunning] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  // Trend mode
  const [trendMode, setTrendMode] = useState(false);
  const [trendDateField, setTrendDateField] = useState<string>('');
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [trendData, setTrendData] = useState<TrendData[]>([]);

  const moduleById = useMemo(() => Object.fromEntries(modules.map(m => [m.id, m])), [modules]);
  const allFields = useMemo(
    () => sources.flatMap(s => s.fields.map(f => ({ ...f, source_id: s.id, source_name: s.name }))),
    [sources]
  );
  const fieldById = useMemo(() => Object.fromEntries(allFields.map(f => [f.id, f])), [allFields]);
  const dateFields = useMemo(() => allFields.filter(f => f.data_type === 'date'), [allFields]);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const [cs, ms, rs, ss] = await Promise.all([
      fetch(`${API}/api/customers`).then(r => r.json()),
      fetch(`${API}/api/modules`).then(r => r.json()),
      fetch(`${API}/api/reports`).then(r => r.json()),
      fetch(`${API}/api/sources`).then(r => r.json()),
    ]);
    setCustomers(cs); setModules(ms); setReports(rs); setSources(ss);
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  }

  async function runReport() {
    setRunning(true);
    try {
      const cids = Array.from(selectedCustomers);

      if (trendMode) {
        // Trend per module
        if (!trendDateField) { alert('Välj ett datumfält först.'); return; }
        const trends: TrendData[] = [];
        for (const mid of selectedModules) {
          const res = await fetch(`${API}/api/modules/${mid}/trend`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_ids: cids, date_field_id: trendDateField, granularity: trendGranularity }),
          });
          if (res.ok) trends.push(await res.json());
        }
        setTrendData(trends);
        setResults([]);
        setDatapointResults([]);
        return;
      }

      // Module gauges
      const out: EvalResult[] = [];
      for (const mid of selectedModules) {
        const res = await fetch(`${API}/api/modules/${mid}/evaluate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_ids: cids }),
        });
        if (res.ok) out.push(await res.json());
      }
      setResults(out);

      // Datapoint panels — bundled via an ad-hoc report run if user has set them
      const dpOut: DatapointResult[] = [];
      if (datapoints.length > 0) {
        // Use a temp report run by creating-and-deleting? Simpler: hit /run on a fresh transient pattern.
        // Instead: call /api/customers/{id}/evaluate-datapoint per cust+dp via inline fetch.
        for (const dp of datapoints) {
          const field = fieldById[dp.source_field_id];
          if (!field) continue;
          const results: DatapointResult['results'] = [];
          for (const cid of cids) {
            const cust = customers.find(c => c.id === cid);
            if (!cust) continue;
            const res = await fetch(`${API}/api/datapoints/evaluate`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customer_id: cid, source_field_id: dp.source_field_id, aggregation: dp.aggregation }),
            });
            if (res.ok) {
              const j = await res.json();
              results.push({ customer_id: cid, customer_name: cust.name, value: j.value, error: j.error });
            }
          }
          dpOut.push({
            panel_kind: 'datapoint',
            source_field_id: field.id, field_key: field.key, field_display_name: field.display_name, field_unit: field.unit || '',
            alias: dp.alias || field.key, aggregation: dp.aggregation,
            results,
          });
        }
      }
      setDatapointResults(dpOut);
      setTrendData([]);
    } finally { setRunning(false); }
  }

  async function saveReport() {
    if (!saveName.trim()) return;
    const body = {
      name: saveName.trim(),
      config: {
        customer_ids: Array.from(selectedCustomers),
        module_ids: Array.from(selectedModules),
        datapoints,
        trend: trendMode ? { date_field_id: trendDateField, granularity: trendGranularity } : null,
      },
    };
    const res = await fetch(`${API}/api/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      setSaveName(''); setShowSave(false); refresh();
    } else alert('Kunde inte spara rapport: ' + (await res.text()));
  }

  function loadReport(r: Report) {
    setSelectedCustomers(new Set(r.config.customer_ids || []));
    setSelectedModules(new Set(r.config.module_ids || []));
    setDatapoints(r.config.datapoints || []);
    if (r.config.trend) {
      setTrendMode(true);
      setTrendDateField(r.config.trend.date_field_id || '');
      setTrendGranularity(r.config.trend.granularity || 'day');
    } else {
      setTrendMode(false);
    }
    setResults([]); setDatapointResults([]); setTrendData([]);
  }

  async function deleteReport(id: string) {
    if (!confirm('Radera rapporten?')) return;
    await fetch(`${API}/api/reports/${id}`, { method: 'DELETE' });
    refresh();
  }

  const canRun = selectedCustomers.size >= 1 && selectedModules.size >= 1;
  const canSave = canRun && saveName.trim().length > 0;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "var(--brand-font-sans)", color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={24} className="brand-text-accent" /> Rapporter (Global vy)
        </h1>
        <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
          Välj bolag och moduler — kör för jämförelse över kunder. Spara urvalet som återanvändbar rapport.
        </p>
      </div>

      {/* Saved reports strip */}
      {reports.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginRight: 4 }}>Sparade:</span>
          {reports.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 12px', borderRadius: 16, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', fontSize: 12 }}>
              <button onClick={() => loadReport(r)} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>{r.name}</button>
              <button onClick={() => deleteReport(r.id)} title="Radera" style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: 0, fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 280px 280px 1fr', gap: 16 }}>
        {/* Customers */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Bolag ({selectedCustomers.size})</h3>
          {customers.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Inga kunder ännu.</div>}
          {customers.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedCustomers.has(c.id) ? 'rgba(0,212,255,0.08)' : 'transparent' }}>
              <input type="checkbox" checked={selectedCustomers.has(c.id)} onChange={() => toggle(selectedCustomers, setSelectedCustomers, c.id)} />
              <span style={{ fontSize: 18 }}>{c.logo_emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{c.dataset_count} dataset</div>
              </div>
            </label>
          ))}
        </div>

        {/* Modules */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Moduler ({selectedModules.size})</h3>
          {modules.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Inga moduler ännu.</div>}
          {modules.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedModules.has(m.id) ? 'rgba(0,212,255,0.08)' : 'transparent' }}>
              <input type="checkbox" checked={selectedModules.has(m.id)} onChange={() => toggle(selectedModules, setSelectedModules, m.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {m.name} <span style={{ color: C.dim }}>({m.abbr})</span>
                  {m.customer_id ? <span style={{ fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8, background: 'rgba(0,212,255,0.15)', color: C.accent }}>KUND</span>
                    : <span style={{ fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: C.dim }}>GLOBAL</span>}
                </div>
                <div style={{ fontSize: 11, color: C.dim }}>{m.category} · {m.field_refs.length} fält</div>
              </div>
            </label>
          ))}
        </div>

        {/* Datapoints (raw fields) */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Datapunkter ({datapoints.length})</h3>
            <button
              onClick={() => {
                const cand = allFields.find(f => !datapoints.some(d => d.source_field_id === f.id));
                if (cand) setDatapoints([...datapoints, { source_field_id: cand.id, alias: cand.key, aggregation: 'sum' }]);
              }}
              disabled={allFields.length === 0}
              style={{ ...btn('ghost'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><Plus size={16} /></button>
          </div>
          {datapoints.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 11 }}>
              Lägg till råa fält för att visa dem som egna gauges (t.ex. totala impressions parallellt med din CTR-modul).
            </div>
          ) : datapoints.map((dp, i) => {
            const f = fieldById[dp.source_field_id];
            return (
              <div key={i} style={{ marginBottom: 8, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <select
                  value={dp.source_field_id}
                  onChange={e => setDatapoints(datapoints.map((d, j) => j === i ? { ...d, source_field_id: e.target.value } : d))}
                  style={{ ...inp, marginBottom: 6, fontSize: 12 }}
                >
                  {sources.map(s => (
                    <optgroup key={s.id} label={s.name}>
                      {s.fields.map(ff => <option key={ff.id} value={ff.id}>{ff.key}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={dp.aggregation}
                    onChange={e => setDatapoints(datapoints.map((d, j) => j === i ? { ...d, aggregation: e.target.value } : d))}
                    style={{ ...inp, fontSize: 12 }}
                  >
                    <option value="sum">sum</option><option value="avg">avg</option><option value="min">min</option><option value="max">max</option><option value="count">count</option><option value="latest">latest</option>
                  </select>
                  <button onClick={() => setDatapoints(datapoints.filter((_, j) => j !== i))} style={{ ...btn('ghost'), padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
                </div>
                {f && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{f.display_name}{f.unit ? ` · ${f.unit}` : ''}</div>}
              </div>
            );
          })}

          {/* Trend toggle */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={trendMode} onChange={e => setTrendMode(e.target.checked)} />
              <LineChart size={16} style={{ marginRight: 4 }} /> Visa som trend (tidsserie)
            </label>
            {trendMode && (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <select value={trendDateField} onChange={e => setTrendDateField(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                  <option value="">Välj datumfält…</option>
                  {dateFields.map(f => <option key={f.id} value={f.id}>{f.key} ({f.display_name})</option>)}
                  {dateFields.length === 0 && allFields.map(f => <option key={f.id} value={f.id}>{f.key} (försök som datum)</option>)}
                </select>
                <select value={trendGranularity} onChange={e => setTrendGranularity(e.target.value as any)} style={{ ...inp, fontSize: 12 }}>
                  <option value="day">Per dag</option>
                  <option value="week">Per vecka</option>
                  <option value="month">Per månad</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={runReport} disabled={!canRun || running} className={canRun ? "brand-btn-primary" : ""} style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed',
              background: canRun ? undefined : 'rgba(0,212,255,0.25)', color: '#fff', border: 'none', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <Play size={16} fill="currentColor" /> {running ? 'Kör…' : trendMode ? 'Kör trend' : 'Kör jämförelse'}
            </button>
            <button onClick={() => setShowSave(!showSave)} disabled={!canRun} style={{ ...btn('ghost'), display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={16} /> Spara som rapport
            </button>
          </div>

          {showSave && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 8 }}>
              <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Rapportnamn, t.ex. 'Q1 kampanjjämförelse'" style={inp} onKeyDown={e => e.key === 'Enter' && canSave && saveReport()} />
              <button onClick={saveReport} disabled={!canSave} className="brand-btn-primary" style={{ padding: '8px 16px' }}>Spara</button>
              <button onClick={() => setShowSave(false)} style={btn('ghost')}>Avbryt</button>
            </div>
          )}

          {/* Trend results */}
          {trendData.length > 0 && trendData.map(td => (
            <div key={td.module_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={18} className="brand-text-accent" /> {td.module_name} <span style={{ color: C.dim, fontSize: 13, marginLeft: 4 }}>{td.module_abbr}</span></h3>
                <span style={{ fontSize: 11, color: C.dim }}>{td.granularity} · {td.periods.length} period(er)</span>
              </div>
              <TrendChart periods={td.periods} series={td.series.map(s => ({ ...s, points: s.points.map(p => ({ period: p.period, value: typeof p.value === 'number' ? p.value : null })) }))} />
            </div>
          ))}

          {/* Datapoint results */}
          {datapointResults.length > 0 && datapointResults.map(dp => (
            <div key={dp.source_field_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={18} className="brand-text-accent" /> {dp.field_display_name} <span style={{ color: C.dim, fontSize: 12, marginLeft: 4 }}>{dp.field_key}</span></h3>
                <code style={{ fontSize: 11, color: C.dim }}>{dp.aggregation}{dp.field_unit ? ` · ${dp.field_unit}` : ''}</code>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'space-around' }}>
                {dp.results.map(rr => {
                  const cust = customers.find(c => c.id === rr.customer_id);
                  return (
                    <div key={rr.customer_id} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                        {cust?.logo_emoji} {rr.customer_name}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: rr.error ? C.danger : C.accent }}>
                        {typeof rr.value === 'number' ? rr.value.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) : '—'}
                        {dp.field_unit && typeof rr.value === 'number' && <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>{dp.field_unit}</span>}
                      </div>
                      {rr.error && <div style={{ fontSize: 10, color: C.danger, marginTop: 4 }}>⚠ {rr.error}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {results.length === 0 && trendData.length === 0 && datapointResults.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: C.muted }}>
              Välj minst 1 bolag och 1 modul för att köra.
            </div>
          ) : results.map(r => {
            const mod = moduleById[r.module_id];
            return (
              <div key={r.module_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{r.module_name} <span style={{ color: C.dim, fontSize: 13 }}>{r.module_abbr}</span></h3>
                  <code style={{ fontSize: 11, color: C.dim }}>{r.expression}</code>
                </div>

                {/* Gauges row */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'space-around', marginBottom: 14 }}>
                  {r.results.map((rr: any) => {
                    const cust = customers.find(c => c.id === rr.customer_id);
                    return (
                      <div key={rr.customer_id} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                          {cust?.logo_emoji} {rr.customer_name}
                        </div>
                        <Gauge
                          value={rr.value}
                          thresholds={mod?.thresholds || {}}
                          inverted={mod?.inverted}
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Details table */}
                <details>
                  <summary style={{ fontSize: 11, color: C.dim, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Kontext</summary>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
                    <tbody>
                      {r.results.map((rr: any) => (
                        <tr key={rr.customer_id}>
                          <td style={{ padding: '6px 4px', borderBottom: `1px solid ${C.border}`, color: C.muted }}>{rr.customer_name}</td>
                          <td style={{ padding: '6px 4px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontFamily: 'monospace' }}>
                            {Object.entries(rr.context || {}).map(([k, v]) => <span key={k} style={{ marginRight: 12 }}>{k}={Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>)}
                            {rr.error && <span style={{ color: C.danger }}> ⚠ {rr.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

const inp: React.CSSProperties = { flex: 1, padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: C.text, fontSize: 13, fontFamily: 'inherit' };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))', color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
