'use client';

/**
 * Domänmoduler som SVG-graf — ingen graf-lib.
 * Manuella positioner i MODULE_POSITIONS (viewBox 0 0 680 450). "Används av"
 * räknas ut automatiskt ur alla moduleUses. Kopplingsgrad = uses + usedBy.
 * Klick på nod → highlight av dess kanter + detaljpanel under grafen.
 */
import { useMemo, useState } from 'react';
import css from './architecture.module.css';
import { MODULES, MODULE_POSITIONS } from './data';

const W = 120;
const H = 56;

type Edge = { from: string; to: string; via: string };

function center(id: string): [number, number] {
  const [x, y] = MODULE_POSITIONS[id] ?? [0, 0];
  return [x + W / 2, y + H / 2];
}

/** Bezier-path mellan två noder. Horisontella kopplingar får en uppåtbåge. */
function edgePath(from: string, to: string): string {
  const [fx, fy] = center(from);
  const [tx, ty] = center(to);
  const dy = Math.abs(ty - fy);
  if (dy < H) {
    // Horisontell — båge uppåt
    const midX = (fx + tx) / 2;
    const lift = fy - 48;
    return `M ${fx} ${fy} Q ${midX} ${lift} ${tx} ${ty}`;
  }
  // Vertikal — botten-center → topp-center
  const fromBottom = fy + H / 2;
  const toTop = ty - H / 2;
  const midY = (fromBottom + toTop) / 2;
  return `M ${fx} ${fromBottom} C ${fx} ${midY} ${tx} ${midY} ${tx} ${toTop}`;
}

export default function ModuleGraph() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const edges: Edge[] = useMemo(
    () => MODULES.flatMap((m) => m.moduleUses.map((u) => ({ from: m.id, to: u.id, via: u.via }))),
    [],
  );

  const degree = useMemo(() => {
    const d: Record<string, number> = {};
    for (const m of MODULES) d[m.id] = 0;
    for (const e of edges) {
      d[e.from] = (d[e.from] ?? 0) + 1;
      d[e.to] = (d[e.to] ?? 0) + 1;
    }
    return d;
  }, [edges]);

  const selectedModule = MODULES.find((m) => m.id === selectedId) ?? null;
  const uses = selectedModule?.moduleUses ?? [];
  const usedBy = edges.filter((e) => e.to === selectedId);

  const isEdgeActive = (e: Edge) => selectedId != null && (e.from === selectedId || e.to === selectedId);

  return (
    <div>
      <svg className={css.graphSvg} viewBox="0 0 680 450" role="img" aria-label="Beroendegraf över domänmoduler">
        <defs>
          <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--brand-muted)" />
          </marker>
          <marker id="arrowActive" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--brand-accent)" />
          </marker>
        </defs>

        {/* Kanter ritas först så noder ligger ovanpå */}
        {edges.map((e, i) => {
          const active = isEdgeActive(e);
          return (
            <path
              key={i}
              d={edgePath(e.from, e.to)}
              fill="none"
              stroke={active ? 'var(--brand-accent)' : 'var(--brand-border)'}
              strokeWidth={active ? 2 : 1.5}
              markerEnd={active ? 'url(#arrowActive)' : 'url(#arrow)'}
              opacity={selectedId && !active ? 0.25 : 1}
            />
          );
        })}

        {/* Noder */}
        {MODULES.map((m) => {
          const [x, y] = MODULE_POSITIONS[m.id] ?? [0, 0];
          const active = selectedId === m.id;
          const deg = degree[m.id] ?? 0;
          return (
            <g
              key={m.id}
              transform={`translate(${x}, ${y})`}
              onClick={() => setSelectedId(active ? null : m.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                width={W}
                height={H}
                rx={10}
                fill="var(--brand-panel)"
                stroke={active ? 'var(--brand-accent)' : 'var(--brand-border)'}
                strokeWidth={active ? 2 : 1}
              />
              <text x={14} y={26} fontSize={16}>
                {m.emoji}
              </text>
              <text x={36} y={31} fill="var(--brand-text)" fontSize={12} fontWeight={600}>
                {m.name}
              </text>
              {/* Badge med kopplingsgrad */}
              <circle cx={W - 12} cy={12} r={9} fill={deg >= 3 ? 'var(--brand-accent)' : 'var(--brand-bg)'} stroke="var(--brand-border)" />
              <text x={W - 12} y={16} textAnchor="middle" fontSize={10} fill={deg >= 3 ? 'var(--brand-bg)' : 'var(--brand-muted)'} fontWeight={700}>
                {deg}
              </text>
            </g>
          );
        })}
      </svg>

      <div className={css.detailPanel} style={{ position: 'static', marginTop: 16 }}>
        {selectedModule ? (
          <>
            <div className={css.detailTitle}>
              {selectedModule.emoji} {selectedModule.name}
            </div>
            <p className={css.detailText}>{selectedModule.description}</p>
            <div className={css.detailLabel}>Använder</div>
            {uses.length ? (
              uses.map((u) => (
                <p key={u.id} className={css.detailText}>
                  → <strong style={{ color: 'var(--brand-text)' }}>{MODULES.find((m) => m.id === u.id)?.name ?? u.id}</strong> · {u.via}
                </p>
              ))
            ) : (
              <p className={css.detailText}>Inga utgående beroenden.</p>
            )}
            <div className={css.detailLabel}>Används av</div>
            {usedBy.length ? (
              usedBy.map((e, i) => (
                <p key={i} className={css.detailText}>
                  ← <strong style={{ color: 'var(--brand-text)' }}>{MODULES.find((m) => m.id === e.from)?.name ?? e.from}</strong> · {e.via}
                </p>
              ))
            ) : (
              <p className={css.detailText}>Ingen modul beror på denna.</p>
            )}
          </>
        ) : (
          <div className={css.placeholder}>Klicka på en modul i grafen. Siffran i hörnet = kopplingsgrad (uses + används av).</div>
        )}
      </div>
    </div>
  );
}
