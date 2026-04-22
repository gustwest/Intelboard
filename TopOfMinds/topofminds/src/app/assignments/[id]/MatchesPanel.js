'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateCvAction, updateApplicationStatusAction } from '@/app/assignments/actions';

const SORT_OPTIONS = [
  { value: 'score', label: 'Högst match först' },
  { value: 'available', label: 'Tillgänglighet' },
  { value: 'name', label: 'Namn' },
];

function recommendationLabel(r) {
  switch (r) {
    case 'STRONG_MATCH': return { label: 'Stark match', cls: 'rec-strong' };
    case 'GOOD_MATCH': return { label: 'Bra match', cls: 'rec-good' };
    case 'POSSIBLE': return { label: 'Möjlig', cls: 'rec-possible' };
    case 'POOR': return { label: 'Svag', cls: 'rec-poor' };
    default: return { label: '—', cls: '' };
  }
}

function scoreColor(score) {
  if (score >= 85) return 'score-strong';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-possible';
  return 'score-poor';
}

function downloadCv(cvText, assignment, consultant) {
  const slug = `${consultant.firstName}-${consultant.lastName}-${assignment.title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const blob = new Blob([cvText], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug || 'cv'}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MatchesPanel({ assignment }) {
  const [threshold, setThreshold] = useState(50);
  const [sortBy, setSortBy] = useState('score');
  const [expandedId, setExpandedId] = useState(null);

  const matches = useMemo(() => {
    const filtered = assignment.matches.filter((m) => m.score >= threshold);
    const sorted = [...filtered];
    if (sortBy === 'score') sorted.sort((a, b) => b.score - a.score);
    else if (sortBy === 'name') sorted.sort((a, b) => a.consultant.firstName.localeCompare(b.consultant.firstName));
    else if (sortBy === 'available') {
      sorted.sort((a, b) => {
        const rank = (c) => (c.status === 'AVAILABLE' ? 0 : c.wantsNewAssignment ? 1 : 2);
        return rank(a.consultant) - rank(b.consultant) || b.score - a.score;
      });
    }
    return sorted;
  }, [assignment.matches, threshold, sortBy]);

  if (assignment.matches.length === 0) {
    return (
      <div className="ai-usage-card">
        <h3>Inga matchningar ännu</h3>
        <p className="ai-empty">
          Klicka på "Matcha mot konsulter" för att analysera alla konsultprofiler mot detta uppdrag.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="matches-controls">
        <div className="matches-filter">
          <label>Minsta match: <strong>{threshold}%</strong></label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
        <div className="matches-filter">
          <label>Sortera</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="matches-summary">
          <strong>{matches.length}</strong> av {assignment.matches.length} konsulter ≥ {threshold}%
        </div>
      </div>

      <div className="matches-list">
        {matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            assignment={assignment}
            expanded={expandedId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
          />
        ))}
        {matches.length === 0 && (
          <p className="ai-empty">Ingen konsult matchar tröskeln på {threshold}%.</p>
        )}
      </div>
    </div>
  );
}

function MatchRow({ match, assignment, expanded, onToggle }) {
  const [isPending, startTransition] = useTransition();
  const [cvText, setCvText] = useState(match.application?.tailoredCv || null);
  const [showCv, setShowCv] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  const rec = recommendationLabel(match.recommendation);
  const scoreCls = scoreColor(match.score);

  const generateCv = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await generateCvAction({
        assignmentId: assignment.id,
        consultantId: match.consultant.id,
      });
      if (res.ok) {
        setCvText(res.cvText);
        setShowCv(true);
        router.refresh();
      } else {
        setMsg(res.message);
      }
    });
  };

  const setStatus = (status) => {
    startTransition(async () => {
      if (!match.application) {
        // Should rarely happen; generate CV first creates the application
        return;
      }
      await updateApplicationStatusAction({ applicationId: match.application.id, status });
      router.refresh();
    });
  };

  return (
    <div className="match-card">
      <div className="match-card-head" onClick={onToggle}>
        <div className={`match-score ${scoreCls}`}>{match.score}%</div>
        <div className="match-consultant">
          <div className="match-name">
            {match.consultant.firstName} {match.consultant.lastName}
          </div>
          <div className="match-sub">
            {match.consultant.title || ''}
            {match.consultant.team && <span> · {match.consultant.team}</span>}
            <span className="match-availability">
              {' · '}
              {match.consultant.status === 'AVAILABLE'
                ? 'Tillgänglig'
                : match.consultant.status === 'ON_CONTRACT'
                ? 'På uppdrag'
                : 'Ledig'}
              {match.consultant.wantsNewAssignment && ' · söker nytt'}
            </span>
          </div>
        </div>
        <div className={`match-rec ${rec.cls}`}>{rec.label}</div>
        <div className="match-summary">{match.summary}</div>
        {match.application && (
          <div className={`match-app-status app-${match.application.status.toLowerCase()}`}>
            {match.application.status === 'APPLIED' ? 'Ansökt' :
             match.application.status === 'DRAFT_CV' ? 'CV-utkast' :
             match.application.status === 'WON' ? 'Vunnet' :
             match.application.status === 'REJECTED' ? 'Avvisad' :
             match.application.status}
          </div>
        )}
      </div>

      {expanded && (
        <div className="match-card-body">
          {match.strengths.length > 0 && (
            <div className="match-section">
              <h4>Styrkor</h4>
              <ul>{match.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {match.concerns.length > 0 && (
            <div className="match-section">
              <h4>Att tänka på</h4>
              <ul>{match.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          <div className="match-skill-cols">
            {match.matchedSkills.length > 0 && (
              <div className="match-section">
                <h4>Matchade skills</h4>
                <div className="skill-chips">
                  {match.matchedSkills.map((s) => <span key={s} className="skill-chip skill-chip-matched">{s}</span>)}
                </div>
              </div>
            )}
            {match.missingSkills.length > 0 && (
              <div className="match-section">
                <h4>Saknas</h4>
                <div className="skill-chips">
                  {match.missingSkills.map((s) => <span key={s} className="skill-chip skill-chip-missing">{s}</span>)}
                </div>
              </div>
            )}
          </div>

          <div className="match-actions">
            <button onClick={generateCv} disabled={isPending} className="ai-toggle-btn">
              {isPending && !cvText ? 'Genererar…' : cvText ? 'Generera nytt CV' : 'Generera skräddarsytt CV'}
            </button>
            {cvText && (
              <>
                <button onClick={() => setShowCv(!showCv)} className="ai-toggle-btn">
                  {showCv ? 'Dölj CV' : 'Visa CV'}
                </button>
                <button onClick={() => downloadCv(cvText, assignment, match.consultant)} className="ai-toggle-btn">
                  Ladda ner (.md)
                </button>
                <button onClick={() => navigator.clipboard.writeText(cvText)} className="ai-toggle-btn">
                  Kopiera
                </button>
              </>
            )}
            {match.application && (
              <>
                <button onClick={() => setStatus('APPLIED')} disabled={isPending} className="ai-toggle-btn">
                  Markera som ansökt
                </button>
                <button onClick={() => setStatus('WON')} disabled={isPending} className="ai-toggle-btn">
                  Vunnet
                </button>
                <button onClick={() => setStatus('WITHDRAWN')} disabled={isPending} className="ai-toggle-btn">
                  Dra tillbaka
                </button>
              </>
            )}
          </div>
          {msg && <p className="auth-error" style={{ marginTop: 8 }}>{msg}</p>}

          {showCv && cvText && (
            <div className="match-cv">
              <pre className="match-cv-text">{cvText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
