'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Quote, Inbox, Network, Radar, Leaf, AlertTriangle, RefreshCw } from 'lucide-react';
import { graphFetch } from '@/app/insider-graph/_lib/api';

type Counts = {
  claims: number;
  items: number;
  linkedin: number;
  risk_findings: number;
  risk_questions: number;
  esg_questions: number;
  esg_findings: number;
};
type GlobalCounts = {
  model_drift?: number;
  ops_alerts?: number;
};
type InboxClient = { client_id: string; company_name: string | null; total: number; counts: Counts };
type InboxData = {
  total: number;
  categories: Counts;
  global_categories?: GlobalCounts;
  clients: InboxClient[];
};

// En kö per kategori: vart åtgärden görs + ikon. Risk och ESG slås ihop till varsin rad.
// `globalKey` pekar på data.global_categories i stället för data.categories (drift-larm,
// model-drift) — de är inte kundscopade utan globala för hela systemet.
type Queue = {
  label: string;
  keys?: (keyof Counts)[];
  globalKey?: keyof GlobalCounts;
  href: string;
  icon: typeof Quote;
  color: string;
};

const QUEUES: Queue[] = [
  { label: 'Claims att granska', keys: ['claims'], href: '/insider-graph/review?tab=claims', icon: Quote, color: '#9f51b6' },
  { label: 'Inkommande att granska', keys: ['items'], href: '/insider-graph/review?tab=items', icon: Inbox, color: '#3b82f6' },
  { label: 'LinkedIn att verifiera', keys: ['linkedin'], href: '/insider-graph/review?tab=linkedin', icon: Network, color: '#0ea5e9' },
  { label: 'Risk att åtgärda', keys: ['risk_findings', 'risk_questions'], href: '/insider-graph/polling', icon: Radar, color: '#f59e0b' },
  { label: 'ESG att granska', keys: ['esg_questions', 'esg_findings'], href: '/insider-graph/kunder', icon: Leaf, color: '#22c55e' },
  { label: 'Drift-larm', globalKey: 'ops_alerts', href: '/insider-graph/alerts', icon: AlertTriangle, color: '#ef4444' },
];

/** Geogiraph "Att göra"-inkorg: aggregerar allt som väntar på en människa. */
export default function GraphInboxBell() {
  const router = useRouter();
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    graphFetch<InboxData>('/api/inbox')
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Initial hämtning: bara async setState (i .then/.catch) för att undvika
  // synkrona cascading renders i effekten.
  useEffect(() => {
    let cancelled = false;
    graphFetch<InboxData>('/api/inbox')
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const total = data?.total ?? 0;
  const queues = QUEUES.map((q) => {
    let count = 0;
    if (data) {
      if (q.keys) {
        count = q.keys.reduce((s, k) => s + (data.categories[k] || 0), 0);
      } else if (q.globalKey) {
        count = data.global_categories?.[q.globalKey] || 0;
      }
    }
    return { ...q, count };
  }).filter((q) => q.count > 0);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <button
        onClick={() => {
          if (!open) refresh();
          setOpen(!open);
        }}
        aria-label="Att göra"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex' }}
      >
        <Bell size={20} color="var(--brand-muted)" />
        {total > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-7px',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              background: '#9f51b6',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '0.625rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 12px)',
            right: 0,
            width: '320px',
            background: 'var(--brand-panel)',
            border: '1px solid var(--brand-border)',
            borderRadius: '12px',
            padding: '8px',
            zIndex: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            maxHeight: '460px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px 10px',
              borderBottom: '1px solid var(--brand-border)',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff' }}>
              Att göra{total > 0 ? ` · ${total}` : ''}
            </span>
            <button
              onClick={refresh}
              aria-label="Uppdatera"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px' }}
            >
              <RefreshCw size={14} color="var(--brand-muted)" style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            </button>
          </div>

          {error && (
            <div style={{ padding: '12px 10px', fontSize: '0.8125rem', color: 'var(--brand-danger)' }}>
              Kunde inte hämta inkorgen.
            </div>
          )}

          {!error && total === 0 && (
            <div style={{ padding: '16px 10px', fontSize: '0.8125rem', color: 'var(--brand-muted)', textAlign: 'center' }}>
              {loading ? 'Laddar…' : 'Inget väntar på dig 🎉'}
            </div>
          )}

          {!error && total > 0 && (
            <>
              {/* Köer per kategori */}
              {queues.map((qu) => {
                const Icon = qu.icon;
                return (
                  <button
                    key={qu.label}
                    onClick={() => go(qu.href)}
                    style={rowStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon size={16} color={qu.color} />
                    <span style={{ flex: 1, color: '#fff' }}>{qu.label}</span>
                    <span style={countPill}>{qu.count}</span>
                  </button>
                );
              })}

              {/* Per kund */}
              {data && data.clients.length > 0 && (
                <>
                  <div style={sectionLabel}>Per kund</div>
                  {data.clients.slice(0, 6).map((c) => (
                    <button
                      key={c.client_id}
                      onClick={() => go(`/insider-graph/kunder/${c.client_id}`)}
                      style={rowStyle}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ flex: 1, minWidth: 0, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.company_name || c.client_id}
                      </span>
                      <span style={countPill}>{c.total}</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '9px 10px',
  border: 'none',
  background: 'transparent',
  borderRadius: '8px',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.8125rem',
  transition: 'background 0.12s',
};

const countPill: React.CSSProperties = {
  minWidth: '20px',
  padding: '1px 7px',
  background: 'rgba(159, 81, 182, 0.18)',
  color: '#c98fdb',
  borderRadius: '10px',
  fontSize: '0.6875rem',
  fontWeight: 700,
  textAlign: 'center',
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--brand-muted)',
  padding: '10px 10px 4px',
};
