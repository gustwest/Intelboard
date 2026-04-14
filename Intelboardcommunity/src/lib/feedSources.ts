/**
 * feedSources.ts — pluggable external content sources for category feeds
 *
 * Adapters for arXiv, Wikipedia Current Events, and The Guardian.
 * Results are cached in localStorage with configurable TTL.
 * Each source maps to specific Intelboard categories.
 */

import logger from '@/lib/logger';

// ===== Types =====

export interface ExternalFeedItem {
  id: string;
  source: 'arxiv' | 'wikipedia' | 'guardian';
  sourceLabel: string;
  sourceIcon: string;
  type: 'paper' | 'news' | 'current_event' | 'report';
  title: string;
  summary: string;
  url: string;
  authors?: string;
  publishedAt: string;
  categorySlug: string;
  categoryName: string;
}

export interface FeedSourceConfig {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
}

// ===== Category Mappings =====

/** Maps Intelboard category slugs to arXiv category codes */
const ARXIV_CATEGORY_MAP: Record<string, string[]> = {
  'computing': ['cs.AI', 'cs.SE', 'cs.PL', 'cs.CR'],
  'programming': ['cs.PL', 'cs.SE', 'cs.DS'],
  'artificial-intelligence': ['cs.AI', 'cs.LG', 'cs.CL'],
  'cybersecurity': ['cs.CR'],
  'data-science': ['cs.LG', 'cs.AI', 'stat.ML'],
  'software-engineering': ['cs.SE'],
  'physics': ['physics.gen-ph', 'quant-ph', 'hep-ph'],
  'quantum-physics': ['quant-ph'],
  'astrophysics': ['astro-ph'],
  'classical-mechanics': ['physics.class-ph'],
  'thermodynamics': ['physics.class-ph'],
  'biology': ['q-bio.GN', 'q-bio.PE', 'q-bio.NC'],
  'genetics': ['q-bio.GN'],
  'ecology': ['q-bio.PE'],
  'neuroscience': ['q-bio.NC'],
  'pure-mathematics': ['math.AG', 'math.NT', 'math.CO'],
  'applied-mathematics': ['math.NA', 'math.OC'],
  'statistics': ['stat.ML', 'stat.ME'],
  'probability': ['math.PR'],
  'economics': ['econ.GN', 'econ.TH'],
  'earth-science': ['physics.geo-ph', 'physics.ao-ph'],
  'chemistry': ['physics.chem-ph'],
};

/** Maps Intelboard slugs to Guardian section IDs */
const GUARDIAN_SECTION_MAP: Record<string, string> = {
  'computing': 'technology',
  'programming': 'technology',
  'artificial-intelligence': 'technology',
  'cybersecurity': 'technology',
  'data-science': 'technology',
  'software-engineering': 'technology',
  'physics': 'science',
  'biology': 'science',
  'chemistry': 'science',
  'earth-science': 'science',
  'ecology': 'environment',
  'economics': 'business',
  'politics': 'politics',
  'law': 'law',
  'education': 'education',
  'medicine': 'science',
  'nutrition': 'lifeandstyle',
  'sports': 'sport',
  'film': 'film',
  'music': 'music',
  'visual-arts': 'artanddesign',
  'literature': 'books',
  'modern-history': 'world',
  'ancient-history': 'world',
};

// ===== Caching =====

const FEED_CACHE_PREFIX = 'intelboard_feed_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SOURCE_CONFIG_KEY = 'intelboard_feedsource_config';

interface CachedFeed {
  items: ExternalFeedItem[];
  fetchedAt: number;
}

function getCacheKey(source: string, categorySlug: string): string {
  return `${FEED_CACHE_PREFIX}${source}_${categorySlug}`;
}

function getCachedFeed(source: string, categorySlug: string): ExternalFeedItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getCacheKey(source, categorySlug));
    if (!raw) return null;
    const cached: CachedFeed = JSON.parse(raw);
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.items;
  } catch { return null; }
}

function setCachedFeed(source: string, categorySlug: string, items: ExternalFeedItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const cached: CachedFeed = { items, fetchedAt: Date.now() };
    localStorage.setItem(getCacheKey(source, categorySlug), JSON.stringify(cached));
  } catch { /* storage full */ }
}

// ===== Source Config =====

const DEFAULT_SOURCES: FeedSourceConfig[] = [
  { id: 'arxiv', name: 'arXiv Papers', icon: '📄', enabled: true },
  { id: 'wikipedia', name: 'Wikipedia Current Events', icon: '🌐', enabled: true },
  { id: 'guardian', name: 'The Guardian', icon: '📰', enabled: true },
];

