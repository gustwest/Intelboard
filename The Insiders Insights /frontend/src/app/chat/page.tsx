'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@/components/UserProvider';
import { colorForName } from '@/lib/team';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ChatMsg {
  id: string;
  body: string;
  author: string;
  images: string[];
  attachments: { id: string; name: string; size: number; contentType: string }[];
  createdAt: string;
}

export default function ChatPage() {
  const { currentUser, allUsers } = useUser();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat`);
      if (res.ok) setMessages(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMessages();
    // Poll every 3s for new messages
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !currentUser) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: input, author: currentUser.name }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
        setInput('');
      }
    } catch { /* */ } finally { setSending(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('author', currentUser.name);
      formData.append('body', `📎 ${file.name}`);
      const res = await fetch(`${API_URL}/api/chat/upload`, { method: 'POST', body: formData });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
      }
    } catch { /* */ } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const captureScreenshot = async () => {
    if (!currentUser) return;
    setIsCapturing(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 0.5,
        logging: false,
        ignoreElements: (el) => el.id === 'chat-overlay',
      });
      const dataUrl = canvas.toDataURL('image/png', 0.7);

      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: '📸 Screenshot',
          author: currentUser.name,
          images: [dataUrl],
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
      }
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getUserColor = (name: string) => {
    if (currentUser && name === currentUser.name) return currentUser.color;
    return allUsers.find(u => u.name === name)?.color || colorForName(name);
  };

  // Group messages by date
  const groupedByDate: { date: string; msgs: ChatMsg[] }[] = [];
  messages.forEach(msg => {
    const date = formatDate(msg.createdAt);
    const last = groupedByDate[groupedByDate.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      groupedByDate.push({ date, msgs: [msg] });
    }
  });

  // Session is still loading (middleware guarantees the user is authenticated)
  if (!currentUser) {
    return (
      <div id="chat-overlay" style={{
        minHeight: 'calc(100vh - 56px)',
        background: 'linear-gradient(135deg, #0a0a14 0%, #0f0f1e 50%, #0a0a14 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        Laddar...
      </div>
    );
  }

  return (
    <div id="chat-overlay" style={{
      height: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(135deg, #0a0a14 0%, #0f0f1e 50%, #0a0a14 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Chat header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.25rem' }}>💬</span>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0' }}>Team Chat</span>
          <span style={{
            fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: '999px',
          }}>
            {messages.length} meddelanden
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {allUsers.map(u => (
            <span key={u.name} style={{
              width: '24px', height: '24px', borderRadius: '50%',
              background: u.color, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, color: '#fff',
              opacity: 0.6,
              border: u.name === currentUser.name ? '2px solid #fff' : '2px solid transparent',
            }}>
              {u.name[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.3)' }}>Laddar meddelanden...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>👋</div>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem' }}>
              Inga meddelanden ännu. Skriv det första!
            </p>
          </div>
        ) : (
          groupedByDate.map((group, gi) => (
            <div key={gi}>
              {/* Date separator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                margin: '20px 0 16px',
              }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {group.date}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
              </div>

              {group.msgs.map((msg, i) => {
                const isMe = msg.author === currentUser.name;
                const showAuthor = i === 0 || group.msgs[i - 1]?.author !== msg.author;
                return (
                  <div key={msg.id} style={{
                    display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: showAuthor ? '12px' : '4px',
                  }}>
                    <div style={{ maxWidth: '70%' }}>
                      {/* Author name */}
                      {showAuthor && !isMe && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          marginBottom: '4px', paddingLeft: '4px',
                        }}>
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: getUserColor(msg.author),
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.5625rem', fontWeight: 700, color: '#fff',
                          }}>
                            {msg.author[0]}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: getUserColor(msg.author) }}>
                            {msg.author}
                          </span>
                        </div>
                      )}

                      {/* Bubble */}
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isMe
                          ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(124,58,237,0.2))'
                          : 'rgba(255,255,255,0.05)',
                        border: isMe
                          ? '1px solid rgba(168,85,247,0.2)'
                          : '1px solid rgba(255,255,255,0.04)',
                      }}>
                        {/* Text */}
                        {msg.body && (
                          <div style={{
                            fontSize: '0.875rem', lineHeight: 1.5,
                            color: '#e2e8f0', whiteSpace: 'pre-wrap',
                          }}>
                            {msg.body}
                          </div>
                        )}

                        {/* Images (screenshots) */}
                        {msg.images?.length > 0 && (
                          <div style={{ marginTop: msg.body ? '8px' : 0 }}>
                            {msg.images.map((img, ii) => (
                              <img
                                key={ii}
                                src={img}
                                alt="Screenshot"
                                onClick={() => setLightboxUrl(img)}
                                style={{
                                  maxWidth: '100%', borderRadius: '10px', cursor: 'pointer',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Attachments */}
                        {msg.attachments?.length > 0 && (
                          <div style={{ marginTop: msg.body ? '8px' : 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {msg.attachments.map(att => (
                              <a
                                key={att.id}
                                href={`${API_URL}/api/chat/attachment/${att.id}`}
                                download
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                  padding: '8px 12px', background: 'rgba(0,0,0,0.2)',
                                  borderRadius: '10px', textDecoration: 'none',
                                  border: '1px solid rgba(255,255,255,0.04)',
                                }}
                              >
                                <span style={{ fontSize: '1.125rem' }}>📎</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontWeight: 500 }}>{att.name}</div>
                                  <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)' }}>{formatSize(att.size)}</div>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#a855f7' }}>⬇</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Time */}
                        <div style={{
                          fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)',
                          marginTop: '4px', textAlign: isMe ? 'right' : 'left',
                        }}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '14px 24px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(10,10,20,0.6)',
      }}>
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end',
        }}>
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Bifoga fil"
            style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
          >
            📎
          </button>

          {/* Screenshot */}
          <button
            onClick={captureScreenshot}
            disabled={isCapturing}
            title="Ta screenshot"
            style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)',
              color: isCapturing ? '#a855f7' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
              opacity: isCapturing ? 0.5 : 1,
            }}
          >
            📸
          </button>

          {/* Text input */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Skriv ett meddelande..."
            rows={1}
            style={{
              flex: 1, padding: '9px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px', color: '#e2e8f0',
              fontSize: '0.875rem', outline: 'none',
              resize: 'none', fontFamily: 'inherit',
              lineHeight: 1.4, maxHeight: '120px',
            }}
          />

          {/* Send */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: input.trim() ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(255,255,255,0.05)',
              border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
              opacity: !input.trim() || sending ? 0.4 : 1,
            }}
          >
            ➤
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, cursor: 'zoom-out',
          }}
        >
          <img src={lightboxUrl} alt="Fullstorlek" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  );
}
