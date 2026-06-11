'use client';

import { useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { graphFetch } from '../../_lib/api';
import { PERSONA_SV, S, cardStyle } from '../_shared';
import { SectionHead, FormRow } from './common';

// Svarar profilsidan på det probe-frågorna faktiskt frågar? Speglar backend
// services/alignment_audit (probe → gap → claim-order). Ett gap = en (persona ×
// dimension) där sidan saknar ett extraherbart svar; varje gap bär en claim-order
// (ett källbart culture-claim som stänger det). "Belägg" publicerar claimet.

export type AlignmentClaimOrder = {
  persona_id: string;
  dimension: string;
  dimension_label: string;
  facet: string;
  audience: string[];
  suggested_statement: string;
  probe_neutral_q: string;
  probe_adversarial_q: string;
  rationale: string;
};

export type AlignmentCoverage = {
  total: number;
  covered: number;
  gaps: number;
  coverage: number;
  by_persona: Record<string, { covered: number; total: number; coverage: number }>;
  by_dimension: Record<string, { covered: number; total: number; coverage: number }>;
};

export type AlignmentAuditResp = {
  client_id: string;
  status: 'ok' | 'not_run';
  company_name?: string;
  captured_at?: string;
  active_personas?: string[];
  claim_orders?: AlignmentClaimOrder[];
  coverage?: AlignmentCoverage;
};

const personaLabel = (id: string) => PERSONA_SV[id] || id;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function AlignmentPanel({ data, clientId, onDone }: {
  data: AlignmentAuditResp;
  clientId: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [fulfilling, setFulfilling] = useState<AlignmentClaimOrder | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  async function runAudit() {
    if (!clientId) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      await graphFetch(`/api/jobs/alignment-audit/${encodeURIComponent(clientId)}`, { method: 'POST' });
      setTriggered(true);
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : 'Kunde inte starta — försök igen');
    } finally {
      setTriggering(false);
    }
  }

  if (data.status === 'not_run') {
    return (
      <section style={cardStyle}>
        <SectionHead
          title="Frågejustering — svarar profilsidan på det motorerna frågar?"
          hint="Probe → gap → riktad claim-beställning. Den största enskilda ociteringsorsaken är att sidan inte svarar på de faktiska frågorna, inte innehållskvalitet."
          badge="ej körd än"
        />
        <p style={{ fontSize: 13, color: C.muted, margin: '12px 0 14px', lineHeight: 1.5 }}>
          Auditen jämför kundens aktiva personors probe-frågor mot profilsidans faktiska textinnehåll
          (samma render-modell som AI-crawlers läser) och listar varje (persona × värmedimension) där
          sidan saknar ett extraherbart svar — med en färdig claim-beställning du kan belägga. Den har
          inte körts för den här kunden än.
        </p>
        {triggered ? (
          <div style={{ padding: '10px 14px', background: S.info.bg, border: `1px solid ${S.info.border}`, borderRadius: 8, fontSize: 13, color: S.info.fg, lineHeight: 1.5 }}>
            Körning startad (~30 motoranrop). Uppdatera om en stund — gapen och beställningarna dyker upp här när jobbet är klart.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={runAudit}
              disabled={triggering || !clientId}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600,
                color: 'white', background: S.resolved.fg,
                border: `1px solid ${S.resolved.fg}`, borderRadius: 6,
                cursor: triggering ? 'wait' : 'pointer', opacity: triggering ? 0.6 : 1,
              }}
            >
              {triggering ? 'Startar…' : 'Kör alignment-audit'}
            </button>
            <span style={{ fontSize: 12, color: C.muted }}>~30 motoranrop · kör inte oftare än nödvändigt</span>
          </div>
        )}
        {triggerError && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: S.open.bg, border: `1px solid ${S.open.border}`, color: S.open.fg, borderRadius: 6, fontSize: 12 }}>
            {triggerError}
          </div>
        )}
      </section>
    );
  }

  const cov = data.coverage;
  const orders = data.claim_orders || [];
  const covRatio = cov?.coverage ?? 0;
  const covColor = covRatio >= 0.8 ? S.resolved : covRatio >= 0.5 ? S.waiting : S.open;

  // Gruppera orders per persona (registry-ordningen kommer redan sorterad från backend).
  const byPersona: Record<string, AlignmentClaimOrder[]> = {};
  for (const o of orders) (byPersona[o.persona_id] ||= []).push(o);

  return (
    <section style={cardStyle}>
      <SectionHead
        title="Frågejustering — svarar profilsidan på det motorerna frågar?"
        hint="Varje gap = en (persona × värmedimension) där sidan saknar ett extraherbart svar på probe-frågan. Belägg en beställning → ett källfört culture-claim publiceras och stänger gapet vid nästa audit."
        collapsible
        open={open}
        onToggle={() => setOpen((v) => !v)}
        badge={cov ? `${pct(covRatio)} täckt · ${cov.gaps} gap` : undefined}
      />

      {open && cov && (
        <div style={{ marginTop: 16 }}>
          {/* Täckningsskala */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 8, background: 'rgba(106,126,138,0.12)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: pct(covRatio), height: '100%', background: covColor.fg, borderRadius: 5 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: covColor.fg, whiteSpace: 'nowrap' }}>
              {cov.covered}/{cov.total} batterier täckta
            </span>
          </div>

          {orders.length === 0 ? (
            <div style={{ padding: '12px 14px', background: S.resolved.bg, border: `1px solid ${S.resolved.border}`, borderRadius: 8, fontSize: 13, color: S.resolved.fg }}>
              Inga gap — profilsidan svarar på samtliga probe-frågor för de aktiva personorna.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {Object.entries(byPersona).map(([pid, list]) => (
                <div key={pid}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                    {personaLabel(pid)} <span style={{ color: C.muted, fontWeight: 500 }}>· {list.length} gap</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map((o) => (
                      <div key={`${o.persona_id}-${o.dimension}`} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', background: C.card }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: S.open.fg, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>
                              {o.dimension_label}
                            </div>
                            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                              {o.probe_neutral_q}
                            </div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
                              {o.rationale}
                            </div>
                          </div>
                          <button
                            onClick={() => setFulfilling(o)}
                            style={{
                              padding: '7px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                              color: 'white', background: S.resolved.fg,
                              border: `1px solid ${S.resolved.fg}`, borderRadius: 6, cursor: 'pointer',
                            }}
                          >
                            Belägg…
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {fulfilling && clientId && (
        <FulfillOrderModal
          clientId={clientId}
          order={fulfilling}
          onClose={() => setFulfilling(null)}
          onDone={() => { setFulfilling(null); onDone(); }}
        />
      )}
    </section>
  );
}

function FulfillOrderModal({ clientId, order, onClose, onDone }: {
  clientId: string;
  order: AlignmentClaimOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  // Förifyll med beställningens utkast-statement; ops redigerar + belägger med källa.
  const [statement, setStatement] = useState(order.suggested_statement);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [demonstrated, setDemonstrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!statement.trim()) {
      setError('Påståendet kan inte vara tomt — ingen källa/innehåll, inget claim.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await graphFetch(`/api/review/${encodeURIComponent(clientId)}/alignment/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          statement: statement.trim(),
          dimension: order.dimension,
          audience: order.audience,
          source_label: sourceLabel.trim() || null,
          source_url: sourceUrl.trim() || null,
          warmth_mode: demonstrated ? 'demonstrated' : 'declared',
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '24px 26px', width: 'min(620px, 92vw)', boxShadow: '0 20px 60px rgba(58,75,86,0.18)', border: `1px solid ${C.border}` }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Belägg gapet med ett källfört claim
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Ett culture-claim ({personaLabel(order.persona_id)} · {order.dimension_label}) som svarar på frågan.
          Publiceras i JSON-LD, FAQ och profilsidan vid nästa kompilering (triggas automatiskt); nästa audit ser
          då claimet och stänger gapet.
        </p>

        <div style={{ padding: '8px 12px', marginBottom: 16, background: 'rgba(58,75,86,0.04)', borderLeft: `2px solid ${C.border}`, borderRadius: 4, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>{order.probe_neutral_q}</strong>
          <br /><span style={{ fontStyle: 'italic' }}>Kritisk vinkel: {order.probe_adversarial_q}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormRow label="Påstående (krävs) — förifyllt utkast, redigera och belägg">
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' }}
            />
          </FormRow>
          <FormRow label="Källans namn (valfritt)">
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="T.ex. 'HR-policy 2026'"
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={demonstrated} onChange={(e) => setDemonstrated(e.target.checked)} />
            Belagt utfall med tredjepartsunderlag (väger tyngre i förtroendegapet) — annars en utsaga/policy
          </label>
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
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.muted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: submitting ? 'wait' : 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={submitting || !statement.trim()}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: 'white', background: S.resolved.fg, border: `1px solid ${S.resolved.fg}`, borderRadius: 6, cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !statement.trim()) ? 0.6 : 1 }}
          >
            {submitting ? 'Publicerar…' : 'Belägg + publicera'}
          </button>
        </div>
      </div>
    </div>
  );
}
