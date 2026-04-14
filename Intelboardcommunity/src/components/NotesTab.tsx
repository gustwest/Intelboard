'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { getNotes, addNote, voteNote, getNotesScored, KnowledgeNote } from '@/lib/communityStore';
import styles from './NotesTab.module.css';

type NoteTag = 'best-practice' | 'tip' | 'warning' | 'experience';

const TAG_CONFIG: Record<NoteTag, { label: string; icon: string; color: string }> = {
  'best-practice': { label: 'Best Practice', icon: '✅', color: '#10b981' },
  'tip': { label: 'Tip', icon: '💡', color: '#f59e0b' },
  'warning': { label: 'Warning', icon: '⚠️', color: '#ef4444' },
  'experience': { label: 'Experience', icon: '📝', color: '#6366f1' },
};

export default function NotesTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { user, signInAsDemo } = useAuth();
  const [notes, setNotes] = useState<(KnowledgeNote & { score: number })[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<NoteTag>('tip');
  const [filter, setFilter] = useState<NoteTag | 'all'>('all');

  useEffect(() => {
    refreshNotes();
  }, [categoryId]);

  function refreshNotes() {
    setNotes(getNotesScored(categoryId));
  }

  function handleCreate() {
    if (!user || !body.trim()) return;
    addNote(categoryId, {
      categoryId,
      authorUid: user.uid,
      authorName: user.displayName || 'Anonymous',
      body: body.trim(),
      tag,
    });
    setBody('');
    setShowComposer(false);
    refreshNotes();
  }

  function handleVote(noteId: string, type: 'up' | 'down') {
    if (!user) return;
    voteNote(categoryId, noteId, user.uid, type);
    refreshNotes();
  }

  const filteredNotes = filter === 'all' ? notes : notes.filter(n => n.tag === filter);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>📝 Community Knowledge</h2>
          <p className={styles.subtitle}>Tips, best practices, and insights from the community about {categoryName}</p>
        </div>
        {user ? (
          <button className="btn-primary" onClick={() => setShowComposer(!showComposer)}>
            + Add Note
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {DEMO_USERS.map(u => (
              <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
                {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {showComposer && (
        <div className={`${styles.composer} glass-card`}>
          <div className={styles.tagSelector}>
            {(Object.keys(TAG_CONFIG) as NoteTag[]).map(t => (
              <button
                key={t}
                className={`${styles.tagBtn} ${tag === t ? styles.tagBtnActive : ''}`}
                onClick={() => setTag(t)}
                style={{ '--tag-color': TAG_CONFIG[t].color } as React.CSSProperties}
              >
                {TAG_CONFIG[t].icon} {TAG_CONFIG[t].label}
              </button>
            ))}
          </div>
          <textarea
            className="textarea"
            placeholder="Share your knowledge, tip, or experience..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
          />
          <div className={styles.composerActions}>
            <button className="btn-secondary" onClick={() => setShowComposer(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreate} disabled={!body.trim()}>Post Note</button>
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <button
          className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notes.length})
        </button>
        {(Object.keys(TAG_CONFIG) as NoteTag[]).map(t => {
          const count = notes.filter(n => n.tag === t).length;
          return (
            <button
              key={t}
              className={`${styles.filterBtn} ${filter === t ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(t)}
            >
              {TAG_CONFIG[t].icon} {TAG_CONFIG[t].label} ({count})
            </button>
          );
        })}
      </div>

      <div className={styles.notesList}>
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-title">No notes yet</div>
            <div className="empty-state-desc">Be the first to share knowledge about {categoryName}!</div>
          </div>
        ) : (
          filteredNotes.map(note => {
            const tagCfg = TAG_CONFIG[note.tag];
            const userVoted = user ? (note.upvotes.includes(user.uid) ? 'up' : note.downvotes.includes(user.uid) ? 'down' : null) : null;
            return (
              <div key={note.id} className={`${styles.noteCard} glass-card`}>
                <div className={styles.voteColumn}>
                  <button
                    className={`${styles.voteBtn} ${userVoted === 'up' ? styles.votedUp : ''}`}
                    onClick={() => handleVote(note.id, 'up')}
                    disabled={!user}
                  >
                    ▲
                  </button>
                  <span className={styles.voteScore}>{note.score}</span>
                  <button
                    className={`${styles.voteBtn} ${userVoted === 'down' ? styles.votedDown : ''}`}
                    onClick={() => handleVote(note.id, 'down')}
                    disabled={!user}
                  >
                    ▼
                  </button>
                </div>
                <div className={styles.noteContent}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteTag} style={{ '--tag-color': tagCfg.color } as React.CSSProperties}>
                      {tagCfg.icon} {tagCfg.label}
                    </span>
                    <span className={styles.noteMeta}>
                      by {note.authorName} • {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={styles.noteBody}>{note.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
