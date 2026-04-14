'use client';

import { useState, useEffect } from 'react';

function formatCurrency(a) { if (!a) return '–'; return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(a); }

export default function FinancialsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar ekonomisk översikt...</p></div>;
  if (!data) return <div className="empty-state"><p>Kunde inte ladda data</p></div>;

  const activeContracts = data.contracts?.filter(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') || [];
  const expiredContracts = data.contracts?.filter(c => c.status === 'EXPIRED' || c.status === 'TERMINATED') || [];

  const totalMonthlyRevenue = activeContracts.reduce((sum, c) => {
    if (c.rateType === 'HOURLY') return sum + (c.rate || 0) * 160;
    if (c.rateType === 'MONTHLY') return sum + (c.rate || 0);
    return sum;
  }, 0);

  const totalActiveValue = activeContracts.reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0);
  const totalHistoricalValue = expiredContracts.reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0);
  const avgHourlyRate = activeContracts.length > 0 ? activeContracts.reduce((sum, c) => sum + (c.rate || 0), 0) / activeContracts.length : 0;
  const totalEstHours = activeContracts.reduce((sum, c) => sum + (c.estimatedHours || 0), 0);
  const yearlyProjection = totalMonthlyRevenue * 12;

  // Per-consultant breakdown
  const consultantRevenue = {};
  activeContracts.forEach(c => {
    const name = c.consultant ? `${c.consultant.firstName} ${c.consultant.lastName}` : 'Okänd';
    if (!consultantRevenue[name]) consultantRevenue[name] = { monthly: 0, total: 0, hours: 0, rate: 0, contracts: 0 };
    const monthly = c.rateType === 'HOURLY' ? (c.rate || 0) * 160 : (c.rate || 0);
    consultantRevenue[name].monthly += monthly;
    consultantRevenue[name].total += (c.rate || 0) * (c.estimatedHours || 0);
    consultantRevenue[name].hours += c.estimatedHours || 0;
    consultantRevenue[name].rate = c.rate || 0;
    consultantRevenue[name].contracts += 1;
  });

  // Per-client breakdown
  const clientRevenue = {};
  activeContracts.forEach(c => {
    const name = c.client?.name || 'Okänd';
    if (!clientRevenue[name]) clientRevenue[name] = { total: 0, monthly: 0, contracts: 0 };
    const monthly = c.rateType === 'HOURLY' ? (c.rate || 0) * 160 : (c.rate || 0);
    clientRevenue[name].monthly += monthly;
    clientRevenue[name].total += (c.rate || 0) * (c.estimatedHours || 0);
    clientRevenue[name].contracts += 1;
  });

  // Revenue bar - find max for scaling
  const maxConsultantMonthly = Math.max(...Object.values(consultantRevenue).map(v => v.monthly), 1);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Ekonomisk översikt</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>Arvoden, intäkter och ekonomisk sammanställning</p>
        </div>
      </div>

      {/* Main stats */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Månadsintäkt (est.)</div>
          <div className="stat-value" style={{ fontSize: '24px' }}>{formatCurrency(totalMonthlyRevenue)}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>baserat på 160h/mån</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Årlig projektion</div>
          <div className="stat-value" style={{ fontSize: '24px' }}>{formatCurrency(yearlyProjection)}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Aktivt kontraktsvärde</div>
          <div className="stat-value" style={{ fontSize: '24px' }}>{formatCurrency(totalActiveValue)}</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Historiskt levererat</div>
          <div className="stat-value" style={{ fontSize: '24px' }}>{formatCurrency(totalHistoricalValue)}</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card neutral" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-label">Snitt timarvode</div>
          <div className="stat-value">{formatCurrency(avgHourlyRate)}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>per timme</div>
        </div>
        <div className="stat-card neutral" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-label">Totalt est. timmar</div>
          <div className="stat-value">{totalEstHours.toLocaleString('sv-SE')}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>aktiva kontrakt</div>
        </div>
        <div className="stat-card neutral" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-label">Aktiva kontrakt</div>
          <div className="stat-value">{activeContracts.length}</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>{expiredContracts.length} historiska</div>
        </div>
      </div>

      {/* Revenue by consultant */}
      <div className="card no-hover" style={{ marginTop: '8px' }}>
        <div className="card-header">
          <div className="card-title">👤 Intäkt per konsult</div>
        </div>
        <div className="data-table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr><th>Konsult</th><th>Arvode/h</th><th>Est. timmar</th><th>Månadsintäkt</th><th>Totalt värde</th><th style={{ width: '200px' }}>Andel</th></tr>
            </thead>
            <tbody>
              {Object.entries(consultantRevenue)
                .sort((a, b) => b[1].monthly - a[1].monthly)
                .map(([name, v]) => (
                  <tr key={name}>
                    <td style={{ fontWeight: 500 }}>{name}</td>
                    <td>{formatCurrency(v.rate)}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{v.hours.toLocaleString('sv-SE')}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(v.monthly)}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(v.total)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${(v.monthly / maxConsultantMonthly) * 100}%`,
                            background: 'linear-gradient(90deg, var(--color-primary), hsl(260, 60%, 55%))',
                            borderRadius: 4,
                            transition: 'width 500ms ease'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', minWidth: '35px' }}>{Math.round((v.monthly / totalMonthlyRevenue) * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by client */}
      <div className="card no-hover" style={{ marginTop: '20px' }}>
        <div className="card-header">
          <div className="card-title">🏢 Intäkt per kund</div>
        </div>
        <div className="data-table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr><th>Kund</th><th>Aktiva kontrakt</th><th>Månadsintäkt</th><th>Totalt kontraktsvärde</th></tr>
            </thead>
            <tbody>
              {Object.entries(clientRevenue)
                .sort((a, b) => b[1].monthly - a[1].monthly)
                .map(([name, v]) => (
                  <tr key={name}>
                    <td style={{ fontWeight: 500 }}>{name}</td>
                    <td><span className="badge primary">{v.contracts}</span></td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(v.monthly)}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(v.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
