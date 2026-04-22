'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/auth/actions';
import { ROLES, isAdmin } from '@/lib/auth/roles';

const ADMIN_LINKS = [
  { href: '/', label: 'Dashboard', icon: '📊', section: 'Översikt' },
  { href: '/consultants', label: 'Konsulter', icon: '👥', section: 'Översikt' },
  { href: '/contracts', label: 'Kontrakt', icon: '📄', section: 'Översikt' },
  { href: '/clients', label: 'Kunder', icon: '🏢', section: 'Översikt' },
  { href: '/gantt', label: 'Beläggning', icon: '📅', section: 'Planering' },
  { href: '/financials', label: 'Ekonomi', icon: '💰', section: 'Planering' },
  { href: '/notifications', label: 'Notifikationer', icon: '🔔', section: 'System', badgeKey: 'notifications' },
  { href: '/admin', label: 'Admin', icon: '⚙️', section: 'System' },
  { href: '/admin/ai', label: 'AI-inställningar', icon: '🤖', section: 'System' },
];

const CONSULTANT_LINKS = [
  { href: '/my', label: 'Mina uppdrag', icon: '🎯', section: 'Jag' },
  { href: '/my/profile', label: 'Min profil', icon: '👤', section: 'Jag' },
];

function initialsFrom(nameOrEmail) {
  const str = (nameOrEmail || '').trim();
  if (!str) return '?';
  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

export default function Sidebar({ user, notificationCount = 0 }) {
  const pathname = usePathname();
  const links = isAdmin(user?.role) ? ADMIN_LINKS : CONSULTANT_LINKS;

  let currentSection = '';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">T</div>
        <span className="sidebar-logo-text">TopOfMinds</span>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => {
          const showSection = link.section !== currentSection;
          if (showSection) currentSection = link.section;

          const isActive =
            link.href === '/'
              ? pathname === '/'
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          const badge = link.badgeKey === 'notifications' ? notificationCount : 0;

          return (
            <div key={link.href}>
              {showSection && <div className="sidebar-section-title">{link.section}</div>}
              <Link href={link.href} className={`sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-link-icon">{link.icon}</span>
                {link.label}
                {badge > 0 && <span className="sidebar-link-badge">{badge}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">{initialsFrom(user.name || user.email)}</div>
            <div className="sidebar-user-meta">
              <div className="sidebar-user-name">{user.name || user.email}</div>
              <div className="sidebar-user-role">{user.role === ROLES.CONSULTANT ? 'Konsult' : user.role}</div>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="sidebar-logout">Logga ut</button>
          </form>
        </div>
      )}
    </aside>
  );
}
