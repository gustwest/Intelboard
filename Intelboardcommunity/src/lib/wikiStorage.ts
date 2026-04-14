/**
 * wikiStorage.ts — localStorage persistence layer for Wikipedia content
 * 
 * Stores fetched Wikipedia content per-category so it persists across sessions.
 * Uses Wikipedia revision IDs to enable "check for updates" functionality.
 */

const STORAGE_PREFIX = 'intelboard_wiki_';

export interface StoredWikiContent {
  /** Wikipedia page title */
  title: string;
  /** Short description from Wikipedia */
  description: string;
  /** Full article extract (plain text) */
  extract: string;
  /** Full article HTML */
  extractHtml: string;
  /** Thumbnail image URL */
  thumbnail?: string;
  /** Wikipedia page URL */
  wikiUrl: string;
  /** Wikipedia revision ID for change detection */
  revisionId: number;
  /** ISO timestamp of when content was fetched */
  fetchedAt: string;
  /** Original page ID from Wikipedia */
  pageId: number;
}

/**
 * Check if stored content exists for a given category slug.
 */
export function hasStoredContent(slug: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${slug}`) !== null;
  } catch {
    return false;
  }
}

/**
 * Retrieve stored Wikipedia content for a category.
 */
export function getStoredWikiContent(slug: string): StoredWikiContent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredWikiContent;
  } catch {
    return null;
  }
}

/**
 * Store Wikipedia content for a category.
 */
export function storeWikiContent(slug: string, content: StoredWikiContent): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${slug}`, JSON.stringify(content));
  } catch (e) {
    // localStorage might be full — log and continue
    console.warn('Failed to store wiki content:', e);
  }
}

/**
 * Get the revision ID of stored content (for update checking).
 */
export function getStoredRevisionId(slug: string): number | null {
  const stored = getStoredWikiContent(slug);
  return stored?.revisionId ?? null;
}

/**
 * Remove stored content for a category.
 */
export function removeStoredContent(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${slug}`);
  } catch {
    // ignore
  }
}

/**
 * Get all category slugs that have stored content.
 */
export function getAllStoredSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const slugs: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        slugs.push(key.replace(STORAGE_PREFIX, ''));
      }
    }
    return slugs;
  } catch {
    return [];
  }
}
