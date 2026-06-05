'use client';

// Delade UI-primitiver för insider-graph (geogiraph). Innan detta återuppfanns
// samma kort/knapp/badge/stat/banner/eyebrow inline i 20+ filer (se
// docs/ux-audit-2026-06-04.md). Allt här bygger på tokens i GraphPageShell
// (graphColors + statusColors) — använd dessa primitiver istället för att
// kopiera inline-stilar.

import { CSSProperties, ReactNode } from 'react';
import { Save } from 'lucide-react';
import { graphColors as C, statusColors, surfaces } from '../GraphPageShell';

type StatusTone = 'ok' | 'warn' | 'err' | 'info';

const accentTone = { fg: C.accent, bg: 'rgba(159,81,182,0.15)', border: 'rgba(159,81,182,0.3)' };
const neutralTone = { fg: C.muted, bg: 'rgba(0,0,0,0.05)', border: C.border };

// ── Eyebrow ────────────────────────────────────────────────────────────────
// Versal mikro-etikett (sektionsögonbryn / formulärlabel). ~25+ inline-kopior.
export function Eyebrow({
  children, icon, iconColor, style,
}: { children: ReactNode; icon?: ReactNode; iconColor?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: C.muted, fontWeight: 600, ...style,
      }}
    >
      {icon && <span style={{ color: iconColor ?? C.accent, display: 'inline-flex' }}>{icon}</span>}
      {children}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────
// Standardcontainer (bg/border/radius 12) med valfri rubrikrad. ~40 inline-kopior.
export function Card({
  icon, title, hint, action, padding, children, style,
}: {
  icon?: ReactNode; title?: ReactNode; hint?: ReactNode; action?: ReactNode;
  padding?: string; children?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: padding ?? '18px 22px', ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: action ? 'space-between' : 'flex-start',
            gap: 8, marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon}
            {title && <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text }}>{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px' }}>{hint}</p>}
      {children}
    </div>
  );
}

