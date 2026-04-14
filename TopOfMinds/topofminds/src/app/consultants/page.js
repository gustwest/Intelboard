'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const TEAM_COLORS = {
  Steam: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(260, 60%, 55%))',
  Accelerate: 'linear-gradient(135deg, hsl(340, 60%, 50%), hsl(20, 70%, 55%))',
  Drive: 'linear-gradient(135deg, hsl(160, 60%, 45%), hsl(200, 50%, 50%))',
};

const AVATAR_COLORS = [
  'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(260, 60%, 55%))',
  'linear-gradient(135deg, hsl(160, 60%, 45%), hsl(200, 50%, 50%))',
  'linear-gradient(135deg, hsl(340, 60%, 50%), hsl(20, 70%, 55%))',
  'linear-gradient(135deg, hsl(40, 80%, 50%), hsl(20, 70%, 55%))',
  'linear-gradient(135deg, hsl(280, 50%, 55%), hsl(320, 60%, 50%))',
  'linear-gradient(135deg, hsl(180, 50%, 45%), hsl(200, 60%, 50%))',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function StatusBadge({ status }) {
  const map = { AVAILABLE: { label: 'Tillgänglig', cls: 'success' }, ON_CONTRACT: { label: 'På uppdrag', cls: 'primary' }, ON_LEAVE: { label: 'Ledig', cls: 'neutral' } };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`badge ${cls}`}><span className="badge-dot"></span>{label}</span>;
}

function formatCurrency(a) { if (!a) return '–'; return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(a); }
function parseSkills(s) { if (!s) return []; try { return JSON.parse(s); } catch { return []; } }

export default function ConsultantsPage() {
  const [consultants, setConsultants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', title: '', team: 'Steam', skills: '', hourlyRate: '', status: 'AVAILABLE', bio: '', notes: '' });

  useEffect(() => {
    fetch('/api/consultants').then(r => r.json()).then(d => { setConsultants(d); setLoading(false); });
  }, []);

  const teams = [...new Set(consultants.map(c => c.team).filter(Boolean))];

  const filtered = consultants.filter(c => {
    const text = `${c.firstName} ${c.lastName} ${c.title || ''} ${c.email} ${c.team || ''}`.toLowerCase();
    const matchSearch = text.includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchTeam = teamFilter === 'ALL' || c.team === teamFilter;
    return matchSearch && matchStatus && matchTeam;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const skills = form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    const res = await fetch('/api/consultants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, skills }),
    });
    if (res.ok) {
      const nc = await res.json();
      setConsultants(prev => [...prev, nc]);
      setShowModal(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', title: '', team: 'Steam', skills: '', hourlyRate: '', status: 'AVAILABLE', bio: '', notes: '' });
    }
  }

  async function handleDelete(id, name) {
    if (confirm(`Vill du ta bort ${name}? Alla tillhörande kontrakt tas också bort.`)) {
      const res = await fetch(`/api/consultants/${id}`, { method: 'DELETE' });
      if (res.ok) setConsultants(prev => prev.filter(c => c.id !== id));
    }
  }

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar konsulter...</p></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Konsulter</h1>
        <div className="page-header-actions">
          <div className="search-bar">
            <span className="search-bar-icon">🔍</span>
            <input placeholder="Sök konsult, roll, team..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Ny konsult</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginRight: '4px' }}>Team:</span>
        {['ALL', ...teams].map(t => (
          <button key={t} className={`filter-chip ${teamFilter === t ? 'active' : ''}`} onClick={() => setTeamFilter(t)}>
            {t === 'ALL' ? 'Alla team' : t} {t !== 'ALL' && `(${consultants.filter(c => c.team === t).length})`}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 4px' }}></span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginRight: '4px' }}>Status:</span>
        {['ALL', 'ON_CONTRACT', 'AVAILABLE', 'ON_LEAVE'].map(s => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s === 'ALL' ? 'Alla' : s === 'ON_CONTRACT' ? 'På uppdrag' : s === 'AVAILABLE' ? 'Tillgängliga' : 'Lediga'}
          </button>
        ))}
      </div>

      <div className="consultant-grid">
        {filtered.map(consultant => {
          const name = `${consultant.firstName} ${consultant.lastName}`;
          const skills = parseSkills(consultant.skills);
          const activeContracts = consultant.contracts?.filter(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') || [];
          return (
            <div key={consultant.id} className="consultant-card" style={{ position: 'relative' }}>
              <Link href={`/consultants/${consultant.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="consultant-card-top">
                  <div className="consultant-avatar" style={{ background: TEAM_COLORS[consultant.team] || getAvatarColor(name) }}>
                    {consultant.firstName[0]}{consultant.lastName[0]}
                  </div>
                  <div>
                    <div className="consultant-name">{name}</div>
                    <div className="consultant-title">{consultant.title}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  <StatusBadge status={consultant.status} />
                  {consultant.team && (
                    <span className="badge primary" style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      {consultant.team}
                    </span>
                  )}
                  {consultant.wantsNewAssignment && (
                    <span className="badge warning" style={{ fontSize: '11px' }}>Söker uppdrag</span>
                  )}
                </div>
                {skills.length > 0 && (
                  <div className="consultant-skills">
                    {skills.slice(0, 4).map(skill => <span key={skill} className="skill-tag">{skill}</span>)}
                    {skills.length > 4 && <span className="skill-tag">+{skills.length - 4}</span>}
                  </div>
                )}
                <div className="consultant-card-footer">
                  <div className="consultant-rate">{formatCurrency(consultant.hourlyRate)}/h</div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {activeContracts.length > 0 ? `${activeContracts.length} aktiva kontrakt` : 'Inget aktivt kontrakt'}
                  </span>
                </div>
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(consultant.id, name); }}
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px 8px', fontSize: '14px', opacity: 0.5 }}
                title="Ta bort konsult"
              >✕</button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">👥</div><p className="empty-state-text">Inga konsulter hittades</p></div>
      )}

      {/* Add consultant modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal slide-up">
            <div className="modal-header">
              <h2 className="modal-title">Ny konsult</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Förnamn *</label><input className="form-input" required value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Efternamn *</label><input className="form-input" required value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">E-post *</label><input className="form-input" type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Telefon</label><input className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Titel / Roll</label><input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="t.ex. Senior Fullstack Developer" /></div>
                  <div className="form-group">
                    <label className="form-label">Team *</label>
                    <select className="form-select" value={form.team} onChange={e => setForm(p => ({ ...p, team: e.target.value }))}>
                      <option value="Steam">Steam</option>
                      <option value="Accelerate">Accelerate</option>
                      <option value="Drive">Drive</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Arvode (SEK/h)</label><input className="form-input" type="number" value={form.hourlyRate} onChange={e => setForm(p => ({ ...p, hourlyRate: e.target.value }))} /></div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="AVAILABLE">Tillgänglig</option>
                      <option value="ON_CONTRACT">På uppdrag</option>
                      <option value="ON_LEAVE">Ledig</option>
                    </select>
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Kompetenser</label><input className="form-input" value={form.skills} onChange={e => setForm(p => ({ ...p, skills: e.target.value }))} placeholder="Kommaseparerade: React, Node.js, TypeScript" /></div>
                <div className="form-group"><label className="form-label">Kort bio</label><textarea className="form-textarea" value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="Kort beskrivning av konsultens erfarenhet och specialistområden..." /></div>
                <div className="form-group"><label className="form-label">Anteckningar</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Avbryt</button>
                <button type="submit" className="btn btn-primary">Skapa konsult</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
