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
