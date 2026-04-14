import { searchCategories, searchAll } from '@/lib/search';

describe('search', () => {
  describe('searchCategories', () => {
    it('finds categories by name', () => {
      const results = searchCategories('Computing');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Computing');
      expect(results[0].type).toBe('category');
    });

    it('finds categories by partial match', () => {
      const results = searchCategories('artifi');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.title === 'Artificial Intelligence')).toBe(true);
    });

    it('returns empty array for empty query', () => {
      expect(searchCategories('')).toEqual([]);
      expect(searchCategories('   ')).toEqual([]);
    });

    it('returns empty array for no matches', () => {
      const results = searchCategories('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('returns results with correct shape', () => {
      const results = searchCategories('Python');
      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('icon');
    });
  });

  describe('searchAll', () => {
    it('returns category results', () => {
      const results = searchAll('Physics');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('category');
    });
  });
});
