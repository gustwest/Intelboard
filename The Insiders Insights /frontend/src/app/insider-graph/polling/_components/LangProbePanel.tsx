'use client';

import { useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { graphFetch } from '../../_lib/api';
import { ENGINE_SV, S, cardStyle } from '../_shared';
import { SectionHead } from './common';

// C2 — sv-vs-en språkexperiment (services/lang_probe). Visar omnämnandegrad per
// (motor × språk) + vinnande språk (signifikanstestat), läsväg för språkbeslutet C3.

type LangBucket = { asked: number; mentioned: number; rate: number | null };
type EngineResult = {
  sv: LangBucket;
  en: LangBucket;
  delta: number | null;
  z: number | null;
  significant: boolean;
  winner: 'sv' | 'en' | 'inconclusive' | 'n/a';
};

export type LangProbeResp = {
  client_id: string;
  status: 'ok' | 'not_run';
  company?: string;
  computed_at?: string;
  pairs?: number;
  runs?: number;
  per_engine?: Record<string, EngineResult>;
};

const engineLabel = (id: string) => ENGINE_SV[id] || id;
const ratePct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

const WINNER: Record<string, { text: string; tone: { fg: string; bg: string; border: string } }> = {
  sv: { text: 'Svenska', tone: S.info },
  en: { text: 'Engelska', tone: S.inProgress },
  inconclusive: { text: 'Oavgjort (inom bruset)', tone: S.neutral },
  'n/a': { text: 'Otillräckligt underlag', tone: S.neutral },
};

export function LangProbePanel({ data, clientId }: {
  data: LangProbeResp;
  clientId: string | null;
}) {
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!clientId) return;
    setTriggering(true);
    setError(null);
    try {
      await graphFetch(`/api/jobs/lang-probe/${encodeURIComponent(clientId)}`, { method: 'POST' });
      setTriggered(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte starta — försök igen');
    } finally {
      setTriggering(false);
    }
  }

  if (data.status === 'not_run') {
    return (
      <section style={cardStyle}>
        <SectionHead
          title="Mätspråk — syns kunden bättre på svenska eller engelska?"
          hint="C2-experimentet kör samma frågor på sv och en mot AI-motorerna och mäter omnämnandegrad per språk. Citerbarhet är motor- och språkspecifik; resultatet avgör mätspråket (C3)."
          badge="ej körd än"
        />
        <p style={{ fontSize: 13, color: C.muted, margin: '12px 0 14px', lineHeight: 1.5 }}>
          Har inte körts för den här kunden än. Körningen tar ~ett par minuter (upprepad sampling per
          fråga × språk × motor med signifikanstest) och kräver probe-nycklar — den går via Cloud Run-jobbet.
        </p>
        {triggered ? (
          <div style={{ padding: '10px 14px', background: S.info.bg, border: `1px solid ${S.info.border}`, borderRadius: 8, fontSize: 13, color: S.info.fg, lineHeight: 1.5 }}>
            Körning startad. Uppdatera om en stund — sv/en-jämförelsen per motor dyker upp här när jobbet är klart.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={run}
              disabled={triggering || !clientId}
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: 'white', background: S.resolved.fg, border: `1px solid ${S.resolved.fg}`, borderRadius: 6, cursor: triggering ? 'wait' : 'pointer', opacity: triggering ? 0.6 : 1 }}
            >
              {triggering ? 'Startar…' : 'Kör språkexperiment'}
            </button>
            <span style={{ fontSize: 12, color: C.muted }}>sv vs en · signifikanstestat · kör inte oftare än nödvändigt</span>
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: S.open.bg, border: `1px solid ${S.open.border}`, color: S.open.fg, borderRadius: 6, fontSize: 12 }}>
            {error}
          </div>
        )}
      </section>
    );
  }

  const engines = Object.entries(data.per_engine || {});

  return (
    <section style={cardStyle}>
      <SectionHead
        title="Mätspråk — syns kunden bättre på svenska eller engelska?"
        hint="Omnämnandegrad per motor × språk (C2). Vinnare utses bara när sv/en-skillnaden är statistiskt signifikant — annars ligger den i bruset. Matar språkbeslutet C3."
        badge={data.pairs != null ? `${data.pairs} frågor · ${data.runs ?? '?'} körningar` : undefined}
      />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {engines.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted }}>Inga motorresultat i körningen.</div>
        ) : engines.map(([engine, r]) => {
          const w = WINNER[r.winner] || WINNER['n/a'];
          return (
            <div key={engine} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', background: C.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{engineLabel(engine)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: w.tone.fg, background: w.tone.bg, border: `1px solid ${w.tone.border}`, borderRadius: 999, padding: '2px 10px' }}>
                  {w.text}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 18, fontSize: 12, color: C.muted }}>
                <span>Svenska: <strong style={{ color: C.text }}>{ratePct(r.sv?.rate)}</strong> <span style={{ opacity: 0.7 }}>({r.sv?.mentioned}/{r.sv?.asked})</span></span>
                <span>Engelska: <strong style={{ color: C.text }}>{ratePct(r.en?.rate)}</strong> <span style={{ opacity: 0.7 }}>({r.en?.mentioned}/{r.en?.asked})</span></span>
                {r.z != null && <span style={{ opacity: 0.7 }}>z={r.z}{r.significant ? ' · signifikant' : ''}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
