'use client';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0a0a0f', card: '#12121a', border: 'rgba(255,255,255,0.08)',
  accent: '#a855f7', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Customer = { id: string; name: string; slug: string; logo_emoji: string; dataset_count: number };
type FieldRef = { id: string; source_field_id: string; alias: string; field_key: string; field_display_name: string; source_id: string; source_key: string };
type Module = { id: string; customer_id: string | null; name: string; abbr: string; category: string; formula: any; field_refs: FieldRef[] };
type EvalResult = { module_id: string; module_name: string; module_abbr: string; expression: string; results: any[] };

export default function RapporterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      const [cs, ms] = await Promise.all([
        fetch(`${API}/api/customers`).then(r => r.json()),
        fetch(`${API}/api/modules`).then(r => r.json()),
      ]);
      setCustomers(cs); setModules(ms);
    })();
  }, []);

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

  const canRun = selectedCustomers.size >= 1 && selectedModules.size >= 1;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>📊 Rapporter (Global vy)</h1>
        <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
          Välj bolag och moduler — kör modul mot flera kunder för jämförelse eller aggregerad vy.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 320px 1fr', gap: 20 }}>
        {/* Customers */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Bolag ({selectedCustomers.size})</h3>
          {customers.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Inga kunder ännu.</div>}
          {customers.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedCustomers.has(c.id) ? 'rgba(168,85,247,0.08)' : 'transparent' }}>
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
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, background: selectedModules.has(m.id) ? 'rgba(168,85,247,0.08)' : 'transparent' }}>
              <input type="checkbox" checked={selectedModules.has(m.id)} onChange={() => toggle(selectedModules, setSelectedModules, m.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name} <span style={{ color: C.dim }}>({m.abbr})</span></div>
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
              background: canRun ? C.accent : 'rgba(168,85,247,0.25)', color: '#fff', border: 'none', fontFamily: 'inherit',
            }}>{running ? 'Kör…' : '▶ Kör jämförelse'}</button>
          </div>

          {results.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: C.muted }}>
              Välj minst 1 bolag och 1 modul för att köra.
            </div>
          ) : results.map(r => (
            <div key={r.module_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{r.module_name} <span style={{ color: C.dim, fontSize: 13 }}>{r.module_abbr}</span></h3>
                <code style={{ fontSize: 11, color: C.dim }}>{r.expression}</code>
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>Bolag</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>Värde</th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>Kontext</th>
                  </tr>
                </thead>
                <tbody>
                  {r.results.map((rr: any) => (
                    <tr key={rr.customer_id}>
                      <td style={{ padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>{rr.customer_name}</td>
                      <td style={{ padding: '8px 4px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontFamily: 'monospace', color: C.accent, fontWeight: 700 }}>
                        {typeof rr.value === 'number' ? rr.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(rr.value)}
                      </td>
                      <td style={{ padding: '8px 4px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>
                        {Object.entries(rr.context || {}).map(([k, v]) => <span key={k} style={{ marginRight: 12 }}>{k}={String(v)}</span>)}
                        {rr.error && <span style={{ color: C.danger }}> ⚠ {rr.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
