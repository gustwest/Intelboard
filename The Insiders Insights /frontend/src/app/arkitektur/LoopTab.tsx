'use client';

/**
 * Loop-fliken: visualiserar hela KUNDRESAN som en numrerad cykel i två faser —
 *   • Etablering (steg 1–4, engång): onboarding → insamling → claims →
 *     första leveransen till CDN. Här byggs och publiceras grafen.
 *   • Den slutna loopen (steg 5–12, återkommande): mät gap → recept →
 *     operatör godkänner & publicerar → skörda & leverera → mät igen &
 *     verifiera → tillbaka till steg 5 (INTE onboarding).
 * Klick på ett steg → sticky detaljpanel (vad / vem / var i koden / output).
 * Se ADR-008.
 *
 * Kärnprincip som diagrammet ska göra tydlig: systemet mäter, föreslår och
 * verifierar AUTOMATISKT, men människan godkänner och publicerar — inga
 * claims fabriceras för att täcka ett gap.
 */
import { useState } from 'react';
import css from './architecture.module.css';
import { CLOSED_LOOP_STEPS, LOOP_PHASES, type LoopStep, type LoopPhase } from './data';

export default function LoopTab() {
  const [selected, setSelected] = useState<LoopStep | null>(CLOSED_LOOP_STEPS[0]);

  return (
    <div className={css.diagramWrap}>
      <div>
        <p className={css.detailText} style={{ marginBottom: 16 }}>
          Kundresan i Geogiraph, från start till sluten loop. Vid{' '}
          <strong style={{ color: 'var(--brand-text)' }}>onboarding</strong> byggs grafen och{' '}
          <strong style={{ color: 'var(--brand-text)' }}>levereras</strong> första gången (engång). Sedan
          går systemet in i den slutna loopen: det <strong style={{ color: 'var(--brand-text)' }}>mäter</strong>{' '}
          ett förtroendegap, <strong style={{ color: 'var(--brand-text)' }}>föreslår</strong> ett recept och{' '}
          <strong style={{ color: 'var(--brand-text)' }}>verifierar</strong> utfallet automatiskt — men en
          operatör <strong style={{ color: 'var(--brand-text)' }}>godkänner och publicerar</strong> det
          faktiska innehållet. Inga claims fabriceras. Klicka på ett steg för detaljer.
        </p>

        <div className={css.loopFlow}>
          {CLOSED_LOOP_STEPS.map((step, i) => {
            const prevPhase: LoopPhase | undefined = CLOSED_LOOP_STEPS[i - 1]?.phase;
            const isPhaseStart = step.phase !== prevPhase;
            const phaseMeta = LOOP_PHASES[step.phase];
            return (
              <div key={step.id} className={css.loopRow}>
                {isPhaseStart ? (
                  <div
                    className={`${css.loopPhase} ${phaseMeta.oneTime ? css.loopPhaseOnce : css.loopPhaseRecurring}`}
                  >
                    <span className={css.loopPhaseTitle}>{phaseMeta.title}</span>
                    <span className={css.loopPhaseBadge}>{phaseMeta.oneTime ? 'engång' : 'återkommande'}</span>
                    <span className={css.loopPhaseTagline}>{phaseMeta.tagline}</span>
                  </div>
                ) : (
                  <span className={`${css.connector} ${css.loopConnector}`} />
                )}
                <button
                  className={`${css.loopStep} ${css[step.color]} ${
                    selected?.id === step.id ? css.diagramNodeActive : ''
                  }`}
                  onClick={() => setSelected(step)}
                >
                  <span className={`${css.loopNum} ${css[step.color]}`}>{step.num}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span className={css.diagramNodeLabel}>{step.label}</span>
                    <span className={css.diagramNodeSub} style={{ display: 'block' }}>
                      {step.sub}
                    </span>
                  </span>
                  <span className={`${css.pill} ${css[step.color]}`}>{step.actor}</span>
                </button>
              </div>
            );
          })}

          {/* Loopen sluts: steg 12 → steg 5 (onboarding/etablering körs aldrig om) */}
          <span className={`${css.connector} ${css.loopConnector}`} />
          <div className={css.loopBack}>
            ↩ Loopen sluts — utfallet från steg 12 blir nästa mätning i steg 5. Etableringen (steg 1–4) körs
            bara en gång per kund.
          </div>
        </div>
      </div>

      <aside className={`${css.detailPanel} ${selected ? css[selected.color] : ''}`}>
        {selected ? (
          <>
            <div className={css.detailTitle}>
              {selected.num}. {selected.label}
            </div>
            <span className={css.pill}>{selected.actor}</span>{' '}
            <span className={css.pill}>{selected.sub}</span>
            <div className={css.detailLabel}>Vad steget gör</div>
            <p className={css.detailText}>{selected.detail.what}</p>
            <div className={css.detailLabel}>Vem / automatiskt?</div>
            <p className={css.detailText}>{selected.detail.who}</p>
            <div className={css.detailLabel}>Var i koden</div>
            <p className={css.detailText} style={{ fontFamily: 'ui-monospace, monospace' }}>
              {selected.detail.where}
            </p>
            <div className={css.detailLabel}>Output</div>
            <p className={css.detailText}>{selected.detail.output}</p>
          </>
        ) : (
          <div className={css.placeholder}>Klicka på ett steg →</div>
        )}
      </aside>
    </div>
  );
}
