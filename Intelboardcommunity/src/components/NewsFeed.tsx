'use client';

import React, { useState, useEffect } from 'react';
import {
  fetchExternalFeed,
  getFeedSourceConfig,
  toggleFeedSource,
  getAvailableSources,
  ExternalFeedItem,
  FeedSourceConfig,
} from '@/lib/feedSources';
import styles from './NewsFeed.module.css';

interface NewsFeedProps {
  categorySlug: string;
  categoryName: string;
}

const SOURCE_COLORS: Record<string, string> = {
  arxiv: '#b31b1b',
  wikipedia: '#326ada',
  guardian: '#052962',
};

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffHrs = Math.floor((now.getTime() - d.getTime()) / 3600000);
  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffHrs < 168) return `${Math.floor(diffHrs / 24)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NewsFeed({ categorySlug, categoryName }: NewsFeedProps) {
  const [items, setItems] = useState<ExternalFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sources, setSources] = useState<FeedSourceConfig[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const available = getAvailableSources(categorySlug);

  useEffect(() => {
    setSources(getFeedSourceConfig());
  }, []);

  async function handleLoad() {
    setLoading(true);
    try {
      const feed = await fetchExternalFeed(categorySlug, categoryName);
      setItems(feed);
      setLoaded(true);
    } catch { /* handled internally */ }
    finally { setLoading(false); }
  }

  function handleToggleSource(sourceId: string) {
    const updated = toggleFeedSource(sourceId);
    setSources(updated);
  }

  const visibleItems = expanded ? items : items.slice(0, 4);

  return (
    <section className={styles.newsFeed}>
      <div className={styles.header}>
        <h2 className={styles.title}>📡 External Reports & News</h2>
        <div className={styles.headerActions}>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowSettings(!showSettings)}
            title="Configure sources"
          >
            ⚙️
          </button>
          <button
            className={styles.loadBtn}
            onClick={handleLoad}
            disabled={loading}
          >
            {loading ? (
              <><span className={styles.spinner} /> Fetching...</>
            ) : loaded ? (
              <>🔄 Refresh</>
            ) : (
              <>📡 Load External Content</>
            )}
          </button>
        </div>
      </div>

      {/* Source settings panel */}
      {showSettings && (
        <div className={styles.settingsPanel}>
          <div className={styles.settingsTitle}>Feed Sources</div>
          <div className={styles.sourceList}>
            {sources.map(src => {
              const isAvailable = available.includes(src.id);
              return (
                <label
                  key={src.id}
                  className={`${styles.sourceToggle} ${!isAvailable ? styles.unavailable : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={src.enabled && isAvailable}
                    disabled={!isAvailable}
                    onChange={() => handleToggleSource(src.id)}
                  />
                  <span className={styles.sourceIcon}>{src.icon}</span>
                  <span className={styles.sourceName}>{src.name}</span>
                  {!isAvailable && (
                    <span className={styles.sourceUnavail}>N/A for this category</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed items */}
      {items.length > 0 ? (
        <>
          <div className={styles.feedGrid}>
            {visibleItems.map(item => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.feedItem}
              >
                <div className={styles.feedItemHeader}>
                  <span
                    className={styles.sourceBadge}
                    style={{ background: SOURCE_COLORS[item.source] || 'var(--primary-500)' }}
                  >
                    {item.sourceIcon} {item.sourceLabel}
                  </span>
                  <span className={styles.feedDate}>{formatDate(item.publishedAt)}</span>
                </div>
                <h4 className={styles.feedItemTitle}>{item.title}</h4>
                <p className={styles.feedItemSummary}>{item.summary}</p>
                {item.authors && (
                  <span className={styles.feedItemAuthors}>{item.authors}</span>
                )}
                <span className={styles.feedItemLink}>Read more →</span>
              </a>
            ))}
          </div>
          {items.length > 4 && (
            <button className={styles.showMoreBtn} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `▼ Show ${items.length - 4} more`}
            </button>
          )}
        </>
      ) : loaded ? (
        <div className={styles.emptyState}>
          <p>No external content found for this category. Try enabling more sources or loading again.</p>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>Click <strong>Load External Content</strong> to fetch reports, papers, and news from external sources.</p>
          <div className={styles.sourcePreview}>
            {available.includes('arxiv') && <span className={styles.sourceTag}>📄 arXiv Papers</span>}
            {available.includes('guardian') && <span className={styles.sourceTag}>📰 The Guardian</span>}
            <span className={styles.sourceTag}>🌐 Wikipedia Events</span>
          </div>
        </div>
      )}
    </section>
  );
}
