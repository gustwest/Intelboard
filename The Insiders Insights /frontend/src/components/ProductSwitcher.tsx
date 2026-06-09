'use client';

import { useRouter, usePathname } from 'next/navigation';

type Product = {
  id: 'insiders' | 'graph';
  name: string;
  tagline: string;
  defaultPath: string;
  accent: string;
  badge: string;
};

const PRODUCTS: Product[] = [
  {
    id: 'insiders',
    name: 'The Insiders',
    tagline: 'Predictive Network Engine',
    defaultPath: '/kunder',
    accent: 'var(--brand-accent)',
    badge: 'TI',
  },
  {
    id: 'graph',
    name: 'geogiraph',
    tagline: 'Generative Engine Optimization',
    defaultPath: '/insider-graph',
    accent: '#c26a52',
    badge: 'GG',
  },
];

export function activeProductId(pathname: string): 'insiders' | 'graph' {
  return pathname.startsWith('/insider-graph') ? 'graph' : 'insiders';
}

export default function ProductSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = activeProductId(pathname);
  const active = PRODUCTS.find((p) => p.id === activeId)!;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Segmenterad växlare — båda produkterna syns, ett klick byter */}
      <div
        role="tablist"
        aria-label="Produkt"
        style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          borderRadius: '10px',
        }}
      >
        {PRODUCTS.map((p) => {
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) router.push(p.defaultPath);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '8px 6px',
                borderRadius: '7px',
                border: 'none',
                cursor: isActive ? 'default' : 'pointer',
                background: isActive
                  ? p.id === 'graph'
                    ? 'rgba(224, 142, 121, 0.18)'
                    : 'rgba(0, 212, 255, 0.15)'
                  : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '5px',
                  background: p.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.5625rem',
                  fontWeight: 700,
                  color: '#000',
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.55,
                }}
              >
                {p.badge}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: isActive ? '#fff' : 'var(--brand-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
      {/* Tagline för aktiv produkt */}
      <div
        style={{
          fontSize: '0.6875rem',
          color: 'var(--brand-muted)',
          marginTop: '8px',
          paddingLeft: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {active.tagline}
      </div>
    </div>
  );
}
