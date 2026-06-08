'use client';

import { useEffect, useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { graphFetch } from '../../_lib/api';
import {
  DecisionConfidence,
  Finding,
  WhatIfResult,
  PERSONA_SV,
  cardStyle,
  harmLabel,
} from '../_shared';
import { SectionHead } from './common';

/**
 * What-if ovanpå receptmotorn (#1a): låter operatören simulera "om vi löser den här
 * risken / publicerar den här korrigeringen → vart rör sig beslutssäkerheten" INNAN
 * åtgärd. Deterministisk projektion av poäng-formeln — inte en empirisk prognos.
 *
 * Matvaliditet: en projicerad rörelse mindre än brusbandet (exceeds_band=false)
 * grå-tonas och märks "inom felmarginalen" — samma princip som SoV-trendpilarna.
 */
export function WhatIfPanel({ clientId, conf, detected }: {
  clientId: string;
  conf: DecisionConfidence;
  detected: Finding[];
}) {
  const openFindings = detected.filter((f) => f.id && (f.status === 'open' || !f.status));
  const canBroaden = conf.covered_personas < 3;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broaden, setBroaden] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasInput = selected.size > 0 || broaden;

  useEffect(() => {
    // Inga val → ingen projektion. Render-grinden (hasInput && result) döljer ev. förra
    // resultatet. Vi sätter state bara i de asynkrona callbacksen (som övriga fetch-effekter
    // i denna fil) — förra resultatet ligger kvar tills det nya landar, ingen blink.
    if (!hasInput) return;
    let cancelled = false;
    graphFetch<WhatIfResult>(`/api/forecast/${encodeURIComponent(clientId)}/confidence/whatif`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resolve_finding_ids: Array.from(selected),
        simulate_full_coverage: broaden,
      }),
    })
      .then((r) => { if (!cancelled) { setResult(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [clientId, selected, broaden, hasInput]);

  if (openFindings.length === 0 && !canBroaden) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="What-if — innan ni agerar"
        hint="Simulera hur beslutssäkerheten rör sig om risker löses eller mätningen breddas. En deterministisk projektion av poängen, inte en prognos — och en rörelse mindre än brusbandet räknas som brus, inte trend."
      />

      {openFindings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
            Vilka risker skulle ni lösa?
          </div>
          {openFindings.map((f) => (
            <label key={f.id!} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: C.text, cursor: 'pointer', padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={selected.has(f.id!)}
                onChange={() => toggle(f.id!)}
                style={{ marginTop: 2, cursor: 'pointer' }}
              />
              <span style={{ flex: 1 }}>
                <span style={{ color: C.muted }}>{f.persona ? PERSONA_SV[f.persona] || f.persona : '—'} · {harmLabel(f.harm)}</span>
                <br />
                {f.question || '—'}
              </span>
            </label>
          ))}
        </div>
      )}

      {canBroaden && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.text, cursor: 'pointer', padding: '8px 0', borderTop: openFindings.length > 0 ? `1px solid ${C.border}` : 'none' }}>
          <input type="checkbox" checked={broaden} onChange={() => setBroaden((b) => !b)} style={{ cursor: 'pointer' }} />
          <span>Simulera mätning av alla tre personas ({conf.covered_personas}/3 idag) — låser upp taket</span>
        </label>
      )}

      {error && <p style={{ fontSize: 12, color: '#b91c1c', margin: '10px 0 0' }}>Kunde inte projicera: {error}</p>}

      {!hasInput && (
        <p style={{ fontSize: 12, color: C.dim, margin: '8px 0 0' }}>
          Välj en eller flera risker {canBroaden ? 'eller kryssa täckningsrutan ' : ''}för att se den projicerade beslutssäkerheten.
        </p>
      )}

      {hasInput && result && <WhatIfOutcome result={result} />}
    </div>
  );
}

function WhatIfOutcome({ result }: { result: WhatIfResult }) {
  const before = result.before.score;
  const after = result.after.score;
  const credible = result.exceeds_band;
  const arrowColor = credible ? (result.delta && result.delta > 0 ? '#16a34a' : '#b91c1c') : C.muted;

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(106,126,138,0.05)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Projicerad beslutssäkerhet</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span>{before ?? '—'}</span>
        <span style={{ color: C.dim, fontSize: 18 }}>→</span>
        <span style={{ color: credible ? C.text : C.muted }}>{after ?? '—'}</span>
        {result.delta != null && (
          <span style={{ fontSize: 15, color: arrowColor }}>
            {result.delta > 0 ? `+${result.delta}` : result.delta}
          </span>
        )}
        <span style={{ fontSize: 14, color: C.dim, fontWeight: 400 }}>/ 100</span>
      </div>

      {!credible && result.delta != null && result.delta !== 0 && (
        <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
          Rörelsen ryms inom brusbandet — räkna med den som riktning, inte som en säker effekt. Den syns säkert först efter en mätning.
        </p>
      )}

      {result.ceiling_unlocked > 0 && (
        <p style={{ fontSize: 12, color: C.text, margin: '8px 0 0', lineHeight: 1.5 }}>
          Taket höjs <strong>{result.before.ceiling} → {result.after.ceiling}</strong> (+{result.ceiling_unlocked} möjliga) när alla tre personas mäts.
        </p>
      )}

      <p style={{ fontSize: 10, color: C.dim, margin: '10px 0 0', lineHeight: 1.5 }}>
        Projektion av poäng-formeln om {result.resolved_count > 0 ? `${result.resolved_count} risk(er) räknas som lösta` : 'mätningen breddas'} — inte ett löfte om utfall.
      </p>
    </div>
  );
}
