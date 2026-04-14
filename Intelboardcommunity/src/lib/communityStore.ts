/**
 * communityStore.ts — shared localStorage for community data
 *
 * Stores knowledge notes, votes, expert profiles, and bookmarks.
 * Data is shared across users (keyed by category).
 */

// ===== Types =====

export interface KnowledgeNote {
  id: string;
  categoryId: string;
  authorUid: string;
  authorName: string;
  body: string;
  tag: 'best-practice' | 'tip' | 'warning' | 'experience';
  upvotes: string[];      // uids who upvoted
  downvotes: string[];    // uids who downvoted
  createdAt: string;
}

export interface Bookmark {
  id: string;
  uid: string;
  categoryId: string;
  categoryName: string;
  snippet: string;
  annotation: string;
  color: 'important' | 'question' | 'reference' | 'idea';
  source: string;         // e.g. 'wiki', 'forum', 'notes'
  createdAt: string;
}

export interface ExpertProfile {
  uid: string;
  displayName: string;
  categoryId: string;
  role: 'expert' | 'learner';
  bio: string;
  joinedAt: string;
  mentorshipStatus: 'available' | 'seeking' | 'none';
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ===== Keys =====

const NOTES_PREFIX = 'intelboard_notes_';
const BOOKMARKS_PREFIX = 'intelboard_bookmarks_';
const EXPERTS_PREFIX = 'intelboard_experts_';
const AICHAT_PREFIX = 'intelboard_aichat_';

// ===== Knowledge Notes =====

export function getNotes(categoryId: string): KnowledgeNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${NOTES_PREFIX}${categoryId}`);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgeNote[];
  } catch { return []; }
}

function saveNotes(categoryId: string, notes: KnowledgeNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${NOTES_PREFIX}${categoryId}`, JSON.stringify(notes));
  } catch { /* ignore */ }
}

export function addNote(categoryId: string, note: Omit<KnowledgeNote, 'id' | 'createdAt' | 'upvotes' | 'downvotes'>): KnowledgeNote {
  const notes = getNotes(categoryId);
  const newNote: KnowledgeNote = {
    ...note,
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    upvotes: [],
    downvotes: [],
    createdAt: new Date().toISOString(),
  };
  notes.unshift(newNote);
  saveNotes(categoryId, notes);
  return newNote;
}

export function voteNote(categoryId: string, noteId: string, uid: string, type: 'up' | 'down'): void {
  const notes = getNotes(categoryId);
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  // Remove from both lists first
  note.upvotes = note.upvotes.filter(u => u !== uid);
  note.downvotes = note.downvotes.filter(u => u !== uid);

  // Add to the appropriate list
  if (type === 'up') note.upvotes.push(uid);
  else note.downvotes.push(uid);

  saveNotes(categoryId, notes);
}

export function getNotesScored(categoryId: string): (KnowledgeNote & { score: number })[] {
  return getNotes(categoryId)
    .map(n => ({ ...n, score: n.upvotes.length - n.downvotes.length }))
    .sort((a, b) => b.score - a.score);
}

// ===== Bookmarks =====

export function getBookmarks(uid: string): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${BOOKMARKS_PREFIX}${uid}`);
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch { return []; }
}

function saveBookmarks(uid: string, bookmarks: Bookmark[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${BOOKMARKS_PREFIX}${uid}`, JSON.stringify(bookmarks));
  } catch { /* ignore */ }
}

export function addBookmark(uid: string, bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'uid'>): Bookmark {
  const bookmarks = getBookmarks(uid);
  const newBookmark: Bookmark = {
    ...bookmark,
    uid,
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  bookmarks.unshift(newBookmark);
  saveBookmarks(uid, bookmarks);
  return newBookmark;
}

export function removeBookmark(uid: string, bookmarkId: string): void {
  const bookmarks = getBookmarks(uid).filter(b => b.id !== bookmarkId);
  saveBookmarks(uid, bookmarks);
}

export function getBookmarksByCategory(uid: string, categoryId: string): Bookmark[] {
  return getBookmarks(uid).filter(b => b.categoryId === categoryId);
}

// ===== Expert Profiles =====

export function getExperts(categoryId: string): ExpertProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${EXPERTS_PREFIX}${categoryId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ExpertProfile[];
  } catch { return []; }
}

function saveExperts(categoryId: string, experts: ExpertProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${EXPERTS_PREFIX}${categoryId}`, JSON.stringify(experts));
  } catch { /* ignore */ }
}

export function setExpertProfile(categoryId: string, profile: ExpertProfile): void {
  const experts = getExperts(categoryId);
  const index = experts.findIndex(e => e.uid === profile.uid);
  if (index >= 0) experts[index] = profile;
  else experts.push(profile);
  saveExperts(categoryId, experts);
}

export function removeExpertProfile(categoryId: string, uid: string): void {
  const experts = getExperts(categoryId).filter(e => e.uid !== uid);
  saveExperts(categoryId, experts);
}

export function getUserExpertProfile(categoryId: string, uid: string): ExpertProfile | null {
  return getExperts(categoryId).find(e => e.uid === uid) || null;
}

// ===== AI Chat History =====

export function getAIChat(categoryId: string, uid: string): AIMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${AICHAT_PREFIX}${categoryId}_${uid}`);
    if (!raw) return [];
    return JSON.parse(raw) as AIMessage[];
  } catch { return []; }
}

export function saveAIChat(categoryId: string, uid: string, messages: AIMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${AICHAT_PREFIX}${categoryId}_${uid}`, JSON.stringify(messages));
  } catch { /* ignore */ }
}

export function clearAIChat(categoryId: string, uid: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${AICHAT_PREFIX}${categoryId}_${uid}`);
  } catch { /* ignore */ }
}
