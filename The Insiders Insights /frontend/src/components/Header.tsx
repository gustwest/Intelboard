'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Search, Bell } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const user = session?.user;
  const role = (session as any)?.user?.role;
  const initial = user?.name?.[0] || user?.email?.[0] || '?';
  const avatarUrl = user?.image;

  // Format today's date
  const today = new Date().toLocaleDateString('sv-SE', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <header style={{
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      background: 'rgba(15, 17, 26, 0.8)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--brand-border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Left side: Search or Title Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', 
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          borderRadius: '8px',
          padding: '8px 12px',
          width: '300px'
        }}>
          <Search size={16} color="var(--brand-muted)" />
          <input 
            type="text" 
            placeholder="Sök kunder, moduler..." 
            style={{ 
              background: 'transparent', border: 'none', color: '#fff', 
              fontSize: '0.875rem', outline: 'none', width: '100%' 
            }} 
          />
        </div>
      </div>

      {/* Right side: Actions & User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ color: 'var(--brand-muted)', fontSize: '0.875rem', textTransform: 'capitalize' }}>
          {today}
        </div>

        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}>
          <Bell size={20} color="var(--brand-muted)" />
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', background: 'var(--brand-accent)', borderRadius: '50%' }} />
        </button>

        <div style={{ width: '1px', height: '24px', background: 'var(--brand-border)' }} />

        {/* User Menu */}
        {user && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    border: '2px solid rgba(0, 212, 255, 0.3)',
                  }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'var(--brand-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', fontWeight: 700, color: '#000',
                }}>
                  {initial}
                </span>
              )}
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem' }}>
                  {user.name || user.email?.split('@')[0]}
                </div>
                {role && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--brand-accent)', fontWeight: 500 }}>
                    {role}
                  </div>
                )}
              </div>
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                right: 0,
                background: 'var(--brand-panel)',
                border: '1px solid var(--brand-border)',
                borderRadius: '12px',
                padding: '8px',
                minWidth: '220px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid var(--brand-border)', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', marginTop: '2px' }}>
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={() => { signOut({ callbackUrl: '/login' }); setShowUserMenu(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '10px 12px',
                    border: 'none', background: 'transparent',
                    color: 'var(--brand-danger)', fontSize: '0.875rem', fontWeight: 500,
                    cursor: 'pointer', borderRadius: '8px',
                    textAlign: 'left', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Logga ut
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
