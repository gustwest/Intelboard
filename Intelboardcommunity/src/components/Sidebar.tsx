'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getTotalNotifications } from '@/lib/userStore';
import { categories, Category, getCategoryPath } from '@/data/categories';
import { getMergedChildren, buildCategoryPath } from '@/lib/dynamicCategories';
import styles from './Sidebar.module.css';

function TreeNode({ category, depth = 0 }: { category: Category; depth?: number }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(depth < 1);
  const [mergedChildren, setMergedChildren] = useState<Category[]>(category.children || []);

  useEffect(() => {
    setMergedChildren(getMergedChildren(category));
  }, [category.slug]);

  const hasChildren = mergedChildren.length > 0;
  let categorySlug: string;
  try {
    categorySlug = getCategoryPath(category).join('/');
  } catch {
    categorySlug = buildCategoryPath(category.slug).join('/') || category.slug;
  }
  const isActive = pathname === `/category/${categorySlug}` || pathname?.startsWith(`/category/${categorySlug}/`);

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.nodeRow} ${isActive ? styles.active : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            className={styles.expandBtn}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className={styles.dot}>•</span>
        )}
        <Link href={`/category/${categorySlug}`} className={styles.nodeLink}>
          <span className={styles.nodeIcon}>{category.icon}</span>
          <span className={styles.nodeName}>{category.name}</span>
        </Link>
      </div>
      {expanded && hasChildren && (
        <div className={styles.children}>
          {mergedChildren.map(child => (
            <TreeNode key={child.id} category={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const notifCount = user ? getTotalNotifications(user.uid) : 0;

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>📁 CATEGORIES</span>
        </div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.homeLink}>
            <span>🏠</span> Home
          </Link>
          <div className={styles.tree}>
            {categories.map(cat => (
              <TreeNode key={cat.id} category={cat} />
            ))}
          </div>
        </nav>
        <div className={styles.sidebarFooter}>
          <Link href="/my-board" className={styles.footerLink}>
            ⭐ My Board
            {notifCount > 0 && <span className={styles.notifBadge}>{notifCount}</span>}
          </Link>
          <Link href="/contacts" className={styles.footerLink}>
            👥 Contacts
          </Link>
          <Link href="/chat" className={styles.footerLink}>
            💬 Chat
          </Link>
        </div>
      </aside>
    </>
  );
}
