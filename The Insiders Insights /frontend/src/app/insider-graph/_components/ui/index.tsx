'use client';

// Delade UI-primitiver för insider-graph (geogiraph). Innan detta återuppfanns
// samma kort/knapp/badge/stat/banner/eyebrow inline i 20+ filer (se
// docs/ux-audit-2026-06-04.md). Allt här bygger på tokens i GraphPageShell
// (graphColors + statusColors) — använd dessa primitiver istället för att
// kopiera inline-stilar.

import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Save, X, Loader2, Check, Play } from 'lucide-react';
import { graphColors as C, statusColors, surfaces } from '../GraphPageShell';

type StatusTone = 'ok' | 'warn' | 'err' | 'info';

const accentTone = { fg: C.accent, bg: 'rgba(224, 142, 121,0.15)', border: 'rgba(224, 142, 121,0.3)' };
const neutralTone = { fg: C.muted, bg: 'rgba(0,0,0,0.05)', border: C.border };

// ── Breadcrumb ───────────────────────────────────────────────────────────────
// Brödsmulor (nav) — ersätter copy-paste:ade tillbaka-länkar. Sista posten är
// nuvarande sida (aria-current=page, ej länk); övriga med href blir länkar.
export function Breadcrumb({
  items, style,
}: { items: { label: ReactNode; href?: string }[]; style?: CSSProperties }) {
  return (
    <nav
      aria-label="Brödsmulor"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 16, flexWrap: 'wrap', ...style }}
    >
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {it.href && !last ? (
              <Link href={it.href} style={{ color: C.muted, textDecoration: 'none' }}>{it.label}</Link>
            ) : (
              <span aria-current={last ? 'page' : undefined} style={{ color: last ? C.text : C.muted }}>{it.label}</span>
            )}
            {!last && <span aria-hidden style={{ color: C.dim }}>›</span>}
          </span>
        );
      })}
    </nav>
  );
}

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
        minWidth: 22, padding: '1px 8px', background: 'rgba(224, 142, 121,0.14)', color: C.accent,
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
// Tomtillstånd (centrerad dämpad text) med valfri ikon ovanför + hint under.
// 6 inline-kopior med 3 signaturer (text / children / icon+hint).
export function Empty({
  icon, children, hint, style,
}: { icon?: ReactNode; children: ReactNode; hint?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ padding: '16px 4px', textAlign: 'center', color: C.muted, ...style }}>
      {icon && <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: C.dim }}>{icon}</div>}
      <div style={{ fontSize: 12 }}>{children}</div>
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{hint}</div>}
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
      padding: '7px 14px', background: 'rgba(224, 142, 121,0.18)', color: C.accent,
      border: '1px solid rgba(224, 142, 121,0.3)', borderRadius: 8,
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

// ── Form-UX-hooks ────────────────────────────────────────────────────────────
// Varnar om osparade ändringar vid sidstängning/omladdning medan dirty=true.
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

// Avfärdar en notis automatiskt efter ms när `active` blir sant (t.ex. "Sparat").
// Re-armas bara när active växlar — onDismiss-identitet ignoreras (ref).
export function useAutoDismiss(active: boolean, onDismiss: () => void, ms = 4000) {
  const cb = useRef(onDismiss);
  useEffect(() => { cb.current = onDismiss; });
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => cb.current(), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
}

// ── SaveButton ───────────────────────────────────────────────────────────────
// Dirty-state spara-knapp: tonad accent när dirty, dämpad/inaktiv annars.
// 5+ inline-kopior i editorerna med identisk logik. disabledReason visas som
// title-tooltip när knappen är inaktiv (synligt skäl, default "inga ändringar").
export function SaveButton({
  dirty, saving, onClick, label = 'Spara', savingLabel = 'Sparar…', disabledReason, style,
}: {
  dirty: boolean; saving?: boolean; onClick?: () => void;
  label?: string; savingLabel?: string; disabledReason?: string; style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      title={!dirty && !saving ? (disabledReason ?? 'Inga ändringar att spara') : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
        background: dirty ? 'rgba(224, 142, 121,0.18)' : 'transparent',
        color: dirty ? C.accent : C.muted,
        border: `1px solid ${dirty ? 'rgba(224, 142, 121,0.3)' : C.border}`,
        borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: dirty && !saving ? 'pointer' : 'not-allowed', ...style,
      }}
    >
      <Save size={12} /> {saving ? savingLabel : label}
    </button>
  );
}

