'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import StarRating from '@/components/StarRating';
import styles from './ForumTab.module.css';

interface Thread {
  id: string;
  title: string;
  body: string;
  authorName: string;
  authorPhoto: string;
  replyCount: number;
  createdAt: string;
  replies: Reply[];
}

interface Reply {
  id: string;
  body: string;
  authorName: string;
  authorPhoto: string;
  createdAt: string;
}

export default function ForumTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { user, signInAsDemo } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState('');

  // Demo threads (in production, these come from Firestore)
  useEffect(() => {
    setThreads([
      {
        id: '1',
        title: `Welcome to the ${categoryName} discussion forum!`,
        body: `This is the official discussion space for ${categoryName}. Feel free to ask questions, share insights, and collaborate with fellow community members.`,
        authorName: 'Intelboard Bot',
        authorPhoto: '',
        replyCount: 2,
        createdAt: new Date().toISOString(),
        replies: [
          { id: 'r1', body: 'Great to see this community space! Looking forward to discussing topics here.', authorName: 'Community Member', authorPhoto: '', createdAt: new Date().toISOString() },
          { id: 'r2', body: 'Excited to learn and share knowledge about this topic!', authorName: 'Knowledge Seeker', authorPhoto: '', createdAt: new Date().toISOString() },
        ]
      },
      {
        id: '2',
        title: `What are the most important aspects of ${categoryName}?`,
        body: `I\'d love to hear from everyone about what they consider the most important aspects or concepts within ${categoryName}. What should newcomers focus on first?`,
        authorName: 'Curious Learner',
        authorPhoto: '',
        replyCount: 1,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        replies: [
          { id: 'r3', body: 'I think understanding the fundamentals is key. Start with the basics and build from there.', authorName: 'Expert Guide', authorPhoto: '', createdAt: new Date().toISOString() },
        ]
      }
    ]);
  }, [categoryId, categoryName]);

  function handleCreateThread() {
    if (!newTitle.trim() || !newBody.trim()) return;
    const thread: Thread = {
      id: Date.now().toString(),
      title: newTitle,
      body: newBody,
      authorName: user?.displayName || 'Anonymous',
      authorPhoto: user?.photoURL || '',
      replyCount: 0,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setThreads([thread, ...threads]);
    setNewTitle('');
    setNewBody('');
    setShowComposer(false);
  }

  function handleReply() {
    if (!replyText.trim() || !activeThread) return;
    const reply: Reply = {
      id: Date.now().toString(),
      body: replyText,
      authorName: user?.displayName || 'Anonymous',
      authorPhoto: user?.photoURL || '',
      createdAt: new Date().toISOString(),
    };
    const updated = threads.map(t =>
      t.id === activeThread.id
        ? { ...t, replies: [...t.replies, reply], replyCount: t.replyCount + 1 }
        : t
    );
    setThreads(updated);
    setActiveThread({ ...activeThread, replies: [...activeThread.replies, reply], replyCount: activeThread.replyCount + 1 });
    setReplyText('');
  }

  if (activeThread) {
    return (
      <div className={styles.container}>
        <button className={`btn-ghost ${styles.backBtn}`} onClick={() => setActiveThread(null)}>
          ← Back to threads
        </button>
        <div className={styles.threadDetail}>
          <div className={styles.threadHeader}>
            <div className={styles.avatar}>{activeThread.authorName[0]}</div>
            <div>
              <h2 className={styles.threadTitle}>{activeThread.title}</h2>
              <span className={styles.threadMeta}>By {activeThread.authorName} • {new Date(activeThread.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <p className={styles.threadBody}>{activeThread.body}</p>
          <StarRating targetType="thread" targetId={activeThread.id} />
        </div>

        <div className={styles.repliesSection}>
          <h3 className={styles.repliesTitle}>{activeThread.replies.length} Replies</h3>
          {activeThread.replies.map(reply => (
            <div key={reply.id} className={styles.replyCard}>
              <div className={styles.replyHeader}>
                <div className={styles.avatarSm}>{reply.authorName[0]}</div>
                <span className={styles.replyAuthor}>{reply.authorName}</span>
                <span className={styles.replyDate}>{new Date(reply.createdAt).toLocaleDateString()}</span>
              </div>
              <p className={styles.replyBody}>{reply.body}</p>
            </div>
          ))}
        </div>

        {user ? (
          <div className={styles.replyComposer}>
            <textarea
              className="textarea"
              placeholder="Write a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <button className="btn-primary" onClick={handleReply}>Reply</button>
          </div>
        ) : (
          <div className={styles.signInPrompt}>
            <p>Sign in to join the discussion</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {DEMO_USERS.map(u => (
                <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
                  {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.forumHeader}>
        <h2 className={styles.forumTitle}>💬 Discussion Forum</h2>
        {user ? (
          <button className="btn-primary" onClick={() => setShowComposer(true)}>+ New Thread</button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {DEMO_USERS.map(u => (
              <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
                {getDemoAvatar(u.uid)} Sign in as {u.displayName?.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {showComposer && (
        <div className={`${styles.composer} glass-card`}>
          <input
            className="input"
            placeholder="Thread title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="What would you like to discuss?"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className={styles.composerActions}>
            <button className="btn-secondary" onClick={() => setShowComposer(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreateThread}>Create Thread</button>
          </div>
        </div>
      )}

      <div className={styles.threadList}>
        {threads.map(thread => (
          <button key={thread.id} className={styles.threadCard} onClick={() => setActiveThread(thread)}>
            <div className={styles.threadCardLeft}>
              <div className={styles.avatar}>{thread.authorName[0]}</div>
              <div className={styles.threadCardInfo}>
                <h3 className={styles.threadCardTitle}>{thread.title}</h3>
                <p className={styles.threadCardPreview}>{thread.body}</p>
                <span className={styles.threadCardMeta}>
                  By {thread.authorName} • {new Date(thread.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className={styles.threadCardRight}>
              <StarRating targetType="thread" targetId={thread.id} size="sm" />
              <span className="badge">{thread.replyCount} replies</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
