'use client';
import { useEffect, useMemo, useState } from 'react';
import Gauge from '../../components/Gauge';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0f0e12', card: '#151218', border: 'rgba(255,255,255,0.08)',
  accent: '#b14ef4', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Customer = { id: string; name: string; slug: string; logo_emoji: string; dataset_count: number };
type FieldRef = { id: string; source_field_id: string; alias: string; field_key: string; field_display_name: string; source_id: string; source_key: string };
type Module = { id: string; customer_id: string | null; name: string; abbr: string; category: string; formula: any; thresholds: any; inverted: boolean; field_refs: FieldRef[] };
type EvalResult = { module_id: string; module_name: string; module_abbr: string; expression: string; results: any[] };
type Report = { id: string; customer_id: string | null; name: string; description: string; config: any; created_at: string };

export default function RapporterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  const moduleById = useMemo(() => Object.fromEntries(modules.map(m => [m.id, m])), [modules]);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const [cs, ms, rs] = await Promise.all([
      fetch(`${API}/api/customers`).then(r => r.json()),
      fetch(`${API}/api/modules`).then(r => r.json()),
      fetch(`${API}/api/reports`).then(r => r.json()),
    ]);
    setCustomers(cs); setModules(ms); setReports(rs);
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  }

  async function runReport() {
    setRunning(true);
    try {
      const out: EvalResult[] = [];
      const cids = Array.from(selectedCustomers);
      for (const mid of selectedModules) {
        const res = await fetch(`${API}/api/modules/${mid}/evaluate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_ids: cids }),
        });
        if (res.ok) out.push(await res.json());
      }
      setResults(out);
    } finally { setRunning(false); }
  }

  async function saveReport() {
    if (!saveName.trim()) return;
    const body = {
      name: saveName.trim(),
      config: {
        customer_ids: Array.from(selectedCustomers),
        module_ids: Array.from(selectedModules),
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
    setResults([]);
  }

  async function deleteReport(id: string) {
    if (!confirm('Radera rapporten?')) return;
    await fetch(`${API}/api/reports/${id}`, { method: 'DELETE' });
    refresh();
  }

  const canRun = selectedCustomers.size >= 1 && selectedModules.size >= 1;
  const canSave = canRun && saveName.trim().length > 0;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>📊 Rapporter (Global vy)</h1>
        <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
          Välj bolag och moduler — kör för jämförelse över kunder. Spara urvalet som återanvändbar rapport.
        </p>
      </div>

      {/* Saved reports strip */}
      {reports.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginRight: 4 }}>Sparade:</span>
          {reports.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 12px', borderRadius: 16, background: 'rgba(177,78,244,0.1)', border: '1px solid rgba(177,78,244,0.25)', fontSize: 12 }}>
              <button onClick={() => loadReport(r)} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>{r.name}</button>
              <button onClick={() => deleteReport(r.id)} title="Radera" style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: 0, fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 320px 1fr', gap: 20 }}>
        {/* Customers */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Bolag ({selectedCustomers.size})</h3>
          {customers.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Inga kunder ännu.</div>}
          {customers.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedCustomers.has(c.id) ? 'rgba(177,78,244,0.08)' : 'transparent' }}>
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
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedModules.has(m.id) ? 'rgba(177,78,244,0.08)' : 'transparent' }}>
              <input type="checkbox" checked={selectedModules.has(m.id)} onChange={() => toggle(selectedModules, setSelectedModules, m.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {m.name} <span style={{ color: C.dim }}>({m.abbr})</span>
                  {m.customer_id ? <span style={{ fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8, background: 'rgba(177,78,244,0.15)', color: C.accent }}>KUND</span>
                    : <span style={{ fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: C.dim }}>GLOBAL</span>}
                </div>
                <div style={{ fontSize: 11, color: C.dim }}>{m.category} · {m.field_refs.length} fält</div>
              </div>
            </label>
          ))}
        </div>

        {/* Results */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={runReport} disabled={!canRun || running} style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed',
              background: canRun ? C.accent : 'rgba(177,78,244,0.25)', color: '#fff', border: 'none', fontFamily: 'inherit',
            }}>{running ? 'Kör…' : '▶ Kör jämförelse'}</button>
            <button onClick={() => setShowSave(!showSave)} disabled={!canRun} style={btn('ghost')}>💾 Spara som rapport</button>
          </div>

          {showSave && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 8 }}>
              <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Rapportnamn, t.ex. 'Q1 kampanjjämförelse'" style={inp} onKeyDown={e => e.key === 'Enter' && canSave && saveReport()} />
              <button onClick={saveReport} disabled={!canSave} style={btn('accent')}>Spara</button>
              <button onClick={() => setShowSave(false)} style={btn('ghost')}>Avbryt</button>
            </div>
          )}

          {results.length === 0 ? (
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
  if (kind === 'accent') return { ...base, background: C.accent, color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
