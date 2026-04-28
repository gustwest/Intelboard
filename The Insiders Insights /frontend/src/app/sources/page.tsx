'use client';
import { useEffect, useMemo, useState } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const C = {
  bg: 'var(--brand-bg)', card: 'var(--brand-surface)', border: 'rgba(255,255,255,0.08)',
  accent: 'var(--brand-accent)', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  text: '#f8fafc', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
};

type Field = { id: string; key: string; display_name: string; data_type: string; unit: string; description?: string; is_active: boolean };
type Mapping = { source_field_id: string; column_name: string };
type Version = { id: string; version: number; is_current: boolean; notes: string; created_at: string; mappings: Mapping[] };
type Source = {
  id: string; key: string; name: string; description: string;
  detect_rules: any; fields: Field[]; versions: Version[];
  current_version_id: string | null; created_at: string;
};

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    const res = await fetch(`${API}/api/sources`);
    const data = await res.json();
    setSources(data);
    setLoading(false);
  }

  const current = sources.find(s => s.id === selected) || null;

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 60px', fontFamily: "var(--brand-font-sans)", color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={24} className="brand-text-accent" /> Datakällor
          </h1>
          <p style={{ fontSize: '0.8125rem', color: C.muted, margin: '4px 0 0' }}>
            Definiera rapporter som kan laddas upp (t.ex. Campaign Manager, Recruiter). Moduler binder mot fälten här.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="brand-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Ny källa</button>
      </div>

      {showCreate && <CreateSourceForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Left: source list */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, minHeight: 400 }}>
          {loading ? (
            <div style={{ padding: 20, color: C.muted }}>Laddar…</div>
          ) : sources.length === 0 ? (
            <div style={{ padding: 20, color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
              Inga källor ännu. Skapa en för att börja ladda upp filer.
            </div>
          ) : (
            sources.map(s => (
              <div key={s.id} onClick={() => setSelected(s.id)} style={{
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                background: selected === s.id ? 'rgba(0,212,255,0.12)' : 'transparent',
                border: selected === s.id ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                marginBottom: 4,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  {s.fields.length} fält · v{s.versions.length} · <code>{s.key}</code>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: source detail */}
        <div>
          {current ? <SourceDetail source={current} onChange={refresh} /> : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: C.muted }}>
              Välj en källa till vänster för att se fält och versioner.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SourceDetail({ source, onChange }: { source: Source; onChange: () => void }) {
  const [newField, setNewField] = useState<{ key: string; display_name: string; data_type: string; unit: string }>({
    key: '', display_name: '', data_type: 'str', unit: '',
  });
  const [bumping, setBumping] = useState(false);

  async function addField() {
    if (!newField.key || !newField.display_name) return;
    const res = await fetch(`${API}/api/sources/${source.id}/fields`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newField),
    });
    if (res.ok) { setNewField({ key: '', display_name: '', data_type: 'str', unit: '' }); onChange(); }
    else alert('Kunde inte lägga till fält: ' + (await res.text()));
  }

  function deleteField(fieldId: string) {
    setTimeout(async () => {
      if (!confirm('Ta bort fältet? Moduler som refererar till det går sönder.')) return;
      await fetch(`${API}/api/sources/${source.id}/fields/${fieldId}`, { method: 'DELETE' });
      onChange();
    }, 10);
  }

  function deleteSource() {
    setTimeout(async () => {
      if (!confirm(`Radera källan "${source.name}" och alla dataset som använder den?`)) return;
      await fetch(`${API}/api/sources/${source.id}`, { method: 'DELETE' });
      onChange();
    }, 10);
  }

  const currentVersion = source.versions.find(v => v.is_current);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{source.name}</h2>
            <div style={{ color: C.dim, fontSize: 12 }}>key: <code>{source.key}</code></div>
          </div>
          <button type="button" onClick={(e) => { e.preventDefault(); deleteSource(); }} style={{ ...btn('danger'), display: 'flex', alignItems: 'center', gap: '6px' }}><Trash2 size={16} /> Ta bort källa</button>
        </div>
        {source.description && <p style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>{source.description}</p>}

        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          <b>Detect-regler:</b> filename_patterns={JSON.stringify(source.detect_rules?.filename_patterns || [])} · required_columns={JSON.stringify(source.detect_rules?.required_columns || [])}
        </div>
      </div>

      {/* Fields */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Datapunkter (SourceFields)</h3>
        <p style={{ fontSize: 12, color: C.muted, marginTop: -6, marginBottom: 14 }}>Moduler binder till dessa fält. Stabila över versioner.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 100px', gap: 10, fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
          <div>Key</div><div>Display</div><div>Typ</div><div>Enhet</div><div></div>
        </div>
        {source.fields.map(f => {
          const mapping = currentVersion?.mappings.find(m => m.source_field_id === f.id);
          return (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 100px', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'center', fontSize: 13 }}>
              <code style={{ color: C.accent }}>{f.key}</code>
              <div>{f.display_name} <div style={{ fontSize: 10, color: C.dim }}>⇒ kolumn: <code>{mapping?.column_name || '—'}</code></div></div>
              <div style={{ color: C.muted }}>{f.data_type}</div>
              <div style={{ color: C.muted }}>{f.unit || '—'}</div>
              <button type="button" onClick={() => deleteField(f.id)} style={btn('ghost')}><Trash2 size={14} /></button>
            </div>
          );
        })}

        {/* Add field inline */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 100px', gap: 10, paddingTop: 16 }}>
          <input placeholder="key" value={newField.key} onChange={e => setNewField({ ...newField, key: e.target.value })} style={inp} />
          <input placeholder="Display name" value={newField.display_name} onChange={e => setNewField({ ...newField, display_name: e.target.value })} style={inp} />
          <select value={newField.data_type} onChange={e => setNewField({ ...newField, data_type: e.target.value })} style={inp}>
            <option value="str">str</option><option value="int">int</option><option value="float">float</option><option value="date">date</option><option value="bool">bool</option>
          </select>
          <input placeholder="enhet" value={newField.unit} onChange={e => setNewField({ ...newField, unit: e.target.value })} style={inp} />
          <button onClick={addField} className="brand-btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px' }}><Plus size={16} /></button>
        </div>
      </div>

      {/* Versions */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Versioner</h3>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Varje version mappar fält → kolumnnamn i tidens format. Skapa ny version när rapporten ändrar kolumner.</p>
          </div>
          {!bumping && <button onClick={() => setBumping(true)} className="brand-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Ny version</button>}
        </div>
        {source.versions.map(v => (
          <div key={v.id} style={{ padding: '10px 12px', border: `1px solid ${v.is_current ? 'rgba(34,197,94,0.25)' : C.border}`, borderRadius: 10, marginBottom: 8, background: v.is_current ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              v{v.version} {v.is_current && <span style={{ fontSize: 11, color: C.success, marginLeft: 6 }}>● aktuell</span>}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{v.notes || '—'} · {v.mappings.length} fält mappade</div>
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 10, color: C.dim, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>Mappning</summary>
              <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'monospace' }}>
                {v.mappings.map(m => {
                  const f = source.fields.find(ff => ff.id === m.source_field_id);
                  return <div key={m.source_field_id} style={{ padding: '2px 0' }}><span style={{ color: C.accent }}>{f?.key || m.source_field_id}</span> ⇒ <code>{m.column_name}</code></div>;
                })}
              </div>
            </details>
          </div>
        ))}

        {bumping && (
          <VersionBumpForm source={source} onClose={() => setBumping(false)} onCreated={() => { setBumping(false); onChange(); }} />
        )}
      </div>
    </div>
  );
}

function VersionBumpForm({ source, onClose, onCreated }: { source: Source; onClose: () => void; onCreated: () => void }) {
  const currentVersion = source.versions.find(v => v.is_current);
  const initialMappings: Record<string, string> = {};
  source.fields.forEach(f => {
    const m = currentVersion?.mappings.find(mm => mm.source_field_id === f.id);
    initialMappings[f.id] = m?.column_name || f.display_name;
  });
  const [mappings, setMappings] = useState<Record<string, string>>(initialMappings);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const body = {
        notes,
        mappings: Object.entries(mappings)
          .filter(([_, col]) => col.trim())
          .map(([source_field_id, column_name]) => ({ source_field_id, column_name: column_name.trim() })),
      };
      const res = await fetch(`${API}/api/sources/${source.id}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { alert('Kunde inte skapa version: ' + (await res.text())); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 12, padding: 16, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Ny version (blir ny aktuell)</div>
      <label style={lbl}>Anteckningar</label>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="t.ex. 'LinkedIn lade till Click Type-kolumnen 2026-04'" style={{ ...inp, marginBottom: 12 }} />

      <label style={lbl}>Fält → kolumnnamn i den nya formaten</label>
      <div style={{ display: 'grid', gap: 6 }}>
        {source.fields.map(f => (
          <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8, alignItems: 'center' }}>
            <code style={{ fontSize: 12, color: C.accent }}>{f.key}</code>
            <input value={mappings[f.id] || ''} onChange={e => setMappings({ ...mappings, [f.id]: e.target.value })} placeholder="Kolumnnamn i v2" style={inp} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>
        Lämna tomt för att utelämna ett fält i den nya versionen (gamla datasets påverkas inte, men framtida uploads ignorerar det).
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={submit} disabled={saving} className="brand-btn-primary" style={{ padding: '8px 16px' }}>{saving ? 'Skapar…' : 'Skapa ny version'}</button>
        <button onClick={onClose} style={btn('ghost')}>Avbryt</button>
      </div>
    </div>
  );
}

function CreateSourceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filenamePatterns, setFilenamePatterns] = useState('');
  const [requiredColumns, setRequiredColumns] = useState('');
  const [fieldsRaw, setFieldsRaw] = useState('impressions | Impressions | int | count\nclicks | Clicks | int | count\ncampaign | Campaign | str |');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const fields: any[] = [];
      const mapping: Record<string, string> = {};
      for (const line of fieldsRaw.split('\n').map(l => l.trim()).filter(Boolean)) {
        const parts = line.split('|').map(p => p.trim());
        const [fkey, display, dtype = 'str', unit = ''] = parts;
        if (!fkey || !display) continue;
        fields.push({ key: fkey, display_name: display, data_type: dtype, unit });
        mapping[fkey] = display; // default column name = display
      }
      const body = {
        key: key || name.toLowerCase().replace(/\s+/g, '-'),
        name,
        description,
        detect_rules: {
          filename_patterns: filenamePatterns.split(',').map(s => s.trim()).filter(Boolean),
          required_columns: requiredColumns.split(',').map(s => s.trim()).filter(Boolean),
        },
        fields,
        initial_column_mapping: mapping,
      };
      const res = await fetch(`${API}/api/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { alert(await res.text()); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px' }}>Ny källa</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>Namn *</label><input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="LinkedIn Campaign Manager" /></div>
        <div><label style={lbl}>Key (slug)</label><input value={key} onChange={e => setKey(e.target.value)} style={inp} placeholder="linkedin-campaign-manager" /></div>
        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Beskrivning</label><input value={description} onChange={e => setDescription(e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Filnamnsmönster (komma)</label><input value={filenamePatterns} onChange={e => setFilenamePatterns(e.target.value)} style={inp} placeholder="*campaign_performance*,*campaigns*" /></div>
        <div><label style={lbl}>Required columns (komma)</label><input value={requiredColumns} onChange={e => setRequiredColumns(e.target.value)} style={inp} placeholder="Impressions,Clicks" /></div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={lbl}>Fält (en per rad: <code>key | display_name | data_type | unit</code>)</label>
          <textarea value={fieldsRaw} onChange={e => setFieldsRaw(e.target.value)} rows={8} style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            display_name används som default-kolumnnamn i v1. Du kan ändra mappning efteråt.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={submit} disabled={saving || !name} className="brand-btn-primary" style={{ padding: '8px 16px' }}>{saving ? 'Skapar…' : 'Skapa källa'}</button>
        <button onClick={onClose} style={btn('ghost')}>Avbryt</button>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };

function btn(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit' };
  if (kind === 'accent') return { ...base, background: 'linear-gradient(135deg, var(--brand-accent), var(--brand-accent-hover))', color: '#fff' };
  if (kind === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: C.danger, borderColor: 'rgba(239,68,68,0.3)' };
  return { ...base, background: 'transparent', color: C.muted, borderColor: C.border };
}
