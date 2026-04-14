'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function formatCurrency(a) { if (!a) return '–'; return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(a); }
function formatDate(d) { return new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' }); }
function formatDateInput(d) { return new Date(d).toISOString().split('T')[0]; }
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

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({});
  const [consultants, setConsultants] = useState([]);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    fetch(`/api/contracts/${params.id}`)
      .then(r => r.json())
      .then(d => { setContract(d); setLoading(false); });
  }, [params.id]);

  const openEdit = () => {
    setForm({
      title: contract.title || '',
      description: contract.description || '',
      startDate: formatDateInput(contract.startDate),
      endDate: formatDateInput(contract.endDate),
      rate: contract.rate || '',
      rateType: contract.rateType || 'HOURLY',
      estimatedHours: contract.estimatedHours || '',
      status: contract.status || 'ACTIVE',
      renewalNoticeDays: contract.renewalNoticeDays || 30,
      notes: contract.notes || '',
      consultantId: contract.consultantId || '',
      clientId: contract.clientId || '',
    });
    // Fetch consultants and clients for dropdowns
    Promise.all([
      fetch('/api/consultants').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ]).then(([c, cl]) => {
      setConsultants(Array.isArray(c) ? c : []);
      setClients(Array.isArray(cl) ? cl : []);
    });
    setEditing(true);
  };

  const saveContract = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setContract(updated);
        setEditing(false);
      }
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const deleteContract = async () => {
    if (!confirm('Är du säker på att du vill ta bort detta kontrakt? Denna åtgärd går inte att ångra.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/contracts');
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar kontrakt...</p></div>;
  if (!contract) return <div className="empty-state"><p>Kontrakt hittades inte</p></div>;

  const days = daysUntil(contract.endDate);
  const totalValue = (contract.rate || 0) * (contract.estimatedHours || 0);
  const monthlyValue = contract.rateType === 'HOURLY' ? (contract.rate || 0) * 160 : contract.rate || 0;
  const totalDays = Math.ceil((new Date(contract.endDate) - new Date(contract.startDate)) / (1000*60*60*24));
  const elapsedDays = Math.ceil((new Date() - new Date(contract.startDate)) / (1000*60*60*24));
  const progressPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <Link href="/contracts" className="btn btn-ghost btn-sm">← Tillbaka till kontrakt</Link>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary btn-sm" onClick={openEdit}>✏️ Redigera</button>
          <button className="btn btn-ghost btn-sm" onClick={deleteContract} disabled={deleting} style={{ color: 'var(--color-danger)' }}>
            {deleting ? 'Tar bort...' : '🗑️ Ta bort'}
          </button>
        </div>
      </div>

      {/* Header card */}
      <div className="card no-hover" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>{contract.title}</h1>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={contract.status} />
              <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
              </span>
              {days > 0 && <span style={{ fontWeight: 600, color: days <= 30 ? 'var(--color-warning)' : 'var(--color-success)' }}>{days} dagar kvar</span>}
              {days <= 0 && <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Utgånget</span>}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Kontraktsperiod</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{Math.round(progressPct)}% genomfört</span>
          </div>
          <div style={{ height: '6px', background: 'var(--color-bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: days <= 30 ? 'linear-gradient(90deg, var(--color-warning), hsl(30, 80%, 55%))' : 'linear-gradient(90deg, var(--color-primary), hsl(260, 60%, 55%))',
              borderRadius: '3px',
              transition: 'width 500ms ease',
            }} />
          </div>
        </div>
      </div>

      {/* Financial & details */}
      <div className="financial-summary" style={{ marginBottom: '20px' }}>
        <div className="financial-item">
          <div className="financial-value">{formatCurrency(contract.rate)}</div>
          <div className="financial-label">{contract.rateType === 'HOURLY' ? 'Per timme' : contract.rateType === 'MONTHLY' ? 'Per månad' : 'Fast pris'}</div>
        </div>
        <div className="financial-item">
          <div className="financial-value">{contract.estimatedHours || '–'}</div>
          <div className="financial-label">Est. timmar</div>
        </div>
        <div className="financial-item">
          <div className="financial-value">{formatCurrency(totalValue)}</div>
          <div className="financial-label">Totalt kontraktsvärde</div>
        </div>
        <div className="financial-item">
          <div className="financial-value">{formatCurrency(monthlyValue)}</div>
          <div className="financial-label">Månadsintäkt (est.)</div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>👤 Konsult</h3>
          <div className="detail-row">
            <div className="detail-label">Namn</div>
            <div className="detail-value">
              <Link href={`/consultants/${contract.consultant?.id}`}>{contract.consultant?.firstName} {contract.consultant?.lastName}</Link>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Roll</div>
            <div className="detail-value">{contract.consultant?.title || '–'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">E-post</div>
            <div className="detail-value">{contract.consultant?.email}</div>
          </div>
        </div>

        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>🏢 Kund</h3>
          <div className="detail-row">
            <div className="detail-label">Företag</div>
            <div className="detail-value">
              <Link href={`/clients/${contract.client?.id}`}>{contract.client?.name}</Link>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Kontaktperson</div>
            <div className="detail-value">{contract.client?.contactPerson || '–'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">E-post</div>
            <div className="detail-value">{contract.client?.contactEmail || '–'}</div>
          </div>
        </div>
      </div>

      {contract.description && (
        <div className="card no-hover" style={{ marginTop: '20px' }}>
          <h3 className="card-title" style={{ marginBottom: '12px' }}>📝 Beskrivning</h3>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{contract.description}</p>
        </div>
      )}

      {contract.notes && (
        <div className="card no-hover" style={{ marginTop: '20px' }}>
          <h3 className="card-title" style={{ marginBottom: '12px' }}>💬 Anteckningar</h3>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{contract.notes}</p>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Redigera kontrakt</h2>
              <button className="modal-close" onClick={() => setEditing(false)}>×</button>
            </div>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Titel *</label>
                <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Konsult</label>
                <select className="form-input" value={form.consultantId} onChange={e => setForm({...form, consultantId: e.target.value})}>
                  <option value="">Välj konsult...</option>
                  {consultants.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Kund</label>
                <select className="form-input" value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})}>
                  <option value="">Välj kund...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Startdatum</label>
                <input type="date" className="form-input" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Slutdatum</label>
                <input type="date" className="form-input" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Arvode (SEK)</label>
                <input type="number" className="form-input" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Arvodestyp</label>
                <select className="form-input" value={form.rateType} onChange={e => setForm({...form, rateType: e.target.value})}>
                  <option value="HOURLY">Per timme</option>
                  <option value="MONTHLY">Per månad</option>
                  <option value="FIXED">Fast pris</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Est. timmar</label>
                <input type="number" className="form-input" value={form.estimatedHours} onChange={e => setForm({...form, estimatedHours: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option value="DRAFT">Utkast</option>
                  <option value="ACTIVE">Aktivt</option>
                  <option value="EXPIRING_SOON">Löper ut snart</option>
                  <option value="EXPIRED">Utgånget</option>
                  <option value="RENEWED">Förnyat</option>
                  <option value="TERMINATED">Avslutat</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Förnyelsefrist (dagar)</label>
                <input type="number" className="form-input" value={form.renewalNoticeDays} onChange={e => setForm({...form, renewalNoticeDays: e.target.value})} />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Beskrivning</label>
                <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Anteckningar</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={saveContract} disabled={saving || !form.title}>
                {saving ? 'Sparar...' : '💾 Spara ändringar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
