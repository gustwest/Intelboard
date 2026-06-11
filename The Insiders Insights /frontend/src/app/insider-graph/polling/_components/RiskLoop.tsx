'use client';

import { useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { graphFetch } from '../../_lib/api';
import {
  RiskQuestionsResp,
  RiskTimelineResp,
  S,
  PERSONA_SV,
  cardStyle,
  isStale,
} from '../_shared';
import { SectionHead, FormRow, LoopStat } from './common';

export function RiskLoopStatus({ questions, findings, latestDetect, latestGenerate, clientId }: {
  questions: RiskQuestionsResp | null;
  findings: RiskTimelineResp | null;
  latestDetect: { status: string; started_at: string | null } | null | undefined;
  latestGenerate: { status: string; started_at: string | null } | null | undefined;
  clientId: string | null;
}) {
  const qc = questions?.counts || { open: 0, approved: 0, rejected: 0 };
  const fc = findings?.counts || { open: 0, actioned: 0, resolved: 0, dismissed: 0 };
  const totalApproved = qc.approved;
  const hasPending = qc.open > 0;
  const hasApproved = totalApproved > 0;
  const hasOpenRisks = fc.open > 0;
  const detectStale = latestDetect?.status === 'running' && isStale(latestDetect.started_at, 10);

  // Bestäm nästa rekommenderade steg i den tredelade loopen.
  let nextStep: { label: string; tone: 'urgent' | 'normal' | 'good' };
  if (!hasApproved && !hasPending) {
    nextStep = { label: 'Generera frågor — loopen är inte aktiverad än', tone: 'urgent' };
  } else if (hasPending) {
    nextStep = { label: `Granska & godkänn ${qc.open} väntande fråga${qc.open === 1 ? '' : 'or'} — i Risk-frågor nedan eller i Granska-fliken`, tone: 'urgent' };
  } else if (hasOpenRisks) {
    nextStep = { label: `Granska ${fc.open} öppna risk${fc.open === 1 ? '' : 'er'} — agera i Granska-fliken`, tone: 'urgent' };
  } else if (hasApproved) {
    nextStep = { label: `Loopen rullar — ${totalApproved} godkända frågor mäts varje vecka`, tone: 'good' };
  } else {
    nextStep = { label: 'Loopen är inaktiv', tone: 'normal' };
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Riskloop-status — generera → granska → mät"
        hint="Tredelad loop: risk-generate skapar frågor (kräver godkännande), risk-detect kör endast godkända frågor mot motorerna, fynd → korrigeringar → lösta efter två rena cykler."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <LoopStat label="Väntar granskning" value={qc.open} tone={hasPending ? 'urgent' : 'idle'} hint={hasPending ? 'godkänn i Granska-fliken' : 'inga'} />
        <LoopStat label="Godkända frågor" value={totalApproved} tone={hasApproved ? 'good' : 'idle'} hint={hasApproved ? 'mäts veckovis' : 'kör risk-generate'} />
        <LoopStat label="Öppna risker" value={fc.open} tone={hasOpenRisks ? 'urgent' : 'idle'} hint={`${fc.actioned} åtgärdade · ${fc.resolved} lösta`} />
        <LoopStat label="Senaste detect" value={latestDetect ? (detectStale ? 'stale' : latestDetect.status) : '—'} tone={detectStale ? 'urgent' : latestDetect?.status === 'success' ? 'good' : 'idle'} hint={latestGenerate ? `gen: ${latestGenerate.status}` : 'risk-generate ej kört'} />
      </div>

      <div style={{
        padding: '10px 14px',
        background: nextStep.tone === 'urgent' ? 'rgba(245,158,11,0.08)' : nextStep.tone === 'good' ? 'rgba(22,163,74,0.06)' : 'rgba(106,126,138,0.06)',
        border: `1px solid ${nextStep.tone === 'urgent' ? 'rgba(245,158,11,0.3)' : nextStep.tone === 'good' ? 'rgba(22,163,74,0.25)' : C.border}`,
        borderRadius: 8,
        fontSize: 12,
        color: C.text,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <strong style={{ color: nextStep.tone === 'urgent' ? '#b45309' : nextStep.tone === 'good' ? '#16a34a' : C.muted, letterSpacing: '0.02em' }}>NÄSTA STEG:</strong>
        <span>{nextStep.label}</span>
        {hasPending && clientId && (
          <a
            href="#risk-fragor"
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: S.waiting.fg,
              background: S.waiting.bg,
              border: `1px solid ${S.waiting.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              textDecoration: 'none',
            }}
          >
            Granska {qc.open} fråga{qc.open === 1 ? '' : 'or'} nedan ↓
          </a>
        )}
      </div>
    </div>
  );
}

export function RiskQuestionsInlineApprover({ clientId, questions, onChanged }: {
  clientId: string;
  questions: RiskQuestionsResp['questions'];
  onChanged: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function decide(qid: string, decision: 'approve' | 'reject') {
    setInFlight((s) => new Set(s).add(qid));
    setErrors((e) => ({ ...e, [qid]: '' }));
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions/${qid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
    } catch (e) {
      setErrors((es) => ({ ...es, [qid]: e instanceof Error ? e.message : 'Misslyckades' }));
    } finally {
      setInFlight((s) => {
        const next = new Set(s);
        next.delete(qid);
        return next;
      });
    }
  }

  async function bulkDecide(decision: 'approve' | 'reject') {
    const ids = decision === 'reject' && checked.size === 0
      ? questions.map((q) => q.id) // "Avvisa alla" — ingen markering krävs
      : Array.from(checked);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => decide(id, decision)));
      setChecked(new Set());
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (questions.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(245,158,11,0.04)', border: `1px solid ${S.waiting.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: S.waiting.fg, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Inline-godkännande
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {checked.size > 0 ? `${checked.size} markerade · ` : ''}{questions.length} öppna frågor
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            disabled={busy || checked.size === 0}
            onClick={() => bulkDecide('approve')}
            style={inlineBtn(S.resolved, busy || checked.size === 0)}
          >
            {busy ? 'Sparar…' : `Godkänn ${checked.size || 'markerade'}`}
          </button>
          <button
            disabled={busy || checked.size === 0}
            onClick={() => bulkDecide('reject')}
            style={inlineBtn(S.open, busy || checked.size === 0)}
          >
            Avvisa markerade
          </button>
          <a
            href={`/insider-graph/review?client=${encodeURIComponent(clientId)}`}
            style={{ ...inlineBtn(S.neutral, false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            title="Öppna full Granska-flik"
          >
            Granska-fliken →
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
        {questions.map((q) => {
          const pending = inFlight.has(q.id);
          const err = errors[q.id];
          return (
            <div key={q.id} style={{
              display: 'grid',
              gridTemplateColumns: '20px 80px 70px 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '8px 6px',
              borderRadius: 6,
              background: checked.has(q.id) ? 'rgba(224, 142, 121,0.06)' : 'transparent',
              fontSize: 12,
              opacity: pending ? 0.5 : 1,
            }}>
              <input
                type="checkbox"
                checked={checked.has(q.id)}
                onChange={() => toggle(q.id)}
                disabled={pending || busy}
                style={{ accentColor: C.accent }}
              />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {q.persona ? PERSONA_SV[q.persona] || q.persona : '—'}
              </span>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>
                {q.type || '—'}
              </span>
              <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.text || ''}>
                {q.text || '(ingen text)'}
                {err && <span style={{ color: S.open.fg, marginLeft: 8 }}>· {err}</span>}
              </span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <button
                  disabled={pending || busy}
                  onClick={async () => { await decide(q.id, 'approve'); onChanged(); }}
                  style={singleBtn(S.resolved, pending || busy)}
                  title="Godkänn"
                >
                  ✓
                </button>
                <button
                  disabled={pending || busy}
                  onClick={async () => { await decide(q.id, 'reject'); onChanged(); }}
                  style={singleBtn(S.open, pending || busy)}
                  title="Avvisa"
                >
                  ✗
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function inlineBtn(tone: { fg: string; bg: string; border: string }, disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: tone.fg,
    background: disabled ? 'transparent' : tone.bg,
    border: `1px solid ${disabled ? C.border : tone.border}`,
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.02em',
    opacity: disabled ? 0.5 : 1,
  };
}

function singleBtn(tone: { fg: string; bg: string; border: string }, disabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 22,
    fontSize: 12,
    fontWeight: 600,
    color: tone.fg,
    background: disabled ? 'transparent' : tone.bg,
    border: `1px solid ${disabled ? C.border : tone.border}`,
    borderRadius: 5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

// Samlad frågevy med statusflikar: hela frågelivscykeln (väntar → godkänd →
// avvisad) på ETT ställe, istället för godkännare i en box och godkänd lista i
// en annan. RiskLoopStatus ankarlänkar hit (#risk-fragor).
export function RiskQuestionsPanel({ questions, clientId, onChanged }: {
  questions: RiskQuestionsResp['questions'];
  clientId: string | null;
  onChanged: () => void;
}) {
  const pending = questions.filter((q) => q.status === 'open');
  const approved = questions.filter((q) => q.status === 'approved');
  const rejected = questions.filter((q) => q.status === 'rejected');

  const [open, setOpen] = useState(pending.length > 0);
  const [tab, setTab] = useState<'open' | 'approved' | 'rejected'>(pending.length > 0 ? 'open' : 'approved');
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const byPersona = new Map<string, number>();
  for (const q of approved) {
    const p = q.persona || 'okänd';
    byPersona.set(p, (byPersona.get(p) || 0) + 1);
  }

  async function reject(qid: string) {
    if (!clientId) return;
    setInFlight((s) => new Set(s).add(qid));
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions/${qid}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'reject' }),
      });
      onChanged();
    } catch {
      // tyst — refresh återställer
    } finally {
      setInFlight((s) => {
        const next = new Set(s);
        next.delete(qid);
        return next;
      });
    }
  }

  const tabs: { id: 'open' | 'approved' | 'rejected'; label: string; count: number; tone: { fg: string; bg: string; border: string } }[] = [
    { id: 'open', label: 'Väntar granskning', count: pending.length, tone: S.waiting },
    { id: 'approved', label: 'Godkända', count: approved.length, tone: S.resolved },
    { id: 'rejected', label: 'Avvisade', count: rejected.length, tone: S.neutral },
  ];

  return (
    <div id="risk-fragor" style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title={`Risk-frågor — mäter beslutssäkerhet`}
        hint={open
          ? "Hela frågelivscykeln på ett ställe: genererade frågor väntar på granskning, godkända körs av risk-detect mot motorerna varje vecka (de driver beslutssäkerheten — skilt från synlighets-frågorna nedan som mäter Share of Voice), avvisade körs aldrig. Avvisa en godkänd fråga som visat sig dålig — den slutar köras och kan ersättas via Generera risk-frågor."
          : `${approved.length} godkända mäts veckovis${pending.length > 0 ? ` · ${pending.length} väntar på granskning` : ''} · ${Array.from(byPersona.entries()).map(([p, n]) => `${n} ${PERSONA_SV[p] || p}`).join(' · ')}`
        }
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={pending.length > 0 ? `${approved.length} · ${pending.length} väntar` : `${approved.length}`}
      />

      {open && (
        <>
          {/* Statusflikar — gör synligt VAR i livscykeln varje fråga är */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  color: tab === t.id ? t.tone.fg : C.muted,
                  background: tab === t.id ? t.tone.bg : 'transparent',
                  border: `1px solid ${tab === t.id ? t.tone.border : C.border}`,
                  borderRadius: 999, cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                {t.label} · {t.count}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setAdding(true)}
              disabled={!clientId}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                color: C.accent, background: 'rgba(224, 142, 121,0.08)',
                border: `1px solid ${S.inProgress.border}`, borderRadius: 6,
                cursor: clientId ? 'pointer' : 'not-allowed', letterSpacing: '0.02em',
              }}
            >
              + Lägg till egen fråga
            </button>
          </div>

          {tab === 'open' && (
            pending.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Inga frågor väntar på granskning. Kör Generera risk-frågor för att få nya förslag.</p>
            ) : clientId ? (
              <RiskQuestionsInlineApprover clientId={clientId} questions={pending} onChanged={onChanged} />
            ) : null
          )}

          {tab === 'approved' && (
            approved.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Inga godkända frågor än — godkänn väntande frågor så börjar risk-detect mäta dem veckovis.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {approved.map((q) => {
                  const busy = inFlight.has(q.id);
                  const personaLabel = q.persona ? PERSONA_SV[q.persona] || q.persona : '—';
                  const typeLabel = q.type === 'comparative' ? 'jämförelse' : q.type === 'open' ? 'öppen' : q.type || '';
                  return (
                    <div
                      key={q.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 70px 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                        padding: '8px 10px',
                        background: 'rgba(22,163,74,0.04)',
                        border: `1px solid ${S.resolved.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        opacity: busy ? 0.5 : 1,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600, color: S.inProgress.fg, background: S.inProgress.bg, border: `1px solid ${S.inProgress.border}`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {personaLabel}
                      </span>
                      <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>{typeLabel}</span>
                      <span style={{ color: C.text, lineHeight: 1.5 }}>
                        {q.text || <span style={{ color: C.dim, fontStyle: 'italic' }}>(saknar fråge-text)</span>}
                        {q.custom && (
                          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 600, color: C.accent, background: 'rgba(224, 142, 121,0.1)', border: `1px solid ${S.inProgress.border}`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', verticalAlign: 'middle' }}>
                            Egen
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => reject(q.id)}
                        disabled={busy || !clientId}
                        title="Avvisa frågan — den körs inte längre"
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          color: S.open.fg, background: 'white',
                          border: `1px solid ${S.open.border}`, borderRadius: 5,
                          cursor: busy ? 'wait' : 'pointer', letterSpacing: '0.02em',
                        }}
                      >
                        ✗ Avvisa
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'rejected' && (
            rejected.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Inga avvisade frågor.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rejected.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 70px 1fr',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'rgba(106,126,138,0.04)',
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {q.persona ? PERSONA_SV[q.persona] || q.persona : '—'}
                    </span>
                    <span style={{ fontSize: 10, color: C.dim, fontStyle: 'italic' }}>{q.type || '—'}</span>
                    <span style={{ color: C.muted, lineHeight: 1.5, textDecoration: 'line-through' }}>{q.text || '(ingen text)'}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {adding && clientId && (
        <CustomQuestionModal
          clientId={clientId}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); onChanged(); }}
        />
      )}
    </div>
  );
}

export function CustomQuestionModal({ clientId, onClose, onCreated }: {
  clientId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [persona, setPersona] = useState<'customer' | 'talent' | 'investor'>('customer');
  const [type, setType] = useState<'open' | 'comparative'>('open');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'sv' | 'en'>('sv');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) {
      setError('Frågans text kan inte vara tom');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await graphFetch(`/api/review/${clientId}/risk-questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona, type, text: text.trim(), language }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Misslyckades — försök igen');
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: '24px 26px',
          width: 'min(560px, 92vw)', boxShadow: '0 20px 60px rgba(58,75,86,0.18)',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Lägg till egen risk-fråga
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
          Frågan körs direkt av risk-detect varje vecka (skippar review-grinden eftersom du själv lade in den).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormRow label="Persona — vem ställer frågan">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['customer', 'talent', 'investor'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  style={{
                    flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    color: persona === p ? S.inProgress.fg : C.muted,
                    background: persona === p ? S.inProgress.bg : 'transparent',
                    border: `1px solid ${persona === p ? S.inProgress.border : C.border}`,
                    borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                  }}
                >
                  {PERSONA_SV[p]}
                </button>
              ))}
            </div>
          </FormRow>

          <FormRow label="Typ">
            <div style={{ display: 'flex', gap: 6 }}>
              {([['open', 'Öppen'], ['comparative', 'Jämförelse']] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                    color: type === v ? C.text : C.muted,
                    background: type === v ? '#f4f5f6' : 'transparent',
                    border: `1px solid ${type === v ? C.text : C.border}`,
                    borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                  }}
                >
                  {lbl}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'sv' | 'en')}
                style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, background: 'white' }}
              >
                <option value="sv">Svenska</option>
                <option value="en">Engelska</option>
              </select>
            </div>
          </FormRow>

          <FormRow label="Frågans text">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="T.ex. 'Vilka företag i Sverige är ledande inom AI-säkerhet?'"
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                color: C.text, border: `1px solid ${C.border}`,
                borderRadius: 6, fontFamily: 'inherit', lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
              Skriv som om en {PERSONA_SV[persona].toLowerCase()} faktiskt skulle ställa den. Var konkret.
            </div>
          </FormRow>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '8px 12px', background: S.open.bg, border: `1px solid ${S.open.border}`, color: S.open.fg, borderRadius: 6, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              color: C.muted, background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={submitting || !text.trim()}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              color: 'white', background: S.resolved.fg,
              border: `1px solid ${S.resolved.fg}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || !text.trim()) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Lägger till…' : 'Lägg till + godkänn'}
          </button>
        </div>
      </div>
    </div>
  );
}
