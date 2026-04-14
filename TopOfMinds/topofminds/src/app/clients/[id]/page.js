'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

function formatCurrency(a) { if (!a) return '–'; return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(a); }
function formatDate(d) { return new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }); }

function StatusBadge({ status }) {
  const map = {
    ACTIVE: { label: 'Aktivt', cls: 'success' }, EXPIRING_SOON: { label: 'Löper ut snart', cls: 'warning' },
    EXPIRED: { label: 'Utgånget', cls: 'danger' }, TERMINATED: { label: 'Avslutat', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`badge ${cls}`}><span className="badge-dot"></span>{label}</span>;
}

export default function ClientDetailPage() {
  const params = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${params.id}`).then(r => r.json()).then(d => { setClient(d); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar...</p></div>;
  if (!client) return <div className="empty-state"><p>Kund hittades inte</p></div>;

  const activeContracts = client.contracts?.filter(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') || [];
  const historicalContracts = client.contracts?.filter(c => c.status === 'EXPIRED' || c.status === 'TERMINATED') || [];
  const totalValue = client.contracts?.reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0) || 0;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '20px' }}>
        <Link href="/clients" className="btn btn-ghost btn-sm">← Tillbaka till kunder</Link>
      </div>

      <div className="card no-hover" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary), hsl(260, 60%, 55%))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'white', fontWeight: 700 }}>
            {client.name[0]}
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{client.name}</h1>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>{client.orgNumber || 'Saknar org.nummer'}</span>
          </div>
        </div>
      </div>

      <div className="financial-summary" style={{ marginBottom: '20px' }}>
        <div className="financial-item"><div className="financial-value">{activeContracts.length}</div><div className="financial-label">Aktiva kontrakt</div></div>
        <div className="financial-item"><div className="financial-value">{historicalContracts.length}</div><div className="financial-label">Historiska kontrakt</div></div>
        <div className="financial-item"><div className="financial-value">{formatCurrency(totalValue)}</div><div className="financial-label">Totalt kontraktsvärde</div></div>
      </div>

      <div className="detail-grid">
        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>📧 Kontaktuppgifter</h3>
          <div className="detail-row"><div className="detail-label">Kontaktperson</div><div className="detail-value">{client.contactPerson || '–'}</div></div>
          <div className="detail-row"><div className="detail-label">E-post</div><div className="detail-value">{client.contactEmail || '–'}</div></div>
          <div className="detail-row"><div className="detail-label">Telefon</div><div className="detail-value">{client.contactPhone || '–'}</div></div>
          <div className="detail-row"><div className="detail-label">Adress</div><div className="detail-value">{client.address || '–'}</div></div>
        </div>
        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>📝 Anteckningar</h3>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{client.notes || 'Inga anteckningar'}</p>
        </div>
      </div>

      <div className="card no-hover" style={{ marginTop: '20px' }}>
        <div className="card-header"><div className="card-title">📄 Alla kontrakt</div></div>
        <div className="data-table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead><tr><th>Titel</th><th>Konsult</th><th>Period</th><th>Arvode</th><th>Status</th></tr></thead>
            <tbody>
              {client.contracts?.map(c => (
                <tr key={c.id}>
                  <td><Link href={`/contracts/${c.id}`} style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.title}</Link></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.consultant?.firstName} {c.consultant?.lastName}</td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{formatDate(c.startDate)} – {formatDate(c.endDate)}</td>
                  <td style={{ fontWeight: 500 }}>{formatCurrency(c.rate)}/h</td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
