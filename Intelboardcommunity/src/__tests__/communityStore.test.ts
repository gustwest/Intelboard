/**
 * @jest-environment jsdom
 */

import {
  addNote,
  getNotes,
  getNotesScored,
  voteNote,
  addBookmark,
  getBookmarks,
  getBookmarksByCategory,
  removeBookmark,
  setExpertProfile,
  getExperts,
  getUserExpertProfile,
  removeExpertProfile,
  getAIChat,
  saveAIChat,
  clearAIChat,
} from '@/lib/communityStore';

describe('communityStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('knowledge notes', () => {
    it('adds and retrieves notes', () => {
      addNote('cat-1', { categoryId: 'cat-1', authorUid: 'u1', authorName: 'Alice', body: 'Test note', tag: 'tip' });
      const notes = getNotes('cat-1');
      expect(notes.length).toBe(1);
      expect(notes[0].body).toBe('Test note');
      expect(notes[0].tag).toBe('tip');
    });

    it('sorts notes by score', () => {
      addNote('cat-1', { categoryId: 'cat-1', authorUid: 'u1', authorName: 'Alice', body: 'Note A', tag: 'tip' });
      addNote('cat-1', { categoryId: 'cat-1', authorUid: 'u2', authorName: 'Bob', body: 'Note B', tag: 'best-practice' });

      const notes = getNotes('cat-1');
      voteNote('cat-1', notes[1].id, 'u1', 'up'); // Vote for Note A (second = older)
      voteNote('cat-1', notes[1].id, 'u2', 'up');

      const scored = getNotesScored('cat-1');
      expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
    });

    it('handles upvote and downvote', () => {
      addNote('cat-1', { categoryId: 'cat-1', authorUid: 'u1', authorName: 'Alice', body: 'Test', tag: 'warning' });
      const noteId = getNotes('cat-1')[0].id;

      voteNote('cat-1', noteId, 'u1', 'up');
      voteNote('cat-1', noteId, 'u2', 'down');

      const scored = getNotesScored('cat-1');
      expect(scored[0].score).toBe(0); // 1 up - 1 down = 0
    });
  });

  describe('bookmarks', () => {
    it('adds and retrieves bookmarks', () => {
      addBookmark('u1', { categoryId: 'cat-1', categoryName: 'Test', snippet: 'content', annotation: 'my note', color: 'important', source: 'wiki' });
      const bms = getBookmarks('u1');
      expect(bms.length).toBe(1);
      expect(bms[0].snippet).toBe('content');
    });

    it('filters bookmarks by category', () => {
      addBookmark('u1', { categoryId: 'cat-1', categoryName: 'A', snippet: 'a', annotation: '', color: 'tip' as 'idea', source: 'wiki' });
      addBookmark('u1', { categoryId: 'cat-2', categoryName: 'B', snippet: 'b', annotation: '', color: 'idea', source: 'wiki' });

      expect(getBookmarksByCategory('u1', 'cat-1').length).toBe(1);
      expect(getBookmarksByCategory('u1', 'cat-2').length).toBe(1);
    });

    it('removes bookmarks', () => {
      addBookmark('u1', { categoryId: 'cat-1', categoryName: 'A', snippet: 'a', annotation: '', color: 'reference', source: 'wiki' });
      const id = getBookmarks('u1')[0].id;
      removeBookmark('u1', id);
      expect(getBookmarks('u1').length).toBe(0);
    });
  });

  describe('expert profiles', () => {
    it('adds and retrieves expert profiles', () => {
      setExpertProfile('cat-1', { uid: 'u1', displayName: 'Alice', categoryId: 'cat-1', role: 'expert', bio: 'Pro', joinedAt: new Date().toISOString(), mentorshipStatus: 'available' });
      const experts = getExperts('cat-1');
      expect(experts.length).toBe(1);
      expect(experts[0].role).toBe('expert');
    });

    it('gets user profile', () => {
      setExpertProfile('cat-1', { uid: 'u1', displayName: 'Alice', categoryId: 'cat-1', role: 'expert', bio: 'Pro', joinedAt: new Date().toISOString(), mentorshipStatus: 'available' });
      const profile = getUserExpertProfile('cat-1', 'u1');
      expect(profile?.displayName).toBe('Alice');
      expect(getUserExpertProfile('cat-1', 'u999')).toBeNull();
    });

    it('removes expert profile', () => {
      setExpertProfile('cat-1', { uid: 'u1', displayName: 'Alice', categoryId: 'cat-1', role: 'learner', bio: '', joinedAt: new Date().toISOString(), mentorshipStatus: 'seeking' });
      removeExpertProfile('cat-1', 'u1');
      expect(getExperts('cat-1').length).toBe(0);
    });
  });

  describe('AI chat', () => {
    it('saves and retrieves chat history', () => {
      const msgs = [
        { id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant' as const, content: 'hi', timestamp: new Date().toISOString() },
      ];
      saveAIChat('cat-1', 'u1', msgs);
      const loaded = getAIChat('cat-1', 'u1');
      expect(loaded.length).toBe(2);
      expect(loaded[0].content).toBe('hello');
    });

    it('clears chat', () => {
      saveAIChat('cat-1', 'u1', [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: new Date().toISOString() }]);
      clearAIChat('cat-1', 'u1');
      expect(getAIChat('cat-1', 'u1').length).toBe(0);
    });

    it('isolates chat by user and category', () => {
      saveAIChat('cat-1', 'u1', [{ id: 'msg-1', role: 'user', content: 'a', timestamp: new Date().toISOString() }]);
      saveAIChat('cat-1', 'u2', [{ id: 'msg-2', role: 'user', content: 'b', timestamp: new Date().toISOString() }]);
      expect(getAIChat('cat-1', 'u1')[0].content).toBe('a');
      expect(getAIChat('cat-1', 'u2')[0].content).toBe('b');
      expect(getAIChat('cat-2', 'u1').length).toBe(0);
    });
  });
});
