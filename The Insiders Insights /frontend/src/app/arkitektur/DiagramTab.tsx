'use client';

/**
 * Diagram-fliken: delat lager på toppen, två spår-lanes under, och en
 * integrationssektion som visar hur spåren samspelar. Klick på nod ELLER
 * integrationskant → sticky detaljpanel.
 *
 * OBS (handover §8, fallgrop #2): noder ritas i fast ordning per lane. Ändrar
 * du antalet noder måste lane-layouten justeras, inte bara arrayen.
 */
import { useState } from 'react';
import css from './architecture.module.css';
import {
  DIAGRAM_SHARED,
  DIAGRAM_INSIDERS,
  DIAGRAM_GEOGRAPH,
  DIAGRAM_INTERACTIONS,
  TRACK_LABELS,
  type DiagramNodeData,
  type Interaction,
} from './data';

type Selection =
  | { kind: 'node'; node: DiagramNodeData }
  | { kind: 'interaction'; item: Interaction }
  | null;

export default function DiagramTab() {
  const [selected, setSelected] = useState<Selection>(null);

  const isNodeActive = (id: string) => selected?.kind === 'node' && selected.node.id === id;
  const isInteractionActive = (id: string) =>
    selected?.kind === 'interaction' && selected.item.id === id;

  // Render-hjälpare (ej React-komponenter) för att slippa state-reset vid render.
  const renderNode = (node: DiagramNodeData) => (
    <button
      key={node.id}
      className={`${css.diagramNode} ${css[node.color]} ${isNodeActive(node.id) ? css.diagramNodeActive : ''}`}
      onClick={() => setSelected({ kind: 'node', node })}
    >
      <div className={css.diagramNodeLabel}>{node.label}</div>
      <div className={css.diagramNodeSub}>{node.sub}</div>
    </button>
  );

  const renderLane = (title: string, cls: string, nodes: DiagramNodeData[]) => (
    <div className={`${css.lane} ${css[cls]}`}>
      <div className={css.laneTitle}>
        <span className={css.layerDot} />
        {title}
      </div>
      {nodes.map((n, i) => (
        <div key={n.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {i > 0 && <span className={css.connector} />}
          {renderNode(n)}
        </div>
      ))}
    </div>
  );

  return (
    <div className={css.diagramWrap}>
      <div>
        {/* Delat lager */}
        <div className={css.diagramRow}>{DIAGRAM_SHARED.map((n) => renderNode(n))}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span className={css.connector} />
        </div>

        {/* Två spår-lanes */}
        <div className={css.lanes}>
          {renderLane(TRACK_LABELS.insiders, 'laneInsiders', DIAGRAM_INSIDERS)}
          {renderLane(TRACK_LABELS.geogiraph, 'laneGeogiraph', DIAGRAM_GEOGRAPH)}
        </div>

        {/* Integration mellan spåren */}
        <h2 className={css.sectionTitle} style={{ marginTop: 24 }}>
          Hur spåren samspelar
        </h2>
        <div className={css.grid}>
          {DIAGRAM_INTERACTIONS.map((item) => (
            <button
              key={item.id}
              className={`${css.card} ${css.cardClickable} ${isInteractionActive(item.id) ? css.cardSelected : ''}`}
              style={{ textAlign: 'left' }}
              onClick={() => setSelected({ kind: 'interaction', item })}
            >
              <div className={css.cardName}>{item.label}</div>
              <div className={css.cardSnippet}>
                {item.from} → {item.to}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detaljpanel */}
      <aside
        className={`${css.detailPanel} ${
          selected?.kind === 'node' ? css[selected.node.color] : ''
        }`}
      >
        {selected?.kind === 'node' ? (
          <>
            <div className={css.detailTitle}>{selected.node.label}</div>
            <span className={css.pill}>{selected.node.sub}</span>
            <div className={css.detailLabel}>Vad det är</div>
            <p className={css.detailText}>{selected.node.detail.description}</p>
            <div className={css.detailLabel}>Varför vi valde det</div>
            <p className={css.detailText}>{selected.node.detail.whyChosen}</p>
            <div className={css.detailLabel}>Alternativ vi valde bort</div>
            <p className={css.detailText}>{selected.node.detail.alternatives}</p>
            <div className={css.detailLabel}>Tekniska detaljer</div>
            <p className={css.detailText}>{selected.node.detail.techDetails}</p>
          </>
        ) : selected?.kind === 'interaction' ? (
          <>
            <div className={css.detailTitle}>{selected.item.label}</div>
            <span className={css.pill}>Integration</span>
            <div className={css.detailLabel}>Riktning</div>
            <p className={css.detailText}>
              {selected.item.from} → {selected.item.to}
            </p>
            <div className={css.detailLabel}>Så funkar det</div>
            <p className={css.detailText}>{selected.item.detail}</p>
          </>
        ) : (
          <div className={css.placeholder}>
            Klicka på en nod eller en integrationskoppling →
          </div>
        )}
      </aside>
    </div>
  );
}
