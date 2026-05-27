'use client';

/**
 * Domänmoduler som SVG-graf — ingen graf-lib. Renderar ETT spår i taget;
 * moduler, positioner och viewBox skickas in som props (per spår från ModulesTab).
 * "Används av" räknas ut automatiskt; kopplingsgrad = uses + usedBy.
 */
import { useMemo, useState } from 'react';
import css from './architecture.module.css';
import type { ModuleNode } from './data';

const W = 130;
const H = 56;

type Edge = { from: string; to: string; via: string };

export default function ModuleGraph({
  modules,
  positions,
  viewBox,
}: {
  modules: ModuleNode[];
  positions: Record<string, [number, number]>;
  viewBox: { w: number; h: number };
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const center = (id: string): [number, number] => {
    const [x, y] = positions[id] ?? [0, 0];
    return [x + W / 2, y + H / 2];
  };

  const edgePath = (from: string, to: string): string => {
    const [fx, fy] = center(from);
    const [tx, ty] = center(to);
    if (Math.abs(ty - fy) < H) {
      const midX = (fx + tx) / 2;
      return `M ${fx} ${fy} Q ${midX} ${fy - 48} ${tx} ${ty}`;
    }
    const fromBottom = fy + H / 2;
    const toTop = ty - H / 2;
    const midY = (fromBottom + toTop) / 2;
    return `M ${fx} ${fromBottom} C ${fx} ${midY} ${tx} ${midY} ${tx} ${toTop}`;
  };

  const edges: Edge[] = useMemo(
    () =>
      modules
        .flatMap((m) => m.moduleUses.map((u) => ({ from: m.id, to: u.id, via: u.via })))
        .filter((e) => positions[e.from] && positions[e.to]),
    [modules, positions],
  );

  const degree = useMemo(() => {
    const d: Record<string, number> = {};
    for (const m of modules) d[m.id] = 0;
    for (const e of edges) {
      d[e.from] = (d[e.from] ?? 0) + 1;
      d[e.to] = (d[e.to] ?? 0) + 1;
    }
    return d;
  }, [modules, edges]);

  const selectedModule = modules.find((m) => m.id === selectedId) ?? null;
  const uses = selectedModule?.moduleUses ?? [];
  const usedBy = edges.filter((e) => e.to === selectedId);
  const isEdgeActive = (e: Edge) => selectedId != null && (e.from === selectedId || e.to === selectedId);

  return (
    <div>
      <svg
        className={css.graphSvg}
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        role="img"
        aria-label="Beroendegraf över domänmoduler"
      >
        <defs>
          <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--brand-muted)" />
          </marker>
          <marker id="arrowActive" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--brand-accent)" />
          </marker>
        </defs>

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

        {modules.map((m) => {
          const [x, y] = positions[m.id] ?? [0, 0];
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
              <text x={36} y={31} fill="var(--brand-text)" fontSize={11} fontWeight={600}>
                {m.name.length > 16 ? m.name.slice(0, 15) + '…' : m.name}
              </text>
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
                  → <strong style={{ color: 'var(--brand-text)' }}>{modules.find((m) => m.id === u.id)?.name ?? u.id}</strong> · {u.via}
                </p>
              ))
            ) : (
              <p className={css.detailText}>Inga utgående beroenden.</p>
            )}
            <div className={css.detailLabel}>Används av</div>
            {usedBy.length ? (
              usedBy.map((e, i) => (
                <p key={i} className={css.detailText}>
                  ← <strong style={{ color: 'var(--brand-text)' }}>{modules.find((m) => m.id === e.from)?.name ?? e.from}</strong> · {e.via}
                </p>
              ))
            ) : (
              <p className={css.detailText}>Ingen modul beror på denna.</p>
            )}
          </>
        ) : (
          <div className={css.placeholder}>Klicka på en modul. Siffran i hörnet = kopplingsgrad (uses + används av).</div>
        )}
      </div>
    </div>
  );
}
