/**
 * dynamicCategories.ts — on-demand subcategory loading from Wikipedia
 *
 * Fetches subcategories via Wikipedia API, caches in localStorage,
 * and merges with the static category tree at runtime.
 */

import { Category, findCategoryBySlug as staticFindBySlug, getAllCategories } from '@/data/categories';
import logger from '@/lib/logger';

// ===== Types =====

export interface DynamicCategoryData {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  parentSlug: string;
  level: number;
  wikiTitle: string;
  isDynamic: true;
  fetchedAt: string;
}

export interface WikiSearchResult {
  title: string;
  description: string;
}

// ===== Storage =====

const DYNAMIC_PREFIX = 'intelboard_dyncats_';
const SEARCH_ADDITION_PREFIX = 'intelboard_searchcats_';

function getDynKey(parentSlug: string): string {
  return `${DYNAMIC_PREFIX}${parentSlug}`;
}

/**
 * Get dynamic children for a parent category from localStorage
 */
export function getDynamicChildren(parentSlug: string): DynamicCategoryData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getDynKey(parentSlug));
    if (!raw) return [];
    return JSON.parse(raw) as DynamicCategoryData[];
  } catch { return []; }
}

/**
 * Save dynamic children for a parent category
 */
function saveDynamicChildren(parentSlug: string, children: DynamicCategoryData[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getDynKey(parentSlug), JSON.stringify(children));
  } catch { /* storage full */ }
}

/**
 * Get all manually-added categories (from search) across all parents
 */
export function getSearchAddedCategories(): DynamicCategoryData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEARCH_ADDITION_PREFIX);
    if (!raw) return [];
    return JSON.parse(raw) as DynamicCategoryData[];
  } catch { return []; }
}

function saveSearchAddedCategories(cats: DynamicCategoryData[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SEARCH_ADDITION_PREFIX, JSON.stringify(cats));
  } catch { /* ignore */ }
}

// ===== Slug / ID helpers =====

function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function pickIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('computer') || n.includes('software') || n.includes('programming')) return '💻';
  if (n.includes('science')) return '🔬';
  if (n.includes('history')) return '📜';
  if (n.includes('math')) return '📐';
  if (n.includes('art') || n.includes('design')) return '🎨';
  if (n.includes('music')) return '🎵';
  if (n.includes('sport')) return '⚽';
  if (n.includes('health') || n.includes('medic')) return '🏥';
  if (n.includes('tech') || n.includes('engineer')) return '⚙️';
  if (n.includes('education') || n.includes('learn')) return '📚';
  if (n.includes('economy') || n.includes('business') || n.includes('finance')) return '💰';
  if (n.includes('law') || n.includes('politic')) return '⚖️';
  if (n.includes('food') || n.includes('cook') || n.includes('cuisine')) return '🍳';
  if (n.includes('transport') || n.includes('vehicle')) return '🚗';
  if (n.includes('communication') || n.includes('media')) return '📡';
  if (n.includes('energy')) return '⚡';
  if (n.includes('environment') || n.includes('nature') || n.includes('ecology')) return '🌿';
  if (n.includes('language') || n.includes('linguistic')) return '🗣️';
  if (n.includes('religion') || n.includes('spiritual')) return '🕊️';
  if (n.includes('philosophy')) return '🤔';
  if (n.includes('geography') || n.includes('earth')) return '🌍';
  if (n.includes('war') || n.includes('military')) return '⚔️';
  return '📂';
}

// ===== Wikipedia API =====

/**
 * Fetch subcategories from Wikipedia for a given category title.
 * Uses the MediaWiki API `categorymembers` endpoint.
 */
