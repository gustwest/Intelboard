'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Don't show navbar on login page
  if (pathname === '/login') return null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navLinks = [
    { href: '/', label: 'Engine', emoji: '⚡' },
    { href: '/kunder', label: 'Kunder', emoji: '🏢' },
    { href: '/sources', label: 'Källor', emoji: '📥' },
    { href: '/moduler', label: 'Moduler', emoji: '📐' },
    { href: '/rapporter', label: 'Rapporter', emoji: '📊' },
    { href: '/loggar', label: 'Loggar', emoji: '🪵' },
    { href: '/admin', label: 'Admin', emoji: '📋' },
  ];

  const user = session?.user;
  const role = (session as any)?.user?.role;
  const initial = user?.name?.[0] || user?.email?.[0] || '?';
  const avatarUrl = user?.image;

  return (
    <header
      style={{
        padding: '0 32px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,15,0.9)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        fontFamily: "var(--brand-font-sans)",
      }}
    >
      {/* Left: Logo + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>THE</span>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#b14ef4', letterSpacing: '-0.02em' }}>INSIDERS.</span>
          </div>
        </Link>

        <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.08)' }} />

        {/* Nav Links */}
        <nav style={{ display: 'flex', gap: '4px' }}>
          {navLinks.map(link => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                  color: isActive ? '#b14ef4' : 'rgba(255,255,255,0.45)',
                  background: isActive ? 'rgba(177,78,244,0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(177,78,244,0.25)' : '1px solid transparent',
                }}
              >
                {link.emoji} {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right: Status + User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Engine status */}
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 8px rgba(34,197,94,0.5)',
          }} />
          Engine Online
        </div>

        {/* Role badge */}
        {role && (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: role === 'SUPERADMIN' ? 'rgba(239,68,68,0.15)' : 'rgba(177,78,244,0.15)',
            color: role === 'SUPERADMIN' ? '#ef4444' : '#b14ef4',
            border: `1px solid ${role === 'SUPERADMIN' ? 'rgba(239,68,68,0.25)' : 'rgba(177,78,244,0.25)'}`,
          }}>
            {role}
          </span>
        )}

        {/* User Menu */}
        {user && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 12px 5px 5px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'pointer',
                color: '#e2e8f0',
                fontSize: '0.8125rem',
                transition: 'all 0.15s',
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    border: '2px solid rgba(177,78,244,0.3)',
                  }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: '#b14ef4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: '#fff',
                }}>
                  {initial}
                </span>
              )}
              <span style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name || user.email?.split('@')[0]}
              </span>
              <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)' }}>▼</span>
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: '#1f1b22',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '8px',
                minWidth: '240px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}>
                {/* User info */}
                <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={() => { signOut({ callbackUrl: '/login' }); setShowUserMenu(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px',
                    border: 'none', background: 'transparent',
                    color: '#f87171', fontSize: '0.8125rem',
                    cursor: 'pointer', borderRadius: '10px',
                    textAlign: 'left', transition: 'background 0.15s',
                    fontFamily: 'inherit',
                  }}
                >
                  🚪 Logga ut
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
