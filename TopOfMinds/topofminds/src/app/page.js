'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

function formatCurrency(amount) {
  if (!amount) return '–';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(amount);
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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <p style={{ color: 'var(--color-text-muted)' }}>Laddar dashboard...</p>
      </div>
    );
  }

  if (!data || data.error) {
    return <div className="empty-state"><div className="empty-state-icon">⚠️</div><p>Kunde inte ladda dashboard</p></div>;
  }

  const { stats, expiringSoonContracts, notifications } = data;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Översikt över konsulter, kontrakt och förnyelser
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/contracts" className="btn btn-primary">
            + Nytt kontrakt
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Konsulter</div>
          <div className="stat-value">{stats.totalConsultants}</div>
          <div className="stat-change" style={{ color: 'var(--color-success)' }}>
            {stats.availableConsultants} tillgängliga
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Aktiva kontrakt</div>
          <div className="stat-value">{stats.activeContracts}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>
            av {stats.totalClients} kunder
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Löper ut inom 30d</div>
          <div className="stat-value">{stats.expiringSoon30}</div>
          <div className="stat-change" style={{ color: 'var(--color-warning)' }}>
            Kräver åtgärd
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Mån. intäkt (est.)</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>{formatCurrency(stats.totalMonthlyRevenue)}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>
            baserat på 160h/mån
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Expiring contracts */}
        <div className="card no-hover">
          <div className="card-header">
            <div>
              <div className="card-title">⏰ Kontrakt som löper ut</div>
              <div className="card-subtitle">Inom 60 dagar</div>
            </div>
            <Link href="/contracts" className="btn btn-ghost btn-sm">Visa alla →</Link>
          </div>
          {expiringSoonContracts.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px' }}>
              <p className="empty-state-text">Inga kontrakt löper ut snart</p>
            </div>
          ) : (
            expiringSoonContracts.map(contract => {
              const days = daysUntil(contract.endDate);
              const urgency = days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'info';
              return (
                <Link href={`/contracts/${contract.id}`} key={contract.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className={`alert-item ${urgency}`}>
                    <div className="alert-item-icon">{days <= 7 ? '🔴' : days <= 30 ? '🟡' : '🔵'}</div>
                    <div className="alert-item-content">
                      <div className="alert-item-title">{contract.title}</div>
                      <div className="alert-item-sub">
                        {contract.consultant?.firstName} {contract.consultant?.lastName} → {contract.client?.name} · {days} dagar kvar
                      </div>
                    </div>
                    <StatusBadge status={contract.status} />
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Notifications */}
        <div className="card no-hover">
          <div className="card-header">
            <div>
              <div className="card-title">🔔 Senaste notiser</div>
              <div className="card-subtitle">{notifications.length} olästa</div>
            </div>
          </div>
          {notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px' }}>
              <p className="empty-state-text">Inga nya notiser</p>
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`alert-item ${n.type === 'EXPIRATION' ? 'danger' : 'warning'}`}>
                <div className="alert-item-icon">{n.type === 'EXPIRATION' ? '⚠️' : '📋'}</div>
                <div className="alert-item-content">
                  <div className="alert-item-title">{n.message}</div>
                  <div className="alert-item-sub">
                    {new Date(n.triggerDate).toLocaleDateString('sv-SE')}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick overview - consultant utilization */}
      <div className="card no-hover" style={{ marginTop: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">👥 Konsultöversikt</div>
            <div className="card-subtitle">Status och nuvarande uppdrag</div>
          </div>
          <Link href="/consultants" className="btn btn-ghost btn-sm">Alla konsulter →</Link>
        </div>
        <div className="data-table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Konsult</th>
                <th>Roll</th>
                <th>Status</th>
                <th>Aktuellt uppdrag</th>
                <th>Arvode</th>
              </tr>
            </thead>
            <tbody>
              {data.consultants?.slice(0, 8).map(consultant => {
                const activeContract = consultant.contracts?.find(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON');
                const name = `${consultant.firstName} ${consultant.lastName}`;
                return (
                  <tr key={consultant.id}>
                    <td>
                      <Link href={`/consultants/${consultant.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'inherit' }}>
                        <div className="consultant-avatar" style={{ width: 32, height: 32, fontSize: 13, background: getAvatarColor(name) }}>
                          {consultant.firstName[0]}{consultant.lastName[0]}
                        </div>
                        <span style={{ fontWeight: 500 }}>{name}</span>
                      </Link>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{consultant.title}</td>
                    <td><StatusBadge status={consultant.status} /></td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                      {activeContract ? activeContract.title : '–'}
                    </td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(consultant.hourlyRate)}/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
