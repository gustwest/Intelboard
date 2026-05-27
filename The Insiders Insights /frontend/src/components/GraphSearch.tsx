'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, ArrowRight } from 'lucide-react';
import { graphFetch } from '@/app/insider-graph/_lib/api';

type Client = { client_id: string; company_name: string | null };

const PAGES: { label: string; href: string }[] = [
  { label: 'Översikt', href: '/insider-graph' },
  { label: 'Kunder', href: '/insider-graph/kunder' },
  { label: 'Connectors', href: '/insider-graph/connectors' },
  { label: 'Granska', href: '/insider-graph/review' },
  { label: 'Leverans', href: '/insider-graph/leverans' },
  { label: 'AI-synlighet', href: '/insider-graph/polling' },
];

/** Geogiraph-sök: kunder (live) + sidgenvägar. */
export default function GraphSearch() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Hämta kundlistan lazyt vid första fokus, cacha sedan.
  function ensureClients() {
    if (clients !== null) return;
    setClients([]); // markera "laddar/hämtad" så vi inte dubbelhämtar
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => setClients(d.clients))
      .catch(() => setClients([]));
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const clientMatches = q
    ? (clients || [])
        .filter(
          (c) =>
            (c.company_name || '').toLowerCase().includes(q) ||
            c.client_id.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];
  const pageMatches = q ? PAGES.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 4) : [];
  const hasResults = clientMatches.length > 0 || pageMatches.length > 0;

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clientMatches[0]) go(`/insider-graph/kunder/${clientMatches[0].client_id}`);
    else if (pageMatches[0]) go(pageMatches[0].href);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          borderRadius: '8px',
          padding: '8px 12px',
          width: '300px',
        }}
      >
        <Search size={16} color="var(--brand-muted)" />
        <input
          type="text"
          value={query}
          placeholder="Sök kunder, sidor…"
          onFocus={() => {
            ensureClients();
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '0.875rem',
            outline: 'none',
            width: '100%',
          }}
        />
      </form>

      {open && q.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '340px',
            background: 'var(--brand-panel)',
            border: '1px solid var(--brand-border)',
            borderRadius: '10px',
            padding: '6px',
            zIndex: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            maxHeight: '420px',
            overflowY: 'auto',
          }}
        >
          {!hasResults && (
            <div style={{ padding: '12px', fontSize: '0.8125rem', color: 'var(--brand-muted)' }}>
              Inga träffar för ”{query}”
            </div>
          )}

          {clientMatches.length > 0 && (
            <>
              <div style={sectionLabel}>Kunder</div>
              {clientMatches.map((c) => (
                <button
                  key={c.client_id}
                  onClick={() => go(`/insider-graph/kunder/${c.client_id}`)}
                  style={rowStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Building2 size={15} color="#9f51b6" />
                  <span style={{ flex: 1, minWidth: 0, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.company_name || c.client_id}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--brand-muted)', fontFamily: 'monospace' }}>
                    {c.client_id}
                  </span>
                </button>
              ))}
            </>
          )}

          {pageMatches.length > 0 && (
            <>
              <div style={sectionLabel}>Sidor</div>
              {pageMatches.map((p) => (
                <button
                  key={p.href}
                  onClick={() => go(p.href)}
                  style={rowStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <ArrowRight size={15} color="var(--brand-muted)" />
                  <span style={{ flex: 1, color: '#fff' }}>{p.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--brand-muted)',
  padding: '8px 10px 4px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '9px 10px',
  border: 'none',
  background: 'transparent',
  borderRadius: '7px',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.8125rem',
  transition: 'background 0.12s',
};
