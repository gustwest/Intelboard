'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: '#0f0e12', card: '#151218', border: 'rgba(255,255,255,0.08)',
  accent: '#b14ef4', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Note = {
  id: string; customer_id: string; title: string; body: string;
  note_type: string; author: string; created_at: string; updated_at: string;
};

const NOTE_TYPES = [
  { value: 'note', label: '📝 Anteckning', color: C.accent },
  { value: 'meeting', label: '🤝 Möte', color: '#3b82f6' },
  { value: 'insight', label: '💡 Insikt', color: C.warning },
];

export default function NotesTab({ customerId }: { customerId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', body: '', note_type: 'note', author: '' });

  async function fetchNotes() {
    const r = await fetch(`${API}/api/customers/${customerId}/notes`);
    if (r.ok) setNotes(await r.json());
  }

  useEffect(() => { fetchNotes(); }, [customerId]);

  async function save() {
    if (!form.title.trim()) return;
    const url = editId ? `${API}/api/notes/${editId}` : `${API}/api/customers/${customerId}/notes`;
    const method = editId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowForm(false); setEditId(null); setForm({ title: '', body: '', note_type: 'note', author: '' });
    fetchNotes();
  }

  async function deleteNote(id: string) {
    if (!confirm('Radera anteckning?')) return;
    await fetch(`${API}/api/notes/${id}`, { method: 'DELETE' });
    fetchNotes();
  }

  function startEdit(n: Note) {
    setEditId(n.id);
    setForm({ title: n.title, body: n.body, note_type: n.note_type, author: n.author });
    setShowForm(true);
  }

  const typeInfo = (t: string) => NOTE_TYPES.find(x => x.value === t) || NOTE_TYPES[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Anteckningar ({notes.length})</h3>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ title: '', body: '', note_type: 'note', author: '' }); }} style={btnStyle('accent')}>
          {showForm ? '✕ Stäng' : '+ Ny anteckning'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titel"
            style={inputStyle} />
          <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Innehåll..."
            rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select value={form.note_type} onChange={e => setForm({ ...form, note_type: e.target.value })} style={{ ...inputStyle, flex: 'none', width: 180 }}>
              {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="Författare" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={save} style={btnStyle('accent')}>{editId ? 'Spara' : 'Skapa'}</button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 32, textAlign: 'center' }}>
          Inga anteckningar ännu. Klicka &quot;+ Ny anteckning&quot; för att börja.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => {
            const ti = typeInfo(n.note_type);
            return (
              <div key={n.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${ti.color}18`, color: ti.color, fontWeight: 600 }}>{ti.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</span>
                    </div>
                    {n.body && <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.body}</div>}
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                      {n.author && <span>{n.author} · </span>}
                      {new Date(n.created_at).toLocaleString('sv-SE')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(n)} style={btnStyle('ghost')}>✏️</button>
                    <button onClick={() => deleteNote(n.id)} style={btnStyle('ghost')}>🗑️</button>
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
