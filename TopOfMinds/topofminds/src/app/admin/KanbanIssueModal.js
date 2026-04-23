'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './admin.module.css';

const STATUS_OPTIONS = [
  { value: 'NY', label: '🆕 Ny', color: '#8b949e' },
  { value: 'PRIORITERAD', label: '⚡ Prioriterad', color: '#d29922' },
  { value: 'PAGAR_UTVECKLING', label: '🔧 Pågår', color: '#58a6ff' },
  { value: 'ANTIGRAVITY_VERIFIERAR', label: '🤖 AG Verifierar', color: '#bc8cff' },
  { value: 'REDO_FOR_VERIFIERING', label: '👀 Redo', color: '#f0883e' },
  { value: 'KLAR', label: '✅ Klar', color: '#3fb950' },
];

function timeAgo(date) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just nu';
  if (diff < 3600) return `${Math.floor(diff / 60)} min sedan`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} tim sedan`;
  return d.toLocaleDateString('sv-SE');
}

export default function KanbanIssueModal({ issueId, onClose, onUpdated }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Comments
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const commentsEndRef = useRef(null);

  // Agent
  const [showAgent, setShowAgent] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [sendingAgent, setSendingAgent] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    loadIssue();
  }, [issueId]);

  async function loadIssue() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/kanban/${issueId}`);
      if (res.ok) {
        const data = await res.json();
        setIssue(data);
        setEditTitle(data.title);
        setEditDesc(data.description);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus) {
    if (!issue) return;
    setIssue((prev) => ({ ...prev, status: newStatus }));

    await fetch(`/api/admin/kanban/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleSaveEdit() {
    await fetch(`/api/admin/kanban/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDesc }),
    });
    setIsEditing(false);
    loadIssue();
  }

  async function handleDelete() {
    await fetch(`/api/admin/kanban/${issueId}`, { method: 'DELETE' });
    onUpdated();
  }

  async function handleAddComment() {
    if (!commentText.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      await fetch(`/api/admin/kanban/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText }),
      });
      setCommentText('');
      loadIssue();
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } finally {
      setSendingComment(false);
    }
  }

  async function handleSendToAgent() {
    if (!agentPrompt.trim() || sendingAgent) return;
    setSendingAgent(true);
    try {
      const fullPrompt = `Kanban ärende: "${issue.title}"\n\nBeskrivning: ${issue.description}\n\n---\n\nUppdrag:\n${agentPrompt}`;
      await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          kanbanIssueId: issueId,
        }),
      });
      setAgentPrompt('');
      setShowAgent(false);
      loadIssue();
    } finally {
      setSendingAgent(false);
    }
  }

  if (loading || !issue) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.kanbanLoading}>
            <div className={styles.kanbanLoadingSpinner} />
            Laddar ärende...
          </div>
        </div>
      </div>
    );
  }

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === issue.status) || STATUS_OPTIONS[0];

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div
          className={`${styles.modalContent} ${styles.modalContentWide}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles.modalHeader}>
            <button className={styles.modalBack} onClick={onClose}>←</button>
            <div className={styles.issueModalTitleRow}>
              {isEditing ? (
                <input
                  className={styles.formInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              ) : (
                <h2>{issue.title}</h2>
              )}
            </div>
            <button className={styles.modalClose} onClick={onClose}>✕</button>
          </div>

          {/* Meta bar */}
          <div className={styles.issueMetaBar}>
            <div className={styles.issueMetaLeft}>
              <select
                className={styles.issueStatusSelect}
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  borderColor: statusOpt.color,
                  color: statusOpt.color,
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className={styles.issueMetaCreator}>
                av {issue.creatorName} · {timeAgo(issue.createdAt)}
              </span>
            </div>
            <div className={styles.issueMetaActions}>
              {isEditing ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveEdit}>
                    💾 Spara
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(false)}>
                    Avbryt
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(true)}>
                    ✏️ Redigera
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setShowAgent(true)}>
                    🤖 Claude
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={styles.modalBody}>
            {/* Description */}
            <div className={styles.issueSection}>
              <h3>Beskrivning</h3>
              {isEditing ? (
                <textarea
                  className={styles.formTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={6}
                />
              ) : (
                <div className={styles.issueDescription}>
                  {issue.description.split('\n').map((p, i) => (
                    <p key={i}>{p || '\u00A0'}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Images */}
            {issue.images?.length > 0 && (
              <div className={styles.issueSection}>
                <h3>Bilder</h3>
                <div className={styles.issueImageGallery}>
                  {issue.images.map((img) => (
                    <div
                      key={img.id}
                      className={styles.issueImageThumb}
                      onClick={() => setLightboxUrl(img.url)}
                    >
                      <img src={img.url} alt={img.caption || ''} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Tasks */}
            {issue.agentTasks?.length > 0 && (
              <div className={styles.issueSection}>
                <h3>🤖 Agent-uppgifter</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {issue.agentTasks.map((task) => (
                    <div key={task.id} className={styles.commentItem}>
                      <div className={styles.commentHeader}>
                        <div className={styles.commentAvatar} style={{ background: '#58a6ff' }}>
                          🤖
                        </div>
                        <div className={styles.commentMeta}>
                          <span className={styles.commentAuthor}>
                            Agent Task
                            <span
                              className={`${styles.statusBadge} ${
                                task.status === 'DONE'
                                  ? styles.statusDone
                                  : task.status === 'RUNNING'
                                  ? styles.statusRunning
                                  : task.status === 'FAILED'
                                  ? styles.statusFailed
                                  : styles.statusPending
                              }`}
                              style={{ marginLeft: 8 }}
                            >
                              {task.status}
                            </span>
                          </span>
                          <span className={styles.commentTime}>{timeAgo(task.createdAt)}</span>
                        </div>
                      </div>
                      <div className={styles.commentBody}>
                        <p><strong>Prompt:</strong> {task.prompt.slice(0, 300)}</p>
                        {task.response && (
                          <p style={{ marginTop: 8, color: '#3fb950' }}>
                            <strong>Svar:</strong> {task.response.slice(0, 500)}
                            {task.response.length > 500 ? '...' : ''}
                          </p>
                        )}
                        {task.error && (
                          <p style={{ marginTop: 8, color: '#f85149' }}>
                            <strong>Fel:</strong> {task.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className={styles.issueSection}>
              <h3>💬 Kommentarer ({issue.comments?.length || 0})</h3>

              {issue.comments?.length > 0 && (
                <div className={styles.commentsList}>
                  {issue.comments.map((c) => (
                    <div key={c.id} className={styles.commentItem}>
                      <div className={styles.commentHeader}>
                        <div className={styles.commentAvatar}>
                          {(c.authorName || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.commentMeta}>
                          <span className={styles.commentAuthor}>{c.authorName || 'Admin'}</span>
                          <span className={styles.commentTime}>{timeAgo(c.createdAt)}</span>
                        </div>
                      </div>
                      <div className={styles.commentBody}>
                        {c.body.split('\n').map((p, i) => (
                          <p key={i}>{p || '\u00A0'}</p>
                        ))}
                      </div>
                      {c.images?.length > 0 && (
                        <div className={styles.commentImages}>
                          {c.images.map((img) => (
                            <div
                              key={img.id}
                              className={styles.issueImageThumb}
                              onClick={() => setLightboxUrl(img.url)}
                            >
                              <img src={img.url} alt={img.caption || ''} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>
              )}

              <div className={styles.commentForm}>
                <textarea
                  className={styles.commentInput}
                  placeholder="Skriv en kommentar..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) handleAddComment();
                  }}
                  rows={3}
                />
                <div className={styles.commentFormActions}>
                  <span className={styles.commentHint}>⌘+Enter skickar</span>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || sendingComment}
                  >
                    {sendingComment ? 'Skickar...' : '💬 Kommentera'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Dialog */}
      {showAgent && (
        <div className={styles.confirmOverlay} onClick={() => setShowAgent(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3>🤖 Skicka till Claude Agent</h3>
            <p>
              Ärendet &quot;{issue.title}&quot; skickas som kontext. Beskriv vad agenten ska göra:
            </p>
            <textarea
              className={styles.formTextarea}
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              placeholder="T.ex. 'Implementera detta ärende och skapa nödvändiga filer'"
              rows={4}
              autoFocus
            />
            <div className={styles.confirmActions} style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowAgent(false)}>
                Avbryt
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSendToAgent}
                disabled={!agentPrompt.trim() || sendingAgent}
              >
                {sendingAgent ? 'Skickar...' : '🚀 Kör Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDelete(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3>🗑 Ta bort ärende</h3>
            <p>Är du säker på att du vill ta bort &quot;{issue.title}&quot;? Detta kan inte ångras.</p>
            <div className={styles.confirmActions}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                Avbryt
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                🗑 Ta bort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Fullbild" />
          <button className={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
