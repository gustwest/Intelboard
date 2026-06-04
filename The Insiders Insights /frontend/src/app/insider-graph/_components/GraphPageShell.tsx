'use client';

import { ReactNode } from 'react';

type Props = {
  title: string;
  icon: ReactNode;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
};

export default function GraphPageShell({ title, icon, subtitle, badge, children }: Props) {
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '24px 24px 60px',
        color: '#3a4b56',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: 'rgba(159,81,182,0.18)',
            color: '#9f51b6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              {title}
            </h1>
            {badge && (
              <span
                style={{
                  fontSize: '0.625rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(159,81,182,0.15)',
                  color: '#9f51b6',
                  border: '1px solid rgba(159,81,182,0.3)',
                  fontWeight: 600,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p style={{ fontSize: '0.8125rem', color: '#6a7e8a', margin: '4px 0 0' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </main>
  );
}

export const graphColors = {
  card: '#ffffff',
  border: '#dfe3e7',
  accent: '#9f51b6',
  muted: '#6a7e8a',
  dim: '#9aa8b1',
  text: '#3a4b56',
};

// Semantiska statusfärger. Kanonisk källa — innan detta kodades samma fyra
// tillstånd ad hoc över sektionen med 5 gröna / 4 amber / 5 röda / 5 blå hexar
// plus 20+ rgba-opaciteter. Använd dessa istället för råa hexar.
//   fg     = text/ikon ovanpå ljus yta (mörkare, läsbar)
//   solid  = fylld yta: status-dot, stapel, fylld badge (klarare)
//   bg     = tonad bakgrund för callout/badge/banner
//   border = kant som matchar den tonade bakgrunden
type StatusTone = { fg: string; solid: string; bg: string; border: string };

export const statusColors: Record<'ok' | 'warn' | 'err' | 'info', StatusTone> = {
  ok: { fg: '#16a34a', solid: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  warn: { fg: '#d97706', solid: '#f59e0b', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.3)' },
  err: { fg: '#dc2626', solid: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  info: { fg: '#2563eb', solid: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
};

// Yt-/neutralton-tokens utöver graphColors (som bara täcker kort/kant/text).
export const surfaces = {
  page: '#f9fafb',        // sektionens off-white bakgrund (se layout.tsx)
  inputBg: '#eef0f1',     // fält-/select-/toggle-bakgrund (~20 hårdkodade idag)
  tableHeaderBg: '#f1f3f5', // tabellhuvud
  subtle: '#fafbfc',      // svag inre yta (rader, inre paneler)
};

export const fonts = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
