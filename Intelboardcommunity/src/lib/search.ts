import Fuse from 'fuse.js';
import { getAllCategories, Category } from '@/data/categories';

export interface SearchResult {
  type: 'category' | 'forum' | 'event' | 'quiz';
  id: string;
  title: string;
  description: string;
  slug?: string;
  icon?: string;
  categoryName?: string;
  score?: number;
}

const categoryFuse = new Fuse(getAllCategories(), {
  keys: ['name', 'description', 'slug'],
  threshold: 0.4,
  includeScore: true,
});

export function searchCategories(query: string): SearchResult[] {
  if (!query.trim()) return [];
  
  const results = categoryFuse.search(query);
  return results.map(r => ({
    type: 'category' as const,
    id: r.item.id,
    title: r.item.name,
    description: r.item.description,
    slug: r.item.slug,
    icon: r.item.icon,
    score: r.score,
  }));
}

export function searchAll(query: string): SearchResult[] {
  // For now, search categories. Forum/event search would query Firestore
  return searchCategories(query);
}
