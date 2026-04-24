'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from './UserProvider';
import { colorForName } from '@/lib/team';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '🎉'];

interface Attachment {
  id: string; name: string; size: number; contentType: string;
}
interface Reaction {
  emoji: string; user: string;
}
interface Msg {
  id: string; body: string; author: string;
  images: string[]; attachments: Attachment[];
  reactions: Reaction[]; createdAt: string;
}
interface Convo {
  id: string; name: string; members: string[];
  emoji: string; messages: Msg[];
  createdAt: string; updatedAt: string;
}

type View = 'closed' | 'list' | 'chat' | 'create';

export default function ChatWidget() {
  const { currentUser, allUsers, sessionStatus } = useUser();
  const [view, setView] = useState<View>('closed');
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeConvo, setActiveConvo] = useState<Convo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [lastSeenLoaded, setLastSeenLoaded] = useState(false);
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Create group form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('💬');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevConvoLastMsgRef = useRef<Record<string, string>>({});
  const notifiedMsgIdsRef = useRef<Set<string>>(new Set());

  // Fetch conversations — only replace state if the summary actually changed,
  // otherwise every 10s poll would churn downstream effects & renders.
  const convoSigRef = useRef<string>('');
  const fetchConvos = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`);
      if (!res.ok) return;
      const data: Convo[] = await res.json();
      const sig = data.map(c => `${c.id}:${c.updatedAt}:${(c.messages || []).length}`).join('|');
      if (sig === convoSigRef.current) return;
      convoSigRef.current = sig;
      setConvos(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchConvos();
    const interval = setInterval(fetchConvos, 10000); // light refresh for convo list
    return () => clearInterval(interval);
  }, [fetchConvos]);

  // Load lastSeen from localStorage when user changes
  useEffect(() => {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(`chat:lastSeen:${currentUser.name}`);
      if (raw) setLastSeen(JSON.parse(raw));
    } catch { /* */ }
    setLastSeenLoaded(true);
  }, [currentUser?.name]);

  // Persist lastSeen on change
  useEffect(() => {
    if (!currentUser || !lastSeenLoaded) return;
    try {
      localStorage.setItem(`chat:lastSeen:${currentUser.name}`, JSON.stringify(lastSeen));
    } catch { /* */ }
  }, [lastSeen, currentUser?.name, lastSeenLoaded]);

  // Initialize lastSeen for convos we haven't seen before (so existing history isn't flagged unread)
  useEffect(() => {
    if (!currentUser || !lastSeenLoaded || convos.length === 0) return;
    setLastSeen(prev => {
      const next = { ...prev };
      let changed = false;
      for (const c of convos) {
        if (!next[c.id]) {
          const msgs = c.messages || [];
          const last = msgs[msgs.length - 1];
          next[c.id] = last?.createdAt || new Date(0).toISOString();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [convos, currentUser?.name, lastSeenLoaded]);

  // Play a short ding via Web Audio (no external asset needed)
  const playDing = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* */ }
  }, []);

  // Detect new messages across all convos → ding + browser notification
  useEffect(() => {
    if (!currentUser) return;
    const prev = prevConvoLastMsgRef.current;
    const next: Record<string, string> = {};

    for (const c of convos) {
      const msgs = c.messages || [];
      const last = msgs[msgs.length - 1];
      if (!last) continue;
      next[c.id] = last.createdAt;

      const isNewSincePrev = prev[c.id] !== undefined && last.createdAt !== prev[c.id];
      const isMine = last.author === currentUser.name;
      const isActivelyViewing = activeConvo?.id === c.id && view === 'chat';
      const alreadyNotified = notifiedMsgIdsRef.current.has(last.id);

      if (isNewSincePrev && !isMine && !isActivelyViewing && !alreadyNotified) {
        notifiedMsgIdsRef.current.add(last.id);
        playDing();
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const n = new Notification(`${last.author} · ${c.name}`, {
              body: last.body || '📎 Bilaga',
              icon: '/favicon.ico',
              silent: true,
              tag: `chat:${c.id}`,
            });
            n.onclick = () => { window.focus(); };
          }
        } catch { /* */ }
      }
    }
    prevConvoLastMsgRef.current = next;
  }, [convos, currentUser?.name, activeConvo?.id, view, playDing]);

  // WebSocket per active conversation
  useEffect(() => {
    if (!activeConvo) return;

    const ws = new WebSocket(`${WS_URL}/ws/chat/${activeConvo.id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        setMessages(prev => [...prev, data.message]);
        if (activeConvo) {
          setLastSeen(prev => ({ ...prev, [activeConvo.id]: data.message.createdAt }));
        }
      } else if (data.type === 'reaction') {
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        ));
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => { ws.close(); wsRef.current = null; };
  }, [activeConvo?.id]);

  // Scroll to bottom only when a new message is appended (not on unrelated re-renders).
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  // Open conversation
  const openConvo = async (convo: Convo) => {
    setActiveConvo(convo);
    setView('chat');
    setLastSeen(prev => ({ ...prev, [convo.id]: new Date().toISOString() }));
    try {
      const res = await fetch(`${API_URL}/api/conversations/${convo.id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch { /* */ }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || !currentUser || !activeConvo) return;
    setSending(true);
    try {
      await fetch(`${API_URL}/api/conversations/${activeConvo.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: input, author: currentUser.name }),
      });
      setInput('');
    } catch { /* */ } finally { setSending(false); }
  };

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !activeConvo) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('author', currentUser.name);
      formData.append('body', `📎 ${file.name}`);
      await fetch(`${API_URL}/api/conversations/${activeConvo.id}/upload`, {
        method: 'POST', body: formData,
      });
    } catch { /* */ } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Screenshot capture
  const captureScreenshot = async () => {
    if (!currentUser || !activeConvo) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true, scale: 0.5, logging: false,
        ignoreElements: (el) => el.id === 'chat-widget-root',
      });
      const dataUrl = canvas.toDataURL('image/png', 0.7);
      await fetch(`${API_URL}/api/conversations/${activeConvo.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: '📸 Screenshot',
          author: currentUser.name,
          images: [dataUrl],
        }),
      });
    } catch (err) { console.error('Screenshot failed:', err); }
  };

  // Toggle reaction
  const toggleReaction = async (msgId: string, emoji: string) => {
    if (!currentUser || !activeConvo) return;
    try {
      await fetch(`${API_URL}/api/conversations/${activeConvo.id}/messages/${msgId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, user: currentUser.name }),
      });
      setReactingMsgId(null);
    } catch { /* */ }
  };

  // Create conversation
  const createConvo = async () => {
    if (!newGroupName.trim() || newGroupMembers.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          members: newGroupMembers,
          emoji: newGroupEmoji,
        }),
      });
      if (res.ok) {
        const convo = await res.json();
        setConvos(prev => [convo, ...prev]);
        setNewGroupName('');
        setNewGroupEmoji('💬');
        setNewGroupMembers([]);
        openConvo(convo);
      }
    } catch { /* */ }
  };

  // Helpers
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const getUserColor = (name: string) => {
    if (currentUser && name === currentUser.name) return currentUser.color;
    return allUsers.find(u => u.name === name)?.color || colorForName(name);
  };

  const lastMsg = (convo: Convo) => {
    const msgs = convo.messages || [];
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  };

  // Unread computation
  const unreadByConvo: Record<string, number> = {};
  if (currentUser && lastSeenLoaded) {
    for (const c of convos) {
      const since = lastSeen[c.id];
      let count = 0;
      for (const m of (c.messages || [])) {
        if (m.author === currentUser.name) continue;
        if (!since || m.createdAt > since) count++;
      }
      unreadByConvo[c.id] = count;
    }
  }
  const totalUnread = Object.values(unreadByConvo).reduce((a, b) => a + b, 0);

  if (sessionStatus === 'unauthenticated') return null;

  // === FLOATING BUBBLE ===
  if (view === 'closed') {
    return (
      <div id="chat-widget-root">
        <button
          onClick={() => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
              Notification.requestPermission().catch(() => {});
            }
            setView('list');
          }}
          style={{
            position: 'fixed', bottom: '88px', left: '24px',
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #b14ef4, #9500b3)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 24px rgba(177,78,244,0.4)',
            zIndex: 100000, transition: 'all 0.2s',
            fontSize: '1.375rem', color: '#fff',
          }}
        >
          💬
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px',
              background: '#ef4444', fontSize: '0.6875rem',
              fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #151218',
            }}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      </div>
    );
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed', bottom: '24px', left: '24px',
    width: '380px', height: '540px',
    borderRadius: '20px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: '#151218',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
    zIndex: 100000,
    fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  };

  // === CONVERSATION LIST ===
  if (view === 'list') {
    return (
      <div id="chat-widget-root" style={panelStyle}>
        {/* Header */}
        <div style={{
          padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,10,20,0.95)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.125rem' }}>💬</span>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0' }}>Meddelanden</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setView('create')} title="Ny grupp" style={iconBtnStyle}>✏️</button>
            <button onClick={() => setView('closed')} title="Stäng" style={iconBtnStyle}>✕</button>
          </div>
        </div>

        {/* Conversations */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convos.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💬</div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', margin: 0 }}>Inga konversationer ännu.</p>
              <button
                onClick={() => setView('create')}
                style={{
                  marginTop: '16px', padding: '10px 20px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #b14ef4, #9500b3)',
                  border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                + Skapa ny grupp
              </button>
            </div>
          ) : (
            convos.map(convo => {
              const last = lastMsg(convo);
              return (
                <button
                  key={convo.id}
                  onClick={() => openConvo(convo)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                    padding: '12px 18px', border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    textAlign: 'left', transition: 'background 0.15s',
                    color: '#e2e8f0',
                  }}
                >
                  <span style={{
                    width: '42px', height: '42px', borderRadius: '50%',
                    background: 'rgba(177,78,244,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.25rem', flexShrink: 0,
                  }}>
                    {convo.emoji}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: unreadByConvo[convo.id] > 0 ? 700 : 600,
                      fontSize: '0.875rem',
                      color: unreadByConvo[convo.id] > 0 ? '#fff' : '#e2e8f0',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {convo.name}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: unreadByConvo[convo.id] > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
                      fontWeight: unreadByConvo[convo.id] > 0 ? 600 : 400,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px',
                    }}>
                      {last ? `${last.author}: ${last.body}` : 'Ingen meddelande ännu'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)' }}>
                      {last ? formatTime(last.createdAt) : ''}
                    </div>
                    {unreadByConvo[convo.id] > 0 && (
                      <span style={{
                        minWidth: '18px', height: '18px', padding: '0 6px',
                        borderRadius: '9px', background: '#ef4444',
                        fontSize: '0.625rem', fontWeight: 700, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {unreadByConvo[convo.id] > 99 ? '99+' : unreadByConvo[convo.id]}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // === CREATE GROUP VIEW ===
  if (view === 'create') {
    const groupEmojis = ['💬', '🚀', '🔥', '💡', '🎯', '⚡', '🏢', '📊', '🤝', '🎨', '🧠', '💎'];
    return (
      <div id="chat-widget-root" style={panelStyle}>
        <div style={{
          padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,10,20,0.95)',
        }}>
          <button onClick={() => setView('list')} style={{ ...iconBtnStyle, fontSize: '0.875rem' }}>←</button>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0' }}>Ny gruppchatt</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px' }}>
          {/* Emoji picker */}
          <label style={labelStyle}>Välj emoji</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
            {groupEmojis.map(e => (
              <button
                key={e}
                onClick={() => setNewGroupEmoji(e)}
                style={{
                  width: '40px', height: '40px', borderRadius: '10px', fontSize: '1.125rem',
                  border: newGroupEmoji === e ? '2px solid #b14ef4' : '1px solid rgba(255,255,255,0.06)',
                  background: newGroupEmoji === e ? 'rgba(177,78,244,0.15)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Group name */}
          <label style={labelStyle}>Gruppnamn</label>
          <input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="t.ex. Sales Strategy"
            style={inputStyle}
          />

          {/* Members */}
          <label style={{ ...labelStyle, marginTop: '20px' }}>Medlemmar</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {allUsers.map(u => {
              const selected = newGroupMembers.includes(u.name);
              return (
                <button
                  key={u.name}
                  onClick={() => {
                    setNewGroupMembers(prev =>
                      selected ? prev.filter(n => n !== u.name) : [...prev, u.name]
                    );
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', borderRadius: '12px',
                    border: selected ? '1px solid rgba(177,78,244,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    background: selected ? 'rgba(177,78,244,0.12)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', color: '#e2e8f0', fontSize: '0.8125rem',
                    width: '100%', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: '28px', height: '28px', borderRadius: '50%', background: u.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6875rem', fontWeight: 700, color: '#fff',
                  }}>
                    {u.name[0]}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{u.name}</span>
                  {selected && <span style={{ color: '#b14ef4' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Create button */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={createConvo}
            disabled={!newGroupName.trim() || newGroupMembers.length === 0}
            style={{
              width: '100%', padding: '12px', borderRadius: '12px',
              background: newGroupName.trim() && newGroupMembers.length > 0
                ? 'linear-gradient(135deg, #b14ef4, #9500b3)' : 'rgba(255,255,255,0.05)',
              border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.875rem',
              cursor: 'pointer', transition: 'all 0.15s',
              opacity: !newGroupName.trim() || newGroupMembers.length === 0 ? 0.4 : 1,
            }}
          >
            Skapa grupp
          </button>
        </div>
      </div>
    );
  }

  // === ACTIVE CHAT VIEW ===
  return (
    <div id="chat-widget-root" style={panelStyle}>
      {/* Chat header */}
      <div style={{
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,20,0.95)',
      }}>
        <button onClick={() => { setView('list'); setActiveConvo(null); }} style={{ ...iconBtnStyle, fontSize: '0.875rem' }}>←</button>
        <span style={{ fontSize: '1.125rem' }}>{activeConvo?.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#e2e8f0' }}>{activeConvo?.name}</div>
          <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)' }}>
            {activeConvo?.members.join(', ')}
          </div>
        </div>
        <button onClick={() => setView('closed')} style={iconBtnStyle}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(255,255,255,0.25)', fontSize: '0.8125rem' }}>
            👋 Skriv det första meddelandet!
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = !!currentUser && msg.author === currentUser.name;
            const showAuthor = i === 0 || messages[i - 1]?.author !== msg.author;
            return (
              <div key={msg.id} style={{ marginBottom: showAuthor ? '10px' : '3px' }}>
                {/* Author label */}
                {showAuthor && !isMe && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', paddingLeft: '2px' }}>
                    <span style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: getUserColor(msg.author),
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.5rem', fontWeight: 700, color: '#fff',
                    }}>
                      {msg.author[0]}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: getUserColor(msg.author) }}>{msg.author}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{ maxWidth: '80%', position: 'relative' }}
                    onDoubleClick={() => setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)}
                  >
                    {/* Bubble */}
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isMe
                        ? 'linear-gradient(135deg, rgba(177,78,244,0.25), rgba(124,58,237,0.2))'
                        : 'rgba(255,255,255,0.05)',
                      border: isMe ? '1px solid rgba(177,78,244,0.2)' : '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {msg.body && (
                        <div style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                          {msg.body}
                        </div>
                      )}
                      {msg.images?.length > 0 && msg.images.map((img, ii) => (
                        <img key={ii} src={img} alt="Screenshot" onClick={() => setLightboxUrl(img)}
                          style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer', marginTop: msg.body ? '6px' : 0,
                            border: '1px solid rgba(255,255,255,0.06)' }}
                        />
                      ))}
                      {msg.attachments?.length > 0 && msg.attachments.map(att => (
                        <a key={att.id} href={`${API_URL}/api/conversations/attachment/${att.id}`} download
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 10px', background: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px', textDecoration: 'none',
                            border: '1px solid rgba(255,255,255,0.04)', marginTop: '4px',
                          }}>
                          <span>📎</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', color: '#e2e8f0' }}>{att.name}</div>
                            <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)' }}>{formatSize(att.size)}</div>
                          </div>
                        </a>
                      ))}
                      <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.2)', marginTop: '3px', textAlign: isMe ? 'right' : 'left' }}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>

                    {/* Reactions display */}
                    {msg.reactions?.length > 0 && (
                      <div style={{
                        display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'wrap',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                      }}>
                        {groupReactions(msg.reactions).map(({ emoji, count, users }) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            title={users.join(', ')}
                            style={{
                              padding: '2px 6px', borderRadius: '10px', fontSize: '0.6875rem',
                              border: currentUser && users.includes(currentUser.name)
                                ? '1px solid rgba(177,78,244,0.4)' : '1px solid rgba(255,255,255,0.08)',
                              background: currentUser && users.includes(currentUser.name)
                                ? 'rgba(177,78,244,0.15)' : 'rgba(255,255,255,0.04)',
                              cursor: 'pointer', color: '#e2e8f0',
                              display: 'flex', alignItems: 'center', gap: '3px',
                            }}
                          >
                            {emoji} <span style={{ fontSize: '0.5625rem' }}>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Reaction picker */}
                    {reactingMsgId === msg.id && (
                      <div style={{
                        position: 'absolute', bottom: msg.reactions?.length > 0 ? '24px' : '0',
                        [isMe ? 'right' : 'left']: 0,
                        display: 'flex', gap: '2px', padding: '4px 6px',
                        background: '#1f1b22', borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        zIndex: 10,
                      }}>
                        {REACTION_EMOJIS.map(e => (
                          <button
                            key={e}
                            onClick={() => toggleReaction(msg.id, e)}
                            style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              border: 'none', background: 'transparent',
                              cursor: 'pointer', fontSize: '0.875rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'transform 0.1s',
                            }}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,20,0.6)',
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} title="Bifoga fil" style={actionBtnStyle}>📎</button>
          <button onClick={captureScreenshot} title="Screenshot" style={actionBtnStyle}>📸</button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Skriv..."
            rows={1}
            style={{
              flex: 1, padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '10px', color: '#e2e8f0',
              fontSize: '0.8125rem', outline: 'none',
              resize: 'none', fontFamily: 'inherit',
              lineHeight: 1.4, maxHeight: '80px',
            }}
          />

          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            style={{
              ...actionBtnStyle,
              background: input.trim() ? 'linear-gradient(135deg, #b14ef4, #9500b3)' : 'rgba(255,255,255,0.05)',
              opacity: !input.trim() || sending ? 0.4 : 1,
            }}
          >
            ➤
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, cursor: 'zoom-out',
        }}>
          <img src={lightboxUrl} alt="Full" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  );
}

// --- Helpers ---
function groupReactions(reactions: Reaction[]): { emoji: string; count: number; users: string[] }[] {
  const map: Record<string, string[]> = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user);
  }
  return Object.entries(map).map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

const iconBtnStyle: React.CSSProperties = {
  width: '30px', height: '30px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const actionBtnStyle: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, transition: 'all 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.6875rem', fontWeight: 600,
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  color: '#e2e8f0', fontSize: '0.875rem',
  outline: 'none', fontFamily: 'inherit',
};
