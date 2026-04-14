'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { categories, countAllChildren } from '@/data/categories';
import { useAuth } from '@/contexts/AuthContext';
import {
  getActivityFeed,
  getUpcomingEvents,
  getRecentMessages,
  getNotificationSummary,
  getSuggestedCategories,
  formatRelativeTime,
  ActivityItem,
  UpcomingEvent,
  MessagePreview,
} from '@/lib/activityFeed';
import { Category } from '@/data/categories';
import NewsFeed from '@/components/NewsFeed';
import styles from './page.module.css';

const TYPE_ICONS: Record<string, string> = {
  forum: '💬',
  event: '📅',
  note: '📝',
  expert: '👥',
  wiki_update: '🌐',
  message: '✉️',
  meeting: '🤝',
};

const TYPE_LABELS: Record<string, string> = {
  forum: 'Discussion',
  event: 'Event',
  note: 'Knowledge Note',
  expert: 'Expert',
  wiki_update: 'Wiki Update',
  message: 'Message',
  meeting: 'Meeting',
};

export default function HomePage() {
  const { user } = useAuth();
  const [feedItems, setFeedItems] = useState<ActivityItem[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [messages, setMessages] = useState<MessagePreview[]>([]);
  const [notifications, setNotifications] = useState<{ type: string; count: number; icon: string }[]>([]);
  const [suggestions, setSuggestions] = useState<Category[]>([]);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    setFeedItems(getActivityFeed(user?.uid || null));
    setEvents(getUpcomingEvents());
    setMessages(getRecentMessages(user?.uid || null));
    setNotifications(getNotificationSummary(user?.uid || null));
    setSuggestions(getSuggestedCategories(user?.uid || null));
  }, [user?.uid]);

  const visibleFeed = feedExpanded ? feedItems : feedItems.slice(0, 3);
  const displayCategories = showAllCategories ? categories : categories.slice(0, 6);

  return (
    <div className="content-wrapper">
      {/* Hero */}
      <section className={styles.hero}>
        <h1 className={styles.title}>
          {user ? (
            <>Welcome back, <span className={styles.accent}>{user.displayName?.split(' ')[0]}</span></>
          ) : (
            <>Welcome to <span className={styles.accent}>Intelboard</span></>
          )}
        </h1>
        <p className={styles.subtitle}>
          {user
            ? 'Here\'s what\'s happening across your knowledge communities.'
            : 'Explore knowledge, join discussions, and learn together across every field.'}
        </p>
      </section>

      {/* Main layout: 2 columns on desktop */}
      <div className={styles.dashboard}>
        {/* Left column — Feed */}
        <div className={styles.mainCol}>
          {/* Notification bar */}
          {user && notifications.length > 0 && (
            <div className={styles.notifBar}>
              {notifications.map(n => (
                <div key={n.type} className={styles.notifItem}>
                  <span className={styles.notifIcon}>{n.icon}</span>
                  <span className={styles.notifCount}>{n.count}</span>
                  <span className={styles.notifLabel}>{n.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Activity Feed */}
          <section className={styles.feedSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>📰 Latest Activity</h2>
              {feedItems.length > 3 && (
                <button className={styles.expandBtn} onClick={() => setFeedExpanded(!feedExpanded)}>
                  {feedExpanded ? 'Show less' : `Show all (${feedItems.length})`}
                </button>
              )}
            </div>

            <div className={styles.feedList}>
              {visibleFeed.map(item => (
                <Link
                  key={item.id}
                  href={`/category/${item.categorySlug}`}
                  className={`${styles.feedCard} glass-card ${item.isPersonalized ? styles.personalized : ''}`}
                >
                  <div className={styles.feedCardLeft}>
                    <span className={styles.feedTypeIcon}>{TYPE_ICONS[item.type]}</span>
                    {item.isPersonalized && <span className={styles.personalizedDot}>⭐</span>}
                  </div>
                  <div className={styles.feedCardBody}>
                    <div className={styles.feedCardHeader}>
                      <span className={styles.feedTypeBadge}>{TYPE_LABELS[item.type]}</span>
                      <span className={styles.feedCategory}>
                        {item.categoryIcon} {item.categoryName}
                      </span>
                      <span className={styles.feedTime}>{formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <h3 className={styles.feedTitle}>{item.title}</h3>
                    <p className={styles.feedBody}>{item.body}</p>
                    <span className={styles.feedAuthor}>by {item.author}</span>
                  </div>
                </Link>
              ))}
            </div>

            {!feedExpanded && feedItems.length > 3 && (
              <button className={styles.showMoreBtn} onClick={() => setFeedExpanded(true)}>
                ▼ Show {feedItems.length - 3} more updates
              </button>
            )}
          </section>

          {/* External Reports & News */}
          <section className={styles.reportsSection}>
            <NewsFeed categorySlug="computing" categoryName="Computing" />
          </section>

          {/* Discover */}
          <section className={styles.discoverSection}>
            <h2 className={styles.sectionTitle}>
              🧭 What would you like to explore today?
            </h2>
            <div className={styles.suggestGrid}>
              {suggestions.map(cat => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className={`${styles.suggestCard} glass-card`}
                >
                  <span className={styles.suggestIcon}>{cat.icon}</span>
                  <div>
                    <div className={styles.suggestName}>{cat.name}</div>
                    <div className={styles.suggestDesc}>{cat.description}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* All Categories */}
          <section className={styles.categoriesSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>📚 Knowledge Categories</h2>
              <button className={styles.expandBtn} onClick={() => setShowAllCategories(!showAllCategories)}>
                {showAllCategories ? 'Show less' : `Show all (${categories.length})`}
              </button>
            </div>
            <div className={styles.grid}>
              {displayCategories.map((cat, index) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className={`${styles.card} glass-card`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={styles.cardIcon}>{cat.icon}</div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>{cat.name}</h3>
                    <p className={styles.cardDesc}>{cat.description}</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className="badge">{cat.children.length} subcategories</span>
                    <span className="badge">{countAllChildren(cat)} total</span>
                  </div>
                  <div className={styles.cardArrow}>→</div>
                </Link>
              ))}
            </div>
            {!showAllCategories && categories.length > 6 && (
              <button className={styles.showMoreBtn} onClick={() => setShowAllCategories(true)}>
                ▼ Show {categories.length - 6} more categories
              </button>
            )}
          </section>
        </div>

        {/* Right column — Sidebar widgets */}
        <aside className={styles.sideCol}>
          {/* Upcoming Events */}
          <div className={`${styles.widget} glass-card`}>
            <h3 className={styles.widgetTitle}>📅 Upcoming Events</h3>
            <div className={styles.eventsList}>
              {events.map(evt => (
                <Link key={evt.id} href={`/category/${evt.categorySlug}`} className={styles.eventItem}>
                  <div className={styles.eventDate}>
                    <span className={styles.eventDay}>{evt.date}</span>
                    <span className={styles.eventTime}>{evt.time}</span>
                  </div>
                  <div className={styles.eventInfo}>
                    <span className={styles.eventName}>{evt.title}</span>
                    <span className={styles.eventMeta}>
                      {evt.categoryIcon} {evt.categoryName} · {evt.attendees} attending
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Messages */}
          {user && (
            <div className={`${styles.widget} glass-card`}>
              <h3 className={styles.widgetTitle}>✉️ Messages</h3>
              <div className={styles.messagesList}>
                {messages.map(msg => (
                  <Link key={msg.id} href="/chat" className={`${styles.messageItem} ${msg.unread ? styles.unread : ''}`}>
                    <span className={styles.msgAvatar}>{msg.avatar}</span>
                    <div className={styles.msgContent}>
                      <div className={styles.msgFrom}>
                        {msg.from}
                        {msg.unread && <span className={styles.unreadDot} />}
                      </div>
                      <div className={styles.msgPreview}>{msg.preview}</div>
                      <div className={styles.msgTime}>{formatRelativeTime(msg.timestamp)}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/chat" className={styles.viewAllLink}>View all messages →</Link>
            </div>
          )}

          {/* Quick Actions */}
          <div className={`${styles.widget} glass-card`}>
            <h3 className={styles.widgetTitle}>⚡ Quick Actions</h3>
            <div className={styles.quickActions}>
              <Link href="/my-board" className={styles.actionBtn}>⭐ My Board</Link>
              <Link href="/chat" className={styles.actionBtn}>💬 Chat</Link>
              <Link href="/contacts" className={styles.actionBtn}>👥 Contacts</Link>
              <Link href="/search" className={styles.actionBtn}>🔍 Search</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
