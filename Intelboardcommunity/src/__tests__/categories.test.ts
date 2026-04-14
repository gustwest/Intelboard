import {
  getAllCategories,
  findCategoryBySlug,
  findCategoryById,
  getBreadcrumbs,
  getCategoryPath,
  countAllChildren,
  categories,
} from '@/data/categories';

describe('categories data', () => {
  describe('getAllCategories', () => {
    it('returns a flat list of all categories', () => {
      const all = getAllCategories();
      expect(all.length).toBeGreaterThan(50); // We have many categories now
    });

    it('includes top-level and nested categories', () => {
      const all = getAllCategories();
      const slugs = all.map(c => c.slug);
      expect(slugs).toContain('computing');
      expect(slugs).toContain('artificial-intelligence');
      expect(slugs).toContain('machine-learning'); // level 3
      expect(slugs).toContain('python'); // level 3 under programming
    });
  });

  describe('findCategoryBySlug', () => {
    it('finds a top-level category by slug', () => {
      const result = findCategoryBySlug('technology-and-applied-sciences');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Technology and Applied Sciences');
    });

    it('finds a level-1 category', () => {
      const result = findCategoryBySlug('computing');
      expect(result).not.toBeNull();
      expect(result?.level).toBe(1);
    });

    it('finds a level-3 category', () => {
      const result = findCategoryBySlug('machine-learning');
      expect(result).not.toBeNull();
      expect(result?.level).toBe(3);
      expect(result?.parentId).toBe('artificial-intelligence');
    });

    it('returns null for non-existent slug', () => {
      expect(findCategoryBySlug('nonexistent')).toBeNull();
    });
  });

  describe('findCategoryById', () => {
    it('finds a category by ID', () => {
      const result = findCategoryById('computing');
      expect(result).not.toBeNull();
      expect(result?.slug).toBe('computing');
    });

    it('returns null for non-existent ID', () => {
      expect(findCategoryById('nonexistent-id')).toBeNull();
    });
  });

  describe('getBreadcrumbs', () => {
    it('returns only the category itself for top-level', () => {
      const cat = findCategoryBySlug('technology-and-applied-sciences');
      expect(cat).not.toBeNull();
      const crumbs = getBreadcrumbs(cat!);
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0].slug).toBe('technology-and-applied-sciences');
    });

    it('returns full hierarchy for a nested category', () => {
      const cat = findCategoryBySlug('machine-learning');
      expect(cat).not.toBeNull();
      const crumbs = getBreadcrumbs(cat!);
      expect(crumbs.length).toBeGreaterThanOrEqual(3);
      expect(crumbs[0].slug).toBe('technology-and-applied-sciences');
    });
  });

  describe('getCategoryPath', () => {
    it('returns a slug array for navigation', () => {
      const cat = findCategoryBySlug('computing');
      expect(cat).not.toBeNull();
      const path = getCategoryPath(cat!);
      expect(path).toContain('technology-and-applied-sciences');
      expect(path).toContain('computing');
    });
  });

  describe('countAllChildren', () => {
    it('counts all recursive children', () => {
      const tech = findCategoryBySlug('technology-and-applied-sciences');
      expect(tech).not.toBeNull();
      const count = countAllChildren(tech!);
      expect(count).toBeGreaterThan(20); // Many subcategories
    });

    it('returns 0 for a leaf node', () => {
      const python = findCategoryBySlug('python');
      expect(python).not.toBeNull();
      expect(countAllChildren(python!)).toBe(0);
    });
  });

  describe('data integrity', () => {
    it('all categories have required fields', () => {
      const all = getAllCategories();
      for (const cat of all) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.slug).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(cat.description).toBeTruthy();
        expect(cat.wikiTitle).toBeTruthy();
        expect(typeof cat.level).toBe('number');
        expect(Array.isArray(cat.children)).toBe(true);
      }
    });

    it('all children reference their parent correctly', () => {
      const all = getAllCategories();
      for (const cat of all) {
        if (cat.parentId) {
          const parent = findCategoryById(cat.parentId);
          expect(parent).not.toBeNull();
        }
      }
    });

    it('has 13 top-level categories', () => {
      expect(categories).toHaveLength(13);
    });

    it('all slugs are unique', () => {
      const all = getAllCategories();
      const slugs = all.map(c => c.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });
  });
});
