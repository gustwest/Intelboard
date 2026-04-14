/**
 * @jest-environment jsdom
 */

import {
  getUserData,
  isFollowing,
  toggleFollow,
  getFollowedSlugs,
  getNotificationCount,
  getTotalNotifications,
  addNotification,
  clearNotifications,
  setRating,
  getAggregatedRating,
  removeRating,
} from '@/lib/userStore';

describe('userStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('follows', () => {
    it('returns empty follows for new user', () => {
      expect(getFollowedSlugs('user1')).toEqual([]);
      expect(isFollowing('user1', 'computing')).toBe(false);
    });

    it('toggleFollow adds and removes a follow', () => {
      const result1 = toggleFollow('user1', 'computing');
      expect(result1).toBe(true);
      expect(isFollowing('user1', 'computing')).toBe(true);
      expect(getFollowedSlugs('user1')).toEqual(['computing']);

      const result2 = toggleFollow('user1', 'computing');
      expect(result2).toBe(false);
      expect(isFollowing('user1', 'computing')).toBe(false);
    });

    it('isolates follows by user', () => {
      toggleFollow('user1', 'computing');
      toggleFollow('user2', 'mathematics');

      expect(getFollowedSlugs('user1')).toEqual(['computing']);
      expect(getFollowedSlugs('user2')).toEqual(['mathematics']);
    });

    it('supports multiple followed categories', () => {
      toggleFollow('user1', 'computing');
      toggleFollow('user1', 'mathematics');
      toggleFollow('user1', 'physics');

      expect(getFollowedSlugs('user1')).toEqual(['computing', 'mathematics', 'physics']);
    });
  });

  describe('notifications', () => {
    it('returns 0 for no notifications', () => {
      expect(getNotificationCount('user1', 'computing')).toBe(0);
      expect(getTotalNotifications('user1')).toBe(0);
    });

    it('adds and retrieves notifications', () => {
      addNotification('user1', 'computing', 3);
      expect(getNotificationCount('user1', 'computing')).toBe(3);

      addNotification('user1', 'computing', 2);
      expect(getNotificationCount('user1', 'computing')).toBe(5);
    });

    it('calculates total notifications across categories', () => {
      addNotification('user1', 'computing', 3);
      addNotification('user1', 'math', 2);
      expect(getTotalNotifications('user1')).toBe(5);
    });

    it('clears notifications for a category', () => {
      addNotification('user1', 'computing', 5);
      clearNotifications('user1', 'computing');
      expect(getNotificationCount('user1', 'computing')).toBe(0);
    });

    it('unfollowing clears notifications', () => {
      toggleFollow('user1', 'computing');
      addNotification('user1', 'computing', 3);
      toggleFollow('user1', 'computing'); // unfollow
      expect(getNotificationCount('user1', 'computing')).toBe(0);
    });
  });

  describe('ratings', () => {
    it('returns empty aggregated rating for no ratings', () => {
      const result = getAggregatedRating('user1', 'thread', 'thread-1');
      expect(result.average).toBe(0);
      expect(result.count).toBe(0);
      expect(result.userRating).toBeNull();
    });

    it('sets and retrieves a rating', () => {
      setRating('user1', 'thread', 'thread-1', 4);
      const result = getAggregatedRating('user1', 'thread', 'thread-1');
      expect(result.average).toBe(4);
      expect(result.count).toBe(1);
      expect(result.userRating).toBe(4);
    });

    it('computes average across multiple users', () => {
      setRating('user1', 'thread', 'thread-1', 5);
      setRating('user2', 'thread', 'thread-1', 3);
      setRating('user3', 'thread', 'thread-1', 4);

      const result = getAggregatedRating('user1', 'thread', 'thread-1');
      expect(result.average).toBe(4);
      expect(result.count).toBe(3);
      expect(result.userRating).toBe(5);
    });

    it('distinguishes user rating from aggregate', () => {
      setRating('user1', 'thread', 'thread-1', 5);
      setRating('user2', 'thread', 'thread-1', 1);

      const forUser2 = getAggregatedRating('user2', 'thread', 'thread-1');
      expect(forUser2.userRating).toBe(1);
      expect(forUser2.average).toBe(3);
    });

    it('clamps rating between 1 and 5', () => {
      setRating('user1', 'thread', 'thread-1', 10);
      expect(getAggregatedRating('user1', 'thread', 'thread-1').userRating).toBe(5);

      setRating('user1', 'thread', 'thread-1', -1);
      expect(getAggregatedRating('user1', 'thread', 'thread-1').userRating).toBe(1);
    });

    it('removes a rating', () => {
      setRating('user1', 'thread', 'thread-1', 4);
      removeRating('user1', 'thread', 'thread-1');
      const result = getAggregatedRating('user1', 'thread', 'thread-1');
      expect(result.count).toBe(0);
      expect(result.userRating).toBeNull();
    });

    it('returns null userRating when uid is null', () => {
      setRating('user1', 'event', 'event-1', 3);
      const result = getAggregatedRating(null, 'event', 'event-1');
      expect(result.average).toBe(3);
      expect(result.count).toBe(1);
      expect(result.userRating).toBeNull();
    });
  });

  describe('getUserData', () => {
    it('returns default data for new user', () => {
      const data = getUserData('new-user');
      expect(data.follows).toEqual([]);
      expect(data.ratings).toEqual({});
      expect(data.notifications).toEqual({});
    });
  });
});
