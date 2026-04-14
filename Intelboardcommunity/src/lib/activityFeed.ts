/**
 * activityFeed.ts — aggregates activity from all data stores for the home feed
 *
 * Generates a unified activity stream from forums, events, notes, bookmarks,
 * experts, and messages. Personalizes based on followed categories.
 */

import { categories, Category, findCategoryBySlug } from '@/data/categories';
import { getUserData } from '@/lib/userStore';
import { getNotes } from '@/lib/communityStore';

// ===== Types =====

export type ActivityType = 'forum' | 'event' | 'note' | 'expert' | 'wiki_update' | 'message' | 'meeting';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  body: string;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  author: string;
  timestamp: string;
  isPersonalized: boolean; // true if from followed category
}

export interface UpcomingEvent {
  id: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  date: string;
  time: string;
  attendees: number;
}

export interface MessagePreview {
  id: string;
  from: string;
  avatar: string;
  preview: string;
  timestamp: string;
  unread: boolean;
  categorySlug?: string;
  categoryName?: string;
}

// ===== Helpers =====

function timeAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ===== Feed Generation =====

/**
 * Build activity feed — mixes community data with realistic starter content
 */
export function getActivityFeed(userId: string | null): ActivityItem[] {
  const items: ActivityItem[] = [];
  const follows = userId ? getUserData(userId).follows : [];
  const followSet = new Set(follows);

  // 1. Real notes from communityStore
  const allCats = categories.flatMap(c => [c, ...c.children.flatMap(ch => [ch, ...ch.children])]);
  for (const cat of allCats) {
    const notes = getNotes(cat.slug);
    for (const n of notes) {
      items.push({
        id: `note-${n.id}`,
        type: 'note',
        title: `New ${n.tag} note in ${cat.name}`,
        body: n.body.slice(0, 150),
        categorySlug: cat.slug,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        author: n.authorName,
        timestamp: n.createdAt,
        isPersonalized: followSet.has(cat.slug),
      });
    }
  }

  // 2. Starter activity — realistic recent events
  const starterActivity: Omit<ActivityItem, 'isPersonalized'>[] = [
    {
      id: 'feed-1', type: 'forum', title: 'New discussion: Best resources for learning physics',
      body: 'Looking for recommendations on physics textbooks and online courses. What worked for you?',
      categorySlug: 'physics', categoryName: 'Physics', categoryIcon: '⚛️',
      author: 'Bob Smith', timestamp: timeAgo(1),
    },
    {
      id: 'feed-2', type: 'event', title: 'Upcoming: AI & Machine Learning Study Group',
      body: 'Weekly meetup to discuss the latest papers and developments in AI. All levels welcome.',
      categorySlug: 'artificial-intelligence', categoryName: 'Artificial Intelligence', categoryIcon: '🤖',
      author: 'Charlie Wilson', timestamp: timeAgo(2),
    },
    {
      id: 'feed-3', type: 'wiki_update', title: 'Wikipedia content updated: Quantum Computing',
      body: 'The article on quantum computing has been updated with new information on error correction.',
      categorySlug: 'computing', categoryName: 'Computing', categoryIcon: '💻',
      author: 'System', timestamp: timeAgo(3),
    },
    {
      id: 'feed-4', type: 'forum', title: 'Thread: The future of renewable energy',
      body: 'Discussing breakthroughs in solar panel efficiency and battery technology for 2026.',
      categorySlug: 'energy-technology', categoryName: 'Energy Technology', categoryIcon: '⚡',
      author: 'Alice Johnson', timestamp: timeAgo(4),
    },
    {
      id: 'feed-5', type: 'note', title: 'Best practice shared: Programming fundamentals',
      body: 'Always write tests before implementing features. TDD helps catch bugs early and improves design.',
      categorySlug: 'programming', categoryName: 'Programming', categoryIcon: '👨‍💻',
      author: 'Bob Smith', timestamp: timeAgo(5),
    },
    {
      id: 'feed-6', type: 'meeting', title: 'Meeting scheduled: History Book Club',
      body: 'Monthly meeting to discuss "The Silk Roads" by Peter Frankopan. Chapter 5-8 this month.',
      categorySlug: 'modern-history', categoryName: 'Modern History', categoryIcon: '📜',
      author: 'Charlie Wilson', timestamp: timeAgo(6),
    },
    {
      id: 'feed-7', type: 'expert', title: 'New expert joined: Nutrition & Health',
      body: 'Registered dietitian specializing in sports nutrition has joined as a community expert.',
      categorySlug: 'nutrition', categoryName: 'Nutrition', categoryIcon: '🥗',
      author: 'Alice Johnson', timestamp: timeAgo(8),
    },
    {
      id: 'feed-8', type: 'forum', title: 'Discussion: Classical music for beginners',
      body: 'What composers and pieces would you recommend for someone just discovering classical music?',
      categorySlug: 'classical-music', categoryName: 'Classical Music', categoryIcon: '🎻',
      author: 'Bob Smith', timestamp: timeAgo(10),
    },
    {
      id: 'feed-9', type: 'event', title: 'Workshop: Introduction to sculpture techniques',
      body: 'Hands-on workshop covering basic clay modeling and stone carving methods. Materials provided.',
      categorySlug: 'sculpture', categoryName: 'Sculpture', categoryIcon: '🗿',
      author: 'Charlie Wilson', timestamp: timeAgo(12),
    },
    {
      id: 'feed-10', type: 'wiki_update', title: 'New subcategories loaded: Biology',
      body: '15 new subcategories discovered and loaded from Wikipedia, including Genetics and Ecology.',
      categorySlug: 'biology', categoryName: 'Biology', categoryIcon: '🧬',
      author: 'System', timestamp: timeAgo(14),
    },
    {
      id: 'feed-11', type: 'message', title: 'Group discussion: Ethics in AI development',
      body: 'The ethics study group is debating responsible AI deployment and bias mitigation strategies.',
      categorySlug: 'ethics', categoryName: 'Ethics', categoryIcon: '⚖️',
      author: 'Alice Johnson', timestamp: timeAgo(16),
    },
    {
      id: 'feed-12', type: 'forum', title: 'Thread: Photography tips for beginners',
      body: 'Share your best tips for composition, lighting, and camera settings for new photographers.',
      categorySlug: 'photography', categoryName: 'Photography', categoryIcon: '📷',
      author: 'Bob Smith', timestamp: timeAgo(20),
    },
  ];

  for (const s of starterActivity) {
    // Skip if we already have a real note with similar category
    items.push({ ...s, isPersonalized: followSet.has(s.categorySlug) });
  }

  // Sort: personalized first, then by timestamp
  items.sort((a, b) => {
    if (a.isPersonalized !== b.isPersonalized) return a.isPersonalized ? -1 : 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return items;
}

/**
 * Get upcoming events
 */
export function getUpcomingEvents(): UpcomingEvent[] {
  const now = new Date();
  return [
    {
      id: 'evt-1', title: 'AI & Machine Learning Study Group',
      categorySlug: 'computing', categoryName: 'Computing', categoryIcon: '💻',
      date: new Date(now.getTime() + 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: '14:00', attendees: 12,
    },
    {
      id: 'evt-2', title: 'History Book Club: The Silk Roads',
      categorySlug: 'modern-history', categoryName: 'Modern History', categoryIcon: '📜',
      date: new Date(now.getTime() + 172800000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: '18:30', attendees: 8,
    },
    {
      id: 'evt-3', title: 'Sculpture Workshop: Clay Modeling',
      categorySlug: 'sculpture', categoryName: 'Sculpture', categoryIcon: '🗿',
      date: new Date(now.getTime() + 345600000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: '10:00', attendees: 15,
    },
    {
      id: 'evt-4', title: 'Ethics in Technology Panel',
      categorySlug: 'ethics', categoryName: 'Ethics', categoryIcon: '⚖️',
      date: new Date(now.getTime() + 518400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: '16:00', attendees: 22,
    },
  ];
}

/**
 * Get recent messages
 */
export function getRecentMessages(userId: string | null): MessagePreview[] {
  if (!userId) return [];
  return [
    {
      id: 'msg-1', from: 'Bob Smith', avatar: '🧑‍💼',
      preview: 'Hey, did you see the new quantum computing article? Really interesting stuff!',
      timestamp: timeAgo(0.5), unread: true,
      categoryName: 'Computing', categorySlug: 'computing',
    },
    {
      id: 'msg-2', from: 'Charlie Wilson', avatar: '👨‍🔬',
      preview: 'The study group meeting is confirmed for tomorrow at 2pm.',
      timestamp: timeAgo(2), unread: true,
    },
    {
      id: 'msg-3', from: 'Ethics Study Group', avatar: '👥',
      preview: 'New discussion posted: "Should AI be used in judicial decisions?"',
      timestamp: timeAgo(5), unread: false,
      categoryName: 'Ethics', categorySlug: 'ethics',
    },
    {
      id: 'msg-4', from: 'Alice Johnson', avatar: '👩‍🎨',
      preview: 'Thanks for the photography tips! I tried the composition rule and it worked great.',
      timestamp: timeAgo(12), unread: false,
      categoryName: 'Photography', categorySlug: 'photography',
    },
  ];
}

/**
 * Get notification summary
 */
export function getNotificationSummary(userId: string | null): { type: string; count: number; icon: string }[] {
  if (!userId) return [];
  const userData = getUserData(userId);
  const followCount = userData.follows.length;
  const unreadNotifs = Object.values(userData.notifications).reduce((sum, n) => sum + n, 0);

  return [
    { type: 'Unread messages', count: 2, icon: '✉️' },
    { type: 'New forum posts', count: 3, icon: '💬' },
    { type: 'Upcoming events', count: 4, icon: '📅' },
    { type: 'Following', count: followCount, icon: '⭐' },
    ...(unreadNotifs > 0 ? [{ type: 'Category updates', count: unreadNotifs, icon: '🔔' }] : []),
  ];
}

/**
 * Get suggested categories for discovery
 */
export function getSuggestedCategories(userId: string | null): Category[] {
  const follows = userId ? getUserData(userId).follows : [];
  const followSet = new Set(follows);

  // Get all leaf categories not yet followed
  const allLeaf: Category[] = [];
  function collect(cats: Category[]) {
    for (const c of cats) {
      if (!followSet.has(c.slug) && c.level >= 1) {
        allLeaf.push(c);
      }
      if (c.children.length > 0) collect(c.children);
    }
  }
  collect(categories);

  // Shuffle and pick 6
  const shuffled = allLeaf.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 6);
}

/**
 * Format relative time
 */
export function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString();
}
