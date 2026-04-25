'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AssistantPanel from '@/components/AssistantPanel';

const AUTH_ROUTES = ['/login', '/signup'];

export default function AppShell({ children, user, notificationCount = 0 }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isAuthRoute || !user) {
    return (
      <div className="auth-shell">
        <main className="auth-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <header className="mobile-header">
        <div className="mobile-header-logo">
          <div className="sidebar-logo-icon">T</div>
          <span className="sidebar-logo-text">TopOfMinds</span>
        </div>
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Öppna meny"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      </header>

      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        user={user}
        notificationCount={notificationCount}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="main-content">
        <div className="page-content">{children}</div>
      </main>
      <AssistantPanel />
    </div>
  );
}
