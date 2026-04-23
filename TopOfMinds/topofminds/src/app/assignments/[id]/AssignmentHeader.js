'use client';

import { useTransition, useState, useRef, useEffect } from 'react';
import { triggerMatchingAction } from '@/app/assignments/actions';
import { useRouter } from 'next/navigation';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('sv-SE');
}

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function ConsultantSelector({ consultants, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: selected.length > 0 ? 'rgba(99,102,241,0.15)' : 'transparent',
          color: selected.length > 0 ? '#a5b4fc' : 'var(--color-text-muted, #94a3b8)',
          fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {selected.length === 0 ? 'Alla konsulter' : `${selected.length} valda`} ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 280, maxHeight: 360, overflowY: 'auto',
          background: 'var(--color-bg-secondary, #1e2433)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 50, padding: 8,
        }}>
          <div style={{ padding: '4px 8px 8px', fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)' }}>
            Välj specifika konsulter (tomt = alla)
          </div>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} style={{
              width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '0.8rem',
              color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6,
            }}>✕ Rensa val</button>
          )}
          {consultants.map((c) => (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 6, cursor: 'pointer',
              background: selected.includes(c.id) ? 'rgba(99,102,241,0.12)' : 'transparent',
            }}>
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: '#6366f1' }} />
              <div>
                <div style={{ fontSize: '0.83rem', color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 500 }}>
                  {c.firstName} {c.lastName}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                  {c.title || ''}
                  {c.status === 'AVAILABLE' && <span style={{ color: '#34d399', marginLeft: 4 }}>● Tillgänglig</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssignmentHeader({ assignment, consultants = [] }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const [selectedConsultants, setSelectedConsultants] = useState([]);
  const router = useRouter();

  const onRunMatching = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await triggerMatchingAction(
        assignment.id,
        selectedConsultants.length > 0 ? selectedConsultants : null
      );
      if (res.ok) {
        setMessage(`Matchning klar: ${res.matchesCount} konsulter analyserade${res.errorsCount ? `, ${res.errorsCount} fel` : ''}.`);
        router.refresh();
      } else {
        setMessage(`Fel: ${res.message}`);
      }
    });
  };

  const dl = daysUntil(assignment.applicationDeadline);

  return (
    <div className="assignment-header">
      <div className="assignment-title-row">
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{assignment.title}</h1>
          <div className="assignment-meta">
            {assignment.clientName && <span>{assignment.clientName}</span>}
            {assignment.location && <span>· {assignment.location}</span>}
            {assignment.seniority && <span>· {assignment.seniority}</span>}
            {assignment.brokerName && <span>· Via {assignment.brokerName}</span>}
          </div>
        </div>
        <div className="assignment-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {consultants.length > 0 && (
            <ConsultantSelector
              consultants={consultants}
              selected={selectedConsultants}
              onChange={setSelectedConsultants}
            />
          )}
          <button onClick={onRunMatching} disabled={isPending} className="ai-save-btn">
            {isPending
              ? 'Matchar…'
              : assignment.matches.length > 0
                ? `Kör om${selectedConsultants.length > 0 ? ` (${selectedConsultants.length})` : ''}`
                : `Matcha mot${selectedConsultants.length > 0 ? ` ${selectedConsultants.length}` : ' alla'}`}
          </button>
        </div>
      </div>

      {message && <div className="assignment-inline-msg">{message}</div>}

      <div className="assignment-kpis">
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Period</div>
          <div className="assignment-kpi-value">{fmtDate(assignment.startDate)} → {fmtDate(assignment.endDate)}</div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Deadline</div>
          <div className="assignment-kpi-value">
            {assignment.applicationDeadline ? (
              <>
                {fmtDate(assignment.applicationDeadline)}
                {dl !== null && (
                  <span className={dl <= 2 ? 'ai-off' : ''} style={{ marginLeft: 6 }}>
                    ({dl < 0 ? 'utgången' : dl === 0 ? 'idag' : `${dl}d`})
                  </span>
                )}
              </>
            ) : '—'}
          </div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Timmar</div>
          <div className="assignment-kpi-value">{assignment.estimatedHours || '—'}</div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Arvode</div>
          <div className="assignment-kpi-value">
            {assignment.rateMin || assignment.rateMax ? (
              <>
                {assignment.rateMin || '?'}–{assignment.rateMax || '?'} kr
                <span className="ai-model-id" style={{ marginLeft: 4 }}>
                  {assignment.rateType === 'MONTHLY' ? '/mån' : assignment.rateType === 'FIXED' ? ' fast' : '/h'}
                </span>
              </>
            ) : '—'}
          </div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">AI-extraktion</div>
          <div className="assignment-kpi-value">
            {assignment.extractionConfidence != null ? `${Math.round(assignment.extractionConfidence * 100)}%` : '—'}
          </div>
        </div>
      </div>

      <div className="assignment-desc"><p>{assignment.description}</p></div>

      <div className="assignment-skills">
        {assignment.requiredSkills.length > 0 && (
          <div>
            <div className="assignment-skills-label">Skallkrav</div>
            <div className="skill-chips">
              {assignment.requiredSkills.map((s) => <span key={s} className="skill-chip skill-chip-required">{s}</span>)}
            </div>
          </div>
        )}
        {assignment.preferredSkills.length > 0 && (
          <div>
            <div className="assignment-skills-label">Meriterande</div>
            <div className="skill-chips">
              {assignment.preferredSkills.map((s) => <span key={s} className="skill-chip">{s}</span>)}
            </div>
          </div>
        )}
        {assignment.languageRequirements.length > 0 && (
          <div>
            <div className="assignment-skills-label">Språk</div>
            <div className="skill-chips">
              {assignment.languageRequirements.map((s) => <span key={s} className="skill-chip">{s}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