export async function fetchSubcategoriesFromWiki(wikiTitle: string): Promise<WikiSearchResult[]> {
  // Clean wiki title for use as category
  const categoryTitle = wikiTitle.startsWith('Category:') ? wikiTitle : `Category:${wikiTitle}`;

  try {
    const url = `https://en.wikipedia.org/w/api.php?` +
      `action=query&list=categorymembers&cmtitle=${encodeURIComponent(categoryTitle)}` +
      `&cmtype=subcat&cmlimit=50&format=json&origin=*`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia API: ${res.status}`);

    const data = await res.json();
    const members = data?.query?.categorymembers || [];

    return members.map((m: { title: string }) => ({
      title: m.title.replace('Category:', ''),
      description: '',
    }));
  } catch (err) {
    logger.error('Failed to fetch subcategories from Wikipedia', { wikiTitle, error: String(err) });
    return [];
  }
}

/**
 * Fetch summary/description for a Wikipedia article 
 */
async function fetchWikiSummary(title: string): Promise<string> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return '';
    const data = await res.json();
    return data.extract || data.description || '';
  } catch {
    return '';
  }
}

/**
 * Search Wikipedia for topics matching a query.
 * Returns page titles with descriptions.
 */
export async function searchWikipediaTopics(query: string): Promise<WikiSearchResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?` +
      `action=query&list=search&srsearch=${encodeURIComponent(query)}` +
      `&srlimit=8&format=json&origin=*`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia search: ${res.status}`);

    const data = await res.json();
    const results = data?.query?.search || [];

    return results.map((r: { title: string; snippet: string }) => ({
      title: r.title,
      description: r.snippet.replace(/<[^>]*>/g, '').slice(0, 200),
    }));
  } catch (err) {
    logger.error('Wikipedia search failed', { query, error: String(err) });
    return [];
  }
}

// ===== Dynamic category operations =====

/**
 * Fetch and persist subcategories for a parent.
 * Returns the dynamic children as Category-compatible objects.
 */
export async function loadSubcategories(
  parentSlug: string,
  parentId: string,
  parentLevel: number,
  wikiTitle: string,
): Promise<DynamicCategoryData[]> {
  // Check cache first
  const cached = getDynamicChildren(parentSlug);
  if (cached.length > 0) return cached;

  const wikiResults = await fetchSubcategoriesFromWiki(wikiTitle);
  if (wikiResults.length === 0) return [];

  // Fetch descriptions in parallel (limit to first 20 for speed)
  const withDescs = await Promise.all(
    wikiResults.slice(0, 30).map(async (r) => {
      const desc = await fetchWikiSummary(r.title);
      return { ...r, description: desc || `Subcategory of ${wikiTitle.replace(/_/g, ' ')}` };
    })
  );

  const children: DynamicCategoryData[] = withDescs.map(r => ({
    id: `dyn-${toSlug(r.title)}`,
    name: r.title,
    slug: toSlug(r.title),
    icon: pickIcon(r.title),
    description: r.description.slice(0, 200),
    parentSlug,
    level: parentLevel + 1,
    wikiTitle: r.title.replace(/\s/g, '_'),
    isDynamic: true,
    fetchedAt: new Date().toISOString(),
  }));

  saveDynamicChildren(parentSlug, children);
  logger.info('Loaded dynamic subcategories', { parentSlug, count: children.length });
  return children;
}

/**
 * Add a category from search results under a given parent.
 * Returns the created dynamic category.
 */
export async function addCategoryFromSearch(
  parentSlug: string,
  parentId: string,
  parentLevel: number,
  searchResult: WikiSearchResult,
): Promise<DynamicCategoryData> {
  const desc = searchResult.description || await fetchWikiSummary(searchResult.title);

  const newCat: DynamicCategoryData = {
    id: `dyn-${toSlug(searchResult.title)}`,
    name: searchResult.title,
    slug: toSlug(searchResult.title),
    icon: pickIcon(searchResult.title),
    description: (desc || `Topic related to ${parentSlug.replace(/-/g, ' ')}`).slice(0, 200),
    parentSlug,
    level: parentLevel + 1,
    wikiTitle: searchResult.title.replace(/\s/g, '_'),
    isDynamic: true,
    fetchedAt: new Date().toISOString(),
  };

  // Add to dynamic children of parent
  const existing = getDynamicChildren(parentSlug);
  if (!existing.find(c => c.slug === newCat.slug)) {
    existing.push(newCat);
    saveDynamicChildren(parentSlug, existing);
  }

  // Also track in search-added list
  const searchAdded = getSearchAddedCategories();
  if (!searchAdded.find(c => c.slug === newCat.slug)) {
    searchAdded.push(newCat);
    saveSearchAddedCategories(searchAdded);
  }

  logger.info('Added category from search', { name: newCat.name, parentSlug });
  return newCat;
}

// ===== Unified category lookup =====

/**
 * Convert a DynamicCategoryData to a full Category object
 */
export function dynamicToCategory(d: DynamicCategoryData): Category {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    icon: d.icon,
    description: d.description,
    parentId: d.parentSlug,
    level: d.level,
    wikiTitle: d.wikiTitle,
    children: [],
  };
}

/**
 * Find a category by slug — checks static tree first, then dynamic store.
 */
export function findCategoryAnywhere(slug: string): Category | null {
  // Check static tree first
  const staticCat = staticFindBySlug(slug);
  if (staticCat) return staticCat;

  // Check all dynamic children stores
  if (typeof window === 'undefined') return null;

  // Search through all dynamic children stores
  const allStatic = getAllCategories();
  for (const cat of allStatic) {
    const dynChildren = getDynamicChildren(cat.slug);
    const found = dynChildren.find(d => d.slug === slug);
    if (found) return dynamicToCategory(found);
  }

  // Also check children of dynamic categories (nested dynamic)
  // Scan all localStorage keys with our prefix
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(DYNAMIC_PREFIX)) continue;
    try {
      const children = JSON.parse(localStorage.getItem(key) || '[]') as DynamicCategoryData[];
      const found = children.find(d => d.slug === slug);
      if (found) return dynamicToCategory(found);
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Build breadcrumbs for any category (static or dynamic).
 */
export function buildBreadcrumbs(slug: string): Category[] {
  const cat = findCategoryAnywhere(slug);
  if (!cat) return [];

  const crumbs: Category[] = [cat];
  let currentParentId = cat.parentId;

  while (currentParentId) {
    // parentId for dynamic cats is the parent slug
    const parent = findCategoryAnywhere(currentParentId) || staticFindBySlug(currentParentId);
    if (!parent) {
      // Try finding by ID in static tree
      const { findCategoryById } = require('@/data/categories');
      const byId = findCategoryById(currentParentId);
      if (byId) {
        crumbs.unshift(byId);
        currentParentId = byId.parentId;
      } else {
        break;
      }
    } else {
      crumbs.unshift(parent);
      currentParentId = parent.parentId;
    }
  }

  return crumbs;
}

/**
 * Get the URL path for any category (static or dynamic)
 */
export function buildCategoryPath(slug: string): string[] {
  return buildBreadcrumbs(slug).map(c => c.slug);
}

/**
 * Get merged children (static + dynamic) for a category
 */
export function getMergedChildren(category: Category): Category[] {
  const staticChildren = category.children || [];
  const dynamicChildren = getDynamicChildren(category.slug).map(dynamicToCategory);

  // Merge, avoiding duplicates by slug
  const slugSet = new Set(staticChildren.map(c => c.slug));
  const merged = [...staticChildren];
  for (const dc of dynamicChildren) {
    if (!slugSet.has(dc.slug)) {
      merged.push(dc);
    }
  }
  return merged;
}
