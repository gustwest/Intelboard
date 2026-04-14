'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from './UserProvider';

export default function Navbar() {
  const pathname = usePathname();
  const { currentUser, setUser, logout, allUsers } = useUser();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    { href: '/admin', label: 'Admin', emoji: '📋' },
    { href: '/chat', label: 'Chatt', emoji: '💬' },
  ];

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
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Left: Logo + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>THE</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.01em' }}>INSIDERS.</span>
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
                  color: isActive ? '#a855f7' : 'rgba(255,255,255,0.45)',
                  background: isActive ? 'rgba(168,85,247,0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
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

        {/* User Menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '5px 12px 5px 8px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              color: '#e2e8f0',
              fontSize: '0.8125rem',
              transition: 'all 0.15s',
            }}
          >
            {currentUser ? (
              <>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: currentUser.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: '#fff',
                }}>
                  {currentUser.name[0]}
                </span>
                <span style={{ fontWeight: 600 }}>{currentUser.name}</span>
                <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)' }}>▼</span>
              </>
            ) : (
              <>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem',
                }}>
                  ?
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Välj användare</span>
                <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)' }}>▼</span>
              </>
            )}
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: '#1a1a24',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              padding: '6px',
              minWidth: '200px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 200,
            }}>
              <div style={{ padding: '8px 12px 4px', fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Välj konto
              </div>
              {allUsers.map(user => (
                <button
                  key={user.name}
                  onClick={() => { setUser(user); setShowUserMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '8px 12px',
                    border: 'none',
                    background: currentUser?.name === user.name ? 'rgba(168,85,247,0.12)' : 'transparent',
                    color: '#e2e8f0', fontSize: '0.8125rem',
                    cursor: 'pointer', borderRadius: '10px',
                    transition: 'background 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: user.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {user.name[0]}
                  </span>
                  <span style={{ fontWeight: 600 }}>{user.name}</span>
                  {currentUser?.name === user.name && (
                    <span style={{ marginLeft: 'auto', color: '#a855f7', fontSize: '0.75rem' }}>✓</span>
                  )}
                </button>
              ))}
              {currentUser && (
                <>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 12px',
                      border: 'none', background: 'transparent',
                      color: '#f87171', fontSize: '0.8125rem',
                      cursor: 'pointer', borderRadius: '10px',
                      textAlign: 'left', transition: 'background 0.15s',
                    }}
                  >
                    🚪 Logga ut
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
