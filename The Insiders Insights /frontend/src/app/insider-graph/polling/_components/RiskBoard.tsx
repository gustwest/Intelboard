'use client';

import { useEffect, useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { graphFetch } from '../../_lib/api';
import {
  DecisionConfidence,
  RiskStatus,
  RiskTimelineRow,
  RiskTimelineResp,
  WhatIfResult,
  PERSONA_SV,
  ENGINE_SV,
  SEVERITY,
  RISK_STATUS_SV,
  S,
  cardStyle,
  buildLifecycleEvents,
  harmLabel,
} from '../_shared';
import { SectionHead, FormRow } from './common';

type BoardFilter = RiskStatus | 'all' | 'report';

/**
 * RiskBoard (Etapp 1, R1–R5): EN risk-centrerad yta. Varje risk är ett kort med
 * status, expanderbart förlopp (f.d. "Riskens livscykel"), what-if-simulering
 * per kort med live-projektion av beslutssäkerheten (f.d. "What-if"-boxen) och
 * åtgärda/avfärda direkt på kortet (samma endpoint som Granska). Rapportens
 * "Detekterade risker" blir filtret "I månadsrapporten" istället för egen tabell.
 */
export function RiskBoard({ data, approvedQuestions, clientId, conf, reportFindingIds, onChanged }: {
  data: RiskTimelineResp;
  approvedQuestions: number | null;
  clientId: string | null;
  conf: DecisionConfidence | null;
  reportFindingIds: Set<string> | null;
  onChanged: () => void;
}) {
  const total = data.findings.length;
  const counts = data.counts;
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [open, setOpen] = useState(total > 0);

  // What-if-simulering: markerade kort + ev. täcknings-simulering → debounce:ad projektion.
  const [simSelected, setSimSelected] = useState<Set<string>>(new Set());
  const [broaden, setBroaden] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const [actioning, setActioning] = useState<RiskTimelineRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);

  const canSimulate = !!clientId && !!conf;
  const canBroaden = canSimulate && (conf?.covered_personas ?? 3) < 3;
  const hasSimInput = simSelected.size > 0 || broaden;

  useEffect(() => {
    if (!hasSimInput || !clientId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      graphFetch<WhatIfResult>(`/api/forecast/${encodeURIComponent(clientId)}/confidence/whatif`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resolve_finding_ids: Array.from(simSelected),
          simulate_full_coverage: broaden,
        }),
      })
        .then((r) => { if (!cancelled) { setWhatIf(r); setWhatIfError(null); } })
        .catch((e) => { if (!cancelled) setWhatIfError(String(e.message || e)); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [clientId, simSelected, broaden, hasSimInput]);

  const toggleSim = (id: string) =>
    setSimSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function dismiss(row: RiskTimelineRow) {
    if (!clientId) return;
    setBusyId(row.id);
    try {
      await graphFetch(`/api/review/${encodeURIComponent(clientId)}/risks/${encodeURIComponent(row.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'dismiss' }),
      });
      setSimSelected((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      onChanged();
    } catch {
      // tyst — refresh återställer
    } finally {
      setBusyId(null);
      setConfirmDismissId(null);
    }
  }

  const inReport = (r: RiskTimelineRow) => !!reportFindingIds && reportFindingIds.has(r.id);
  const reportCount = reportFindingIds ? data.findings.filter(inReport).length : 0;
  const rows =
    filter === 'all' ? data.findings
    : filter === 'report' ? data.findings.filter(inReport)
    : data.findings.filter((r) => r.status === filter);

  return (
    <div id="risk-board" style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title="Risker — upptäckt → simulering → åtgärd → löst"
        hint={open
          ? "Varje kort är EN risk genom hela livscykeln. Kryssa 'simulera löst' på öppna risker för att se hur beslutssäkerheten skulle röra sig, åtgärda med ett källförsett korrigerande claim, eller avfärda sanna negativ. Löst = motorn har svarat säkert två mätcykler i rad."
          : `${total} ${total === 1 ? 'risk' : 'risker'} totalt · ${counts.open} öppna · ${counts.resolved} lösta`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={counts.open > 0 ? `${counts.open} öppna` : undefined}
      />
      {open && (<>

      {total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <FilterChip label={`Alla (${total})`} active={filter === 'all'} onClick={() => setFilter('all')} />
          {(['open', 'actioned', 'resolved', 'dismissed'] as RiskStatus[]).map((s) =>
            counts[s] > 0 ? (
              <FilterChip
                key={s}
                label={`${RISK_STATUS_SV[s].label} (${counts[s]})`}
                active={filter === s}
                onClick={() => setFilter(s)}
                tone={RISK_STATUS_SV[s]}
              />
            ) : null,
          )}
          {reportCount > 0 && (
            <FilterChip
              label={`I månadsrapporten (${reportCount})`}
              active={filter === 'report'}
              onClick={() => setFilter('report')}
            />
          )}
        </div>
      )}

      {total === 0 ? (
        <BoardEmpty approvedQuestions={approvedQuestions} />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker i den här statusen.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((r, i) => (
            <RiskCard
              key={r.id}
              row={r}
              isLast={i === rows.length - 1}
              inReport={inReport(r)}
              simChecked={simSelected.has(r.id)}
              onToggleSim={canSimulate && r.status === 'open' ? () => toggleSim(r.id) : undefined}
              busy={busyId === r.id}
              confirmDismiss={confirmDismissId === r.id}
              onAction={clientId && r.status === 'open' ? () => setActioning(r) : undefined}
              onDismiss={clientId && r.status === 'open'
                ? () => (confirmDismissId === r.id ? dismiss(r) : setConfirmDismissId(r.id))
                : undefined}
            />
          ))}
        </div>
      )}

      {/* Simulering — projektionsraden lever i samma yta som korten den simulerar */}
      {canBroaden && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.text, cursor: 'pointer', padding: '10px 0 0', marginTop: 10, borderTop: `1px solid ${C.border}` }}>
          <input type="checkbox" checked={broaden} onChange={() => setBroaden((b) => !b)} style={{ cursor: 'pointer' }} />
          <span>Simulera mätning av alla tre personas ({conf!.covered_personas}/3 idag) — låser upp taket</span>
        </label>
      )}
      {whatIfError && <p style={{ fontSize: 12, color: '#b91c1c', margin: '10px 0 0' }}>Kunde inte projicera: {whatIfError}</p>}
      {hasSimInput && whatIf && <WhatIfSummary result={whatIf} />}
      </>)}

      {actioning && clientId && (
        <ActionRiskModal
          clientId={clientId}
          row={actioning}
          onClose={() => setActioning(null)}
          onDone={() => {
            setSimSelected((prev) => { const n = new Set(prev); n.delete(actioning.id); return n; });
            setActioning(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function RiskCard({ row, isLast, inReport, simChecked, onToggleSim, busy, confirmDismiss, onAction, onDismiss }: {
  row: RiskTimelineRow;
  isLast: boolean;
  inReport: boolean;
  simChecked: boolean;
  onToggleSim?: () => void;
  busy: boolean;
  confirmDismiss: boolean;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const st = RISK_STATUS_SV[row.status];
  const sev = row.severity ? SEVERITY[row.severity] : null;
  const [expanded, setExpanded] = useState(false);
  const events = buildLifecycleEvents(row);

  return (
    <div style={{ padding: '14px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}`, opacity: busy ? 0.5 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{row.question || '—'}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {row.persona ? PERSONA_SV[row.persona] || row.persona : '—'}
            {row.engine && ` · ${ENGINE_SV[row.engine] || row.engine}`}
            {row.harm && ` · ${harmLabel(row.harm)}`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.color}33`, borderRadius: 6, padding: '3px 8px', letterSpacing: '0.04em' }}>{st.label}</span>
          {sev && <span style={{ fontSize: 10, fontWeight: 600, color: sev.color, background: sev.bg, border: `1px solid ${sev.color}33`, borderRadius: 6, padding: '2px 7px' }}>{sev.label}</span>}
          {inReport && (
            <span title="Risken ingick som öppen i den valda månadsrapporten" style={{ fontSize: 9, fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 7px', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              I rapporten
            </span>
          )}
        </div>
      </div>

      {row.engine_excerpt && (
        <div style={{ fontSize: 11, color: C.dim, fontStyle: 'italic', margin: '4px 0 8px', padding: '6px 10px', background: 'rgba(58,75,86,0.04)', borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}>
          "{row.engine_excerpt}"
        </div>
      )}

      {/* Handlingsrad: simulera · åtgärda · avfärda · förlopp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {onToggleSim && (
          <label
            title="Räkna risken som löst i en projektion av beslutssäkerheten — ändrar ingenting på riktigt"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
              color: simChecked ? S.inProgress.fg : C.muted,
              background: simChecked ? S.inProgress.bg : 'transparent',
              border: `1px solid ${simChecked ? S.inProgress.border : C.border}`,
            }}
          >
            <input type="checkbox" checked={simChecked} onChange={onToggleSim} style={{ cursor: 'pointer', accentColor: C.accent, margin: 0 }} />
            Simulera löst
          </label>
        )}
        {onAction && (
          <button
            onClick={onAction}
            disabled={busy}
            title="Möt risken med ett källförsett korrigerande claim — publiceras i JSON-LD/FAQ/profil vid nästa kompilering"
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: S.resolved.fg, background: S.resolved.bg, border: `1px solid ${S.resolved.border}`, borderRadius: 6, cursor: busy ? 'wait' : 'pointer', letterSpacing: '0.02em' }}
          >
            Åtgärda…
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={busy}
            title="Stäng risken utan att publicera något — för sanna negativ som inte ska mötas med kontext"
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: confirmDismiss ? '#ffffff' : S.open.fg, background: confirmDismiss ? S.open.fg : 'transparent', border: `1px solid ${S.open.border}`, borderRadius: 6, cursor: busy ? 'wait' : 'pointer', letterSpacing: '0.02em' }}
          >
            {confirmDismiss ? 'Bekräfta avfärdande' : 'Avfärda'}
          </button>
        )}
        {(events.length > 0 || row.ammo_claim_ids.length > 0) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, fontWeight: 600, color: C.muted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em' }}
          >
            {expanded ? 'Dölj förlopp' : 'Visa förlopp'}
          </button>
        )}
      </div>

      {expanded && events.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 12, fontSize: 11 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, flex: i === events.length - 1 ? '0 0 auto' : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 90 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev.color, boxShadow: `0 0 0 3px ${ev.color}22` }} />
                <div style={{ fontSize: 10, color: ev.color, fontWeight: 600 }}>{ev.label}</div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{ev.date}</div>
                {ev.detail && <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 1.3 }}>{ev.detail}</div>}
              </div>
              {i < events.length - 1 && (
                <div style={{ flex: 1, height: 2, background: ev.color, opacity: 0.4, margin: '0 4px', marginTop: -22 }} />
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && row.ammo_claim_ids.length > 0 && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          Korrigering kopplad: <code style={{ color: C.accent, fontSize: 11 }}>{row.ammo_claim_ids.join(', ')}</code>
        </div>
      )}
    </div>
  );
}

function WhatIfSummary({ result }: { result: WhatIfResult }) {
  const credible = result.exceeds_band;
  const arrowColor = credible ? (result.delta && result.delta > 0 ? '#16a34a' : '#b91c1c') : C.muted;
  return (
    <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(106,126,138,0.05)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>
        Projicerad beslutssäkerhet — om {result.resolved_count > 0 ? `${result.resolved_count} markerad${result.resolved_count === 1 ? '' : 'e'} risk${result.resolved_count === 1 ? '' : 'er'} löses` : 'mätningen breddas'}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span>{result.before.score ?? '—'}</span>
        <span style={{ color: C.dim, fontSize: 16 }}>→</span>
        <span style={{ color: credible ? C.text : C.muted }}>{result.after.score ?? '—'}</span>
        {result.delta != null && (
          <span style={{ fontSize: 14, color: arrowColor }}>{result.delta > 0 ? `+${result.delta}` : result.delta}</span>
        )}
        <span style={{ fontSize: 13, color: C.dim, fontWeight: 400 }}>/ 100</span>
      </div>
      {!credible && result.delta != null && result.delta !== 0 && (
        <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
          Rörelsen ryms inom brusbandet — räkna med den som riktning, inte som en säker effekt.
        </p>
      )}
      {result.ceiling_unlocked > 0 && (
        <p style={{ fontSize: 12, color: C.text, margin: '8px 0 0', lineHeight: 1.5 }}>
          Taket höjs <strong>{result.before.ceiling} → {result.after.ceiling}</strong> (+{result.ceiling_unlocked} möjliga) när alla tre personas mäts.
        </p>
      )}
      <p style={{ fontSize: 10, color: C.dim, margin: '10px 0 0', lineHeight: 1.5 }}>
        Deterministisk projektion av poäng-formeln — inte ett löfte om utfall. Åtgärda riskerna med knapparna på korten ovan.
      </p>
    </div>
  );
}

function BoardEmpty({ approvedQuestions }: { approvedQuestions: number | null }) {
  if (approvedQuestions === null) {
    return <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker att visa ännu.</p>;
  }
  if (approvedQuestions === 0) {
    return (
      <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        <strong style={{ color: '#b45309' }}>Loopen är inte aktiverad än.</strong> Inga godkända frågor finns — risk-detect kör en no-op.
        Kör <code style={{ color: C.accent }}>Generera risk-frågor</code> i jobbraden ovan och godkänn dem i Risk-frågor;
        därefter fylls denna yta allt eftersom motorerna producerar farliga svar.
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
      <strong style={{ color: '#16a34a' }}>Inga risker hittade.</strong> {approvedQuestions} godkända fråga{approvedQuestions === 1 ? '' : 'or'} kördes
      — motorerna svarade säkert på alla. Ytan fylls den vecka något bryter mönstret.
    </div>
  );
}

function FilterChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: { color: string; bg: string } }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        background: active ? tone?.bg || 'rgba(224, 142, 121,0.14)' : 'transparent',
        color: active ? tone?.color || C.accent : C.muted,
        border: `1px solid ${active ? tone?.color || C.accent : C.border}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </button>
  );
}

function ActionRiskModal({ clientId, row, onClose, onDone }: {
  clientId: string;
  row: RiskTimelineRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [statement, setStatement] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!statement.trim()) {
      setError('Korrigeringens text kan inte vara tom — ingen källa/innehåll, inget claim.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await graphFetch(`/api/review/${encodeURIComponent(clientId)}/risks/${encodeURIComponent(row.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'action',
          statement: statement.trim(),
          source_label: sourceLabel.trim() || null,
          source_url: sourceUrl.trim() || null,
        }),
      });
      onDone();
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
          width: 'min(620px, 92vw)', boxShadow: '0 20px 60px rgba(58,75,86,0.18)',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Åtgärda risken med en korrigering
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Ett källförsett claim som möter motorns felaktiga svar. Publiceras i JSON-LD, FAQ och profilsidan
          vid nästa kompilering (triggas automatiskt). Risken markeras som åtgärdad och räknas som löst
          efter två rena mätcykler.
        </p>

        <div style={{ padding: '8px 12px', marginBottom: 16, background: 'rgba(58,75,86,0.04)', borderLeft: `2px solid ${C.border}`, borderRadius: 4, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>{row.question || '—'}</strong>
          {row.engine_excerpt && <><br /><span style={{ fontStyle: 'italic' }}>Motorn sa: "{row.engine_excerpt}"</span></>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormRow label="Korrigerande påstående (krävs)">
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="T.ex. 'Bolaget har varit kassaflödespositivt sedan 2024, se årsredovisningen.'"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                color: C.text, border: `1px solid ${C.border}`,
                borderRadius: 6, fontFamily: 'inherit', lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          </FormRow>
          <FormRow label="Källans namn (valfritt)">
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="T.ex. 'Årsredovisning 2025'"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'inherit' }}
            />
          </FormRow>
          <FormRow label="Käll-URL (valfritt)">
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'inherit' }}
            />
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
            disabled={submitting || !statement.trim()}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              color: 'white', background: S.resolved.fg,
              border: `1px solid ${S.resolved.fg}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || !statement.trim()) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Publicerar…' : 'Åtgärda + publicera'}
          </button>
        </div>
      </div>
    </div>
  );
}
