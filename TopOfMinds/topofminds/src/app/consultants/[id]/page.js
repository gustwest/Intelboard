'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const AVATAR_COLORS = [
  'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(260, 60%, 55%))',
  'linear-gradient(135deg, hsl(160, 60%, 45%), hsl(200, 50%, 50%))',
  'linear-gradient(135deg, hsl(340, 60%, 50%), hsl(20, 70%, 55%))',
  'linear-gradient(135deg, hsl(40, 80%, 50%), hsl(20, 70%, 55%))',
  'linear-gradient(135deg, hsl(280, 50%, 55%), hsl(320, 60%, 50%))',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatCurrency(amount) {
  if (!amount) return '–';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(date) {
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE: { label: 'Aktivt', cls: 'success' },
    EXPIRING_SOON: { label: 'Löper ut snart', cls: 'warning' },
    EXPIRED: { label: 'Utgånget', cls: 'danger' },
    DRAFT: { label: 'Utkast', cls: 'neutral' },
    RENEWED: { label: 'Förnyat', cls: 'primary' },
    TERMINATED: { label: 'Avslutat', cls: 'neutral' },
    AVAILABLE: { label: 'Tillgänglig', cls: 'success' },
    ON_CONTRACT: { label: 'På uppdrag', cls: 'primary' },
    ON_LEAVE: { label: 'Ledig', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`badge ${cls}`}><span className="badge-dot"></span>{label}</span>;
}

function parseSkills(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export default function ConsultantDetailPage() {
  const params = useParams();
  const [consultant, setConsultant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/consultants/${params.id}`)
      .then(r => r.json())
      .then(d => { setConsultant(d); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar...</p></div>;
  if (!consultant) return <div className="empty-state"><p>Konsult hittades inte</p></div>;

  const name = `${consultant.firstName} ${consultant.lastName}`;
  const skills = parseSkills(consultant.skills);
  const activeContracts = consultant.contracts?.filter(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') || [];
  const historicalContracts = consultant.contracts?.filter(c => c.status === 'EXPIRED' || c.status === 'TERMINATED' || c.status === 'RENEWED') || [];
  
  // Calculate total historical earnings
  const totalHistoricalValue = historicalContracts.reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0);
  const totalActiveValue = activeContracts.reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0);

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '20px' }}>
        <Link href="/consultants" className="btn btn-ghost btn-sm">← Tillbaka till konsulter</Link>
      </div>

      {/* Profile header */}
      <div className="card no-hover" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div className="consultant-avatar" style={{ width: 72, height: 72, fontSize: 28, background: getAvatarColor(name) }}>
            {consultant.firstName[0]}{consultant.lastName[0]}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>{name}</h1>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '15px', marginBottom: '8px' }}>{consultant.title}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={consultant.status} />
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>·</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{formatCurrency(consultant.hourlyRate)}/h</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>·</span>
              <Link href={`/consultants/${consultant.id}/cv`} className="btn btn-primary btn-sm" style={{ fontSize: '13px', padding: '5px 14px' }}>📄 Visa CV</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        {/* Contact info */}
        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>📧 Kontaktuppgifter</h3>
          <div className="detail-row">
            <div className="detail-label">E-post</div>
            <div className="detail-value">{consultant.email}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Telefon</div>
            <div className="detail-value">{consultant.phone || '–'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Registrerad</div>
            <div className="detail-value">{formatDate(consultant.createdAt)}</div>
          </div>
          {consultant.notes && (
            <div className="detail-row">
              <div className="detail-label">Anteckningar</div>
              <div className="detail-value" style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{consultant.notes}</div>
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="detail-section">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>🛠 Kompetenser</h3>
          {skills.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {skills.map(skill => <span key={skill} className="skill-tag" style={{ fontSize: '13px', padding: '5px 12px' }}>{skill}</span>)}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)' }}>Inga kompetenser registrerade</p>
          )}

          {/* Financial summary */}
          <div className="financial-summary" style={{ marginTop: '24px' }}>
            <div className="financial-item">
              <div className="financial-value">{formatCurrency(consultant.hourlyRate)}</div>
              <div className="financial-label">Timarvode</div>
            </div>
            <div className="financial-item">
              <div className="financial-value">{formatCurrency(totalActiveValue)}</div>
              <div className="financial-label">Aktivt kontraktsvärde</div>
            </div>
            <div className="financial-item">
              <div className="financial-value">{formatCurrency(totalHistoricalValue)}</div>
              <div className="financial-label">Historiskt värde</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active contracts */}
      <div className="card no-hover" style={{ marginTop: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">📄 Aktiva kontrakt</div>
            <div className="card-subtitle">{activeContracts.length} pågående</div>
          </div>
        </div>
        {activeContracts.length > 0 ? (
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr><th>Titel</th><th>Kund</th><th>Period</th><th>Arvode</th><th>Dagar kvar</th><th>Status</th></tr>
              </thead>
              <tbody>
                {activeContracts.map(c => (
                  <tr key={c.id}>
                    <td><Link href={`/contracts/${c.id}`} style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.title}</Link></td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{c.client?.name}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{formatDate(c.startDate)} – {formatDate(c.endDate)}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(c.rate)}/h</td>
                    <td>
                      <span style={{ fontWeight: 600, color: daysUntil(c.endDate) <= 30 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                        {daysUntil(c.endDate)}d
                      </span>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '30px' }}><p className="empty-state-text">Inga aktiva kontrakt</p></div>
        )}
      </div>

      {/* Historical contracts */}
      {historicalContracts.length > 0 && (
        <div className="card no-hover" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <div>
              <div className="card-title">📜 Kontraktshistorik</div>
              <div className="card-subtitle">{historicalContracts.length} avslutade uppdrag</div>
            </div>
          </div>
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr><th>Titel</th><th>Kund</th><th>Period</th><th>Dåvarande arvode</th><th>Est. timmar</th><th>Värde</th><th>Status</th></tr>
              </thead>
              <tbody>
                {historicalContracts.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.title}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{c.client?.name}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{formatDate(c.startDate)} – {formatDate(c.endDate)}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(c.rate)}/h</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{c.estimatedHours || '–'}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency((c.rate || 0) * (c.estimatedHours || 0))}</td>
                    <td><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
