'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from './page.module.css';
import { COLUMNS } from './KanbanBoard';
import ConfirmModal from '@/components/ConfirmModal';
import { formatTimestamp } from '@/lib/formatTimestamp';

interface IssueDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; image: string | null };
  images: { id: string; url: string; caption: string | null }[];
  comments: CommentData[];
}

interface CommentData {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  images: { id: string; url: string; caption: string | null }[];
}

interface AgentTaskData {
  id: string;
  prompt: string;
  status: string;
  model: string | null;
  error: string | null;
  response: string | null;
  createdAt: string;
  updatedAt: string;
  logs: { id: string; message: string; createdAt: string }[];
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Props {
  issueId: string;
  onClose: () => void;
  onUpdated: (keepOpen?: boolean) => void;
  onDeleted: (id: string) => void;
}

export default function KanbanIssueModal({ issueId, onClose, onUpdated, onDeleted }: Props) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentImages, setCommentImages] = useState<{ url: string; preview: string }[]>([]);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [agentModel, setAgentModel] = useState('claude-sonnet-4-6');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [isLaunchingAgent, setIsLaunchingAgent] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchIssue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  const fetchIssue = async () => {
    try {
      const res = await fetch(`/api/admin/kanban/${issueId}`);
      if (res.ok) {
        const data = await res.json();
        setIssue(data);
        setEditTitle(data.title);
        setEditDescription(data.description);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!issue) return;

    setIssue({ ...issue, status: newStatus });

    try {
      await fetch(`/api/admin/kanban/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchIssue(); // revert
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editDescription.trim()) return;

    try {
      const res = await fetch(`/api/admin/kanban/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });

      if (res.ok) {
        const updated = await res.json();
        setIssue((prev) =>
          prev ? { ...prev, title: updated.title, description: updated.description } : prev
        );
        setIsEditing(false);
      }
    } catch {
      // Keep editing
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/admin/kanban/${issueId}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted(issueId);
      }
    } catch {
      alert('Kunde inte ta bort ärendet');
    }
  };

  const handleCommentFiles = async (files: FileList | null) => {
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const dataUrl = `data:${file.type};base64,${base64}`;

      setCommentImages((prev) => [...prev, { url: dataUrl, preview: dataUrl }]);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() && commentImages.length === 0) return;

    setIsSubmittingComment(true);

    try {
      const res = await fetch(`/api/admin/kanban/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: commentText.trim() || '(bild)',
          images: commentImages.map((img) => ({ url: img.url })),
        }),
      });

      if (res.ok) {
        const newComment = await res.json();
        setIssue((prev) =>
          prev ? { ...prev, comments: [...prev.comments, newComment] } : prev
        );
        setCommentText('');
        setCommentImages([]);
        setReplyingTo(null);

        // Auto-promote: move to PRIORITERAD when commented — only for NEW issues
        if (issue && issue.status === 'NY') {
          await handleStatusChange('PRIORITERAD');
        }

        // Refresh the board in the background (keep modal open)
        onUpdated(true);

        // Scroll to bottom
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch {
      alert('Kunde inte lägga till kommentaren');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const formatDate = (dateStr: string) => {
    return formatTimestamp(dateStr);
  };

  // Auto-linkify URLs and relative paths in text
  const renderLinkedText = (text: string) => {
    // Match full URLs OR relative paths like /events, /match/quick etc.
    const linkRegex = /(https?:\/\/[^\s)]+|(?:^|\s)(\/[a-zA-Z][^\s)]*[^\s.,;:!?)]))/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        elements.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }

      const fullMatch = match[0];
      // Determine if it's a full URL or relative path
      const isRelative = !fullMatch.trim().startsWith('http');
      const path = isRelative ? fullMatch.trim() : fullMatch;
      const href = isRelative
        ? `https://dvoucher-app-815335042776.europe-north1.run.app${path}`
        : path;
      const displayText = path.length > 60 ? path.slice(0, 57) + '...' : path;

      // Add leading whitespace if relative path had it
      if (isRelative && fullMatch.startsWith(' ')) {
        elements.push(<span key={`ws${match.index}`}> </span>);
      }

      elements.push(
        <a
          key={`l${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#58a6ff',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </a>
      );

      lastIndex = match.index + fullMatch.length;
    }

    // Remaining text
    if (lastIndex < text.length) {
      elements.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return elements.length > 0 ? elements : text;
  };

  const handleReply = (comment: CommentData) => {
    setReplyingTo({ id: comment.id, name: comment.author.name });
    setCommentText(`@${comment.author.name} `);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  };

  const handleOpenAgentDialog = () => {
    if (!issue) return;
    const context = [
      `Ärende: ${issue.title}`,
      ``,
      `Beskrivning:`,
      issue.description,
    ];
    if (issue.comments.length > 0) {
      context.push('', '--- Kommentarer ---');
      for (const c of issue.comments.slice(-5)) {
        context.push(`${c.author.name}: ${c.body}`);
      }
    }
    setAgentPrompt(context.join('\n'));
    setShowAgentDialog(true);
  };

  const handleLaunchAgent = async () => {
    if (!issue || !agentPrompt.trim()) return;
    setIsLaunchingAgent(true);
    try {
      const res = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: agentPrompt.trim(),
          model: agentModel,
          kanbanIssueId: issue.id,
        }),
      });
      if (res.ok) {
        setShowAgentDialog(false);
        fetchIssue();
        onUpdated(true);
      } else {
        const err = await res.json();
        alert(err.error || 'Kunde inte starta agenten');
      }
    } catch {
      alert('Nätverksfel');
    } finally {
      setIsLaunchingAgent(false);
    }
  };

  const currentColumn = COLUMNS.find((c) => c.key === issue?.status);

  if (loading) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.kanbanLoading}>
            <div className={styles.kanbanLoadingSpinner} />
            <span>Laddar ärende...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!issue) return null;

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div
          className={`${styles.modalContent} ${styles.modalContentWide}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <button
              className={styles.modalBack}
              onClick={onClose}
              aria-label="Tillbaka"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
            <div className={styles.issueModalTitleRow}>
              {isEditing ? (
                <input
                  type="text"
                  className={styles.formInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              ) : (
                <h2>{issue.title}</h2>
              )}
            </div>
            <button className={styles.modalClose} onClick={onClose} aria-label="Stäng">✕</button>
          </div>

          <div className={styles.issueMetaBar}>
            <div className={styles.issueMetaLeft}>
              <select
                className={styles.issueStatusSelect}
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  borderColor: currentColumn?.color || '#58a6ff',
                  color: currentColumn?.color || '#58a6ff',
                }}
              >
                {COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.emoji} {col.label}
                  </option>
                ))}
              </select>
              <span className={styles.issueMetaCreator}>
                Skapad av {issue.creator.name} · {formatDate(issue.createdAt)}
              </span>
            </div>
            <div className={styles.issueMetaActions}>
              {isEditing ? (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(false)}>
                    Avbryt
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveEdit}>
                    Spara
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(true)}>
                    ✏️ Redigera
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleOpenAgentDialog}
                    style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none' }}>
                    🤖 Kör med Claude
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowDeleteConfirm(true)} style={{ color: '#f85149' }}>
                    🗑 Radera
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
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                />
              ) : (
                <div className={styles.issueDescription}>
                  {issue.description.split('\n').map((line, i) => (
                    <p key={i}>{line ? renderLinkedText(line) : '\u00A0'}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Issue Images */}
            {issue.images.length > 0 && (
              <div className={styles.issueSection}>
                <h3>Bilder</h3>
                <div className={styles.issueImageGallery}>
                  {issue.images.map((img) => (
                    <div
                      key={img.id}
                      className={styles.issueImageThumb}
                      onClick={() => setLightboxUrl(img.url)}
                    >
                      <img src={img.url} alt={img.caption || 'Bild'} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className={styles.issueSection}>
              <h3>Kommentarer ({issue.comments.length})</h3>

              <div className={styles.commentsList}>
                {issue.comments.map((comment) => (
                  <div key={comment.id} className={styles.commentItem}>
                    <div className={styles.commentHeader}>
                      <div className={styles.commentAvatar}>
                        {comment.author.image ? (
                          <img src={comment.author.image} alt={comment.author.name} />
                        ) : (
                          getInitials(comment.author.name)
                        )}
                      </div>
                      <div className={styles.commentMeta}>
                        <span className={styles.commentAuthor}>{comment.author.name}</span>
                        <span className={styles.commentTime}>{formatDate(comment.createdAt)}</span>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleReply(comment)}
                        style={{ marginLeft: 'auto', fontSize: '0.6875rem', padding: '2px 8px', color: 'var(--text-tertiary)' }}
                        title="Svara"
                      >
                        ↩ Svara
                      </button>
                    </div>
                    <div className={styles.commentBody}>
                      {comment.body.split('\n').map((line, i) => (
                        <p key={i}>{line ? renderLinkedText(line) : '\u00A0'}</p>
                      ))}
                    </div>
                    {comment.images.length > 0 && (
                      <div className={styles.commentImages}>
                        {comment.images.map((img) => (
                          <div
                            key={img.id}
                            className={styles.issueImageThumb}
                            onClick={() => setLightboxUrl(img.url)}
                          >
                            <img src={img.url} alt={img.caption || 'Kommentarsbild'} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              {/* Add Comment */}
              <div className={styles.commentForm}>
                {replyingTo && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 8px', marginBottom: '4px',
                    fontSize: '0.75rem', color: '#58a6ff',
                    background: 'rgba(88,166,255,0.08)', borderRadius: '6px',
                  }}>
                    ↩ Svarar {replyingTo.name}
                    <button
                      onClick={() => { setReplyingTo(null); setCommentText(''); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <textarea
                  ref={commentInputRef}
                  className={styles.commentInput}
                  placeholder="Skriv en kommentar..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                  }}
                  rows={3}
                />
                {commentImages.length > 0 && (
                  <div className={styles.imagePreviews}>
                    {commentImages.map((img, i) => (
                      <div key={i} className={styles.imagePreview}>
                        <img src={img.preview} alt="Preview" />
                        <button
                          className={styles.imageRemove}
                          onClick={() => setCommentImages((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.commentFormActions}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => commentFileRef.current?.click()}
                  >
                    📎 Bifoga bild
                  </button>
                  <input
                    ref={commentFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleCommentFiles(e.target.files)}
                  />
                  <div className={styles.commentFormRight}>
                    <span className={styles.commentHint}>⌘+Enter för att skicka</span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleSubmitComment}
                      disabled={isSubmittingComment || (!commentText.trim() && commentImages.length === 0)}
                    >
                      {isSubmittingComment ? 'Skickar...' : 'Kommentera'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Tasks */}
            {(issue as any).agentTasks && (issue as any).agentTasks.length > 0 && (
              <div className={styles.issueSection}>
                <h3>🤖 Agent-loggar ({(issue as any).agentTasks.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {((issue as any).agentTasks as AgentTaskData[]).map((task) => (
                    <div key={task.id} style={{
                      background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        style={{
                          padding: '10px 12px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}
                      >
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px',
                          background: task.status === 'DONE' ? 'rgba(34,197,94,0.15)' :
                            task.status === 'RUNNING' ? 'rgba(234,179,8,0.15)' :
                            task.status === 'FAILED' ? 'rgba(248,81,73,0.15)' : 'rgba(88,166,255,0.15)',
                          color: task.status === 'DONE' ? '#22c55e' :
                            task.status === 'RUNNING' ? '#eab308' :
                            task.status === 'FAILED' ? '#f85149' : '#58a6ff',
                          fontWeight: 600,
                        }}>{task.status}</span>
                        {task.model && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            {task.model}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }}>
                          {task.prompt.slice(0, 60)}{task.prompt.length > 60 ? '...' : ''}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                          {formatDate(task.createdAt)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {expandedTaskId === task.id ? '▲' : '▼'}
                        </span>
                      </div>
                      {expandedTaskId === task.id && (
                        <div style={{
                          padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
                          maxHeight: '300px', overflow: 'auto',
                          fontFamily: 'monospace', fontSize: '0.75rem',
                          background: 'rgba(0,0,0,0.2)', color: '#c9d1d9',
                          whiteSpace: 'pre-wrap', lineHeight: 1.5,
                        }}>
                          {task.response && (
                            <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(34,197,94,0.05)', borderRadius: '4px', border: '1px solid rgba(34,197,94,0.15)' }}>
                              <strong style={{ color: '#22c55e' }}>Response:</strong>
                              <div>{task.response.slice(0, 1000)}</div>
                            </div>
                          )}
                          {task.error && (
                            <div style={{ marginBottom: '8px', color: '#f85149' }}>
                              ❌ {task.error}
                            </div>
                          )}
                          {task.logs.map((log) => (
                            <div key={log.id} style={{ padding: '2px 0' }}>
                              <span style={{ color: '#484f58', marginRight: '6px' }}>
                                {new Date(log.createdAt).toLocaleTimeString('sv')}
                              </span>
                              {log.message}
                            </div>
                          ))}
                          {task.logs.length === 0 && !task.error && (
                            <span style={{ color: '#484f58' }}>Inga loggar ännu...</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Fullstorlek" />
          <button className={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}
      {/* Agent Launch Dialog */}
      {showAgentDialog && (
        <div className={styles.modalOverlay} onClick={() => setShowAgentDialog(false)}
          style={{ zIndex: 1100 }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '540px' }}>
            <div className={styles.modalHeader}>
              <button
                className={styles.modalBack}
                onClick={() => setShowAgentDialog(false)}
                aria-label="Tillbaka"
              >
                <ArrowLeft size={20} strokeWidth={2} />
              </button>
              <h2>🤖 Kör med Claude Code</h2>
              <button className={styles.modalClose} onClick={() => setShowAgentDialog(false)} aria-label="Stäng">✕</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                  Modell
                </label>
                <select
                  value={agentModel}
                  onChange={(e) => setAgentModel(e.target.value)}
                  className={styles.formInput}
                  style={{ width: '100%' }}
                >
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (snabb, standard)</option>
                  <option value="claude-opus-4-7">Claude Opus 4.7 (planering, komplex)</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                  Prompt (ärendekontext inkluderad)
                </label>
                <textarea
                  className={styles.formTextarea}
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  rows={10}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowAgentDialog(false)}>
                  Avbryt
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleLaunchAgent}
                  disabled={isLaunchingAgent || !agentPrompt.trim()}
                  style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none' }}
                >
                  {isLaunchingAgent ? '⏳ Startar...' : '🚀 Starta agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Ta bort ärende"
        message="Är du säker på att du vill ta bort detta ärende? Detta kan inte ångras."
        confirmText="Radera"
        cancelText="Avbryt"
        isDestructive={true}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