// ── SegmentedToggle ──────────────────────────────────────────────────────────
// Vald = tonad accent, övriga dämpade. 6 inline-kopior (olika selected-opacitet
// 0.08–0.18 → standardiserad till 0.16 här).
export function SegmentedToggle<T extends string>({
  options, value, onChange, style,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  style?: CSSProperties;
}) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 4, ...style }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: active ? 'rgba(224, 142, 121,0.16)' : 'transparent',
              color: active ? C.accent : C.muted,
              border: `1px solid ${active ? 'rgba(224, 142, 121,0.3)' : C.border}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── JobRunButton ─────────────────────────────────────────────────────────────
// Kör-knapp med tillståndsmaskin idle/running/success/failed (Play/Loader2/
// Check/X). 3 identiska inline-kopior. Självförsörjande spin-keyframe.
export function JobRunButton({
  status, onClick, label, runningLabel = 'Kör…', primary, title, style,
}: {
  status: 'idle' | 'running' | 'success' | 'failed';
  onClick?: () => void;
  label: string;
  runningLabel?: string;
  primary?: boolean;
  title?: string;
  style?: CSSProperties;
}) {
  const Icon = status === 'running' ? Loader2 : status === 'success' ? Check : status === 'failed' ? X : Play;
  const iconColor = primary ? '#fff' : status === 'success' ? statusColors.ok.fg : status === 'failed' ? statusColors.err.fg : undefined;
  const variant: CSSProperties = primary
    ? { background: C.accent, color: '#fff', border: `1px solid ${C.accent}` }
    : { background: 'transparent', color: C.text, border: `1px solid ${C.border}` };
  return (
    <button
      onClick={onClick}
      disabled={status === 'running'}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: status === 'running' ? 'wait' : 'pointer', ...variant, ...style,
      }}
    >
      <style>{'@keyframes ui-spin{to{transform:rotate(360deg)}}'}</style>
      <Icon size={12} color={iconColor} style={status === 'running' ? { animation: 'ui-spin 0.8s linear infinite' } : undefined} />
      {status === 'running' ? runningLabel : label}
    </button>
  );
}

// ── DropZone ─────────────────────────────────────────────────────────────────
// Tillgänglig fil-uppladdningszon: drag-and-drop + klick/Enter/Space → filväljare.
// Äger dragOver-state, dold <input type=file> och a11y (role=button, tabIndex,
// aria-label, tangentbord). Ersätter 3 klickbara <div>-ar utan a11y.
// onFile(file) anropas vid släpp ELLER val; input nollställs efter varje val.
export function DropZone({
  onFile, accept, disabled, ariaLabel = 'Ladda upp fil — släpp en fil här eller tryck för att välja',
  padding = '18px 16px', restBg = '#f7f8f9', children, style,
}: {
  onFile: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  ariaLabel?: string;
  padding?: string;
  restBg?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => { if (!disabled) inputRef.current?.click(); };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onClick={openPicker}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      style={{
        background: dragOver ? 'rgba(224, 142, 121,0.08)' : restBg,
        border: `2px dashed ${dragOver ? C.accent : C.border}`,
        borderRadius: 10, padding, textAlign: 'center',
        cursor: disabled ? 'wait' : 'pointer', transition: 'all 0.15s', outline: 'none', ...style,
      }}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
// Laddnings-platshållare med shimmer. Används istället för "render inget medan
// null", så sidan inte poppar in sektion för sektion.
const shimmerStyle: CSSProperties = {
  borderRadius: 6,
  background: '#eaedf0',
  backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)',
  backgroundSize: '200% 100%',
  animation: 'ui-shimmer 1.4s ease-in-out infinite',
};

export function Skeleton({ height = 12, width = '100%', style }: { height?: number | string; width?: number | string; style?: CSSProperties }) {
  return <div aria-hidden style={{ ...shimmerStyle, height, width, ...style }} />;
}

// Kort-format laddnings-platshållare (rubrikrad + N textrader).
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: CSSProperties }) {
  return (
    <div
      aria-busy="true"
      aria-label="Laddar…"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', marginBottom: 16, ...style }}
    >
      <style>{'@keyframes ui-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>
      <div style={{ ...shimmerStyle, height: 14, width: '38%', marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ ...shimmerStyle, height: 11, width: i === lines - 1 ? '64%' : '100%', marginBottom: 8 }} />
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
// Tillgänglig dialog: overlay + centrerad panel, role=dialog/aria-modal,
// Esc-stängning, fokusfälla och fokus-återställning. Ersätter 4 inline-kopior
// som saknade all a11y.
export function Modal({
  open, onClose, title, children, width = '100%', maxWidth = 820, overlayOpacity = 0.7, panelStyle,
}: {
  open: boolean; onClose?: () => void; title?: ReactNode; children?: ReactNode;
  width?: number | string; maxWidth?: number; overlayOpacity?: number; panelStyle?: CSSProperties;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: `rgba(0,0,0,${overlayOpacity})`, backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 14, width, maxWidth,
          maxHeight: '90vh', overflowY: 'auto', padding: 28, outline: 'none', ...panelStyle,
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
            <button onClick={onClose} aria-label="Stäng" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
