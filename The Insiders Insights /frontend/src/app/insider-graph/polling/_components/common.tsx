'use client';

import { Radar } from 'lucide-react';
import { graphColors as C } from '../../_components/GraphPageShell';
import * as UI from '../../_components/ui';
import { S, GEO_STAGES, cardStyle } from '../_shared';

export function SectionHead({ title, hint, collapsible, open, onToggle, badge }: {
  title: string;
  hint?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  badge?: string;
}) {
  const interactive = collapsible
    ? { ...UI.toggleProps(!!open, onToggle), style: { marginBottom: 14, cursor: 'pointer', userSelect: 'none' } as React.CSSProperties }
    : { style: { marginBottom: 14 } as React.CSSProperties };
  return (
    <div {...interactive}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {collapsible && <UI.Chevron open={!!open} />}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, letterSpacing: '-0.005em' }}>{title}</h2>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 600, color: S.inProgress.fg, background: S.inProgress.bg, border: `1px solid ${S.inProgress.border}`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em' }}>{badge}</span>
        )}
      </div>
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0 0', lineHeight: 1.55, paddingLeft: collapsible ? 20 : 0 }}>{hint}</p>}
    </div>
  );
}

export function StageScale({ score, ceiling }: { score: number; ceiling: number }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 8, background: '#eef0f1', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${score}%`, background: C.accent, borderRadius: 5 }} />
        {/* Tak — markerar att 100 aldrig nås */}
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${ceiling}%`, width: 2, background: C.dim }} title={`Tak ${ceiling}`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GEO_STAGES.length}, 1fr)`, marginTop: 6, fontSize: 10, letterSpacing: '0.04em', color: C.dim }}>
        {GEO_STAGES.map(([t, name]) => (
          <span key={t} style={{ color: score >= t ? C.accent : C.dim, fontWeight: score >= t ? 600 : 400 }}>{name}</span>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ series, width = 88, height = 22 }: { series: (number | null)[] | undefined; width?: number; height?: number }) {
  const pts = (series || []).filter((v): v is number => v != null);
  if (pts.length < 2) return <span style={{ fontSize: 10, color: C.dim }}>—</span>;
  const max = Math.max(...pts, 0.001);
  const step = width / (pts.length - 1);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = last - first;
  const color = delta > 0.02 ? '#16a34a' : delta < -0.02 ? '#b91c1c' : C.muted;
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-label={`trend ${Math.round(first * 100)}→${Math.round(last * 100)}%`}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - (last / max) * (height - 2) - 1} r={2} fill={color} />
    </svg>
  );
}

export function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em', color: color || (accent ? C.accent : C.text) }}>{value}</div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div style={{ ...cardStyle, padding: '48px 24px', textAlign: 'center' }}>
      <Radar size={32} color={C.dim} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>Ingen riskrapport ännu</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Generera och godkänn ett frågebatteri, kör riskdetekteringen och bygg månadsrapporten
        (jobben <code style={{ color: C.accent }}>risk-generate</code> → <code style={{ color: C.accent }}>risk-detect</code> → <code style={{ color: C.accent }}>monthly-report</code>).
        Rapporten dyker upp här när den finns.
      </div>
    </div>
  );
}

export function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function LoopStat({ label, value, tone, hint }: { label: string; value: number | string; tone: 'urgent' | 'good' | 'idle'; hint?: string }) {
  const color = tone === 'urgent' ? '#b45309' : tone === 'good' ? '#16a34a' : C.muted;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color, letterSpacing: '-0.02em' }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
