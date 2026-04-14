'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatCurrency(a) { if (!a) return '–'; return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(a); }
function formatDate(d) { return new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }); }
function daysUntil(d) { return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24)); }

function StatusBadge({ status }) {
  const map = {
    ACTIVE: { label: 'Aktivt', cls: 'success' }, EXPIRING_SOON: { label: 'Löper ut snart', cls: 'warning' },
    EXPIRED: { label: 'Utgånget', cls: 'danger' }, DRAFT: { label: 'Utkast', cls: 'neutral' },
    RENEWED: { label: 'Förnyat', cls: 'primary' }, TERMINATED: { label: 'Avslutat', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`badge ${cls}`}><span className="badge-dot"></span>{label}</span>;
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', rate: '', rateType: 'HOURLY', estimatedHours: '', status: 'ACTIVE', renewalNoticeDays: '30', consultantId: '', clientId: '', notes: '' });

  useEffect(() => {
    Promise.all([
      fetch('/api/contracts').then(r => r.json()),
      fetch('/api/consultants').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ]).then(([c, cons, cls]) => { setContracts(c); setConsultants(cons); setClients(cls); setLoading(false); });
  }, []);

  const filtered = contracts.filter(c => {
    const text = `${c.title} ${c.consultant?.firstName} ${c.consultant?.lastName} ${c.client?.name}`.toLowerCase();
    const matchSearch = text.includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const nc = await res.json();
      setContracts(prev => [...prev, nc]);
      setShowModal(false);
      setForm({ title: '', description: '', startDate: '', endDate: '', rate: '', rateType: 'HOURLY', estimatedHours: '', status: 'ACTIVE', renewalNoticeDays: '30', consultantId: '', clientId: '', notes: '' });
    }
  }

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar kontrakt...</p></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Kontrakt</h1>
        <div className="page-header-actions">
          <div className="search-bar">
            <span className="search-bar-icon">🔍</span>
            <input placeholder="Sök kontrakt..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nytt kontrakt</button>
        </div>
      </div>

      <div className="filter-bar">
        {['ALL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'DRAFT', 'TERMINATED'].map(s => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s === 'ALL' ? 'Alla' : s === 'ACTIVE' ? 'Aktiva' : s === 'EXPIRING_SOON' ? 'Löper ut snart' : s === 'EXPIRED' ? 'Utgångna' : s === 'DRAFT' ? 'Utkast' : 'Avslutade'}
            {s !== 'ALL' && ` (${contracts.filter(c => c.status === s).length})`}
          </button>
        ))}
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Konsult</th>
              <th>Kund</th>
              <th>Period</th>
              <th>Arvode</th>
              <th>Est. timmar</th>
              <th>Värde</th>
              <th>Dagar</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const days = daysUntil(c.endDate);
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contracts/${c.id}`} style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.title}</Link>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>
                    {c.consultant ? `${c.consultant.firstName} ${c.consultant.lastName}` : '–'}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.client?.name || '–'}</td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {formatDate(c.startDate)} – {formatDate(c.endDate)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{formatCurrency(c.rate)}/{c.rateType === 'HOURLY' ? 'h' : c.rateType === 'MONTHLY' ? 'mån' : 'fast'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.estimatedHours || '–'}</td>
                  <td style={{ fontWeight: 500 }}>{formatCurrency((c.rate || 0) * (c.estimatedHours || 0))}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: days <= 0 ? 'var(--color-danger)' : days <= 30 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                      {days <= 0 ? 'Utgånget' : `${days}d`}
                    </span>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">📄</div><p className="empty-state-text">Inga kontrakt hittades</p></div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal slide-up">
            <div className="modal-header">
              <h2 className="modal-title">Nytt kontrakt</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titel *</label>
                  <input className="form-input" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Konsult *</label>
                    <select className="form-select" required value={form.consultantId} onChange={e => setForm(p => ({ ...p, consultantId: e.target.value }))}>
                      <option value="">Välj konsult...</option>
                      {consultants.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kund *</label>
                    <select className="form-select" required value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}>
                      <option value="">Välj kund...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Startdatum *</label>
                    <input className="form-input" type="date" required value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Slutdatum *</label>
                    <input className="form-input" type="date" required value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Arvode (SEK)</label>
                    <input className="form-input" type="number" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Arvodestyp</label>
                    <select className="form-select" value={form.rateType} onChange={e => setForm(p => ({ ...p, rateType: e.target.value }))}>
                      <option value="HOURLY">Per timme</option>
                      <option value="MONTHLY">Per månad</option>
                      <option value="FIXED">Fast pris</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Est. timmar</label>
                    <input className="form-input" type="number" value={form.estimatedHours} onChange={e => setForm(p => ({ ...p, estimatedHours: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Förnyelsevarning (dagar)</label>
                    <input className="form-input" type="number" value={form.renewalNoticeDays} onChange={e => setForm(p => ({ ...p, renewalNoticeDays: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="DRAFT">Utkast</option>
                      <option value="ACTIVE">Aktivt</option>
                      <option value="EXPIRED">Utgånget (historiskt)</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Beskrivning</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Anteckningar</label>
                  <textarea className="form-textarea" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Avbryt</button>
                <button type="submit" className="btn btn-primary">Skapa kontrakt</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
