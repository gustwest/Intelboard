'use client';

// Återanvändbara små UI-bitar för output-quality-loggar (OutputQualityPanel + detaljsidan).
// Färgkonventionen är konsekvent: grönt = bra, gult = behöver granskning, rött = block/drop.

import { Check, AlertCircle, Ban, Shuffle, Sparkles, ShieldOff } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';

export type Verdict = 'pass' | 'needs_review' | 'block';
export type ClaimAction = 'publish' | 'transform' | 'drop';

const verdictMeta: Record<Verdict, { label: string; color: string; bg: string; border: string; icon: typeof Check }> = {
  pass:         { label: 'Pass',          color: '#16a34a', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  icon: Check },
  needs_review: { label: 'Granska',       color: '#d97706', bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.3)', icon: AlertCircle },
  block:        { label: 'Blockerad',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  icon: Ban },
};

const actionMeta: Record<ClaimAction, { label: string; color: string; bg: string; icon: typeof Check }> = {
  publish:   { label: 'Publish',   color: '#16a34a', bg: 'rgba(34,197,94,0.12)',  icon: Check },
  transform: { label: 'Transform', color: '#d97706', bg: 'rgba(245,158,11,0.16)', icon: Shuffle },
  drop:      { label: 'Drop',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: Ban },
};

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict | string; size?: 'sm' | 'md' }) {
  const meta = verdictMeta[verdict as Verdict] || { label: verdict, color: '#6a7e8a', bg: 'transparent', border: C.border, icon: Sparkles };
  const Icon = meta.icon;
  const px = size === 'sm' ? 8 : 12;
  const py = size === 'sm' ? 3 : 5;
  const fs = size === 'sm' ? 10 : 12;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: `${py}px ${px}px`, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, borderRadius: 999, fontSize: fs, fontWeight: 600 }}>
      <Icon size={fs - 1} /> {meta.label}
    </span>
  );
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 3.5 ? '#16a34a' : score >= 2.5 ? '#d97706' : '#ef4444';
  const bg = score >= 3.5 ? 'rgba(34,197,94,0.12)' : score >= 2.5 ? 'rgba(245,158,11,0.16)' : 'rgba(239,68,68,0.12)';
  const fs = size === 'lg' ? 28 : size === 'sm' ? 11 : 14;
  const px = size === 'lg' ? 14 : size === 'sm' ? 8 : 10;
  const py = size === 'lg' ? 8 : size === 'sm' ? 2 : 3;
  return (
    <span style={{ display: 'inline-block', padding: `${py}px ${px}px`, borderRadius: 10, background: bg, color, fontFamily: 'ui-monospace, monospace', fontSize: fs, fontWeight: 700, lineHeight: 1 }}>
      {score.toFixed(2)}
    </span>
  );
}

export function ActionPill({ action }: { action: ClaimAction | string }) {
  const meta = actionMeta[action as ClaimAction] || { label: action, color: '#6a7e8a', bg: 'transparent', icon: Sparkles };
  const Icon = meta.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', background: meta.bg, color: meta.color, borderRadius: 999, fontSize: 10, fontWeight: 600 }}>
      <Icon size={10} /> {meta.label}
    </span>
  );
}

type BundleFlag = { type: string; detail: string | null; dimension_hint?: string | null; audience?: string | null };

const flagColor: Record<string, string> = {
  high_redundancy: '#d97706',
  missing_persona: '#d97706',
  low_authority_density: '#d97706',
  volume_too_high: '#d97706',
  no_audience_target: '#6a7e8a',
  schema_slot_mismatch: '#ef4444',
};

export function BundleFlagChip({ flag }: { flag: BundleFlag }) {
  const color = flagColor[flag.type] || '#6a7e8a';
  return (
    <span title={flag.detail || flag.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: `${color}1f`, color, border: `1px solid ${color}55`, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
      <AlertCircle size={11} /> {flag.detail || flag.type}
    </span>
  );
}

export function AudiencePill({ audience }: { audience: string | null | undefined }) {
  if (!audience || audience === 'none') {
    return <span style={{ color: '#6a7e8a', fontSize: 10 }}>—</span>;
  }
  const map: Record<string, { label: string; color: string; bg: string }> = {
    customer: { label: '🛒 customer', color: C.accent, bg: 'rgba(159,81,182,0.14)' },
    employee: { label: '🎯 employee', color: '#0ea5e9', bg: 'rgba(14,165,233,0.14)' },
    investor: { label: '💰 investor', color: '#16a34a', bg: 'rgba(34,197,94,0.14)' },
  };
  const m = map[audience] || { label: audience, color: C.text, bg: 'transparent' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', background: m.bg, color: m.color, borderRadius: 999, fontSize: 10, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

export function HintChip({ hint }: { hint: string | null | undefined }) {
  if (!hint) return null;
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', background: '#eef0f1', color: C.text, borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
      {hint}
    </span>
  );
}

export function ShadowGateBadge({ source }: { source: string | null | undefined }) {
  if (source === 'gate') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
        <ShieldOff size={10} /> gate
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: '#eef0f1', color: '#6a7e8a', borderRadius: 4, fontSize: 10 }}>
      shadow
    </span>
  );
}
