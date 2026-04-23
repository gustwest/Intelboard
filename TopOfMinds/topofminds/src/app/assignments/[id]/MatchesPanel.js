'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateCvAction, updateApplicationStatusAction, updateCvDraftAction } from '@/app/assignments/actions';

const SORT_OPTIONS = [
  { value: 'score', label: 'Högst match' },
  { value: 'available', label: 'Tillgänglighet' },
  { value: 'name', label: 'Namn' },
];

function recommendationLabel(r) {
  switch (r) {
    case 'STRONG_MATCH': return { label: 'Stark match', color: '#34d399', bg: 'rgba(52,211,153,0.12)' };
    case 'GOOD_MATCH':   return { label: 'Bra match',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
    case 'POSSIBLE':     return { label: 'Möjlig',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' };
    case 'POOR':         return { label: 'Svag',        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' };
    default: return { label: '—', color: '#64748b', bg: 'transparent' };
  }
}

function ScoreRing({ score }) {
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : score >= 40 ? '#60a5fa' : '#94a3b8';
  return (
    <div style={{
      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
      boxShadow: `0 0 0 2px rgba(0,0,0,0.4)`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: 'var(--color-bg-primary, #0f1117)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.78rem', fontWeight: 700, color,
      }}>
        {score}%
      </div>
    </div>
  );
}

function downloadCv(cvText, assignment, consultant) {
  const slug = `${consultant.firstName}-${consultant.lastName}-${assignment.title}`
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const blob = new Blob([cvText], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug || 'cv'}.md`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function MatchesPanel({ assignment }) {
  const [threshold, setThreshold] = useState(50);
  const [sortBy, setSortBy] = useState('score');
  const [expandedId, setExpandedId] = useState(null);

  const matches = useMemo(() => {
    const filtered = assignment.matches.filter((m) => m.score >= threshold);
    return [...filtered].sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'name') return a.consultant.firstName.localeCompare(b.consultant.firstName);
      if (sortBy === 'available') {
        const rank = (c) => (c.status === 'AVAILABLE' ? 0 : c.wantsNewAssignment ? 1 : 2);
        return rank(a.consultant) - rank(b.consultant) || b.score - a.score;
      }
      return 0;
    });
  }, [assignment.matches, threshold, sortBy]);

  if (assignment.matches.length === 0) {
    return (
      <div className="ai-usage-card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
        <h3>Inga matchningar ännu</h3>
        <p className="ai-empty">Klicka på "Matcha mot alla" ovan för att köra AI-matchning mot alla konsultprofiler.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="matches-controls">
        <div className="matches-filter">
          <label>Minsta match: <strong>{threshold}%</strong></label>
          <input type="range" min={0} max={100} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </div>
        <div className="matches-filter">
          <label>Sortera</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="matches-summary">
          <strong>{matches.length}</strong> av {assignment.matches.length} ≥ {threshold}%
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
          <p className="ai-empty">Ingen konsult matchar tröskeln {threshold}%.</p>
        )}
      </div>
    </div>
  );
}

function MatchRow({ match, assignment, expanded, onToggle }) {
  const [isPending, startTransition] = useTransition();
  const [cvText, setCvText] = useState(match.application?.tailoredCv || null);
  const [cvEdited, setCvEdited] = useState(cvText || '');
  const [showCv, setShowCv] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  const rec = recommendationLabel(match.recommendation);

  const generateCv = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await generateCvAction({ assignmentId: assignment.id, consultantId: match.consultant.id });
      if (res.ok) {
        setCvText(res.cvText);
        setCvEdited(res.cvText);
        setShowCv(true);
        setEditing(false);
        router.refresh();
      } else {
        setMsg(res.message);
      }
    });
  };

  const saveCvDraft = () => {
    if (!match.application?.id) return;
    setSaveMsg(null);
    startTransition(async () => {
      const res = await updateCvDraftAction({ applicationId: match.application.id, tailoredCv: cvEdited });
      if (res.ok) {
        setCvText(cvEdited);
        setEditing(false);
        setSaveMsg('Sparat');
        setTimeout(() => setSaveMsg(null), 2000);
      } else {
        setSaveMsg(`Fel: ${res.message}`);
      }
    });
  };

  const setStatus = (status) => {
    if (!match.application) return;
    startTransition(async () => {
      await updateApplicationStatusAction({ applicationId: match.application.id, status });
      router.refresh();
    });
  };

  return (
    <div className="match-card">
      {/* Header row — always visible */}
      <div className="match-card-head" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <ScoreRing score={match.score} />

        <div className="match-consultant" style={{ flex: 1 }}>
          <div className="match-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {match.consultant.firstName} {match.consultant.lastName}
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: rec.color, background: rec.bg }}>
              {rec.label}
            </span>
            {match.application && (
              <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 8, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
                {match.application.status === 'APPLIED' ? 'Ansökt' :
                 match.application.status === 'DRAFT_CV' ? 'CV-utkast' :
                 match.application.status === 'WON' ? '🏆 Vunnet' :
                 match.application.status === 'REJECTED' ? 'Avvisad' :
                 match.application.status}
              </span>
            )}
          </div>
          <div className="match-sub">
            {match.consultant.title || ''}
            {match.consultant.team && <span> · {match.consultant.team}</span>}
            <span className="match-availability" style={{ color: match.consultant.status === 'AVAILABLE' ? '#34d399' : '#94a3b8' }}>
              {' · '}{match.consultant.status === 'AVAILABLE' ? '● Tillgänglig' : match.consultant.status === 'ON_CONTRACT' ? '● På uppdrag' : '● Ledig'}
              {match.consultant.wantsNewAssignment && ' · söker nytt'}
            </span>
          </div>
          {/* Summary — shown collapsed */}
          {!expanded && match.summary && (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginTop: 4, lineHeight: 1.5 }}>
              {match.summary}
            </div>
          )}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="match-card-body">
          {/* Summary */}
          {match.summary && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary, #cbd5e1)', lineHeight: 1.6, marginBottom: 16 }}>
              {match.summary}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Strengths */}
            {match.strengths.length > 0 && (
              <div className="match-section">
                <h4 style={{ fontSize: '0.78rem', color: '#34d399', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ✓ Styrkor
                </h4>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {match.strengths.map((s, i) => <li key={i} style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #cbd5e1)', marginBottom: 4 }}>{s}</li>)}
                </ul>
              </div>
            )}

            {/* Concerns / missing */}
            {match.concerns.length > 0 && (
              <div className="match-section">
                <h4 style={{ fontSize: '0.78rem', color: '#f87171', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ✗ Luckor
                </h4>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {match.concerns.map((s, i) => <li key={i} style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #cbd5e1)', marginBottom: 4 }}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Skill chips */}
          <div className="match-skill-cols">
            {match.matchedSkills.length > 0 && (
              <div className="match-section">
                <h4 style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Matchade kompetenser
                </h4>
                <div className="skill-chips">
                  {match.matchedSkills.map((s) => <span key={s} className="skill-chip skill-chip-matched">{s}</span>)}
                </div>
              </div>
            )}
            {match.missingSkills.length > 0 && (
              <div className="match-section">
                <h4 style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: 6, textTransform: 'uppercase' }}>
                  Saknas för perfekt match
                </h4>
                <div className="skill-chips">
                  {match.missingSkills.map((s) => <span key={s} className="skill-chip skill-chip-missing">{s}</span>)}
                </div>
              </div>
            )}
          </div>

          {/* CV section */}
          <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary, #f1f5f9)' }}>
                Skräddarsytt CV
              </span>
              {cvText && (
                <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 8, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                  Genererat
                </span>
              )}
            </div>

            <div className="match-actions" style={{ flexWrap: 'wrap' }}>
              <button onClick={generateCv} disabled={isPending} className="ai-toggle-btn">
                {isPending && !cvText ? 'Genererar…' : cvText ? 'Regenerera' : 'Generera CV'}
              </button>
              {cvText && (
                <>
                  <button onClick={() => { setShowCv(!showCv); setEditing(false); }} className="ai-toggle-btn">
                    {showCv ? 'Dölj' : 'Visa'}
                  </button>
                  <button onClick={() => { setShowCv(true); setEditing(!editing); setCvEdited(cvText); }} className="ai-toggle-btn">
                    {editing ? 'Avbryt' : 'Redigera'}
                  </button>
                  <button onClick={() => downloadCv(cvText, assignment, match.consultant)} className="ai-toggle-btn">
                    ↓ .md
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(cvText)} className="ai-toggle-btn">
                    Kopiera
                  </button>
                </>
              )}
            </div>

            {match.application && (
              <div className="match-actions" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)' }}>Status:</span>
                {['INTERESTED', 'APPLIED', 'WON', 'REJECTED', 'WITHDRAWN'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={isPending || match.application.status === s}
                    className="ai-toggle-btn"
                    style={{ opacity: match.application.status === s ? 0.4 : 1 }}
                  >
                    {s === 'INTERESTED' ? 'Intressant' : s === 'APPLIED' ? 'Ansökt' : s === 'WON' ? 'Vunnet' : s === 'REJECTED' ? 'Avvisad' : 'Dragen'}
                  </button>
                ))}
              </div>
            )}

            {msg && <p className="auth-error" style={{ marginTop: 8 }}>{msg}</p>}

            {/* CV display / editor */}
            {showCv && cvText && (
              <div style={{ marginTop: 12 }}>
                {editing ? (
                  <>
                    <textarea
                      value={cvEdited}
                      onChange={(e) => setCvEdited(e.target.value)}
                      style={{
                        width: '100%', minHeight: 400, padding: '14px 16px',
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8, color: 'var(--color-text-primary, #f1f5f9)',
                        fontSize: '0.82rem', lineHeight: 1.7, fontFamily: 'monospace',
                        resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <button onClick={saveCvDraft} disabled={isPending} className="ai-save-btn" style={{ padding: '7px 16px' }}>
                        {isPending ? 'Sparar…' : 'Spara ändringar'}
                      </button>
                      <button onClick={() => { setEditing(false); setCvEdited(cvText); }} className="ai-toggle-btn">
                        Avbryt
                      </button>
                      {saveMsg && <span style={{ fontSize: '0.8rem', color: saveMsg.startsWith('Fel') ? '#f87171' : '#34d399' }}>{saveMsg}</span>}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #94a3b8)', marginTop: 8 }}>
                      Tips: Öppna AI-assistenten (✦) och be den komplettera specifika avsnitt.
                    </p>
                  </>
                ) : (
                  <pre className="match-cv-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem', lineHeight: 1.7 }}>
                    {cvText}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
