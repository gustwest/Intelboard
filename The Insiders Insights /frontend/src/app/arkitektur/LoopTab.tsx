'use client';

/**
 * Loop-fliken: visualiserar Geogiraphs SLUTNA LOOP som en numrerad cykel —
 * mät gap → generera recept → operatör godkänner & publicerar → skörda &
 * leverera → mät igen & verifiera → tillbaka till steg 1. Klick på ett steg
 * → sticky detaljpanel (vad / vem / var i koden / output). Se ADR-008.
 *
 * Kärnprincip som diagrammet ska göra tydlig: systemet mäter, föreslår och
 * verifierar AUTOMATISKT, men människan godkänner och publicerar — inga
 * claims fabriceras för att täcka ett gap.
 */
import { useState } from 'react';
import css from './architecture.module.css';
import { CLOSED_LOOP_STEPS, type LoopStep } from './data';

export default function LoopTab() {
  const [selected, setSelected] = useState<LoopStep | null>(CLOSED_LOOP_STEPS[0]);

  return (
    <div className={css.diagramWrap}>
      <div>
        <p className={css.detailText} style={{ marginBottom: 16 }}>
          Den slutna loopen i Geogiraph: systemet{' '}
          <strong style={{ color: 'var(--brand-text)' }}>mäter</strong> ett förtroendegap,{' '}
          <strong style={{ color: 'var(--brand-text)' }}>föreslår</strong> ett recept och{' '}
          <strong style={{ color: 'var(--brand-text)' }}>verifierar</strong> utfallet automatiskt — men en
          operatör <strong style={{ color: 'var(--brand-text)' }}>godkänner och publicerar</strong> det
          faktiska innehållet. Inga claims fabriceras. Klicka på ett steg för detaljer.
        </p>

        <div className={css.loopFlow}>
          {CLOSED_LOOP_STEPS.map((step, i) => (
            <div key={step.id} className={css.loopRow}>
              {i > 0 && <span className={`${css.connector} ${css.loopConnector}`} />}
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
          ))}

          {/* Loopen sluts: steg 8 → steg 1 */}
          <span className={`${css.connector} ${css.loopConnector}`} />
          <div className={css.loopBack}>
            ↩ Loopen sluts — utfallet från steg 8 blir nästa mätning i steg 1
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
