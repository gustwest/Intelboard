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
  ShieldAlert 
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  // Hide sidebar on login page
  if (pathname === '/login') return null;

  const navLinks = [
    { href: '/', label: 'Engine', icon: Zap },
    { href: '/kunder', label: 'Kunder', icon: Building2 },
    { href: '/sources', label: 'Källor', icon: DownloadCloud },
    { href: '/moduler', label: 'Moduler', icon: Layers },
    { href: '/rapporter', label: 'Rapporter', icon: BarChart3 },
    { href: '/loggar', label: 'Loggar', icon: Terminal },
    { href: '/admin', label: 'Admin', icon: ShieldAlert },
  ];

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
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>THE</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-accent)', letterSpacing: '-0.03em' }}>INSIDERS.</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {navLinks.map(link => {
          const isActive = pathname === link.href;
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
                background: isActive ? 'linear-gradient(90deg, rgba(0, 212, 255, 0.15), transparent)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--brand-accent)' : '3px solid transparent',
              }}
            >
              <Icon size={18} style={{ color: isActive ? 'var(--brand-accent)' : 'inherit' }} />
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
