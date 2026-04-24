'use client';
import { useEffect, useMemo, useState } from 'react';
import Gauge from '../../components/Gauge';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0f0e12', card: '#151218', border: 'rgba(255,255,255,0.08)',
  accent: '#b14ef4', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Field = { id: string; key: string; display_name: string; data_type: string; unit: string };
type Source = { id: string; key: string; name: string; fields: Field[] };
type FieldRef = { id: string; source_field_id: string; alias: string; field_key: string; field_display_name: string; source_id: string; source_key: string };
type Module = { id: string; customer_id: string | null; name: string; abbr: string; category: string; description: string; formula: any; thresholds: any; visualization: string; insight_template: string; inverted: boolean; field_refs: FieldRef[] };
type Customer = { id: string; name: string; logo_emoji: string };

type Filter = 'all' | 'global' | 'customer';

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState<Module | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('');

  async function refresh() {
    const [ms, ss, cs] = await Promise.all([
      fetch(`${API}/api/modules`).then(r => r.json()),
      fetch(`${API}/api/sources`).then(r => r.json()),
      fetch(`${API}/api/customers`).then(r => r.json()),
    ]);
    setModules(ms); setSources(ss); setCustomers(cs);
  }
  useEffect(() => { refresh(); }, []);

  const filtered = modules.filter(m => {
    if (filter === 'global') return m.customer_id === null;
    if (filter === 'customer') {
      if (!filterCustomer) return m.customer_id !== null;
      return m.customer_id === filterCustomer;
    }
    return true;
  });

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>📐 Moduler</h1>
          <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
            Globala mallar som kan klonas per kund, eller direkt kund-specifika moduler.
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={btn('accent')} disabled={sources.length === 0}>
          + Ny modul
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Visa:</span>
        {(['all', 'global', 'customer'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: filter === f ? 'rgba(177,78,244,0.15)' : 'transparent',
            color: filter === f ? C.accent : C.muted,
            border: `1px solid ${filter === f ? 'rgba(177,78,244,0.3)' : C.border}`,
          }}>
            {f === 'all' ? 'Alla' : f === 'global' ? 'Globala mallar' : 'Kund-specifika'}
          </button>
        ))}
        {filter === 'customer' && (
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
            <option value="">Alla kunder</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.logo_emoji} {c.name}</option>)}
          </select>
        )}
        <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>{filtered.length} visade · {modules.length} totalt</span>
      </div>

      {sources.length === 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13 }}>
          💡 Du behöver minst en datakälla innan du kan skapa moduler. <a href="/sources" style={{ color: C.accent }}>Gå till Källor →</a>
        </div>
      )}

      {(creating || open) && (
        <ModuleEditor
          module={open}
          sources={sources}
          customers={customers}
          onClose={() => { setOpen(null); setCreating(false); }}
          onSaved={() => { setOpen(null); setCreating(false); refresh(); }}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map(m => (
          <ModuleCard key={m.id} module={m} customers={customers} onOpen={() => setOpen(m)} onChanged={refresh} />
        ))}
        {filtered.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, padding: 40, textAlign: 'center', gridColumn: '1 / -1' }}>
            Inga moduler i detta urval.
          </div>
        )}
      </div>
    </main>
  );
}

