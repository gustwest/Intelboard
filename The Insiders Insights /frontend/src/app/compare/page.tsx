'use client';
import { useState, useEffect } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = { bg:'#0a0a0f', card:'#12121a', border:'rgba(255,255,255,0.06)', accent:'#a855f7', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', text:'#f8fafc', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.25)' };
const COMPARE_COLORS = ['#a855f7', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#f97316'];
const STATUS_COLORS: Record<string,string> = { excellent:'#22c55e', warning:'#f59e0b', critical:'#ef4444' };

export default function ComparePage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/customers`).then(r => r.json()).then(setCustomers);
  }, []);

  function toggleCustomer(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function runCompare() {
    if (selected.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/compare?customer_ids=${selected.join(',')}`);
      setCompareData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // Build radar data from compare results
  const radarData = (() => {
    if (!compareData?.customers) return [];
    const cids = Object.keys(compareData.customers);
    if (cids.length === 0) return [];
    // Collect all unique KPI abbrs
    const allKpis = new Set<string>();
    cids.forEach(cid => Object.keys(compareData.customers[cid].kpis || {}).forEach(k => allKpis.add(k)));
    return Array.from(allKpis).slice(0, 12).map(abbr => {
      const point: any = { kpi: abbr };
      cids.forEach(cid => {
        const kpi = compareData.customers[cid].kpis[abbr];
        // Normalize to 0-100 scale
        point[cid] = kpi ? Math.min(kpi.value * 100, 100) : 0;
      });
      return point;
    });
  })();

  // Build bar data for overall scores
  const barData = compareData?.customers ? Object.entries(compareData.customers).map(([id, c]: [string, any]) => ({
    name: `${c.emoji} ${c.name}`,
    score: c.overall_score,
  })) : [];

  // Build KPI comparison table data
  const tableKpis = (() => {
    if (!compareData?.customers) return [];
    const cids = Object.keys(compareData.customers);
    const allKpis = new Set<string>();
    cids.forEach(cid => Object.keys(compareData.customers[cid].kpis || {}).forEach(k => allKpis.add(k)));
    return Array.from(allKpis).map(abbr => {
      const row: any = { abbr };
      const first = cids.find(cid => compareData.customers[cid].kpis[abbr]);
      if (first) row.name = compareData.customers[first].kpis[abbr].name;
      cids.forEach(cid => {
        const kpi = compareData.customers[cid].kpis[abbr];
        row[`${cid}_value`] = kpi?.value ?? '-';
        row[`${cid}_status`] = kpi?.status ?? 'unknown';
      });
      return row;
    });
  })();

  const cids = compareData?.customers ? Object.keys(compareData.customers) : [];

  return (
    <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px' }}>⚖️ Jämförelse</h1>
      <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '0 0 24px' }}>Cross-referera KPI:er mellan kunder</p>

      {/* Customer selector */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {customers.map((c: any) => (
          <button key={c.id} onClick={() => toggleCustomer(c.id)} style={{
            padding: '10px 18px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600,
            background: selected.includes(c.id) ? 'rgba(168,85,247,0.15)' : C.card,
            border: selected.includes(c.id) ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
            color: selected.includes(c.id) ? C.accent : C.muted, cursor: 'pointer',
          }}>
            {c.logo_emoji} {c.name}
          </button>
        ))}
        <button onClick={runCompare} disabled={selected.length < 2 || loading} style={{
          padding: '10px 24px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700,
          background: selected.length >= 2 ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'rgba(255,255,255,0.04)',
          color: selected.length >= 2 ? '#fff' : C.dim, border: 'none', cursor: selected.length >= 2 ? 'pointer' : 'default',
          opacity: loading ? 0.5 : 1,
        }}>
          {loading ? '⏳ Beräknar...' : `Jämför ${selected.length} kunder`}
        </button>
      </div>

      {/* Results */}
      {compareData?.customers && (
        <>
          {/* Overall scores bar chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 16px' }}>📊 Strategy Score</h3>
              <div style={{ height: '200px' }}>
                <ResponsiveContainer>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: C.dim, fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.8125rem' }} />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                      {barData.map((_: any, i: number) => (
                        <rect key={i} fill={COMPARE_COLORS[i % COMPARE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Radar overlay */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 16px' }}>🕸️ KPI Radar</h3>
              <div style={{ height: '200px' }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="kpi" tick={{ fill: C.dim, fontSize: 9 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    {cids.map((cid, i) => (
                      <Radar key={cid} name={compareData.customers[cid].name} dataKey={cid}
                        stroke={COMPARE_COLORS[i]} fill={COMPARE_COLORS[i]} fillOpacity={0.1} strokeWidth={2} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* KPI comparison table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>📋 KPI-jämförelse</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: C.dim, fontWeight: 600 }}>KPI</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: C.dim, fontWeight: 600 }}>Namn</th>
                    {cids.map((cid, i) => (
                      <th key={cid} style={{ padding: '10px 16px', textAlign: 'center', color: COMPARE_COLORS[i], fontWeight: 700 }}>
                        {compareData.customers[cid].emoji} {compareData.customers[cid].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableKpis.map((row: any) => (
                    <tr key={row.abbr} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 16px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: C.accent }}>{row.abbr}</td>
                      <td style={{ padding: '8px 16px', color: C.muted }}>{row.name}</td>
                      {cids.map((cid, i) => {
                        const val = row[`${cid}_value`];
                        const status = row[`${cid}_status`];
                        const color = STATUS_COLORS[status] || C.dim;
                        return (
                          <td key={cid} style={{ padding: '8px 16px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color }}>
                              {typeof val === 'number' ? val.toFixed(2) : val}
                            </span>
                            <span style={{ marginLeft: '6px', fontSize: '0.6875rem' }}>
                              {status === 'excellent' ? '🟢' : status === 'warning' ? '🟡' : status === 'critical' ? '🔴' : ''}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!compareData && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: C.dim }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚖️</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>Välj minst 2 kunder ovan</div>
          <div style={{ fontSize: '0.8125rem' }}>och klicka Jämför för att se KPI-jämförelsen</div>
        </div>
      )}
    </main>
  );
}
