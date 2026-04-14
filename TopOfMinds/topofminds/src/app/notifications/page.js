'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function NotificationsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar notifikationer...</p></div>;

  // Get all contracts that need attention
  const now = new Date();
  const urgentContracts = data?.contracts?.filter(c => {
    const days = Math.ceil((new Date(c.endDate) - now) / (1000*60*60*24));
    return days > 0 && days <= 60 && (c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON');
  }).sort((a, b) => new Date(a.endDate) - new Date(b.endDate)) || [];

  const expiredContracts = data?.contracts?.filter(c => c.status === 'EXPIRED') || [];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Notifikationer</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>Förnyelsepåminnelser och kontraktsvarningar</p>
        </div>
      </div>

      {urgentContracts.length > 0 && (
        <div className="card no-hover" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title">⏰ Kontrakt som kräver åtgärd</div>
          </div>
          {urgentContracts.map(c => {
            const days = Math.ceil((new Date(c.endDate) - now) / (1000*60*60*24));
            return (
              <Link href={`/contracts/${c.id}`} key={c.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className={`alert-item ${days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'info'}`}>
                  <div className="alert-item-icon">{days <= 7 ? '🔴' : days <= 30 ? '🟡' : '🔵'}</div>
                  <div className="alert-item-content">
                    <div className="alert-item-title">{c.title}</div>
                    <div className="alert-item-sub">
                      {c.consultant?.firstName} {c.consultant?.lastName} → {c.client?.name} · Löper ut om {days} dagar
                      {days <= c.renewalNoticeDays && ' · Påbörja förhandling!'}
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: days <= 7 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                    {days}d
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {expiredContracts.length > 0 && (
        <div className="card no-hover">
          <div className="card-header">
            <div className="card-title">📋 Utgångna kontrakt</div>
          </div>
          {expiredContracts.map(c => (
            <Link href={`/contracts/${c.id}`} key={c.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="alert-item danger">
                <div className="alert-item-icon">⚠️</div>
                <div className="alert-item-content">
                  <div className="alert-item-title">{c.title}</div>
                  <div className="alert-item-sub">
                    {c.consultant?.firstName} {c.consultant?.lastName} → {c.client?.name} · Utgånget {new Date(c.endDate).toLocaleDateString('sv-SE')}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {urgentContracts.length === 0 && expiredContracts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <p className="empty-state-text">Inga aktiva varningar</p>
          <p className="empty-state-sub">Alla kontrakt ser bra ut för tillfället</p>
        </div>
      )}
    </div>
  );
}
