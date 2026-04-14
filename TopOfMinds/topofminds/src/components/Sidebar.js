'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ notificationCount = 0 }) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard', icon: '📊', section: 'Översikt' },
    { href: '/consultants', label: 'Konsulter', icon: '👥', section: 'Översikt' },
    { href: '/contracts', label: 'Kontrakt', icon: '📄', section: 'Översikt' },
    { href: '/clients', label: 'Kunder', icon: '🏢', section: 'Översikt' },
    { href: '/gantt', label: 'Beläggning', icon: '📅', section: 'Planering' },
    { href: '/financials', label: 'Ekonomi', icon: '💰', section: 'Planering' },
    { href: '/notifications', label: 'Notifikationer', icon: '🔔', section: 'System', badge: notificationCount },
  ];

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

          const isActive = link.href === '/'
            ? pathname === '/'
            : pathname.startsWith(link.href);

          return (
            <div key={link.href}>
              {showSection && (
                <div className="sidebar-section-title">{link.section}</div>
              )}
              <Link
                href={link.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-link-icon">{link.icon}</span>
                {link.label}
                {link.badge > 0 && (
                  <span className="sidebar-link-badge">{link.badge}</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
