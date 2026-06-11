'use client';
import { useEffect, useState } from 'react';
import { fmtDate } from '@/lib/datetime';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
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

  // Osparat-skydd: jämför formuläret mot dess utgångsläge (tomt för nytt, original
  // vid redigering). dirty → varna vid sidnavigering och vid stängning av formuläret.
  const editingGoal = editId ? goals.find(g => g.id === editId) : null;
  const baseline = editingGoal
    ? { title: editingGoal.title, description: editingGoal.description, target_value: editingGoal.target_value?.toString() || '', current_value: editingGoal.current_value?.toString() || '' }
    : { title: '', description: '', target_value: '', current_value: '' };
  const dirty = showForm && JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty);

  function closeForm() {
    if (dirty && !confirm('Du har ett påbörjat mål som inte sparats. Stäng utan att spara?')) return;
    setShowForm(false); setEditId(null); setForm({ title: '', description: '', target_value: '', current_value: '' });
  }

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
        <button onClick={() => { if (showForm) { closeForm(); } else { setEditId(null); setForm({ title: '', description: '', target_value: '', current_value: '' }); setShowForm(true); } }} style={btnStyle('accent')}>
          {showForm ? '✕ Stäng' : '+ Nytt mål'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Mål (t.ex. 'Öka målgruppen med 10%')" style={inputStyle} />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ytterligare anteckningar eller kontext kring målet..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={save} style={{ ...btnStyle('accent'), display: 'flex', alignItems: 'center', gap: 7, ...(dirty ? { boxShadow: '0 1px 7px rgba(0,0,0,0.35)' } : {}) }}>
              {dirty && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />}
              {editId ? 'Spara' : 'Skapa'}
            </button>
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
            const si = STATUS_MAP[g.status] || STATUS_MAP.active;
            return (
              <div key={g.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <button onClick={() => toggleStatus(g)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${si.color}18`, color: si.color, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {si.label}
                      </button>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{g.title}</span>
                    </div>
                    {g.description && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{g.description}</div>}
                    
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 12 }}>
                      Skapad {fmtDate(g.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
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
  if (kind === 'accent') return { ...base, background: 'var(--brand-accent)', color: '#fff' };
  return { ...base, background: 'transparent', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.08)' };
}
