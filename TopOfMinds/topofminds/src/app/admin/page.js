'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import KanbanBoard from './KanbanBoard';
import SourcesPanel from './SourcesPanel';
import styles from './admin.module.css';

const ROLE_LABELS = { SUPERADMIN: 'Superadmin', ADMIN: 'Admin', CONSULTANT: 'Konsult' };
const ROLE_OPTIONS = ['SUPERADMIN', 'ADMIN', 'CONSULTANT'];

export default function AdminPage() {
  const [tab, setTab] = useState('kanban');

  // Agent state
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentInfo, setAgentInfo] = useState({});
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');

  // Live log state
  const [taskLogs, setTaskLogs] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});

  // Users state
  const [users, setUsers] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('CONSULTANT');
  const [userError, setUserError] = useState(null);
  const [userSaving, setUserSaving] = useState(false);

  // Refs
  const eventSourceRef = useRef(null);
  const streamingTaskIdRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const prevTaskStatusesRef = useRef(null);

  // ── Fetch sessions ──
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agent');
      if (res.ok) setSessions(await res.json());
    } catch {}
  }, []);

  // ── Fetch agent status ──
  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agent/status');
      if (res.ok) {
        const data = await res.json();
        setAgentOnline(data.online);
        setAgentInfo({
          model: data.model,
          lastPoll: data.lastPoll,
          stats: data.stats,
        });
      }
    } catch {
      setAgentOnline(false);
    }
  }, []);

  // ── Fetch users ──
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) setUsers(await res.json());
    } catch {}
  }, []);

  // ── Polling (only when agent tab is active) ──
  useEffect(() => {
    if (tab !== 'agent') return;
    fetchSessions();
    fetchAgentStatus();
    const s1 = setInterval(fetchSessions, 5000);
    const s2 = setInterval(fetchAgentStatus, 10000);
    return () => { clearInterval(s1); clearInterval(s2); };
  }, [tab, fetchSessions, fetchAgentStatus]);

  // ── Load users when users tab is active ──
  useEffect(() => {
    if (tab === 'users') fetchUsers();
  }, [tab, fetchUsers]);

  // ── Notification when task completes ──
  useEffect(() => {
    if (tab !== 'agent' || sessions.length === 0) return;
    const current = new Map();
    for (const s of sessions) for (const t of s.tasks) current.set(t.id, t.status);
    if (!prevTaskStatusesRef.current) { prevTaskStatusesRef.current = current; return; }
    const prev = prevTaskStatusesRef.current;
    for (const [taskId, status] of current) {
      const wasActive = prev.get(taskId) === 'RUNNING' || prev.get(taskId) === 'PENDING';
      if (wasActive && status === 'DONE') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('🤖 Agent klar', { body: 'Uppgiften är färdig!' });
        }
      }
    }
    prevTaskStatusesRef.current = current;
  }, [sessions, tab]);

  // ── Scroll helpers ──
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatMessagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const handleScroll = () => {
    const el = chatMessagesRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  useEffect(() => {
    if (activeSessionId) { stickToBottomRef.current = true; scrollToBottom(); }
  }, [activeSessionId, scrollToBottom]);

  // ── Cleanup SSE ──
  useEffect(() => () => { if (eventSourceRef.current) eventSourceRef.current.close(); }, []);

  // ── Start SSE streaming for a task ──
  const startStreaming = useCallback((taskId) => {
    if (streamingTaskIdRef.current === taskId) return;
    if (eventSourceRef.current) eventSourceRef.current.close();
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
          if (stickToBottomRef.current) scrollToBottom();
        } else if (data.type === 'done') {
          es.close();
          eventSourceRef.current = null;
          streamingTaskIdRef.current = null;
          fetchSessions();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    };
  }, [fetchSessions, scrollToBottom]);

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

  // ── Submit prompt ──
  async function handleSend() {
    if (!prompt.trim() || sending) return;
    setSending(true);
    const text = prompt.trim();
    try {
      const res = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, sessionId: activeSessionId, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Error: ${data.error}`); return; }

      const newTask = data.task;
      const newSession = data.session;

      // Optimistically update sessions
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === newSession.id);
        if (idx >= 0) {
          const updated = { ...prev[idx], updatedAt: new Date().toISOString(), tasks: [...prev[idx].tasks, newTask] };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        }
        return [{ ...newSession, tasks: [newTask] }, ...prev];
      });

      setActiveSessionId(newSession.id);
      setTaskLogs((prev) => ({ ...prev, [newTask.id]: [] }));
      setExpandedLogs((prev) => ({ ...prev, [newTask.id]: true }));
      startStreaming(newTask.id);
      setPrompt('');
      stickToBottomRef.current = true;
      scrollToBottom();
    } catch (err) {
      alert(`Misslyckades: ${err.message || err}`);
    } finally {
      setSending(false);
    }
  }

  // ── Session management ──
  async function deleteSession(id) {
    await fetch(`/api/admin/agent/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) { setActiveSessionId(null); closeSSE(); }
    setMenuOpen(null);
    fetchSessions();
  }

  async function togglePin(id, pinned) {
    await fetch(`/api/admin/agent/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !pinned }),
    });
    fetchSessions();
  }

  function closeSSE() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      streamingTaskIdRef.current = null;
    }
  }

  function handleBackToGallery() {
    setActiveSessionId(null);
    closeSSE();
  }

  function handleNewSession() {
    setActiveSessionId(null);
    setPrompt('');
    closeSSE();
  }

  // ── Helpers ──
  function timeAgo(date) {
    const d = new Date(date);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'Just nu';
    if (diff < 3600) return `${Math.floor(diff / 60)} min sedan`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} tim sedan`;
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  }

  function elapsed(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  async function handleTaskAction(taskId, action) {
    try {
      const res = await fetch('/api/admin/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });
      if (res.ok) fetchSessions();
    } catch (err) {
      console.error('Task action error:', err);
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'PENDING': return styles.statusPending;
      case 'RUNNING': return styles.statusRunning;
      case 'DONE': return styles.statusDone;
      case 'FAILED': return styles.statusFailed;
      default: return '';
    }
  }

  function getLogClass(msg) {
    if (msg.startsWith('❌') || msg.startsWith('⛔') || msg.startsWith('✗') || msg.startsWith('⚠️'))
      return styles.error;
    if (msg.startsWith('✅') || msg.startsWith('✓')) return styles.success;
    if (msg.startsWith('🚀') || msg.startsWith('⚡') || msg.startsWith('💬') ||
        msg.startsWith('📂') || msg.startsWith('🔧') || msg.startsWith('🔌') || msg.startsWith('🔁'))
      return styles.info;
    return '';
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;

  const q = searchQ.trim().toLowerCase();
  const filtered = q
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.tasks?.some((t) => t.prompt.toLowerCase().includes(q) || (t.response || '').toLowerCase().includes(q))
      )
    : sessions;
  const pinned = filtered.filter((s) => s.pinned);
  const recent = filtered.filter((s) => !s.pinned);

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Admin</h1>
        <div className={`${styles.connectionStatus} ${agentOnline ? styles.online : styles.offline}`}>
          <span className={styles.statusDot} />
          {agentOnline ? 'Agent Online' : 'Agent Offline'}
        </div>
      </div>

      <div className={styles.tabNav}>
        <button className={`${styles.tab} ${tab === 'kanban' ? styles.tabActive : ''}`} onClick={() => setTab('kanban')}>
          📋 Kanban
        </button>
        <button className={`${styles.tab} ${tab === 'agent' ? styles.tabActive : ''}`} onClick={() => setTab('agent')}>
          🤖 AI Agent
        </button>
        <button className={`${styles.tab} ${tab === 'users' ? styles.tabActive : ''}`} onClick={() => setTab('users')}>
          👥 Användare
        </button>
        <button className={`${styles.tab} ${tab === 'sources' ? styles.tabActive : ''}`} onClick={() => setTab('sources')}>
          📡 Källor
        </button>
      </div>

      {tab === 'kanban' && <KanbanBoard />}

      {tab === 'sources' && <SourcesPanel />}

      {tab === 'agent' && (
        <>
          {/* ── Agent Info Dashboard ── */}
          <div className={styles.panel}>
            <div className={styles.panelTitleRow}>
              <h2 className={styles.panelTitle}>🤖 Claude Code Agent</h2>
            </div>
            <div className={styles.agentInfoGrid}>
              <div className={styles.agentInfoCard}>
                <div className={styles.agentInfoLabel}>Modell</div>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={styles.modelSelect}
                >
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-opus-4-7">Claude Opus 4.7</option>
                </select>
              </div>
              <div className={styles.agentInfoCard}>
                <div className={styles.agentInfoLabel}>Tasks Utförda</div>
                <div className={styles.agentInfoValue}>
                  <span style={{ color: '#34d399' }}>{agentInfo.stats?.completed || 0}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> / {agentInfo.stats?.total || 0}</span>
                </div>
              </div>
              <div className={styles.agentInfoCard}>
                <div className={styles.agentInfoLabel}>Success Rate</div>
                <div className={styles.agentInfoValue} style={{ color: (agentInfo.stats?.successRate || 0) >= 80 ? '#34d399' : '#fbbf24' }}>
                  {agentInfo.stats?.successRate || 0}%
                </div>
              </div>
              <div className={styles.agentInfoCard}>
                <div className={styles.agentInfoLabel}>Senaste Poll</div>
                <div className={styles.agentInfoValue}>
                  {agentInfo.lastPoll ? timeAgo(agentInfo.lastPoll) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Gallery (no active session) ── */}
          {!activeSession && (
            <div className={styles.panel}>
              <div className={styles.chatHeader}>
                <h2 className={styles.panelTitle}>💬 Sessioner</h2>
                <button className="btn btn-sm btn-primary" onClick={handleNewSession}>+ Ny session</button>
              </div>

              <div className={styles.sessionSearch}>
                <input
                  type="search"
                  className={styles.sessionSearchInput}
                  placeholder="Sök sessioner..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                />
                <span className={styles.sessionSearchCount}>
                  {filtered.length} / {sessions.length}
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className={styles.chatEmpty}>Inga sessioner ännu. Skriv din första prompt nedan.</div>
              ) : filtered.length === 0 ? (
                <div className={styles.chatEmpty}>Inga sessioner matchar sökningen.</div>
              ) : (
                <div className={styles.galleryWrap}>
                  {pinned.length > 0 && (
                    <>
                      <div className={styles.galleryGroupTitle}>📌 Pinnade</div>
                      <div className={styles.sessionGrid}>{pinned.map(renderSessionCard)}</div>
                    </>
                  )}
                  {recent.length > 0 && (
                    <>
                      {pinned.length > 0 && <div className={styles.galleryGroupTitle}>Senaste</div>}
                      <div className={styles.sessionGrid}>{recent.map(renderSessionCard)}</div>
                    </>
                  )}
                </div>
              )}

              {/* Quick input */}
              <div className={styles.chatInput}>
                <textarea
                  className={styles.textarea}
                  placeholder='Starta en ny session — t.ex. "Lägg till en ny API-endpoint som..."'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleSend(); } }}
                  rows={3}
                />
                <div className={styles.actions}>
                  <span className={styles.hint}>⌘+Enter skickar · Ny session</span>
                  <button className="btn btn-primary" onClick={handleSend} disabled={!prompt.trim() || sending}>
                    {sending ? 'Skickar...' : '🚀 Starta session'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Chat Detail (active session) ── */}
          {activeSession && (
            <div className={styles.panel}>
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderLeft}>
                  <button className={styles.backButton} onClick={handleBackToGallery}>← Alla sessioner</button>
                  <h2 className={styles.panelTitle} title={activeSession.title}>💬 {activeSession.title}</h2>
                </div>
                <div className={styles.chatHeaderActions}>
                  <button className="btn btn-sm btn-ghost" onClick={() => togglePin(activeSession.id, activeSession.pinned)}>
                    {activeSession.pinned ? '📌 Fäst' : '📍 Fäst'}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => deleteSession(activeSession.id)}>🗑 Radera</button>
                  <button className="btn btn-sm btn-primary" onClick={handleNewSession}>+ Ny</button>
                </div>
              </div>

              {/* Messages */}
              <div className={styles.chatMessages} ref={chatMessagesRef} onScroll={handleScroll}>
                {activeSession.tasks.map((task) => (
                  <div key={task.id} className={styles.chatTurn}>
                    {/* User bubble */}
                    <div className={styles.userBubble}>
                      <div className={styles.bubbleLabel}>👤 Admin · {timeAgo(task.createdAt)}</div>
                      <div className={styles.bubbleText}>{task.prompt}</div>
                    </div>

                    {/* Assistant bubble */}
                    <div className={styles.assistantBubble}>
                      <div className={styles.bubbleLabel}>
                        🤖 Claude
                        <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>{task.status}</span>
                        {(task.status === 'RUNNING' || task.status === 'PENDING') && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #9ca3af)', marginLeft: 8 }}>
                            ⏱ {elapsed(task.createdAt)}
                          </span>
                        )}
                      </div>
                      {task.response && <div className={styles.bubbleText}>{task.response}</div>}
                      {task.error && <div className={`${styles.bubbleText} ${styles.error}`}>{task.error}</div>}
                      {!task.response && !task.error && task.status === 'RUNNING' && (
                        <div className={styles.bubbleText} style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                          ⚡ Arbetar...
                        </div>
                      )}
                      {!task.response && !task.error && task.status === 'PENDING' && (
                        <div className={styles.bubbleText} style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                          ⏳ Väntar på att agenten ska plocka upp uppgiften...
                        </div>
                      )}
                      {/* Manual controls */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {(task.status === 'RUNNING' || task.status === 'PENDING') && (
                          <button
                            onClick={() => handleTaskAction(task.id, 'stop')}
                            style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer' }}
                          >⏹ Stoppa</button>
                        )}
                        {(task.status === 'FAILED' || task.status === 'STOPPED') && (
                          <button
                            onClick={() => handleTaskAction(task.id, 'retry')}
                            style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', cursor: 'pointer' }}
                          >🔄 Kör om</button>
                        )}
                      </div>

                      {/* Collapsible logs */}
                      <button className={styles.logsToggle} onClick={() => setExpandedLogs((p) => ({ ...p, [task.id]: !p[task.id] }))}>
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
                                  <span className={`${styles.logMsg} ${getLogClass(log.message)}`}>{log.message}</span>
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleSend(); } }}
                  rows={3}
                />
                <div className={styles.actions}>
                  <span className={styles.hint}>⌘+Enter · {activeSession.claudeSessionId ? 'Session aktiv' : 'Ny session startar'}</span>
                  <button className="btn btn-primary" onClick={handleSend} disabled={!prompt.trim() || sending}>
                    {sending ? 'Skickar...' : '📨 Skicka'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'users' && (
        <div className={styles.panel}>
          <div className={styles.chatHeader}>
            <h2 className={styles.panelTitle}>👥 Användare</h2>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowAddUser(true); setUserError(null); }}>
              + Lägg till användare
            </button>
          </div>

          {/* Add user form */}
          {showAddUser && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(99,102,241,0.04)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>E-post *</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="namn@exempel.se"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Namn</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Förnamn Efternamn"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Roll</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
                  >
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!newUserEmail.trim() || userSaving}
                    onClick={async () => {
                      setUserSaving(true);
                      setUserError(null);
                      try {
                        const res = await fetch('/api/admin/users', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: newUserEmail, name: newUserName, role: newUserRole }),
                        });
                        const data = await res.json();
                        if (!res.ok) { setUserError(data.error); return; }
                        setNewUserEmail(''); setNewUserName(''); setNewUserRole('CONSULTANT');
                        setShowAddUser(false);
                        fetchUsers();
                      } catch (e) { setUserError(e.message); } finally { setUserSaving(false); }
                    }}
                  >{userSaving ? 'Sparar...' : '✓ Spara'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddUser(false)}>Avbryt</button>
                </div>
              </div>
              {userError && <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 8 }}>{userError}</p>}
            </div>
          )}

          {/* Users table */}
          <div className="data-table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Användare</th>
                  <th>Roll</th>
                  <th>Status</th>
                  <th>Senast inloggad</th>
                  <th>Skapad</th>
                  <th style={{ width: 120 }}>Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, hsl(220,70%,55%), hsl(260,60%,55%))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#fff' }}>
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={async (e) => {
                          await fetch(`/api/admin/users/${u.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: e.target.value }),
                          });
                          fetchUsers();
                        }}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
                      >
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.isActive ? 'success' : 'neutral'}`}>
                        <span className="badge-dot"></span>
                        {u.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }) : 'Aldrig'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(u.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={async () => {
                            await fetch(`/api/admin/users/${u.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ isActive: !u.isActive }),
                            });
                            fetchUsers();
                          }}
                          title={u.isActive ? 'Inaktivera' : 'Aktivera'}
                        >{u.isActive ? '🔒' : '🔓'}</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#f87171' }}
                          onClick={async () => {
                            if (!confirm(`Ta bort ${u.email}?`)) return;
                            await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                            fetchUsers();
                          }}
                        >🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 40 }}>Inga användare ännu</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  function renderSessionCard(s) {
    const hasRunning = s.tasks?.some((t) => t.status === 'RUNNING' || t.status === 'PENDING');
    const hasFailed = s.tasks?.some((t) => t.status === 'FAILED');
    const lastTask = s.tasks?.[s.tasks.length - 1];
    return (
      <div key={s.id} className={styles.sessionCard} onClick={() => { setActiveSessionId(s.id); setMenuOpen(null); }}>
        <div className={styles.sessionCardTop}>
          <div className={styles.sessionCardTitle}>
            {s.pinned && <span className={styles.pinIcon}>📌</span>}
            {s.title}
          </div>
          <div className={styles.sessionCardMenuWrap} onClick={(e) => e.stopPropagation()}>
            <button className={styles.sessionCardMenuBtn} onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)}>⋯</button>
            {menuOpen === s.id && (
              <div className={styles.sessionCardMenu}>
                <button onClick={() => { togglePin(s.id, s.pinned); setMenuOpen(null); }}>
                  {s.pinned ? '📌 Avpinna' : '📌 Pinna'}
                </button>
                <button className={styles.sessionCardMenuDanger} onClick={() => deleteSession(s.id)}>🗑 Ta bort</button>
              </div>
            )}
          </div>
        </div>
        <div className={styles.sessionCardPreview}>{lastTask?.prompt?.slice(0, 120) || 'Ingen uppgift'}</div>
        <div className={styles.sessionCardMeta}>
          <span>{timeAgo(s.updatedAt)}</span>
          <span>·</span>
          <span>{s.tasks?.length || 0} tasks</span>
          {hasRunning && <span className={styles.sessionCardStatusRunning}>● Arbetar</span>}
          {hasFailed && !hasRunning && <span className={styles.sessionCardStatusFailed}>● Fel</span>}
        </div>
      </div>
    );
  }
}