export function getFeedSourceConfig(): FeedSourceConfig[] {
  if (typeof window === 'undefined') return DEFAULT_SOURCES;
  try {
    const raw = localStorage.getItem(SOURCE_CONFIG_KEY);
    if (!raw) return DEFAULT_SOURCES;
    return JSON.parse(raw);
  } catch { return DEFAULT_SOURCES; }
}

export function setFeedSourceConfig(configs: FeedSourceConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOURCE_CONFIG_KEY, JSON.stringify(configs));
  } catch { /* ignore */ }
}

export function toggleFeedSource(sourceId: string): FeedSourceConfig[] {
  const configs = getFeedSourceConfig();
  const updated = configs.map(c =>
    c.id === sourceId ? { ...c, enabled: !c.enabled } : c
  );
  setFeedSourceConfig(updated);
  return updated;
}

// ===== arXiv Adapter =====

/**
 * Fetch recent papers from arXiv for a category
 */
async function fetchArxiv(categorySlug: string, categoryName: string): Promise<ExternalFeedItem[]> {
  const arxivCats = ARXIV_CATEGORY_MAP[categorySlug];
  if (!arxivCats || arxivCats.length === 0) return [];

  // Check cache first
  const cached = getCachedFeed('arxiv', categorySlug);
  if (cached) return cached;

  try {
    const catQuery = arxivCats.map(c => `cat:${c}`).join('+OR+');
    const url = `/api/feed/arxiv?query=${encodeURIComponent(catQuery)}&max=5`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`arXiv: ${res.status}`);

    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const entries = xml.querySelectorAll('entry');

    const items: ExternalFeedItem[] = [];
    entries.forEach((entry, idx) => {
      const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const summary = entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const published = entry.querySelector('published')?.textContent || new Date().toISOString();
      const link = entry.querySelector('id')?.textContent || '';
      const authorNodes = entry.querySelectorAll('author > name');
      const authors = Array.from(authorNodes).map(a => a.textContent).join(', ');

      items.push({
        id: `arxiv-${categorySlug}-${idx}`,
        source: 'arxiv',
        sourceLabel: 'arXiv',
        sourceIcon: '📄',
        type: 'paper',
        title: title.slice(0, 200),
        summary: summary.slice(0, 300),
        url: link,
        authors: authors.slice(0, 100),
        publishedAt: published,
        categorySlug,
        categoryName,
      });
    });

    setCachedFeed('arxiv', categorySlug, items);
    logger.info('Fetched arXiv papers', { categorySlug, count: items.length });
    return items;
  } catch (err) {
    logger.error('arXiv fetch failed', { categorySlug, error: String(err) });
    return [];
  }
}

// ===== Wikipedia Current Events Adapter =====

/**
 * Fetch Wikipedia current events (portal page)
 */
async function fetchWikiCurrentEvents(categorySlug: string, categoryName: string): Promise<ExternalFeedItem[]> {
  const cached = getCachedFeed('wikipedia', categorySlug);
  if (cached) return cached;

  try {
    // Fetch today's current events from Wikipedia
    const now = new Date();
    const year = now.getFullYear();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const day = now.getDate();

    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events/${month}_${year}&prop=text&format=json&origin=*`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wiki events: ${res.status}`);

    const data = await res.json();
    const html = data?.parse?.text?.['*'] || '';

    // Parse events from HTML — extract list items
    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (!tempDiv) return [];

    tempDiv.innerHTML = html;
    const listItems = tempDiv.querySelectorAll('li');

    const items: ExternalFeedItem[] = [];
    let count = 0;

    listItems.forEach((li) => {
      if (count >= 8) return;
      const text = li.textContent?.trim() || '';
      if (text.length < 30 || text.length > 500) return;

      // Simple relevance filter based on category keywords
      const catKeywords = categoryName.toLowerCase().split(/\s+/);
      const isRelevant = categorySlug === 'all' ||
        catKeywords.some(kw => text.toLowerCase().includes(kw)) ||
        count < 5; // Always include first 5 for general feed

      if (!isRelevant) return;

      // Find first link for URL
      const link = li.querySelector('a');
      const href = link ? `https://en.wikipedia.org${link.getAttribute('href') || ''}` : '';

      items.push({
        id: `wiki-event-${count}`,
        source: 'wikipedia',
        sourceLabel: 'Wikipedia',
        sourceIcon: '🌐',
        type: 'current_event',
        title: text.slice(0, 150),
        summary: text.slice(0, 300),
        url: href,
        publishedAt: now.toISOString(),
        categorySlug,
        categoryName,
      });
      count++;
    });

    setCachedFeed('wikipedia', categorySlug, items);
    logger.info('Fetched Wikipedia current events', { count: items.length });
    return items;
  } catch (err) {
    logger.error('Wikipedia events fetch failed', { error: String(err) });
    return [];
  }
}

