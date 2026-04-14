'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { getFollowedSlugs, toggleFollow, getNotificationCount, getTotalNotifications } from '@/lib/userStore';
import { findCategoryBySlug, getCategoryPath } from '@/data/categories';
import { getStoredWikiContent } from '@/lib/wikiStorage';
import styles from './myboard.module.css';

interface FollowedCategory {
  slug: string;
  name: string;
  icon: string;
  description: string;
  path: string;
  hasWikiContent: boolean;
  notificationCount: number;
}

export default function MyBoardPage() {
  const { user, signInAsDemo } = useAuth();
  const [followedCategories, setFollowedCategories] = useState<FollowedCategory[]>([]);

  useEffect(() => {
    if (!user) return;
    loadFollows();
  }, [user?.uid]);

  function loadFollows() {
    if (!user) return;
    const slugs = getFollowedSlugs(user.uid);
    const cats: FollowedCategory[] = [];

    for (const slug of slugs) {
      const cat = findCategoryBySlug(slug);
      if (cat) {
        const path = getCategoryPath(cat).join('/');
        const stored = getStoredWikiContent(slug);
        cats.push({
          slug,
          name: cat.name,
          icon: cat.icon,
          description: cat.description,
          path,
          hasWikiContent: stored !== null,
          notificationCount: getNotificationCount(user.uid, slug),
        });
      }
    }

    setFollowedCategories(cats);
  }

  function handleUnfollow(slug: string) {
    if (!user) return;
    toggleFollow(user.uid, slug);
    loadFollows();
  }

  if (!user) {
    return (
      <div className="content-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">⭐</div>
          <div className="empty-state-title">Sign in to access My Board</div>
          <div className="empty-state-desc">Follow categories to build your personal knowledge base.</div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {DEMO_USERS.map(u => (
              <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)}>
                {getDemoAvatar(u.uid)} {u.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>⭐ My Board</h1>
          <p className={styles.subtitle}>
            Your personal knowledge base — categories you follow will appear here.
          </p>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{followedCategories.length}</span>
            <span className={styles.statLabel}>Following</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{getTotalNotifications(user.uid)}</span>
            <span className={styles.statLabel}>Updates</span>
          </div>
        </div>
      </div>

      {followedCategories.length > 0 ? (
        <div className={styles.grid}>
          {followedCategories.map(cat => (
            <div key={cat.slug} className={`${styles.card} glass-card`}>
              <div className={styles.cardTop}>
                <Link href={`/category/${cat.path}`} className={styles.cardLink}>
                  <span className={styles.cardIcon}>{cat.icon}</span>
                  <div className={styles.cardInfo}>
                    <h3 className={styles.cardName}>{cat.name}</h3>
                    <p className={styles.cardDesc}>{cat.description}</p>
                  </div>
                </Link>
                {cat.notificationCount > 0 && (
                  <span className={styles.notifBadge}>{cat.notificationCount}</span>
                )}
              </div>
              <div className={styles.cardMeta}>
                {cat.hasWikiContent && (
                  <span className={styles.metaBadge}>📖 Content loaded</span>
                )}
                <span className={styles.metaBadge}>💬 Forum</span>
                <span className={styles.metaBadge}>📅 Events</span>
              </div>
              <div className={styles.cardActions}>
                <Link href={`/category/${cat.path}`} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  Open
                </Link>
                <button className="btn-ghost" onClick={() => handleUnfollow(cat.slug)} title="Unfollow">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No followed categories yet</div>
          <div className="empty-state-desc">
            Browse categories and click the ⭐ Follow button to add them to your board.
          </div>
          <Link href="/" className="btn-primary" style={{ marginTop: '1rem' }}>
            Browse Categories
          </Link>
        </div>
      )}
    </div>
  );
}
