/**
 * userStore.ts — localStorage persistence for per-user data
 *
 * Stores follows, ratings, and notifications keyed by user UID.
 * Each demo user gets their own isolated data store.
 */

// ===== Types =====

export interface UserData {
  follows: string[];                        // category slugs
  ratings: Record<string, UserRating>;      // key = `${type}:${id}`
  notifications: Record<string, number>;    // slug → unread count
}

export interface UserRating {
  targetType: 'thread' | 'event' | 'user';
  targetId: string;
  rating: number; // 1-5
  timestamp: string;
}

export interface AggregatedRating {
  average: number;
  count: number;
  userRating: number | null;
}

// ===== Storage Keys =====

const STORE_PREFIX = 'intelboard_user_';
const RATINGS_PREFIX = 'intelboard_ratings_';

function getUserKey(uid: string): string {
  return `${STORE_PREFIX}${uid}`;
}

function getRatingsKey(targetType: string, targetId: string): string {
  return `${RATINGS_PREFIX}${targetType}:${targetId}`;
}

// ===== User Data =====

function getDefaultUserData(): UserData {
  return { follows: [], ratings: {}, notifications: {} };
}

export function getUserData(uid: string): UserData {
  if (typeof window === 'undefined') return getDefaultUserData();
  try {
    const raw = localStorage.getItem(getUserKey(uid));
    if (!raw) return getDefaultUserData();
    return JSON.parse(raw) as UserData;
  } catch {
    return getDefaultUserData();
  }
}

function saveUserData(uid: string, data: UserData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getUserKey(uid), JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

// ===== Follows =====

export function isFollowing(uid: string, slug: string): boolean {
  return getUserData(uid).follows.includes(slug);
}

export function toggleFollow(uid: string, slug: string): boolean {
  const data = getUserData(uid);
  const index = data.follows.indexOf(slug);
  if (index >= 0) {
    data.follows.splice(index, 1);
    delete data.notifications[slug];
    saveUserData(uid, data);
    return false; // unfollowed
  } else {
    data.follows.push(slug);
    saveUserData(uid, data);
    return true; // followed
  }
}

export function getFollowedSlugs(uid: string): string[] {
  return getUserData(uid).follows;
}

// ===== Notifications =====

export function getNotificationCount(uid: string, slug: string): number {
  return getUserData(uid).notifications[slug] || 0;
}

export function getTotalNotifications(uid: string): number {
  const data = getUserData(uid);
  return Object.values(data.notifications).reduce((sum, n) => sum + n, 0);
}

export function addNotification(uid: string, slug: string, count: number = 1): void {
  const data = getUserData(uid);
  data.notifications[slug] = (data.notifications[slug] || 0) + count;
  saveUserData(uid, data);
}

export function clearNotifications(uid: string, slug: string): void {
  const data = getUserData(uid);
  delete data.notifications[slug];
  saveUserData(uid, data);
}

// ===== Ratings =====

/**
 * All ratings for a target are stored in a shared key (not per-user)
 * so we can compute averages across all users.
 * Format: { uid: rating } for each target.
 */

interface RatingStore {
  [uid: string]: number; // uid → 1-5
}

function getRatingStore(targetType: string, targetId: string): RatingStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getRatingsKey(targetType, targetId));
    if (!raw) return {};
    return JSON.parse(raw) as RatingStore;
  } catch {
    return {};
  }
}

function saveRatingStore(targetType: string, targetId: string, store: RatingStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getRatingsKey(targetType, targetId), JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function setRating(uid: string, targetType: string, targetId: string, rating: number): void {
  const store = getRatingStore(targetType, targetId);
  store[uid] = Math.max(1, Math.min(5, Math.round(rating)));
  saveRatingStore(targetType, targetId, store);
}

export function removeRating(uid: string, targetType: string, targetId: string): void {
  const store = getRatingStore(targetType, targetId);
  delete store[uid];
  saveRatingStore(targetType, targetId, store);
}

export function getAggregatedRating(uid: string | null, targetType: string, targetId: string): AggregatedRating {
  const store = getRatingStore(targetType, targetId);
  const values = Object.values(store);
  const count = values.length;
  const average = count > 0 ? values.reduce((s, v) => s + v, 0) / count : 0;
  const userRating = uid && store[uid] != null ? store[uid] : null;
  return { average, count, userRating };
}
