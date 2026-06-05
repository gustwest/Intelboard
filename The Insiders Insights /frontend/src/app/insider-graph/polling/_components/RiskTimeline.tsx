'use client';

import { useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import {
  RiskStatus,
  RiskTimelineRow,
  RiskTimelineResp,
  PERSONA_SV,
  ENGINE_SV,
  SEVERITY,
  RISK_STATUS_SV,
  cardStyle,
  buildLifecycleEvents,
  harmLabel,
} from '../_shared';
import { SectionHead } from './common';

export function RiskLifecycleTimeline({ data, approvedQuestions }: { data: RiskTimelineResp; approvedQuestions: number | null }) {
  const [filter, setFilter] = useState<RiskStatus | 'all'>('all');
  const rows = filter === 'all' ? data.findings : data.findings.filter((r) => r.status === filter);
  const total = data.findings.length;
  const counts = data.counts;
  // Defaulta öppen om det finns något att visa, annars kollapsad.
  const [open, setOpen] = useState(total > 0);
  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title="Riskens livscykel — detektion → åtgärd → löst"
        hint={open ? "Per risk: när AI:n först gav ett farligt svar, när mjukvaran publicerade en korrigering, och när motorn slutat upprepa problemet. Beviset att loopen sluter sig." : `${total} ${total === 1 ? 'risk' : 'risker'} totalt · ${counts.open} öppna · ${counts.resolved} lösta`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={counts.open > 0 ? `${counts.open} öppna` : undefined}
      />
      {open && (<>

      {total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <RiskFilterChip label={`Alla (${total})`} active={filter === 'all'} onClick={() => setFilter('all')} />
          {(['open', 'actioned', 'resolved', 'dismissed'] as RiskStatus[]).map((s) =>
            counts[s] > 0 ? (
              <RiskFilterChip
                key={s}
                label={`${RISK_STATUS_SV[s].label} (${counts[s]})`}
                active={filter === s}
                onClick={() => setFilter(s)}
                tone={RISK_STATUS_SV[s]}
              />
            ) : null,
          )}
        </div>
      )}

      {total === 0 ? (
        <RiskTimelineEmpty approvedQuestions={approvedQuestions} />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker i den här statusen.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rows.map((r, i) => <RiskTimelineCard key={r.id} row={r} isLast={i === rows.length - 1} />)}
        </div>
      )}
      </>)}
    </div>
  );
}

export function RiskTimelineEmpty({ approvedQuestions }: { approvedQuestions: number | null }) {
  // Kontextuell tomtext beroende på var i tredelade loopen kunden står.
  if (approvedQuestions === null) {
    return <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Inga risker att visa ännu.</p>;
  }
  if (approvedQuestions === 0) {
    return (
      <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        <strong style={{ color: '#b45309' }}>Loopen är inte aktiverad än.</strong> Inga godkända frågor finns — det betyder att risk-detect kör en no-op
        ({'questions_asked: 0'}). Kör <code style={{ color: C.accent }}>risk-generate</code> i jobbraden ovan, sedan godkänn frågor i Granska-fliken;
        därefter kommer denna tidslinje fyllas allt eftersom motorerna producerar farliga svar.
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
      <strong style={{ color: '#16a34a' }}>Inga risker hittade.</strong> {approvedQuestions} godkända fråga{approvedQuestions === 1 ? '' : 'or'} kördes
      — motorerna svarade säkert på alla. Tidslinjen fylls den vecka något bryter mönstret.
    </div>
  );
}

export function RiskFilterChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: { color: string; bg: string } }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        background: active ? tone?.bg || 'rgba(159,81,182,0.14)' : 'transparent',
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

export function RiskTimelineCard({ row, isLast }: { row: RiskTimelineRow; isLast: boolean }) {
  const st = RISK_STATUS_SV[row.status];
  const sev = row.severity ? SEVERITY[row.severity] : null;
  const events = buildLifecycleEvents(row);
  return (
    <div style={{ padding: '14px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
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
        </div>
      </div>

      {row.engine_excerpt && (
        <div style={{ fontSize: 11, color: C.dim, fontStyle: 'italic', margin: '4px 0 8px', padding: '6px 10px', background: 'rgba(58,75,86,0.04)', borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}>
          "{row.engine_excerpt}"
        </div>
      )}

      {events.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 10, fontSize: 11 }}>
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

      {row.ammo_claim_ids.length > 0 && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          Korrigering kopplad: <code style={{ color: C.accent, fontSize: 11 }}>{row.ammo_claim_ids.join(', ')}</code>
        </div>
      )}
    </div>
  );
}
