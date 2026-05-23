'use client';

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
  FileJson,
  Radar,
  Inbox,
} from 'lucide-react';
import ProductSwitcher, { activeProductId } from './ProductSwitcher';

const INSIDERS_LINKS = [
  { href: '/kunder', label: 'Kunder', icon: Building2 },
  { href: '/sources', label: 'Källor', icon: DownloadCloud },
  { href: '/moduler', label: 'Moduler', icon: Layers },
  { href: '/rapporter', label: 'Rapporter', icon: BarChart3 },
  { href: '/engine', label: 'Engine', icon: Zap },
  { href: '/loggar', label: 'Loggar', icon: Terminal },
  { href: '/admin', label: 'Admin', icon: ShieldAlert },
];

const GRAPH_LINKS = [
  { href: '/insider-graph', label: 'Översikt', icon: LayoutDashboard },
  { href: '/insider-graph/kunder', label: 'Kunder', icon: Users },
  { href: '/insider-graph/connectors', label: 'Connectors', icon: Plug },
  { href: '/insider-graph/review', label: 'Granska', icon: Inbox },
  { href: '/insider-graph/schema', label: 'JSON-LD', icon: FileJson },
  { href: '/insider-graph/polling', label: 'AI-synlighet', icon: Radar },
  { href: '/insider-graph/admin', label: 'Admin', icon: ShieldAlert },
];

export default function Sidebar() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  const product = activeProductId(pathname);
  const navLinks = product === 'graph' ? GRAPH_LINKS : INSIDERS_LINKS;
  const productAccent = product === 'graph' ? '#7c6dfa' : 'var(--brand-accent)';

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
    }}>
      {/* Product switcher */}
      <ProductSwitcher />

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {navLinks.map(link => {
          const isActive = pathname === link.href || (link.href !== '/insider-graph' && pathname.startsWith(link.href + '/'));
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                color: isActive ? '#fff' : 'var(--brand-muted)',
                background: isActive
                  ? `linear-gradient(90deg, ${product === 'graph' ? 'rgba(124, 109, 250, 0.18)' : 'rgba(0, 212, 255, 0.15)'}, transparent)`
                  : 'transparent',
                borderLeft: isActive ? `3px solid ${productAccent}` : '3px solid transparent',
              }}
            >
              <Icon size={18} style={{ color: isActive ? productAccent : 'inherit' }} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div style={{
        marginTop: 'auto',
        padding: '16px',
        background: 'var(--brand-panel)',
        borderRadius: '12px',
        border: '1px solid var(--brand-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ position: 'relative', width: '10px', height: '10px' }}>
          <span style={{ position: 'absolute', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--brand-success)', opacity: 0.5, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
          <span style={{ position: 'absolute', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--brand-success)' }} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>Engine Online</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--brand-muted)' }}>Alla system normala</div>
        </div>
      </div>
    </aside>
  );
}
