'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';

type Product = {
  id: 'insiders' | 'graph';
  name: string;
  tagline: string;
  defaultPath: string;
  accent: string;
};

const PRODUCTS: Product[] = [
  {
    id: 'insiders',
    name: 'The Insiders',
    tagline: 'Predictive Network Engine',
    defaultPath: '/kunder',
    accent: 'var(--brand-accent)',
  },
  {
    id: 'graph',
    name: 'Insider Graph',
    tagline: 'Generative Engine Optimization',
    defaultPath: '/insider-graph',
    accent: '#7c6dfa',
  },
];

export function activeProductId(pathname: string): 'insiders' | 'graph' {
  return pathname.startsWith('/insider-graph') ? 'graph' : 'insiders';
}

export default function ProductSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeId = activeProductId(pathname);
  const active = PRODUCTS.find((p) => p.id === activeId)!;

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: '24px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          borderRadius: '10px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      >
        <span
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: active.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#000',
            flexShrink: 0,
          }}
        >
          {active.id === 'graph' ? 'IG' : 'TI'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
            {active.name}
          </div>
          <div
            style={{
              fontSize: '0.6875rem',
              color: 'var(--brand-muted)',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {active.tagline}
          </div>
        </div>
        <ChevronDown size={14} color="var(--brand-muted)" />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--brand-panel)',
            border: '1px solid var(--brand-border)',
            borderRadius: '10px',
            padding: '6px',
            zIndex: 50,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {PRODUCTS.map((p) => {
            const isActive = p.id === activeId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) router.push(p.defaultPath);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = isActive ? 'rgba(255,255,255,0.04)' : 'transparent')
                }
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: p.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: '#000',
                    flexShrink: 0,
                  }}
                >
                  {p.id === 'graph' ? 'IG' : 'TI'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--brand-muted)',
                      marginTop: '2px',
                    }}
                  >
                    {p.tagline}
                  </div>
                </div>
                {isActive && <Check size={14} color="var(--brand-accent)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
