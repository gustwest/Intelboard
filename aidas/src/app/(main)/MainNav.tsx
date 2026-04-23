'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './nav.module.css';

interface NavProps {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

const navItems = [
  { href: '/dashboard', label: 'Översikt', icon: '📊' },
  { href: '/catalog', label: 'Datakatalog', icon: '🗂️' },
  { href: '/modeling', label: 'Data Vault', icon: '🔷' },
  { href: '/reports', label: 'Rapporter', icon: '📈' },
  { href: '/admin', label: 'Admin', icon: '⚙️' },
];

export function MainNav({ user }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>◆</span>
        <span className={styles.logoText}>AIDAS</span>
      </div>

      <div className={styles.navItems}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${pathname.startsWith(item.href) ? styles.active : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          {user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className={styles.avatar} />
          )}
          <div className={styles.userName}>{user.name || user.email}</div>
        </div>
        <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
          Logga ut
        </button>
      </div>
    </nav>
  );
}
