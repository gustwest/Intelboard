'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  Building2,
  DownloadCloud,
  Layers,
  BarChart3,
  Terminal,
  ShieldAlert,
  LayoutDashboard,
  Users,
  Plug,
  Radar,
  Inbox,
  Rocket,
  Gauge,
  DollarSign,
  Bell,
  Cpu,
  ShieldCheck,
  ReceiptText,
} from 'lucide-react';
import ProductSwitcher, { activeProductId } from './ProductSwitcher';
import { graphFetch } from '@/app/insider-graph/_lib/api';

type NavLink = { href: string; label: string; icon: typeof Users; badge?: 'review' | 'risk' };
type NavGroup = { title: string | null; links: NavLink[] };

const INSIDERS_GROUPS: NavGroup[] = [
  {
    title: null,
    links: [
      { href: '/kunder', label: 'Kunder', icon: Building2 },
      { href: '/sources', label: 'Källor', icon: DownloadCloud },
      { href: '/moduler', label: 'Moduler', icon: Layers },
      { href: '/rapporter', label: 'Rapporter', icon: BarChart3 },
      { href: '/engine', label: 'Engine', icon: Zap },
      { href: '/loggar', label: 'Loggar', icon: Terminal },
      { href: '/admin', label: 'Admin', icon: ShieldAlert },
    ],
  },
];

// Geogiraph: grupperat efter kundens arbetsflöde, med status-badges där det väntar.
const GRAPH_GROUPS: NavGroup[] = [
  { title: null, links: [{ href: '/insider-graph', label: 'Översikt', icon: LayoutDashboard }] },
  {
    title: 'Sätt upp',
    links: [
      { href: '/insider-graph/kunder', label: 'Kunder', icon: Users },
      { href: '/insider-graph/connectors', label: 'Connectors', icon: Plug },
    ],
  },
  {
    // Arbeta = ytor med åtgärder som ändrar tillstånd (AR6: läs-artefakterna flyttade ut).
    title: 'Arbeta',
    links: [
      { href: '/insider-graph/review', label: 'Granska', icon: Inbox, badge: 'review' },
      { href: '/insider-graph/leverans', label: 'Leverans', icon: Rocket },
    ],
  },
  {
    // Mät = produktens kvalitet (kundvänd). MA2: skilt från infra-hälsa nedan.
    title: 'Mät',
    links: [
      { href: '/insider-graph/polling', label: 'AI-synlighet', icon: Radar, badge: 'risk' },
      { href: '/insider-graph/output-quality', label: 'Connector-kvalitet', icon: Gauge },
    ],
  },
  {
    // Rapporter = read-only artefakter (AR6: ut ur Arbeta, paret som redan korslänkar).
    title: 'Rapporter',
    links: [
      { href: '/insider-graph/kvitto', label: 'Månadens kvitto', icon: ReceiptText },
      { href: '/insider-graph/bevisarkiv', label: 'Bevisarkiv', icon: ShieldCheck },
    ],
  },
  {
    // System/Drift = run-the-platform (MA2: infra-hälsa skild från kundmätning).
    title: 'System',
    links: [
      { href: '/insider-graph/costs', label: 'Kostnader', icon: DollarSign },
      { href: '/insider-graph/model-health', label: 'Modell-hälsa', icon: Cpu },
      { href: '/insider-graph/alerts', label: 'Drift-larm', icon: Bell },
    ],
  },
  { title: null, links: [{ href: '/insider-graph/admin', label: 'Admin', icon: ShieldAlert }] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const product = activeProductId(pathname);
  const [badges, setBadges] = useState<{ review: number; risk: number }>({ review: 0, risk: 0 });

  // Status-badges i menyn (bara Geogiraph) — väntande granskningar ur inkorgen.
  useEffect(() => {
    if (product !== 'graph') return;
    let cancelled = false;
    graphFetch<{ categories: Record<string, number> }>('/api/inbox')
      .then((d) => {
        if (cancelled) return;
        const c = d.categories || {};
        setBadges({
          review: (c.claims || 0) + (c.items || 0) + (c.linkedin || 0),
          risk: (c.risk_findings || 0) + (c.risk_questions || 0),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product, pathname]);

  if (pathname === '/login') return null;

  const groups = product === 'graph' ? GRAPH_GROUPS : INSIDERS_GROUPS;
  const productAccent = product === 'graph' ? '#c26a52' : 'var(--brand-accent)';

  return (
    <aside style={{
      width: '260px',
      height: '100vh',
      background: 'rgba(15, 17, 26, 0.95)',
      borderRight: '1px solid var(--brand-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      position: 'sticky',
      top: 0,
      backdropFilter: 'blur(10px)',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      <ProductSwitcher />

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {groups.map((group, gi) => (
          <div key={group.title || `group-${gi}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: group.title ? '14px' : 0 }}>
            {group.title && (
              <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-muted)', opacity: 0.7, padding: '0 16px 4px' }}>
                {group.title}
              </div>
            )}
            {group.links.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/insider-graph' && pathname.startsWith(link.href + '/'));
              const Icon = link.icon;
              const count = link.badge ? badges[link.badge] : 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 16px',
                    borderRadius: '12px',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    color: isActive ? '#fff' : 'var(--brand-muted)',
                    background: isActive
                      ? `linear-gradient(90deg, ${product === 'graph' ? 'rgba(224, 142, 121, 0.18)' : 'rgba(0, 212, 255, 0.15)'}, transparent)`
                      : 'transparent',
                    borderLeft: isActive ? `3px solid ${productAccent}` : '3px solid transparent',
                  }}
                >
                  <Icon size={18} style={{ color: isActive ? productAccent : 'inherit' }} />
                  <span style={{ flex: 1 }}>{link.label}</span>
                  {count > 0 && (
                    <span style={{
                      minWidth: '18px',
                      height: '18px',
                      padding: '0 5px',
                      background: productAccent,
                      color: '#fff',
                      borderRadius: '9px',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
