'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

function StatusBadge({ status }) {
  const map = {
    AVAILABLE: { label: 'Tillgänglig', cls: 'success' }, ON_CONTRACT: { label: 'På uppdrag', cls: 'primary' },
    ON_LEAVE: { label: 'Ledig', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`badge ${cls}`}><span className="badge-dot"></span>{label}</span>;
}

export default function GanttPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  // Calculate timeline range
  const { months, startTime, endTime, totalMs } = useMemo(() => {
    if (!data?.contracts?.length) return { months: [], startTime: 0, endTime: 0, totalMs: 1 };
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
    const months = [];
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      months.push(new Date(d));
    }
    return { months, startTime: start.getTime(), endTime: end.getTime(), totalMs: end.getTime() - start.getTime() };
  }, [data]);

  if (loading) return <div className="fade-in" style={{ textAlign: 'center', paddingTop: '100px' }}><p style={{ color: 'var(--color-text-muted)' }}>Laddar beläggningsschema...</p></div>;
  if (!data) return <div className="empty-state"><p>Kunde inte ladda data</p></div>;

  // Group contracts by consultant
  const consultantContracts = {};
  data.consultants?.forEach(c => {
    const name = `${c.firstName} ${c.lastName}`;
    consultantContracts[c.id] = { name, title: c.title, status: c.status, contracts: [] };
  });
  data.contracts?.forEach(c => {
    if (consultantContracts[c.consultantId]) {
      consultantContracts[c.consultantId].contracts.push(c);
    }
  });

  const now = new Date();
  const nowPct = ((now.getTime() - startTime) / totalMs) * 100;

  const totalConsultants = data.consultants?.length || 0;
  const onContract = data.consultants?.filter(c => c.status === 'ON_CONTRACT').length || 0;
  const utilizationRate = totalConsultants > 0 ? Math.round((onContract / totalConsultants) * 100) : 0;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Beläggning & Gantt-schema</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>Visuell översikt av konsulternas tillgänglighet och kontraktsperioder</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Beläggningsgrad</div>
          <div className="stat-value">{utilizationRate}%</div>
          <div className="stat-change" style={{ color: 'var(--color-text-muted)' }}>{onContract} av {totalConsultants} konsulter</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">På uppdrag</div>
          <div className="stat-value">{onContract}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Tillgängliga</div>
          <div className="stat-value">{data.consultants?.filter(c => c.status === 'AVAILABLE').length || 0}</div>
        </div>
        <div className="stat-card neutral" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-label">Lediga</div>
          <div className="stat-value">{data.consultants?.filter(c => c.status === 'ON_LEAVE').length || 0}</div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="card no-hover">
        <div className="card-header">
          <div className="card-title">📅 Kontraktstidslinje</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'linear-gradient(90deg, var(--color-primary), hsl(260, 60%, 55%))', marginRight: 4, verticalAlign: 'middle' }}></span> Aktivt
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'linear-gradient(90deg, var(--color-warning), hsl(30, 80%, 55%))', marginLeft: 12, marginRight: 4, verticalAlign: 'middle' }}></span> Löper ut snart
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'linear-gradient(90deg, var(--color-danger), hsl(340, 60%, 50%))', marginLeft: 12, marginRight: 4, verticalAlign: 'middle', opacity: 0.5 }}></span> Utgånget
          </div>
        </div>

        <div className="gantt-container">
          {/* Month headers */}
          <div className="gantt-months">
            {months.map((m, i) => (
              <div key={i} className="gantt-month">
                {m.toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' })}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ position: 'relative' }}>
            {/* Today line */}
            <div className="gantt-today-line" style={{ left: `calc(180px + 12px + ${nowPct}% * (100% - 192px) / 100%)`, left: `calc(192px + ${nowPct}%)` }}>
              <div style={{ position: 'absolute', top: '-16px', left: '-14px', fontSize: '10px', color: 'var(--color-danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>Idag</div>
            </div>

            {Object.entries(consultantContracts).map(([id, { name, title, status, contracts }]) => (
              <div key={id} className="gantt-row">
                <div className="gantt-label">
                  <Link href={`/consultants/${id}`} style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{name}</Link>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{title}</div>
                </div>
                <div className="gantt-bar-container">
                  {contracts.map(c => {
                    const cStart = Math.max(new Date(c.startDate).getTime(), startTime);
                    const cEnd = Math.min(new Date(c.endDate).getTime(), endTime);
                    if (cEnd < startTime || cStart > endTime) return null;
                    const left = ((cStart - startTime) / totalMs) * 100;
                    const width = ((cEnd - cStart) / totalMs) * 100;
                    const barClass = c.status === 'EXPIRED' || c.status === 'TERMINATED' ? 'expired' : c.status === 'EXPIRING_SOON' ? 'expiring' : 'active';
                    return (
                      <Link href={`/contracts/${c.id}`} key={c.id}>
                        <div className={`gantt-bar ${barClass}`} style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }} title={`${c.title} (${c.client?.name || ''})`}>
                          {width > 8 ? c.title : ''}
                        </div>
                      </Link>
                    );
                  })}
                  {contracts.length === 0 && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {status === 'AVAILABLE' ? 'Tillgänglig' : status === 'ON_LEAVE' ? 'Ledig' : '–'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
