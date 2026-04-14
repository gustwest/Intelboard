import {
  hasStoredContent,
  getStoredWikiContent,
  storeWikiContent,
  getStoredRevisionId,
  removeStoredContent,
  getAllStoredSlugs,
  StoredWikiContent,
} from '@/lib/wikiStorage';

// localStorage is provided by jest-environment-jsdom

const mockContent: StoredWikiContent = {
  title: 'Test Article',
  description: 'A test article',
  extract: 'This is a test extract.',
  extractHtml: '<p>This is a test extract.</p>',
  thumbnail: 'https://example.com/thumb.jpg',
  wikiUrl: 'https://en.wikipedia.org/wiki/Test',
  revisionId: 12345,
  fetchedAt: '2026-03-11T20:00:00Z',
  pageId: 67890,
};

describe('wikiStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storeWikiContent / getStoredWikiContent', () => {
    it('stores and retrieves content', () => {
      storeWikiContent('test-slug', mockContent);
      const retrieved = getStoredWikiContent('test-slug');
      expect(retrieved).toEqual(mockContent);
    });

    it('returns null for non-existent slug', () => {
      expect(getStoredWikiContent('nonexistent')).toBeNull();
    });
  });

  describe('hasStoredContent', () => {
    it('returns false when no content exists', () => {
      expect(hasStoredContent('test-slug')).toBe(false);
    });

    it('returns true after storing content', () => {
      storeWikiContent('test-slug', mockContent);
      expect(hasStoredContent('test-slug')).toBe(true);
    });
  });

  describe('getStoredRevisionId', () => {
    it('returns null when no content exists', () => {
      expect(getStoredRevisionId('test-slug')).toBeNull();
    });

    it('returns revision ID from stored content', () => {
      storeWikiContent('test-slug', mockContent);
      expect(getStoredRevisionId('test-slug')).toBe(12345);
    });
  });

  describe('removeStoredContent', () => {
    it('removes stored content', () => {
      storeWikiContent('test-slug', mockContent);
      expect(hasStoredContent('test-slug')).toBe(true);
      removeStoredContent('test-slug');
      expect(hasStoredContent('test-slug')).toBe(false);
    });

    it('does not throw when removing non-existent content', () => {
      expect(() => removeStoredContent('nonexistent')).not.toThrow();
    });
  });

  describe('getAllStoredSlugs', () => {
    it('returns empty array when nothing is stored', () => {
      expect(getAllStoredSlugs()).toEqual([]);
    });

    it('returns all stored slugs', () => {
      storeWikiContent('slug-1', mockContent);
      storeWikiContent('slug-2', { ...mockContent, title: 'Second' });
      storeWikiContent('slug-3', { ...mockContent, title: 'Third' });
      const slugs = getAllStoredSlugs();
      expect(slugs.sort()).toEqual(['slug-1', 'slug-2', 'slug-3']);
    });

    it('does not include non-wiki localStorage keys', () => {
      localStorage.setItem('other_key', 'value');
      storeWikiContent('test-slug', mockContent);
      const slugs = getAllStoredSlugs();
      expect(slugs).toEqual(['test-slug']);
    });
  });
});