// ===== Guardian Adapter =====

// The Guardian API key — free developer tier
const GUARDIAN_API_KEY = 'test'; // 'test' key works for development, limited rate

/**
 * Fetch recent articles from The Guardian
 */
async function fetchGuardian(categorySlug: string, categoryName: string): Promise<ExternalFeedItem[]> {
  const section = GUARDIAN_SECTION_MAP[categorySlug];
  if (!section) return [];

  const cached = getCachedFeed('guardian', categorySlug);
  if (cached) return cached;

  try {
    const url = `https://content.guardianapis.com/search?section=${section}&page-size=5&show-fields=trailText&order-by=newest&api-key=${GUARDIAN_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Guardian: ${res.status}`);

    const data = await res.json();
    const results = data?.response?.results || [];

    const items: ExternalFeedItem[] = results.map((r: {
      id: string;
      webTitle: string;
      webUrl: string;
      webPublicationDate: string;
      fields?: { trailText?: string };
    }, idx: number) => ({
      id: `guardian-${categorySlug}-${idx}`,
      source: 'guardian' as const,
      sourceLabel: 'The Guardian',
      sourceIcon: '📰',
      type: 'news' as const,
      title: r.webTitle,
      summary: r.fields?.trailText || '',
      url: r.webUrl,
      publishedAt: r.webPublicationDate,
      categorySlug,
      categoryName,
    }));

    setCachedFeed('guardian', categorySlug, items);
    logger.info('Fetched Guardian articles', { categorySlug, count: items.length });
    return items;
  } catch (err) {
    logger.error('Guardian fetch failed', { categorySlug, error: String(err) });
    return [];
  }
}

// ===== Public API =====

/**
 * Fetch external content for a specific category from all enabled sources.
 */
export async function fetchExternalFeed(
  categorySlug: string,
  categoryName: string
): Promise<ExternalFeedItem[]> {
  const config = getFeedSourceConfig();
  const enabledSources = config.filter(c => c.enabled).map(c => c.id);

  const fetches: Promise<ExternalFeedItem[]>[] = [];

  if (enabledSources.includes('arxiv')) {
    fetches.push(fetchArxiv(categorySlug, categoryName));
  }
  if (enabledSources.includes('wikipedia')) {
    fetches.push(fetchWikiCurrentEvents(categorySlug, categoryName));
  }
  if (enabledSources.includes('guardian')) {
    fetches.push(fetchGuardian(categorySlug, categoryName));
  }

  const results = await Promise.allSettled(fetches);
  const items: ExternalFeedItem[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Sort by date
  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items;
}

/**
 * Fetch external content for the home page feed (across all categories).
 * Returns a mix of content from all enabled sources.
 */
export async function fetchHomeFeed(): Promise<ExternalFeedItem[]> {
  const config = getFeedSourceConfig();
  const enabledSources = config.filter(c => c.enabled).map(c => c.id);

  const fetches: Promise<ExternalFeedItem[]>[] = [];

  // Fetch from a few popular categories for the home feed
  const homeSlugs = [
    { slug: 'computing', name: 'Computing' },
    { slug: 'physics', name: 'Physics' },
    { slug: 'biology', name: 'Biology' },
    { slug: 'economics', name: 'Economics' },
  ];

  for (const { slug, name } of homeSlugs) {
    if (enabledSources.includes('arxiv')) {
      fetches.push(fetchArxiv(slug, name));
    }
    if (enabledSources.includes('guardian')) {
      fetches.push(fetchGuardian(slug, name));
    }
  }

  // Wikipedia current events (global)
  if (enabledSources.includes('wikipedia')) {
    fetches.push(fetchWikiCurrentEvents('all', 'Current Events'));
  }

  const results = await Promise.allSettled(fetches);
  const items: ExternalFeedItem[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items.slice(0, 15); // Limit home feed
}

/**
 * Get available source IDs for a given category
 */
export function getAvailableSources(categorySlug: string): string[] {
  const available: string[] = [];
  if (ARXIV_CATEGORY_MAP[categorySlug]) available.push('arxiv');
  if (GUARDIAN_SECTION_MAP[categorySlug]) available.push('guardian');
  available.push('wikipedia'); // Always available
  return available;
}