// ── StatTile ────────────────────────────────────────────────────────────────
// KPI-ruta: eyebrow + stort värde + valfri undertext. 3 likanamniga inline-kopior.
// tone='attention' = warn.fg (= #d97706, oförändrad mot tidigare hårdkodning).
export function StatTile({
  icon, label, value, sub, tone, size = 28,
}: {
  icon?: ReactNode; label: string; value: ReactNode; sub?: string;
  tone?: 'attention' | 'ok'; size?: number;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <Eyebrow icon={icon}>{label}</Eyebrow>
      <div
        style={{
          fontSize: size, fontWeight: 600,
          color: tone === 'attention' ? statusColors.warn.fg : C.text,
          marginTop: 8, letterSpacing: '-0.02em',
        }}
      >
        {value === null || value === undefined ? '—' : value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────
// Versal tonad status-pill. ~8 inline-varianter + trustGapBadge.
export function Badge({
  tone = 'neutral', children, style,
}: { tone?: StatusTone | 'accent' | 'neutral'; children: ReactNode; style?: CSSProperties }) {
  const t = tone === 'accent' ? accentTone : tone === 'neutral' ? neutralTone : statusColors[tone];
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6,
        color: t.fg, background: t.bg, border: `1px solid ${t.border}`, ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────
// Räkne-bubbla (count). Index/review/kunder hade var sin kopia.
export function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        minWidth: 22, padding: '1px 8px', background: 'rgba(159,81,182,0.14)', color: C.accent,
        borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: 'center', ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── StatusBanner ────────────────────────────────────────────────────────────
// Färgad notis/callout (ok/warn/err/info). ~7 inline-varianter med olika röda.
export function StatusBanner({
  tone = 'info', icon, children, style,
}: { tone?: StatusTone; icon?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  const t = statusColors[tone];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
        fontSize: 12, lineHeight: 1.5, color: t.fg, background: t.bg, border: `1px solid ${t.border}`, ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

// ── Empty ──────────────────────────────────────────────────────────────────
// Tomtillstånd (centrerad dämpad text). 6 inline-kopior.
export function Empty({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 12, color: C.muted, padding: '16px 4px', textAlign: 'center', ...style }}>
      {children}
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
// Varianter: 'ghost' (transparent + kant), 'primary' (accent-tint), 'row'
// (full bredd, vänsterställd, hover-bg). Vidarebefordrar onClick/disabled/type.
type ButtonProps = {
  variant?: 'ghost' | 'primary' | 'row';
  icon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'>;

export function Button({ variant = 'ghost', icon, children, style, disabled, ...rest }: ButtonProps) {
  const base: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.12s',
  };
  const variants: Record<string, CSSProperties> = {
    ghost: {
      padding: '7px 12px', background: 'transparent', color: C.text,
      border: `1px solid ${C.border}`, borderRadius: 8,
    },
    primary: {
      padding: '7px 14px', background: 'rgba(159,81,182,0.18)', color: C.accent,
      border: '1px solid rgba(159,81,182,0.3)', borderRadius: 8,
    },
    row: {
      width: '100%', padding: '9px 8px', background: 'transparent', color: C.text,
      border: 'none', borderRadius: 8, textAlign: 'left', fontSize: 13,
    },
  };
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={variant === 'row' && !disabled ? (e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)') : rest.onMouseEnter}
      onMouseLeave={variant === 'row' && !disabled ? (e) => (e.currentTarget.style.background = 'transparent') : rest.onMouseLeave}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────
// Textfält (bg surfaces.inputBg). ≥6 inline-kopior i editorerna.
export function Input({ style, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      style={{
        padding: '8px 12px', background: surfaces.inputBg, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none', ...style,
      }}
    />
  );
}

// ── FieldLabel ───────────────────────────────────────────────────────────────
// Versal formulär-label (block-variant av Eyebrow, renderar <label> för a11y).
export function FieldLabel({
  children, htmlFor, style,
}: { children: ReactNode; htmlFor?: string; style?: CSSProperties }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: C.muted, fontWeight: 600, marginBottom: 6, ...style,
      }}
    >
      {children}
    </label>
  );
}

// ── Chevron ──────────────────────────────────────────────────────────────────
// Konsekvent expand/collapse-pil (▶ → roterar 90° vid open). aria-hidden —
// tillgänglighetstillståndet bärs av aria-expanded på toggle-elementet.
export function Chevron({ open, size = 10, color }: { open: boolean; size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        fontSize: size, color: color ?? C.muted, lineHeight: 1, display: 'inline-block',
        transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none',
      }}
    >
      ▶
    </span>
  );
}

// ── toggleProps ──────────────────────────────────────────────────────────────
// Tillgänglighets-props för att retrofitta ett klickbart expand/collapse-element
// (ersätter klickbara <div> utan tangentbord/ARIA). Sprid på elementet:
//   <div {...toggleProps(open, onToggle)} style={…}>…</div>
// Ger role=button, tabIndex, aria-expanded och Enter/Space-hantering.
export function toggleProps(open: boolean, onToggle?: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-expanded': open,
    onClick: onToggle,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle?.();
      }
    },
  };
}

// ── Collapsible ──────────────────────────────────────────────────────────────
// Kontrollerad disclosure: tillgänglig header (chevron + valfritt innehåll) +
// body som visas när open. Ägaren håller open-state och skickar onToggle.
export function Collapsible({
  open, onToggle, header, children, gap = 8, headerStyle,
}: {
  open: boolean; onToggle?: () => void; header: ReactNode; children?: ReactNode;
  gap?: number; headerStyle?: CSSProperties;
}) {
  return (
    <div>
      <div
        {...toggleProps(open, onToggle)}
        style={{ display: 'flex', alignItems: 'center', gap, cursor: 'pointer', userSelect: 'none', ...headerStyle }}
      >
        <Chevron open={open} />
        {header}
      </div>
      {open && children}
    </div>
  );
}

// ── SaveButton ───────────────────────────────────────────────────────────────
// Dirty-state spara-knapp: tonad accent när dirty, dämpad/inaktiv annars.
// 5+ inline-kopior i editorerna med identisk logik.
export function SaveButton({
  dirty, saving, onClick, label = 'Spara', savingLabel = 'Sparar…', style,
}: {
  dirty: boolean; saving?: boolean; onClick?: () => void;
  label?: string; savingLabel?: string; style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
        background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent',
        color: dirty ? C.accent : C.muted,
        border: `1px solid ${dirty ? 'rgba(159,81,182,0.3)' : C.border}`,
        borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: dirty && !saving ? 'pointer' : 'not-allowed', ...style,
      }}
    >
      <Save size={12} /> {saving ? savingLabel : label}
    </button>
  );
}
