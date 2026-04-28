'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  card: '#151218', border: 'rgba(255,255,255,0.08)',
  accent: '#b14ef4', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Goal = {
  id: string; customer_id: string; title: string; description: string;
  metric_type: string; module_id: string | null; target_value: number | null;
  target_date: string | null; current_value: number | null; status: string;
  created_at: string; updated_at: string;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '🎯 Aktiv', color: C.accent },
  completed: { label: '✅ Uppnått', color: C.success },
  paused: { label: '⏸️ Pausad', color: C.dim },
};

export default function GoalsTab({ customerId }: { customerId: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', target_value: '', current_value: '' });

  async function fetchGoals() {
    const r = await fetch(`${API}/api/customers/${customerId}/goals`);
    if (r.ok) setGoals(await r.json());
  }

  useEffect(() => { fetchGoals(); }, [customerId]);

  async function save() {
    if (!form.title.trim()) return;
    const body: any = { title: form.title, description: form.description };
    if (form.target_value) body.target_value = parseFloat(form.target_value);
    if (form.current_value) body.current_value = parseFloat(form.current_value);
    const url = editId ? `${API}/api/goals/${editId}` : `${API}/api/customers/${customerId}/goals`;
    await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setShowForm(false); setEditId(null); setForm({ title: '', description: '', target_value: '', current_value: '' });
    fetchGoals();
  }

  async function deleteGoal(id: string) {
    if (!confirm('Radera mål?')) return;
    await fetch(`${API}/api/goals/${id}`, { method: 'DELETE' });
    fetchGoals();
  }

  async function toggleStatus(g: Goal) {
    const next = g.status === 'active' ? 'completed' : g.status === 'completed' ? 'paused' : 'active';
    await fetch(`${API}/api/goals/${g.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    fetchGoals();
  }

  function startEdit(g: Goal) {
    setEditId(g.id);
    setForm({ title: g.title, description: g.description, target_value: g.target_value?.toString() || '', current_value: g.current_value?.toString() || '' });
    setShowForm(true);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Målsättningar ({goals.length})</h3>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ title: '', description: '', target_value: '', current_value: '' }); }} style={btnStyle('accent')}>
          {showForm ? '✕ Stäng' : '+ Nytt mål'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Mål (t.ex. 'Nå 10 000 followers')" style={inputStyle} />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Beskrivning..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: C.dim, marginBottom: 2, display: 'block' }}>Målvärde</label>
              <input value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} placeholder="10000" type="number" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: C.dim, marginBottom: 2, display: 'block' }}>Nuvarande värde</label>
              <input value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} placeholder="7500" type="number" style={inputStyle} />
            </div>
            <button onClick={save} style={{ ...btnStyle('accent'), alignSelf: 'flex-end', marginBottom: 8 }}>{editId ? 'Spara' : 'Skapa'}</button>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 32, textAlign: 'center' }}>
          Inga målsättningar ännu. Klicka &quot;+ Nytt mål&quot; för att definiera ert första mål.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {goals.map(g => {
            const pct = g.target_value && g.current_value ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : null;
            const si = STATUS_MAP[g.status] || STATUS_MAP.active;
            return (
              <div key={g.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <button onClick={() => toggleStatus(g)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${si.color}18`, color: si.color, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {si.label}
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{g.title}</span>
                    </div>
                    {g.description && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{g.description}</div>}
                    {pct !== null && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.dim, marginBottom: 4 }}>
                          <span>{g.current_value?.toLocaleString()} / {g.target_value?.toLocaleString()}</span>
                          <span style={{ fontWeight: 700, color: pct >= 100 ? C.success : pct >= 70 ? C.warning : C.accent }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? C.success : pct >= 70 ? C.warning : C.accent, borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                      Skapad {new Date(g.created_at).toLocaleDateString('sv-SE')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(g)} style={btnStyle('ghost')}>✏️</button>
                    <button onClick={() => deleteGoal(g.id)} style={btnStyle('ghost')}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f8fafc', fontFamily: 'inherit', marginBottom: 8, outline: 'none',
};

function btnStyle(kind: 'accent' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: '#b14ef4', color: '#fff' };
  return { ...base, background: 'transparent', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.08)' };
}
