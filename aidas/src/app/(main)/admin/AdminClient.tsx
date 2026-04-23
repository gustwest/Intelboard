'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import KanbanBoard from './KanbanBoard';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AgentTask {
  id: string;
  prompt: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'STOPPED';
  error?: string | null;
  response?: string | null;
  sessionId?: string | null;
  createdAt: string;
  creator?: { name: string };
  _count?: { logs: number };
}

interface AgentSession {
  id: string;
  title: string;
  claudeSessionId?: string | null;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
  creator?: { name: string };
  tasks: AgentTask[];
}

interface LogEntry {
  time: string;
  message: string;
}

type AdminTab = 'kanban' | 'agent';

const VALID_TABS: AdminTab[] = ['kanban', 'agent'];

export default function AdminClient({ initialUsers: _initialUsers }: { initialUsers: User[] }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const sessionParam = searchParams.get('session');
  const initialTab: AdminTab = VALID_TABS.includes(tabParam as AdminTab)
    ? (tabParam as AdminTab)
    : 'kanban';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const autoSelectedSessionRef = useRef(false);

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam as AdminTab)) {
      setActiveTab(tabParam as AdminTab);
    }
  }, [tabParam]);

  // ── Agent State ──
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<string, LogEntry[]>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [sessionSearch, setSessionSearch] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{
    model?: string;
    cliVersion?: string;
    projectDir?: string;
    lastPoll?: string;
    stats?: { total: number; completed: number; failed: number; successRate: number };
    lastCompleted?: { time: string; prompt: string };
  }>({});

  const eventSourceRef = useRef<EventSource | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const streamingTaskIdRef = useRef<string | null>(null);
  const prevTaskStatusesRef = useRef<Map<string, string> | null>(null);

  const handleChatScroll = () => {
    const el = chatMessagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 100;
  };

  // ── Fetch sessions and agent status ──
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agent');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agent/status');
      if (res.ok) {
        const data = await res.json();
        setAgentOnline(data.online);
        setAgentInfo({
          model: data.model,
          cliVersion: data.cliVersion,
          projectDir: data.projectDir,
          lastPoll: data.lastPoll,
          stats: data.stats,
          lastCompleted: data.lastCompleted,
        });
      }
    } catch {
      setAgentOnline(false);
    }
  }, []);

  // ── Auto-open a session when deep-linked (?session=latest or ?session=<id>) ──
  useEffect(() => {
    if (autoSelectedSessionRef.current) return;
    if (tabParam !== 'agent' || !sessionParam || sessions.length === 0) return;
    if (activeSessionId) return;

    if (sessionParam === 'latest') {
      setActiveSessionId(sessions[0].id);
      autoSelectedSessionRef.current = true;
    } else {
      const found = sessions.find((s) => s.id === sessionParam);
      if (found) {
        setActiveSessionId(found.id);
        autoSelectedSessionRef.current = true;
      }
    }
  }, [tabParam, sessionParam, sessions, activeSessionId]);

  // ── Initial load + polling (only when agent tab is active) ──
  useEffect(() => {
    if (activeTab !== 'agent') return;

    fetchSessions();
    fetchAgentStatus();

    const sessionInterval = setInterval(fetchSessions, 5000);
    const statusInterval = setInterval(fetchAgentStatus, 10000);

    return () => {
      clearInterval(sessionInterval);
      clearInterval(statusInterval);
    };
  }, [fetchSessions, fetchAgentStatus, activeTab]);

  // ── Local notification when a task flips from RUNNING/PENDING → DONE ──
  useEffect(() => {
    if (activeTab !== 'agent' || sessions.length === 0) return;

    const current = new Map<string, string>();
    for (const s of sessions) for (const t of s.tasks) current.set(t.id, t.status);

    // Seed on first observation so we don't fire for tasks that were already DONE.
    if (prevTaskStatusesRef.current === null) {
      prevTaskStatusesRef.current = current;
      return;
    }

    const prev = prevTaskStatusesRef.current;
    for (const [taskId, status] of current) {
      const wasActive = prev.get(taskId) === 'RUNNING' || prev.get(taskId) === 'PENDING';
      if (wasActive && status === 'DONE') {
        const sessionId = sessions.find((s) => s.tasks.some((t) => t.id === taskId))?.id;
        const url = sessionId ? `/admin?tab=agent&session=${sessionId}` : '/admin?tab=agent';
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification('Claude är klar', {
              body: 'Din tur att svara',
              tag: `agent-done-${taskId}`,
              data: { url },
            });
          }).catch(() => {});
        }
      }
    }
    prevTaskStatusesRef.current = current;
  }, [sessions, activeTab]);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatMessagesRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Scroll to bottom once when opening a session (not on every poll/log update)
  useEffect(() => {
    if (!activeSessionId) return;
    stickToBottomRef.current = true;
    scrollChatToBottom();
  }, [activeSessionId, scrollChatToBottom]);

  // ── Cleanup SSE on unmount ──
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // ── Start SSE streaming for a task ──
  const startStreaming = useCallback((taskId: string) => {
    if (streamingTaskIdRef.current === taskId) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    streamingTaskIdRef.current = taskId;

    const es = new EventSource(`/api/admin/agent/stream/${taskId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setTaskLogs((prev) => ({
            ...prev,
            [taskId]: [...(prev[taskId] || []), { time: data.time, message: data.message }],
          }));
          if (stickToBottomRef.current) scrollChatToBottom();
        } else if (data.type === 'done') {
          es.close();
          eventSourceRef.current = null;
          streamingTaskIdRef.current = null;
          fetchSessions();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    };
  }, [fetchSessions, scrollChatToBottom]);

  // ── Auto-attach SSE when opening a session with a running task ──
  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const running = session.tasks.find((t) => t.status === 'RUNNING' || t.status === 'PENDING');
    if (running && streamingTaskIdRef.current !== running.id) {
      setTaskLogs((prev) => ({ ...prev, [running.id]: prev[running.id] || [] }));
      startStreaming(running.id);
    }
  }, [activeSessionId, sessions, startStreaming]);

  // ── Submit a message (new session OR continue existing) ──
  const handleSend = async () => {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const sendText = prompt.trim();

    try {
      const res = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sendText, sessionId: activeSessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Error: ${data.error}`);
        return;
      }
      const newTask = data.task as AgentTask;
      const newSessionFromServer = data.session as Omit<AgentSession, 'tasks'>;

      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === newSessionFromServer.id);
        if (idx >= 0) {
          const updated = {
            ...prev[idx],
            updatedAt: new Date().toISOString(),
            tasks: [...prev[idx].tasks, newTask],
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        }
        return [{ ...newSessionFromServer, tasks: [newTask] }, ...prev];
      });
      setActiveSessionId(newSessionFromServer.id);
      setTaskLogs((prev) => ({ ...prev, [newTask.id]: [] }));
      startStreaming(newTask.id);
      setPrompt('');
      stickToBottomRef.current = true;
      scrollChatToBottom();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to submit: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setPrompt('');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    }
  };

  const handleBackToGallery = () => {
    setActiveSessionId(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    }
  };

  const patchSession = async (
    sessionId: string,
    data: { title?: string; pinned?: boolean }
  ) => {
    const prev = sessions;
    setSessions((curr) =>
      curr.map((s) => (s.id === sessionId ? { ...s, ...data } : s))
    );
    try {
      const res = await fetch(`/api/admin/agent/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Kunde inte uppdatera sessionen');
      fetchSessions();
    } catch (err) {
      setSessions(prev);
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTogglePin = (session: AgentSession) => {
    setMenuOpenFor(null);
    patchSession(session.id, { pinned: !session.pinned });
  };

  const handleRename = (session: AgentSession) => {
    setMenuOpenFor(null);
    const next = window.prompt('Nytt namn på session:', session.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === session.title) return;
    patchSession(session.id, { title: trimmed });
  };

  const handleDelete = async (session: AgentSession) => {
    setMenuOpenFor(null);
    if (!window.confirm(`Radera "${session.title}"? Detta kan inte ångras.`)) return;
    const prev = sessions;
    setSessions((curr) => curr.filter((s) => s.id !== session.id));
    if (activeSessionId === session.id) handleBackToGallery();
    try {
      const res = await fetch(`/api/admin/agent/${session.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Kunde inte radera sessionen');
    } catch (err) {
      setSessions(prev);
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleLogs = (taskId: string) => {
    setExpandedLogs((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // ── Helpers ──
  const getLogClass = (msg: string) => {
    if (msg.startsWith('❌') || msg.startsWith('⛔') || msg.startsWith('✗') || msg.startsWith('⚠️'))
      return styles.error;
    if (msg.startsWith('✅') || msg.startsWith('✓')) return styles.success;
    if (
      msg.startsWith('🚀') ||
      msg.startsWith('⚡') ||
      msg.startsWith('💬') ||
      msg.startsWith('📂') ||
      msg.startsWith('🔧') ||
      msg.startsWith('🔌') ||
      msg.startsWith('🔁')
    )
      return styles.info;
    return '';
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      PENDING: { label: 'PENDING', cls: styles.statusPending },
      RUNNING: { label: 'RUNNING', cls: styles.statusRunning },
      DONE: { label: 'DONE', cls: styles.statusDone },
      FAILED: { label: 'FAILED', cls: styles.statusFailed },
      STOPPED: { label: 'STOPPED', cls: styles.statusFailed },
    };
    const info = map[status] || { label: status, cls: '' };
    return <span className={`${styles.statusBadge} ${info.cls}`}>{info.label}</span>;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;

  // ── Close session menu on outside click / Esc ──
  useEffect(() => {
    if (!menuOpenFor) return;
    const close = () => setMenuOpenFor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenFor(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpenFor]);

  // ── Filter + group sessions for gallery ──
  const q = sessionSearch.trim().toLowerCase();
  const filteredSessions = q
    ? sessions.filter((s) => {
        if (s.title.toLowerCase().includes(q)) return true;
        return s.tasks.some(
          (t) =>
            t.prompt.toLowerCase().includes(q) ||
            (t.response || '').toLowerCase().includes(q)
        );
      })
    : sessions;
  const pinnedSessions = filteredSessions.filter((s) => s.pinned);
  const unpinnedSessions = filteredSessions.filter((s) => !s.pinned);

  const sessionPreview = (s: AgentSession) => {
    const last = s.tasks[s.tasks.length - 1];
    if (!last) return 'Inga meddelanden ännu';
    return (last.response || last.prompt).replace(/\s+/g, ' ').slice(0, 140);
  };

  const openSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    }
  };

  const renderSessionCard = (s: AgentSession) => {
    const taskCount = s.tasks.length;
    const running = s.tasks.some((t) => t.status === 'RUNNING' || t.status === 'PENDING');
    const failed = s.tasks.some((t) => t.status === 'FAILED' || t.status === 'STOPPED');
    return (
      <div
        key={s.id}
        className={styles.sessionCard}
        onClick={() => openSession(s.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSession(s.id);
          }
        }}
      >
        <div className={styles.sessionCardTop}>
          <div className={styles.sessionCardTitle}>
            {s.pinned && <span className={styles.pinIcon}>📌</span>}
            {s.title}
          </div>
          <div className={styles.sessionCardMenuWrap}>
            <button
              className={styles.sessionCardMenuBtn}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenFor(menuOpenFor === s.id ? null : s.id);
              }}
              aria-label="Session-meny"
            >
              ⋯
            </button>
            {menuOpenFor === s.id && (
              <div
                className={styles.sessionCardMenu}
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => handleTogglePin(s)}>
                  {s.pinned ? '📌 Ta bort fästning' : '📍 Fäst session'}
                </button>
                <button onClick={() => handleRename(s)}>✎ Byt namn</button>
                <button
                  onClick={() => handleDelete(s)}
                  className={styles.sessionCardMenuDanger}
                >
                  🗑 Radera
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={styles.sessionCardPreview}>{sessionPreview(s)}</div>
        <div className={styles.sessionCardMeta}>
          <span>{timeAgo(s.updatedAt)}</span>
          <span>·</span>
          <span>
            {taskCount} {taskCount === 1 ? 'meddelande' : 'meddelanden'}
          </span>
          {running && (
            <span className={styles.sessionCardStatusRunning}>● Arbetar</span>
          )}
          {failed && !running && (
            <span className={styles.sessionCardStatusFailed}>● Fel</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Tab Navigation ── */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tab} ${activeTab === 'kanban' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          📋 Ärendehantering
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'agent' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          🤖 Extern AI Agent
        </button>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'kanban' && <KanbanBoard />}

      {activeTab === 'agent' && (
        <>
          {/* ── Agent Info Dashboard ── */}
          <div className={styles.panel}>
            <div className={styles.panelTitleRow}>
              <h2 className={styles.panelTitle}>🤖 Claude Code Agent</h2>
              <div className={`${styles.connectionStatus} ${agentOnline ? styles.online : styles.offline}`}>
                <span className={styles.statusDot} />
                {agentOnline ? 'Agent Online' : 'Agent Offline'}
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-sm)',
            }}>
              <div style={{ background: 'var(--bg-card, #1a1d27)', borderRadius: 'var(--radius-md, 8px)', padding: 'var(--space-sm) var(--space-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modell</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px', color: '#a78bfa' }}>
                  {agentInfo.model || '—'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-card, #1a1d27)', borderRadius: 'var(--radius-md, 8px)', padding: 'var(--space-sm) var(--space-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CLI Version</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px' }}>
                  {agentInfo.cliVersion || '—'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-card, #1a1d27)', borderRadius: 'var(--radius-md, 8px)', padding: 'var(--space-sm) var(--space-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks Utförda</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px' }}>
                  <span style={{ color: '#34d399' }}>{agentInfo.stats?.completed || 0}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> / {agentInfo.stats?.total || 0}</span>
                  {(agentInfo.stats?.failed || 0) > 0 && (
                    <span style={{ color: '#f87171', fontSize: '0.75rem', marginLeft: '6px' }}>
                      ({agentInfo.stats?.failed} failed)
                    </span>
                  )}
                </div>
              </div>
              <div style={{ background: 'var(--bg-card, #1a1d27)', borderRadius: 'var(--radius-md, 8px)', padding: 'var(--space-sm) var(--space-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Success Rate</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px', color: (agentInfo.stats?.successRate || 0) >= 80 ? '#34d399' : (agentInfo.stats?.successRate || 0) >= 50 ? '#fbbf24' : '#f87171' }}>
                  {agentInfo.stats?.successRate || 0}%
                </div>
              </div>
              <div style={{ background: 'var(--bg-card, #1a1d27)', borderRadius: 'var(--radius-md, 8px)', padding: 'var(--space-sm) var(--space-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Senaste Poll</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px' }}>
                  {agentInfo.lastPoll ? timeAgo(agentInfo.lastPoll) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Gallery (shown when no active session) ── */}
          {!activeSession && (
            <div className={styles.panel}>
              <div className={styles.chatHeader}>
                <h2 className={styles.panelTitle}>💬 Sessioner</h2>
                <button className="btn btn-sm btn-primary" onClick={handleNewSession}>
                  + Ny session
                </button>
              </div>

              <div className={styles.sessionSearch}>
                <input
                  type="search"
                  className={styles.sessionSearchInput}
                  placeholder="Sök sessioner (titel, prompt, svar)…"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                />
                <span className={styles.sessionSearchCount}>
                  {filteredSessions.length} / {sessions.length}
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className={styles.chatEmpty}>
                  Inga sessioner ännu. Skriv din första prompt nedan.
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className={styles.chatEmpty}>Inga sessioner matchar sökningen.</div>
              ) : (
                <div className={styles.galleryWrap}>
                  {pinnedSessions.length > 0 && (
                    <>
                      <div className={styles.galleryGroupTitle}>📌 Fästa</div>
                      <div className={styles.sessionGrid}>
                        {pinnedSessions.map((s) => renderSessionCard(s))}
                      </div>
                    </>
                  )}
                  {unpinnedSessions.length > 0 && (
                    <>
                      {pinnedSessions.length > 0 && (
                        <div className={styles.galleryGroupTitle}>Senaste</div>
                      )}
                      <div className={styles.sessionGrid}>
                        {unpinnedSessions.map((s) => renderSessionCard(s))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Quick input for new session */}
              <div className={styles.chatInput}>
                <textarea
                  className={styles.textarea}
                  placeholder='Starta en ny session — t.ex. "Lägg till en knapp på event-sidan som..."'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <div className={styles.actions}>
                  <span className={styles.hint}>⌘+Enter för att skicka · Ny session</span>
                  <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={isSubmitting || !prompt.trim()}
                  >
                    {isSubmitting ? 'Skickar...' : '🚀 Starta session'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Chat Detail (shown when a session is active) ── */}
          {activeSession && (
          <div className={styles.panel}>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderLeft}>
                <button
                  className={styles.backButton}
                  onClick={handleBackToGallery}
                  title="Tillbaka till alla sessioner"
                >
                  ← Alla sessioner
                </button>
                <h2 className={styles.panelTitle} title={activeSession.title}>
                  💬 {activeSession.title}
                </h2>
              </div>
              <div className={styles.chatHeaderActions}>
                <button
                  className={`btn btn-sm btn-ghost ${activeSession.pinned ? styles.pinActive : ''}`}
                  onClick={() => handleTogglePin(activeSession)}
                  title={activeSession.pinned ? 'Ta bort från fästa' : 'Fäst session'}
                >
                  {activeSession.pinned ? '📌 Fäst' : '📍 Fäst'}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRename(activeSession)}
                >
                  ✎ Byt namn
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleDelete(activeSession)}
                >
                  🗑 Radera
                </button>
                <button className="btn btn-sm btn-primary" onClick={handleNewSession}>
                  + Ny
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              className={styles.chatMessages}
              ref={chatMessagesRef}
              onScroll={handleChatScroll}
            >
              {activeSession.tasks.map((task) => (
                <div key={task.id} className={styles.chatTurn}>
                  {/* User bubble */}
                  <div className={styles.userBubble}>
                    <div className={styles.bubbleLabel}>
                      {task.creator?.name || 'Du'} · {timeAgo(task.createdAt)}
                    </div>
                    <div className={styles.bubbleText}>{task.prompt}</div>
                  </div>

                  {/* Assistant bubble */}
                  <div className={styles.assistantBubble}>
                    <div className={styles.bubbleLabel}>
                      <span>🤖 Claude</span>
                      {getStatusBadge(task.status)}
                    </div>
                    {task.response && (
                      <div className={styles.bubbleText}>{task.response}</div>
                    )}
                    {task.error && (
                      <div className={`${styles.bubbleText} ${styles.error}`}>
                        {task.error}
                      </div>
                    )}
                    {!task.response && !task.error && task.status === 'RUNNING' && (
                      <div className={styles.bubbleText} style={{ color: 'var(--text-secondary)' }}>
                        Arbetar...
                      </div>
                    )}

                    {/* Collapsible logs */}
                    <button
                      className={styles.logsToggle}
                      onClick={() => toggleLogs(task.id)}
                    >
                      {expandedLogs[task.id] ? '▼' : '▶'} Logs ({(taskLogs[task.id] || []).length})
                    </button>
                    {expandedLogs[task.id] && (
                      <div className={styles.terminal}>
                        <div className={styles.terminalBody}>
                          {(!taskLogs[task.id] || taskLogs[task.id].length === 0) ? (
                            <div className={styles.terminalEmpty}>
                              {task.status === 'PENDING'
                                ? 'Väntar på agenten...'
                                : task.status === 'RUNNING'
                                  ? 'Streaming...'
                                  : 'Inga logs tillgängliga.'}
                            </div>
                          ) : (
                            taskLogs[task.id].map((log, i) => (
                              <div key={i} className={styles.logLine}>
                                <span className={styles.logTime}>{log.time}</span>
                                <span className={`${styles.logMsg} ${getLogClass(log.message)}`}>
                                  {log.message}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className={styles.chatInput}>
              <textarea
                className={styles.textarea}
                placeholder="Fortsätt konversationen — Claude kommer ihåg tidigare meddelanden i denna session..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className={styles.actions}>
                <span className={styles.hint}>
                  {`⌘+Enter för att skicka · Session ${activeSession.claudeSessionId ? 'aktiv' : 'startar'}`}
                </span>
                <button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={isSubmitting || !prompt.trim()}
                >
                  {isSubmitting ? 'Skickar...' : '📨 Skicka'}
                </button>
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </>
  );
}
