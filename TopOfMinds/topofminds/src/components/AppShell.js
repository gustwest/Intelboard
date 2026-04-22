'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const AUTH_ROUTES = ['/login', '/signup'];

export default function AppShell({ children, user, notificationCount = 0 }) {
  const pathname = usePathname();
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
      <Sidebar user={user} notificationCount={notificationCount} />
      <main className="main-content">
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