function ModuleCard({ module: m, customers, onOpen, onChanged }: { module: Module; customers: Customer[]; onOpen: () => void; onChanged: () => void }) {
  const [showClone, setShowClone] = useState(false);
  const isGlobal = m.customer_id === null;
  const cust = m.customer_id ? customers.find(c => c.id === m.customer_id) : null;

  async function clone(customer_id: string) {
    const res = await fetch(`${API}/api/modules/${m.id}/clone`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id }),
    });
    if (res.ok) { setShowClone(false); onChanged(); }
    else alert('Kunde inte klona: ' + (await res.text()));
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 15, cursor: 'pointer' }} onClick={onOpen}>{m.name}</h3>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(177,78,244,0.1)' }}>{m.abbr}</span>
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
        {isGlobal ? <span style={{ color: C.muted, fontWeight: 600 }}>GLOBAL MALL</span>
          : <span style={{ color: C.accent }}>KUND: {cust?.logo_emoji} {cust?.name || m.customer_id}</span>}
        {' · '}{m.category}
      </div>
      {m.description && <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>{m.description}</p>}
      <div onClick={onOpen} style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace', background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 8, cursor: 'pointer' }}>
        {m.formula?.expression || '—'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {m.field_refs.map(ref => (
          <span key={ref.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(177,78,244,0.08)', color: C.accent }}>
            {ref.alias}={ref.field_key}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onOpen} style={btn('ghost')}>Öppna / Redigera</button>
        {isGlobal && (
          <button onClick={() => setShowClone(!showClone)} style={btn('ghost')}>Klona till kund</button>
        )}
      </div>

      {showClone && (
        <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Välj kund att klona till:</div>
          {customers.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim }}>Inga kunder tillgängliga.</div>
          ) : customers.map(c => (
            <button key={c.id} onClick={() => clone(c.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8,
              background: 'transparent', border: `1px solid ${C.border}`, color: C.text, fontSize: 12, cursor: 'pointer',
              marginBottom: 4, fontFamily: 'inherit',
            }}>
              {c.logo_emoji} {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleEditor({ module, sources, customers, onClose, onSaved }: { module: Module | null; sources: Source[]; customers: Customer[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !module;
  const [name, setName] = useState(module?.name || '');
  const [abbr, setAbbr] = useState(module?.abbr || '');
  const [category, setCategory] = useState(module?.category || 'custom');
  const [description, setDescription] = useState(module?.description || '');
  const [expression, setExpression] = useState(module?.formula?.expression || '');
  const [aggregations, setAggregations] = useState<Record<string, string>>(module?.formula?.aggregations || {});
  const [customerId, setCustomerId] = useState<string | null>(module?.customer_id || null);
  const [inverted, setInverted] = useState<boolean>(module?.inverted || false);
  const [thresholds, setThresholds] = useState<{ red: string; yellow: string; green: string }>({
    red: module?.thresholds?.red?.toString() || '',
    yellow: module?.thresholds?.yellow?.toString() || '',
    green: module?.thresholds?.green?.toString() || '',
  });
  const [fieldRefs, setFieldRefs] = useState<{ source_field_id: string; alias: string }[]>(
    module?.field_refs.map(r => ({ source_field_id: r.source_field_id, alias: r.alias })) || []
  );
  const [testResults, setTestResults] = useState<any>(null);

  const allFields = useMemo(() => sources.flatMap(s => s.fields.map(f => ({ ...f, source_id: s.id, source_name: s.name, source_key: s.key }))), [sources]);
  const fieldById = Object.fromEntries(allFields.map(f => [f.id, f]));

  function addFieldRef() {
    const candidate = allFields.find(f => !fieldRefs.some(r => r.source_field_id === f.id));
    if (!candidate) return;
    setFieldRefs([...fieldRefs, { source_field_id: candidate.id, alias: candidate.key }]);
  }
  function removeFieldRef(idx: number) {
    setFieldRefs(fieldRefs.filter((_, i) => i !== idx));
  }
  function updateRef(idx: number, patch: Partial<{ source_field_id: string; alias: string }>) {
    setFieldRefs(fieldRefs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function parsedThresholds() {
    const out: any = {};
    for (const k of ['red', 'yellow', 'green'] as const) {
      const n = parseFloat(thresholds[k]);
      if (!Number.isNaN(n)) out[k] = n;
    }
    return out;
  }

  async function save() {
    const body = {
      customer_id: customerId,
      name, abbr, category, description, inverted,
      formula: { expression, aggregations },
      thresholds: parsedThresholds(),
      field_refs: fieldRefs,
      visualization: 'gauge',
    };
    const url = isNew ? `${API}/api/modules` : `${API}/api/modules/${module!.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { alert('Sparning misslyckades: ' + (await res.text())); return; }
    onSaved();
  }

  async function remove() {
    if (!module) return;
    if (!confirm(`Radera modulen "${module.name}"?`)) return;
    await fetch(`${API}/api/modules/${module.id}`, { method: 'DELETE' });
    onSaved();
  }

  async function testEval() {
    if (!module) { alert('Spara modulen först för att testa.'); return; }
    const cids = customerId ? [customerId] : customers.slice(0, 3).map(c => c.id);
    if (cids.length === 0) { alert('Ingen kund tillgänglig att testa mot.'); return; }
    const res = await fetch(`${API}/api/modules/${module.id}/evaluate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ids: cids }),
    });
    setTestResults(await res.json());
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '95%', maxWidth: 900, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>{isNew ? 'Ny modul' : module!.name}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isNew && <button onClick={remove} style={btn('danger')}>Ta bort</button>}
            <button onClick={onClose} style={btn('ghost')}>Stäng</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><label style={lbl}>Namn *</label><input value={name} onChange={e => setName(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Förkortning *</label><input value={abbr} onChange={e => setAbbr(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Kategori</label><input value={category} onChange={e => setCategory(e.target.value)} style={inp} /></div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Beskrivning</label>
          <input value={description} onChange={e => setDescription(e.target.value)} style={inp} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Scope</label>
          <select value={customerId || ''} onChange={e => setCustomerId(e.target.value || null)} style={inp}>
            <option value="">Global mall (kan klonas till kunder)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.logo_emoji} {c.name} (kund-specifik)</option>)}
          </select>
        </div>

        {/* Field refs */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <label style={lbl}>Datapunkter (fält som modulen läser)</label>
            <button onClick={addFieldRef} style={btn('ghost')}>+ Lägg till fält</button>
          </div>
          {fieldRefs.length === 0 && <div style={{ color: C.muted, fontSize: 12, padding: 12, border: `1px dashed ${C.border}`, borderRadius: 10 }}>Inga fält valda. Lägg till minst ett för att kunna skriva en formel.</div>}
          {fieldRefs.map((ref, i) => {
            const f = fieldById[ref.source_field_id];
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px 80px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select value={ref.source_field_id} onChange={e => updateRef(i, { source_field_id: e.target.value })} style={inp}>
                  {sources.map(s => (
                    <optgroup key={s.id} label={s.name}>
                      {s.fields.map(ff => <option key={ff.id} value={ff.id}>{ff.key} — {ff.display_name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <input value={ref.alias} onChange={e => updateRef(i, { alias: e.target.value })} placeholder="alias" style={{ ...inp, fontFamily: 'monospace' }} />
                <select value={aggregations[ref.alias] || 'sum'} onChange={e => setAggregations({ ...aggregations, [ref.alias]: e.target.value })} style={inp}>
                  <option value="sum">sum</option><option value="avg">avg</option><option value="min">min</option><option value="max">max</option><option value="count">count</option><option value="latest">latest</option>
                </select>
                <button onClick={() => removeFieldRef(i)} style={btn('ghost')}>✕</button>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            <b>alias</b> är variabelnamnet du använder i formeln. <b>aggregation</b> styr hur raderna reduceras till ett värde.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Formel (expression)</label>
          <input value={expression} onChange={e => setExpression(e.target.value)} placeholder="t.ex. if_(imp > 0, clk / imp * 100, 0)" style={{ ...inp, fontFamily: 'monospace' }} />
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            Stöd: + - * / % ** · min/max/abs/round · if_(cond, a, b) · jämförelser · aliasen ovan används som variabler.
          </div>
        </div>

        {/* Thresholds + inversion */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Tröskelvärden (för gauge-visualisering)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 8, alignItems: 'center' }}>
            <input value={thresholds.red} onChange={e => setThresholds({ ...thresholds, red: e.target.value })} placeholder="röd" style={{ ...inp, borderColor: 'rgba(239,68,68,0.3)' }} />
            <input value={thresholds.yellow} onChange={e => setThresholds({ ...thresholds, yellow: e.target.value })} placeholder="gul" style={{ ...inp, borderColor: 'rgba(245,158,11,0.3)' }} />
            <input value={thresholds.green} onChange={e => setThresholds({ ...thresholds, green: e.target.value })} placeholder="grön" style={{ ...inp, borderColor: 'rgba(34,197,94,0.3)' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={inverted} onChange={e => setInverted(e.target.checked)} /> Lägre = bättre
            </label>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Lämna tomt om modulen inte ska visualiseras med ampel.</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={save} style={btn('accent')}>{isNew ? 'Skapa modul' : 'Spara ändringar'}</button>
          {!isNew && <button onClick={testEval} style={btn('ghost')}>Testa mot kunder</button>}
        </div>

        {testResults && (
          <div style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: C.muted, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Testresultat:</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
              {testResults.results.map((r: any) => (
                <div key={r.customer_id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{r.customer_name}</div>
                  <Gauge value={r.value} thresholds={parsedThresholds()} inverted={inverted} size="sm" />
                  {r.error && <div style={{ fontSize: 10, color: C.danger, marginTop: 4 }}>⚠ {r.error}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>
              {testResults.results.map((r: any) => (
                <div key={r.customer_id}>
                  <b style={{ color: C.text }}>{r.customer_name}</b>:{' '}
                  {Object.entries(r.context || {}).map(([k, v]) => `${k}=${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(' · ')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: C.accent, color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
