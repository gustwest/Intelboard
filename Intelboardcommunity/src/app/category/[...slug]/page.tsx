'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { findCategoryBySlug, getCategoryPath, Category } from '@/data/categories';
import { useAuth } from '@/contexts/AuthContext';
import { isFollowing, toggleFollow, clearNotifications } from '@/lib/userStore';
import {
  findCategoryAnywhere,
  buildBreadcrumbs,
  buildCategoryPath,
  getMergedChildren,
  loadSubcategories,
  searchWikipediaTopics,
  addCategoryFromSearch,
  WikiSearchResult,
} from '@/lib/dynamicCategories';
import ForumTab from '@/components/ForumTab';
import EventsTab from '@/components/EventsTab';
import LearnTab from '@/components/LearnTab';
import NotesTab from '@/components/NotesTab';
import AskAITab from '@/components/AskAITab';
import BookmarksTab from '@/components/BookmarksTab';
import ExpertsTab from '@/components/ExpertsTab';
import InsightsTab from '@/components/InsightsTab';
import NewsFeed from '@/components/NewsFeed';
import {
  getStoredWikiContent,
  storeWikiContent,
  StoredWikiContent,
} from '@/lib/wikiStorage';
import logger from '@/lib/logger';
import styles from './category.module.css';

export default function CategoryPage() {
  const params = useParams();
  const { user } = useAuth();
  const slugParts = (params.slug as string[]) || [];
  const currentSlug = slugParts[slugParts.length - 1];
  const category = findCategoryAnywhere(currentSlug);
  const [activeTab, setActiveTab] = useState('overview');
  const [wikiContent, setWikiContent] = useState<StoredWikiContent | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  // Dynamic subcategory state
  const [mergedChildren, setMergedChildren] = useState<Category[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subsLoaded, setSubsLoaded] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTopic, setAddingTopic] = useState<string | null>(null);

  // Load persisted content and follow state on mount
  useEffect(() => {
    if (!category) return;
    const stored = getStoredWikiContent(category.slug);
    if (stored) {
      setWikiContent(stored);
      logger.info('Loaded persisted Wikipedia content', { slug: category.slug, revisionId: stored.revisionId });
    }
    if (user) {
      setFollowing(isFollowing(user.uid, category.slug));
      clearNotifications(user.uid, category.slug);
    }
    // Load merged children (static + dynamic)
    setMergedChildren(getMergedChildren(category));
    setSubsLoaded(false);
  }, [category?.slug, user?.uid]);

  // Clear update message after 5 seconds
  useEffect(() => {
    if (!updateMessage) return;
    const timer = setTimeout(() => setUpdateMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [updateMessage]);

  function handleToggleFollow() {
    if (!user || !category) return;
    const nowFollowing = toggleFollow(user.uid, category.slug);
    setFollowing(nowFollowing);
  }

  // Load subcategories from Wikipedia
  const handleLoadSubcategories = useCallback(async () => {
    if (!category || loadingSubs) return;
    setLoadingSubs(true);
    try {
      const dynChildren = await loadSubcategories(
        category.slug,
        category.id,
        category.level,
        category.wikiTitle,
      );
      if (dynChildren.length > 0) {
        setMergedChildren(getMergedChildren(category));
      }
      setSubsLoaded(true);
    } catch (err) {
      logger.error('Failed to load subcategories', { error: String(err) });
    } finally {
      setLoadingSubs(false);
    }
  }, [category, loadingSubs]);

  // Search Wikipedia for topics
  async function handleSearch() {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    try {
      const results = await searchWikipediaTopics(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      logger.error('Search failed', { error: String(err) });
    } finally {
      setSearching(false);
    }
  }

  // Add a topic from search results as a subcategory
  async function handleAddFromSearch(result: WikiSearchResult) {
    if (!category || addingTopic) return;
    setAddingTopic(result.title);
    try {
      await addCategoryFromSearch(category.slug, category.id, category.level, result);
      setMergedChildren(getMergedChildren(category));
      setSearchResults(prev => prev.filter(r => r.title !== result.title));
    } catch (err) {
      logger.error('Failed to add category', { error: String(err) });
    } finally {
      setAddingTopic(null);
    }
  }

  if (!category) {
    return (
      <div className="content-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Category Not Found</div>
          <div className="empty-state-desc">The category you&apos;re looking for doesn&apos;t exist.</div>
          <Link href="/" className="btn-primary" style={{ marginTop: '1rem' }}>Back to Home</Link>
        </div>
      </div>
    );
  }

  const breadcrumbs = buildBreadcrumbs(currentSlug);
  const hasContent = wikiContent !== null;

  async function fetchWikiInfo() {
    if (!category) return;
    setWikiLoading(true);
    setUpdateMessage(null);

    try {
      // Fetch summary first (includes revision ID, thumbnail, description)
      const summaryRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(category.wikiTitle)}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!summaryRes.ok) {
        logger.error('Failed to fetch Wikipedia summary', { status: summaryRes.status, slug: category.slug });
        setWikiLoading(false);
        return;
      }

      const summaryData = await summaryRes.json();
      const newRevisionId = summaryData.revision;

      // If we already have this revision, no update needed
      if (hasContent && wikiContent?.revisionId === newRevisionId) {
        logger.info('Wikipedia content is up to date', { slug: category.slug, revisionId: newRevisionId });
        setUpdateMessage('✅ Content is up to date — no changes since last fetch.');
        setWikiLoading(false);
        return;
      }

      // Fetch the full article HTML for comprehensive content
      let fullExtractHtml = summaryData.extract_html || summaryData.extract || '';
      try {
        const mobileRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/mobile-html/${encodeURIComponent(category.wikiTitle)}`,
          { headers: { 'Accept': 'text/html' } }
        );
        if (mobileRes.ok) {
          const fullHtml = await mobileRes.text();
          // Extract main content sections from the mobile HTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(fullHtml, 'text/html');
          const sections = doc.querySelectorAll('section');
          const contentParts: string[] = [];
          sections.forEach((section) => {
            // Skip empty sections and references
            const text = section.textContent?.trim();
            if (text && text.length > 50 && !section.querySelector('.mw-references-wrap')) {
              contentParts.push(section.innerHTML);
            }
          });
          if (contentParts.length > 0) {
            fullExtractHtml = contentParts.slice(0, 8).join('');
          }
        }
      } catch (htmlErr) {
        logger.warn('Could not fetch full article HTML, using summary extract', { error: String(htmlErr) });
      }

      // Build the stored content object
      const storedContent: StoredWikiContent = {
        title: summaryData.title,
        description: summaryData.description || '',
        extract: summaryData.extract || '',
        extractHtml: fullExtractHtml,
        thumbnail: summaryData.thumbnail?.source,
        wikiUrl: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${category.wikiTitle}`,
        revisionId: newRevisionId,
        fetchedAt: new Date().toISOString(),
        pageId: summaryData.pageid,
      };

      // Persist to localStorage
      storeWikiContent(category.slug, storedContent);
      setWikiContent(storedContent);

      if (hasContent) {
        setUpdateMessage('🔄 Content has been updated with the latest changes from Wikipedia.');
        logger.info('Wikipedia content updated', { slug: category.slug, oldRevision: wikiContent?.revisionId, newRevision: newRevisionId });
      } else {
        logger.info('Wikipedia content fetched and stored', { slug: category.slug, revisionId: newRevisionId });
      }
    } catch (err) {
      logger.error('Failed to fetch Wikipedia data', { error: String(err), slug: category.slug });
    }

    setWikiLoading(false);
  }

  // Format the "last fetched" timestamp
  function formatFetchedAt(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📖' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'ask-ai', label: 'Ask AI', icon: '🤖' },
    { id: 'forum', label: 'Forum', icon: '💬' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'bookmarks', label: 'Bookmarks', icon: '📌' },
    { id: 'experts', label: 'Experts', icon: '👥' },
    { id: 'insights', label: 'Insights', icon: '📊' },
    { id: 'learn', label: 'Learning', icon: '🧠' },
  ];

  return (
    <div className="content-wrapper">
      {/* Breadcrumbs */}
      <nav className={styles.breadcrumbs}>
        <Link href="/" className={styles.crumb}>Home</Link>
        {breadcrumbs.map((bc, i) => {
          const path = getCategoryPath(bc).join('/');
          const isLast = i === breadcrumbs.length - 1;
          return (
            <React.Fragment key={bc.id}>
              <span className={styles.crumbSep}>/</span>
              {isLast ? (
                <span className={styles.crumbActive}>{bc.name}</span>
              ) : (
                <Link href={`/category/${path}`} className={styles.crumb}>{bc.name}</Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Category Header */}
      <div className={styles.categoryHeader}>
        <div className={styles.categoryIcon}>{category.icon}</div>
        <div className={styles.categoryInfo}>
          <h1 className={styles.categoryName}>{category.name}</h1>
          <p className={styles.categoryDesc}>{category.description}</p>
          <div className={styles.categoryMeta}>
            {mergedChildren.length > 0 && (
              <span className="badge">{mergedChildren.length} subcategories</span>
            )}
            <span className="badge">Level {category.level}</span>
          </div>
        </div>
        {user && (
          <button
            className={`${styles.followBtn} ${following ? styles.followBtnActive : ''}`}
            onClick={handleToggleFollow}
          >
            {following ? '✅ Following' : '⭐ Follow'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className={styles.overviewTab}>
          {/* Subcategories */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Subcategories</h2>
              <button
                className="btn-primary"
                onClick={handleLoadSubcategories}
                disabled={loadingSubs}
                style={{ fontSize: 'var(--text-xs)' }}
              >
                {loadingSubs ? (
                  <><span className={styles.spinner}></span> Loading...</>
                ) : subsLoaded ? (
                  <>🔄 Refresh from Wikipedia</>
                ) : (
                  <>🌐 Load from Wikipedia</>
                )}
              </button>
            </div>
            {mergedChildren.length > 0 ? (
              <div className={styles.subGrid}>
                {mergedChildren.map(child => {
                  // Build path: for static children use getCategoryPath, for dynamic use buildCategoryPath
                  const childPath = child.children !== undefined && child.children.length >= 0
                    ? (() => { try { return getCategoryPath(child).join('/'); } catch { return buildCategoryPath(child.slug).join('/') || `${slugParts.join('/')}/${child.slug}`; } })()
                    : `${slugParts.join('/')}/${child.slug}`;
                  return (
                    <Link key={child.id} href={`/category/${childPath}`} className={`${styles.subCard} glass-card`}>
                      <span className={styles.subIcon}>{child.icon}</span>
                      <div>
                        <h3 className={styles.subName}>{child.name}</h3>
                        <p className={styles.subDesc}>{child.description}</p>
                        {child.children && child.children.length > 0 && (
                          <span className="badge" style={{ marginTop: '0.5rem' }}>{child.children.length} subcategories</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className={styles.fetchPrompt}>
                <p>Click &quot;Load from Wikipedia&quot; to discover subcategories for this topic.</p>
              </div>
            )}
          </section>

          {/* Search Wikipedia Topics */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>🔍 Discover & Add Topics</h2>
            <div className={styles.searchBar}>
              <input
                className="input"
                placeholder={`Search Wikipedia for topics related to ${category.name}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map(result => (
                  <div key={result.title} className={`${styles.searchResultCard} glass-card`}>
                    <div className={styles.searchResultInfo}>
                      <h4 className={styles.searchResultTitle}>{result.title}</h4>
                      <p className={styles.searchResultDesc}>{result.description}</p>
                    </div>
                    <button
                      className="btn-primary"
                      onClick={() => handleAddFromSearch(result)}
                      disabled={addingTopic === result.title}
                      style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}
                    >
                      {addingTopic === result.title ? 'Adding...' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* External News & Reports */}
          <section className={styles.section}>
            <NewsFeed categorySlug={category.slug} categoryName={category.name} />
          </section>

          {/* Wiki Content */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Wikipedia Information</h2>
              <button className="btn-primary" onClick={fetchWikiInfo} disabled={wikiLoading}>
                {wikiLoading ? (
                  <>
                    <span className={styles.spinner}></span>
                    {hasContent ? 'Checking...' : 'Fetching...'}
                  </>
                ) : hasContent ? (
                  <>🔄 Check for updates</>
                ) : (
                  <>📥 Fetch Information</>
                )}
              </button>
            </div>

            {/* Update status message */}
            {updateMessage && (
              <div className={styles.updateMessage}>
                {updateMessage}
              </div>
            )}

            {wikiLoading && !hasContent && (
              <div className={styles.wikiSkeleton}>
                <div className="skeleton" style={{ height: '1.5rem', width: '60%', marginBottom: '1rem' }}></div>
                <div className="skeleton" style={{ height: '1rem', width: '100%', marginBottom: '0.5rem' }}></div>
                <div className="skeleton" style={{ height: '1rem', width: '90%', marginBottom: '0.5rem' }}></div>
                <div className="skeleton" style={{ height: '1rem', width: '95%' }}></div>
              </div>
            )}

            {wikiContent && (
              <div className={`${styles.wikiContent} glass-card`}>
                {wikiContent.thumbnail && (
                  <div className={styles.wikiImage}>
                    <img src={wikiContent.thumbnail} alt={wikiContent.title} />
                  </div>
                )}
                <div className={styles.wikiText}>
                  <h3 className={styles.wikiTitle}>{wikiContent.title}</h3>
                  {wikiContent.description && (
                    <p className={styles.wikiDescription}>{wikiContent.description}</p>
                  )}
                  <div
                    className={styles.wikiExtract}
                    dangerouslySetInnerHTML={{ __html: wikiContent.extractHtml || wikiContent.extract }}
                  />
                  <div className={styles.wikiFooter}>
                    <a
                      href={wikiContent.wikiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.wikiLink}
                    >
                      Read full article on Wikipedia →
                    </a>
                    <span className={styles.fetchedAt}>
                      Last updated: {formatFetchedAt(wikiContent.fetchedAt)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!hasContent && !wikiLoading && (
              <div className={styles.fetchPrompt}>
                <p>Click &quot;Fetch Information&quot; to load detailed content from Wikipedia about this category.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'forum' && <ForumTab categoryId={category.id} categoryName={category.name} />}
      {activeTab === 'events' && <EventsTab categoryId={category.id} categoryName={category.name} />}
      {activeTab === 'learn' && <LearnTab categoryId={category.id} categoryName={category.name} wikiContent={wikiContent?.extract || category.description} />}
      {activeTab === 'notes' && <NotesTab categoryId={category.id} categoryName={category.name} />}
      {activeTab === 'ask-ai' && <AskAITab categoryId={category.id} categoryName={category.name} wikiContent={wikiContent?.extract || category.description} />}
      {activeTab === 'bookmarks' && <BookmarksTab categoryId={category.id} categoryName={category.name} />}
      {activeTab === 'experts' && <ExpertsTab categoryId={category.id} categoryName={category.name} />}
      {activeTab === 'insights' && <InsightsTab categoryId={category.id} categoryName={category.name} />}
    </div>
  );
}
