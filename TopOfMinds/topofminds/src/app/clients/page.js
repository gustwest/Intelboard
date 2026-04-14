'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', orgNumber: '', contactPerson: '', contactEmail: '', contactPhone: '', address: '', notes: '' });

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => { setClients(d); setLoading(false); });
  }, []);

  const filtered = clients.filter(c => {
    const text = `${c.name} ${c.contactPerson || ''} ${c.orgNumber || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      const nc = await res.json();
      setClients(prev => [...prev, nc]);
      setShowModal(false);
      setForm({ name: '', orgNumber: '', contactPerson: '', contactEmail: '', contactPhone: '', address: '', notes: '' });
    }
  }

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar kunder...</p></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Kunder</h1>
        <div className="page-header-actions">
          <div className="search-bar">
            <span className="search-bar-icon">🔍</span>
            <input placeholder="Sök kund..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Ny kund</button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr><th>Företag</th><th>Org.nr</th><th>Kontaktperson</th><th>E-post</th><th>Telefon</th><th>Aktiva kontrakt</th></tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const activeContracts = c.contracts?.filter(ct => ct.status === 'ACTIVE' || ct.status === 'EXPIRING_SOON') || [];
              return (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`} style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</Link></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.orgNumber || '–'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.contactPerson || '–'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.contactEmail || '–'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.contactPhone || '–'}</td>
                  <td><span className={`badge ${activeContracts.length > 0 ? 'primary' : 'neutral'}`}>{activeContracts.length}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">🏢</div><p className="empty-state-text">Inga kunder hittades</p></div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal slide-up">
            <div className="modal-header">
              <h2 className="modal-title">Ny kund</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Företagsnamn *</label>
                    <input className="form-input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Org.nummer</label>
                    <input className="form-input" value={form.orgNumber} onChange={e => setForm(p => ({ ...p, orgNumber: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Kontaktperson</label>
                    <input className="form-input" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">E-post</label>
                    <input className="form-input" type="email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Telefon</label>
                  <input className="form-input" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Adress</label>
                  <textarea className="form-textarea" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Anteckningar</label>
                  <textarea className="form-textarea" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Avbryt</button>
                <button type="submit" className="btn btn-primary">Skapa kund</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
