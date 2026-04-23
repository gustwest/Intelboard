'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = { bg:'#0a0a0f', card:'#12121a', border:'rgba(255,255,255,0.06)', accent:'#a855f7', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', text:'#f8fafc', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.25)' };
const CAT_COLORS: Record<string,{emoji:string,color:string}> = { demografi:{emoji:'🎯',color:'#3b82f6'}, kampanj:{emoji:'💰',color:'#f59e0b'}, konkurrenter:{emoji:'⚔️',color:'#a855f7'}, innehåll:{emoji:'📝',color:'#22c55e'}, beslutstratt:{emoji:'🔄',color:'#06b6d4'}, video:{emoji:'🎬',color:'#ec4899'}, målgrupp:{emoji:'👥',color:'#f97316'}, budget:{emoji:'🏦',color:'#ef4444'}, custom:{emoji:'⚙️',color:'#6366f1'} };
const VIZ_LABELS: Record<string,string> = { gauge:'🔵 Gauge', bar:'📊 Stapel', line:'📈 Linje', radar:'🕸️ Radar', pie:'🥧 Tårta', table:'📋 Tabell', funnel:'🔻 Tratt', heatmap:'🟧 Heatmap', kpi_card:'🃏 KPI-kort', stacked_bar:'📊 Staplad' };

export default function ModulerPage() {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', abbr: '', category: 'custom', description: '', visualization: { primary: 'gauge', secondary: 'bar' }, thresholds: { critical_below: 0.35, good_above: 0.60 }, insight_template: '', data_sources: [] as string[] });

  useEffect(() => { fetchModules(); }, []);

  async function fetchModules() {
    try { const res = await fetch(`${API}/api/modules`); setModules(await res.json()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function createModule() {
    if (!form.name || !form.abbr) return;
    await fetch(`${API}/api/modules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: '', abbr: '', category: 'custom', description: '', visualization: { primary: 'gauge', secondary: 'bar' }, thresholds: { critical_below: 0.35, good_above: 0.60 }, insight_template: '', data_sources: [] });
    fetchModules();
  }

  const categories = ['all', ...Array.from(new Set(modules.map(m => m.category)))];
  const filtered = filter === 'all' ? modules : modules.filter(m => m.category === filter);

  return (
    <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>📐 Modulbibliotek</h1>
          <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>{modules.length} moduler • {modules.filter(m => m.is_default).length} standard</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '10px 20px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700,
          background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#fff', border: 'none', cursor: 'pointer',
        }}>+ Ny modul</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px' }}>Skapa ny modul</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Namn</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="T.ex. Custom Conversion Index"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text }} />
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Förkortning</label>
              <input value={form.abbr} onChange={e => setForm({...form, abbr: e.target.value.toUpperCase()})} placeholder="CCI"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Kategori</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.875rem', background: C.card, border: `1px solid ${C.border}`, color: C.text }}>
                {Object.entries(CAT_COLORS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {k}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Beskrivning</label>
            <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 120px', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Primär visualisering</label>
              <select value={form.visualization.primary} onChange={e => setForm({...form, visualization: {...form.visualization, primary: e.target.value}})}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '0.8125rem', background: C.card, border: `1px solid ${C.border}`, color: C.text }}>
                {Object.entries(VIZ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>Sekundär visualisering</label>
              <select value={form.visualization.secondary} onChange={e => setForm({...form, visualization: {...form.visualization, secondary: e.target.value}})}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '0.8125rem', background: C.card, border: `1px solid ${C.border}`, color: C.text }}>
                {Object.entries(VIZ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>🔴 Kritisk &lt;</label>
              <input type="number" step="0.01" value={form.thresholds.critical_below} onChange={e => setForm({...form, thresholds: {...form.thresholds, critical_below: parseFloat(e.target.value)}})}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text }} />
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.dim, display: 'block', marginBottom: '4px' }}>🟢 Bra &gt;</label>
              <input type="number" step="0.01" value={form.thresholds.good_above} onChange={e => setForm({...form, thresholds: {...form.thresholds, good_above: parseFloat(e.target.value)}})}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text }} />
            </div>
          </div>
          <button onClick={createModule} style={{
            padding: '10px 28px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700,
            background: C.accent, color: '#fff', border: 'none', cursor: 'pointer',
          }}>Skapa modul</button>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        {categories.map(cat => {
          const meta = CAT_COLORS[cat] || { emoji: '📊', color: C.accent };
          return (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '6px 14px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap',
              background: filter === cat ? `${meta.color}15` : 'rgba(255,255,255,0.02)',
              border: filter === cat ? `1px solid ${meta.color}40` : `1px solid ${C.border}`,
              color: filter === cat ? meta.color : C.muted, cursor: 'pointer',
            }}>
              {cat === 'all' ? `📊 Alla (${modules.length})` : `${meta.emoji} ${cat} (${modules.filter(m => m.category === cat).length})`}
            </button>
          );
        })}
      </div>

      {/* Module grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.muted }}>Laddar moduler...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {filtered.map((m: any) => {
            const catMeta = CAT_COLORS[m.category] || { emoji: '📊', color: C.accent };
            return (
              <div key={m.id} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px',
                padding: '20px', position: 'relative', overflow: 'hidden', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${catMeta.color}40`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${catMeta.color}60, transparent)` }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: catMeta.color, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{m.abbr}</span>
                    {m.is_default && <span style={{ fontSize: '0.5625rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: C.dim }}>STANDARD</span>}
                  </div>
                  <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '12px', background: `${catMeta.color}12`, color: catMeta.color, fontWeight: 600 }}>
                    {catMeta.emoji} {m.category}
                  </span>
                </div>

                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 6px' }}>{m.name}</h3>
                <p style={{ fontSize: '0.75rem', color: C.muted, margin: '0 0 12px', lineHeight: 1.4 }}>{m.description}</p>

                {/* Visualization + Data sources */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {m.visualization && (
                    <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: C.dim }}>
                      {VIZ_LABELS[m.visualization.primary] || m.visualization.primary}
                    </span>
                  )}
                  {m.data_sources?.map((ds: string) => (
                    <span key={ds} style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
                      {ds}
                    </span>
                  ))}
                </div>

                {/* Thresholds */}
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.6875rem', color: C.dim }}>
                  <span>🔴 {m.inverted ? '>' : '<'} {String(Object.values(m.thresholds || {})[0] ?? '')}</span>
                  <span>🟢 {m.inverted ? '<' : '>'} {String(Object.values(m.thresholds || {})[1] ?? '')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
