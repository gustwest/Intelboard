'use client';

import { useTransition, useState } from 'react';
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

export default function AssignmentHeader({ assignment }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const router = useRouter();

  const onRunMatching = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await triggerMatchingAction(assignment.id);
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
        <div className="assignment-actions">
          <button onClick={onRunMatching} disabled={isPending} className="ai-save-btn">
            {isPending ? 'Kör matchning…' : assignment.matches.length > 0 ? 'Kör om matchning' : 'Matcha mot konsulter'}
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
                {dl !== null && <span className={dl <= 2 ? 'ai-off' : ''} style={{ marginLeft: 6 }}>({dl}d)</span>}
              </>
            ) : '—'}
          </div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Timmar</div>
          <div className="assignment-kpi-value">{assignment.estimatedHours || '—'}</div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Pris</div>
          <div className="assignment-kpi-value">
            {assignment.rateMin || assignment.rateMax ? (
              <>
                {assignment.rateMin || '?'}-{assignment.rateMax || '?'} kr
                <span className="ai-model-id" style={{ marginLeft: 4 }}>
                  {assignment.rateType === 'MONTHLY' ? '/mån' : assignment.rateType === 'FIXED' ? ' fast' : '/h'}
                </span>
              </>
            ) : '—'}
          </div>
        </div>
        <div className="assignment-kpi">
          <div className="assignment-kpi-label">Extraktion</div>
          <div className="assignment-kpi-value">
            {assignment.extractionConfidence != null
              ? `${Math.round(assignment.extractionConfidence * 100)}% säkerhet`
              : '—'}
          </div>
        </div>
      </div>

      <div className="assignment-desc">
        <p>{assignment.description}</p>
      </div>

      <div className="assignment-skills">
        {assignment.requiredSkills.length > 0 && (
          <div>
            <div className="assignment-skills-label">Skallkrav</div>
            <div className="skill-chips">
              {assignment.requiredSkills.map((s) => (
                <span key={s} className="skill-chip skill-chip-required">{s}</span>
              ))}
            </div>
          </div>
        )}
        {assignment.preferredSkills.length > 0 && (
          <div>
            <div className="assignment-skills-label">Meriterande</div>
            <div className="skill-chips">
              {assignment.preferredSkills.map((s) => (
                <span key={s} className="skill-chip">{s}</span>
              ))}
            </div>
          </div>
        )}
        {assignment.languageRequirements.length > 0 && (
          <div>
            <div className="assignment-skills-label">Språk</div>
            <div className="skill-chips">
              {assignment.languageRequirements.map((s) => (
                <span key={s} className="skill-chip">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
