'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { getBookmarksByCategory, addBookmark, removeBookmark, Bookmark } from '@/lib/communityStore';
import styles from './BookmarksTab.module.css';

type HighlightColor = 'important' | 'question' | 'reference' | 'idea';

const COLOR_CONFIG: Record<HighlightColor, { label: string; icon: string; hex: string }> = {
  'important': { label: 'Important', icon: '🔴', hex: '#ef4444' },
  'question': { label: 'Question', icon: '🟡', hex: '#f59e0b' },
  'reference': { label: 'Reference', icon: '🔵', hex: '#3b82f6' },
  'idea': { label: 'Idea', icon: '🟢', hex: '#10b981' },
};

export default function BookmarksTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { user, signInAsDemo } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [snippet, setSnippet] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [color, setColor] = useState<HighlightColor>('important');
  const [source, setSource] = useState('wiki');
  const [filter, setFilter] = useState<HighlightColor | 'all'>('all');

  useEffect(() => {
    if (!user) return;
    setBookmarks(getBookmarksByCategory(user.uid, categoryId));
  }, [user?.uid, categoryId]);

  function handleAdd() {
    if (!user || !snippet.trim()) return;
    addBookmark(user.uid, {
      categoryId,
      categoryName,
      snippet: snippet.trim(),
      annotation: annotation.trim(),
      color,
      source,
    });
    setSnippet('');
    setAnnotation('');
    setShowForm(false);
    setBookmarks(getBookmarksByCategory(user.uid, categoryId));
  }

  function handleRemove(id: string) {
    if (!user) return;
    removeBookmark(user.uid, id);
    setBookmarks(getBookmarksByCategory(user.uid, categoryId));
  }

  const filtered = filter === 'all' ? bookmarks : bookmarks.filter(b => b.color === filter);

  if (!user) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📌</div>
        <div className="empty-state-title">Sign in to save bookmarks</div>
        <div className="empty-state-desc">Save and annotate content from {categoryName}</div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
          {DEMO_USERS.map(u => (
            <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
              {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>📌 Bookmarks & Annotations</h2>
          <p className={styles.subtitle}>Save snippets and add your own notes for {categoryName}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          + Add Bookmark
        </button>
      </div>

      {showForm && (
        <div className={`${styles.form} glass-card`}>
          <textarea
            className="textarea"
            placeholder="Paste or type the content you want to save..."
            value={snippet}
            onChange={e => setSnippet(e.target.value)}
            rows={3}
          />
          <input
            className="input"
            placeholder="Your annotation or note (optional)"
            value={annotation}
            onChange={e => setAnnotation(e.target.value)}
          />
          <div className={styles.formRow}>
            <div className={styles.colorPicker}>
              {(Object.keys(COLOR_CONFIG) as HighlightColor[]).map(c => (
                <button
                  key={c}
                  className={`${styles.colorBtn} ${color === c ? styles.colorBtnActive : ''}`}
                  onClick={() => setColor(c)}
                  style={{ '--dot-color': COLOR_CONFIG[c].hex } as React.CSSProperties}
                  title={COLOR_CONFIG[c].label}
                >
                  {COLOR_CONFIG[c].icon} {COLOR_CONFIG[c].label}
                </button>
              ))}
            </div>
            <select className="input" value={source} onChange={e => setSource(e.target.value)} style={{ width: '160px' }}>
              <option value="wiki">📖 Wikipedia</option>
              <option value="forum">💬 Forum</option>
              <option value="notes">📝 Notes</option>
              <option value="other">📎 Other</option>
            </select>
          </div>
          <div className={styles.formActions}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd} disabled={!snippet.trim()}>Save Bookmark</button>
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <button className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`} onClick={() => setFilter('all')}>
          All ({bookmarks.length})
        </button>
        {(Object.keys(COLOR_CONFIG) as HighlightColor[]).map(c => (
          <button
            key={c}
            className={`${styles.filterBtn} ${filter === c ? styles.active : ''}`}
            onClick={() => setFilter(c)}
          >
            {COLOR_CONFIG[c].icon} {COLOR_CONFIG[c].label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📌</div>
            <div className="empty-state-title">No bookmarks yet</div>
            <div className="empty-state-desc">Save content snippets with annotations for quick reference</div>
          </div>
        ) : (
          filtered.map(bm => {
            const cfg = COLOR_CONFIG[bm.color];
            return (
              <div key={bm.id} className={styles.card} style={{ '--highlight': cfg.hex } as React.CSSProperties}>
                <div className={styles.cardHighlight} />
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTag}>{cfg.icon} {cfg.label}</span>
                    <span className={styles.cardSource}>from {bm.source}</span>
                    <button className={styles.removeBtn} onClick={() => handleRemove(bm.id)} title="Remove">✕</button>
                  </div>
                  <blockquote className={styles.cardSnippet}>{bm.snippet}</blockquote>
                  {bm.annotation && (
                    <p className={styles.cardAnnotation}>💭 {bm.annotation}</p>
                  )}
                  <span className={styles.cardDate}>{new Date(bm.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
