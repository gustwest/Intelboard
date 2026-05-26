'use client';

/** ADR-fliken: utfällbara Architecture Decision Records. */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import css from './architecture.module.css';
import { ADRS } from './data';

const STATUS_CLASS: Record<string, string> = {
  Aktiv: css.statusAktiv,
  Ersatt: css.statusErsatt,
  Föråldrad: css.statusFöråldrad,
};

export default function AdrTab() {
  const [open, setOpen] = useState<string | null>(ADRS[0]?.id ?? null);

  return (
    <div>
      <h2 className={css.sectionTitle}>Arkitekturbeslut (ADR)</h2>
      {ADRS.map((adr) => {
        const isOpen = open === adr.id;
        return (
          <div key={adr.id} className={`${css.adrCard} ${STATUS_CLASS[adr.status] ?? ''}`}>
            <button className={css.adrHead} onClick={() => setOpen(isOpen ? null : adr.id)}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className={css.adrTitle}>{adr.title}</span>
              <span className={css.pill}>{adr.status}</span>
              <span className={css.adrDate}>{adr.date}</span>
            </button>
            {isOpen && (
              <div className={css.adrBody}>
                <div className={css.detailLabel}>Kontext</div>
                <p className={css.detailText}>{adr.context}</p>
                <div className={css.detailLabel}>Beslut</div>
                <p className={css.detailText}>{adr.decision}</p>
                <div className={css.detailLabel}>Konsekvenser</div>
                <p className={css.detailText}>{adr.consequences}</p>
                <div className={css.detailLabel}>Ompröva när</div>
                <p className={css.detailText}>{adr.revisitWhen}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
