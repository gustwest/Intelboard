'use client';

/**
 * Diagram-fliken: klickbart systemdiagram.
 * Klienter (topp) → mittkolumn DIAGRAM_NODES[0..5] med pilar mellan → sidnoder (externa tjänster).
 * Klick på nod → sticky detaljpanel (vad/varför/alternativ/tekniska detaljer).
 *
 * OBS (handover §8, fallgrop #2): noderna ritas i fast index-ordning. Ändrar du
 * antalet noder i DIAGRAM_NODES måste layouten nedan justeras, inte bara arrayen.
 */
import { useState } from 'react';
import css from './architecture.module.css';
import { CLIENTS, DIAGRAM_NODES, SIDE_NODES, type DiagramNodeData } from './data';

export default function DiagramTab() {
  const [selected, setSelected] = useState<DiagramNodeData | null>(null);

  const Node = ({ node }: { node: DiagramNodeData }) => (
    <button
      className={`${css.diagramNode} ${css[node.color]} ${selected?.id === node.id ? css.diagramNodeActive : ''}`}
      onClick={() => setSelected(node)}
    >
      <div className={css.diagramNodeLabel}>{node.label}</div>
      <div className={css.diagramNodeSub}>{node.sub}</div>
    </button>
  );

  return (
    <div className={css.diagramWrap}>
      <div className={css.diagramCol}>
        {/* Klienter */}
        <div className={css.diagramRow}>
          {CLIENTS.map((c) => (
            <Node key={c.id} node={c} />
          ))}
        </div>

        {/* Mittkolumn — fast ordning med pilar mellan */}
        {DIAGRAM_NODES.map((n) => (
          <div key={n.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span className={css.connector} />
            <Node node={n} />
          </div>
        ))}
      </div>

      {/* Sidnoder + detaljpanel */}
      <div>
        <div className={css.sideCol} style={{ marginBottom: 20 }}>
          <div className={css.small + ' ' + css.muted}>Externa tjänster</div>
          {SIDE_NODES.map((s) => (
            <Node key={s.id} node={s} />
          ))}
        </div>

        <aside className={`${css.detailPanel} ${selected ? css[selected.color] : ''}`}>
          {selected ? (
            <>
              <div className={css.detailTitle}>{selected.label}</div>
              <span className={css.pill}>{selected.sub}</span>
              <div className={css.detailLabel}>Vad det är</div>
              <p className={css.detailText}>{selected.detail.description}</p>
              <div className={css.detailLabel}>Varför vi valde det</div>
              <p className={css.detailText}>{selected.detail.whyChosen}</p>
              <div className={css.detailLabel}>Alternativ vi valde bort</div>
              <p className={css.detailText}>{selected.detail.alternatives}</p>
              <div className={css.detailLabel}>Tekniska detaljer</div>
              <p className={css.detailText}>{selected.detail.techDetails}</p>
            </>
          ) : (
            <div className={css.placeholder}>Klicka på en nod i diagrammet →</div>
          )}
        </aside>
      </div>
    </div>
  );
}
