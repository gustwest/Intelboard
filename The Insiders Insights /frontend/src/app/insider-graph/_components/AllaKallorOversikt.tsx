'use client';

import { useEffect, useState } from 'react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';
import { CONNECTOR_NAME } from '../_lib/connectors';
import { fmtDate } from '@/lib/datetime';

type ConnStatus = { state: 'live' | 'staged' | 'idle'; last_at: string | null; detail?: string };
type ConnResp = { active_connectors: string[]; connector_status?: Record<string, ConnStatus> };
type AttestedType = { key: string; label: string; included: number; staged: number; last_attested_at: string | null };
type AttestedResp = { source_types: AttestedType[] };

type SrcState = 'live' | 'staged' | 'idle' | 'off';
type Row = { name: string; kind: 'Connector' | 'Uppladdning'; state: SrcState; date: string | null };

const CHIP: Record<SrcState, { label: string; color: string; bg: string }> = {
  live: { label: 'I leverans', color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  staged: { label: 'Väntar', color: '#b45309', bg: 'rgba(245,158,11,0.12)' },
  idle: { label: 'Ingen data', color: C.muted, bg: 'rgba(106,126,138,0.08)' },
  off: { label: 'Av', color: C.dim, bg: 'transparent' },
};

/** C2 + C3: "Alla källor"-översikt — en samlad, read-only vy över VARJE datakälla
 * (connectors + uppladdningar) med konsekvent leveransstatus (i leverans / väntar /
 * ingen data / av). Stänger C3 (se alla källor + aktiv→claims vs inaktiv) och C2:s
 * egentliga intent (enhetlig leveransstatus över alla källor). Editorerna nedan står
 * kvar för konfiguration; det här kortet är överblicken. */
export default function AllaKallorOversikt({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [conn, att] = await Promise.all([
        graphFetch<ConnResp>(`/api/connectors/${clientId}`),
        graphFetch<AttestedResp>(`/api/attested/${clientId}/status`).catch(() => ({ source_types: [] as AttestedType[] })),
      ]);
      if (cancelled) return;
      const active = conn.active_connectors || [];
      const cstat = conn.connector_status || {};
      const out: Row[] = [];
      // Alla kända connectors — aktiva får sin tri-state, övriga "av" (så ops ser vad
      // som INTE hämtas också, inte bara det som är på).
      for (const cid of Object.keys(CONNECTOR_NAME)) {
        const s = cstat[cid];
        out.push({
          name: CONNECTOR_NAME[cid],
          kind: 'Connector',
          state: active.includes(cid) ? (s?.state ?? 'idle') : 'off',
          date: s?.last_at ?? null,
        });
      }
      // Uppladdningar — attesterade källtyper som faktiskt har data (staged → väntar,
      // annars i leverans). Tomma typer visas inte (ingen uppladdning gjord).
      for (const st of att.source_types) {
        if (!st.included && !st.staged) continue;
        out.push({
          name: st.label,
          kind: 'Uppladdning',
          state: st.staged > 0 ? 'staged' : st.included > 0 ? 'live' : 'idle',
          date: st.last_attested_at,
        });
      }
      setRows(out);
    })().catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Alla källor</div>
      <p style={{ fontSize: 11, color: C.dim, margin: '0 0 12px' }}>
        Varje datakälla — connectors och uppladdningar — med leveransstatus.{' '}
        <strong style={{ color: '#16a34a' }}>I leverans</strong> = göder claims på profilen.{' '}
        Konfigurera respektive källa nedan.
      </p>
      {rows === null ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Inga källor än.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => {
            const chip = CHIP[r.state];
            return (
              <div key={`${r.kind}-${r.name}`} style={{ display: 'grid', gridTemplateColumns: '1.5fr auto 110px 96px', gap: 10, alignItems: 'center', fontSize: 12, padding: '7px 0', borderTop: i ? `1px solid ${C.border}` : 'none', opacity: r.state === 'off' ? 0.55 : 1 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>{r.name}</span>
                <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.kind}</span>
                <span style={{ justifySelf: 'start', fontSize: 10, fontWeight: 600, color: chip.color, background: chip.bg, border: `1px solid ${chip.color}33`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{chip.label}</span>
                <span style={{ color: C.dim, fontSize: 11, textAlign: 'right' }}>{r.date ? fmtDate(r.date) : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </UI.Card>
  );
}
