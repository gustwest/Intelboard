'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const TOOL_LABELS = {
  list_assignments: 'Hämtar uppdrag',
  get_assignment: 'Läser uppdrag',
  get_matches: 'Läser matchningar',
  list_consultants: 'Hämtar konsulter',
  get_consultant: 'Läser profil',
  update_consultant: 'Uppdaterar konsultprofil',
  update_contract: 'Uppdaterar kontrakt',
  list_clients: 'Hämtar kunder',
  generate_cv: 'Genererar CV',
};

function extractContext(pathname) {
  const assignmentMatch = pathname.match(/\/assignments\/([a-f0-9-]{8,})/);
  const consultantMatch = pathname.match(/\/consultants\/([a-f0-9-]{8,})/);
  const contractMatch = pathname.match(/\/contracts\/([a-f0-9-]{8,})/);
  return {
    page: pathname,
    assignmentId: assignmentMatch?.[1] || null,
    consultantId: consultantMatch?.[1] || null,
    contractId: contractMatch?.[1] || null,
  };
}

function contextLabel(ctx) {
  if (ctx.assignmentId) return 'Kontext: aktivt uppdrag';
  if (ctx.consultantId) return 'Kontext: konsultprofil';
  if (ctx.contractId) return 'Kontext: kontrakt';
  return 'TopOfMinds';
}

function ToolBadge({ call }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: '0.72rem', color: call.done ? '#34d399' : '#fbbf24',
      padding: '2px 8px', borderRadius: 12,
      background: call.done ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)',
      border: `1px solid ${call.done ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)'}`,
      marginBottom: 2,
    }}>
      {call.done ? '✓' : <Spinner size={10} />}
      <span>{call.done ? call.summary : (TOOL_LABELS[call.name] || call.name)}</span>
    </div>
  );
}

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
    </svg>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      {!isUser && msg.toolCalls?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6, maxWidth: '92%' }}>
          {msg.toolCalls.map((t, i) => <ToolBadge key={`${t.name}-${i}`} call={t} />)}
        </div>
      )}

      {(msg.content || msg.streaming) && (
        <div style={{
          maxWidth: '92%',
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser
            ? 'linear-gradient(135deg, hsl(220,70%,48%), hsl(260,60%,48%))'
            : 'rgba(255,255,255,0.06)',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
          fontSize: '0.875rem',
          lineHeight: 1.55,
          color: 'var(--color-text-primary, #f1f5f9)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.error
            ? <span style={{ color: '#f87171' }}>{msg.content}</span>
            : msg.content}
          {msg.streaming && !msg.content && (
            <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>
              <Spinner size={12} />
            </span>
          )}
          {msg.streaming && msg.content && (
            <span style={{ opacity: 0.5, marginLeft: 2 }}>▌</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssistantPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || busy) return;

    const userMsg = { role: 'user', content: text };
    const assistantMsg = { role: 'assistant', content: '', toolCalls: [], streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setBusy(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    const context = extractContext(pathname);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context }),
        signal: abort.signal,
      });

      if (!res.ok) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: `Fel ${res.status}`, error: true, streaming: false }];
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          setMessages((prev) => {
            const last = { ...prev[prev.length - 1] };
            switch (event.type) {
              case 'tool_start':
                last.toolCalls = [...(last.toolCalls || []), { id: event.id, name: event.name, done: false }];
                break;
              case 'tool_done':
                last.toolCalls = (last.toolCalls || []).map((t) =>
                  t.id === event.id ? { ...t, done: true, summary: event.summary } : t
                );
                break;
              case 'text':
                last.content = (last.content || '') + event.content;
                break;
              case 'error':
                last.content = event.message;
                last.error = true;
                last.streaming = false;
                break;
              case 'done':
                last.streaming = false;
                break;
              default:
                return prev;
            }
            return [...prev.slice(0, -1), last];
          });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: err.message, error: true, streaming: false }];
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, messages, pathname]);

  // Listen for document upload events from DocumentUpload component
  useEffect(() => {
    const handler = (e) => {
      setOpen(true);
      const msg = e.detail?.message;
      if (msg) {
        // Small delay to let panel animate open before sending
        setTimeout(() => sendMessage(msg), 200);
      }
    };
    window.addEventListener('assistant:open', handler);
    return () => window.removeEventListener('assistant:open', handler);
  }, [sendMessage]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    if (busy) { abortRef.current?.abort(); setBusy(false); }
    setMessages([]);
  };

  const context = extractContext(pathname);

  const quickPrompts = context.consultantId
    ? [
        'Sammanfatta denna konsults styrkor',
        'Vilka uppdrag passar den här konsulten?',
        'Vad saknas i profilen för att öka matchningar?',
      ]
    : context.contractId
      ? [
          'Sammanfatta detta kontrakt',
          'Är det något ovanligt i kontraktsvillkoren?',
          'Uppdatera kontraktets status',
        ]
      : context.assignmentId
        ? [
            'Vem passar bäst för det här uppdraget och varför?',
            'Vad saknas för en perfekt matchning?',
            'Generera CV för bästa kandidaten',
          ]
        : [
            'Lista alla öppna uppdrag',
            'Vilka konsulter är tillgängliga nu?',
            'Visa uppdrag med deadline denna vecka',
          ];

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <button
        onClick={() => setOpen((v) => !v)}
        title="AI-assistent"
        style={{
          position: 'fixed',
          bottom: 24,
          right: open ? 432 : 24,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '1px solid rgba(99,102,241,0.4)',
          background: open
            ? 'rgba(99,102,241,0.3)'
            : 'linear-gradient(135deg, hsl(220,70%,40%), hsl(260,60%,40%))',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'right 0.28s ease, background 0.2s',
        }}
      >
        {open ? '×' : '✦'}
      </button>

      <div style={{
        position: 'fixed',
        top: 0,
        right: open ? 0 : -420,
        width: 408,
        height: '100dvh',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(14,18,30,0.97)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        boxShadow: open ? '-8px 0 40px rgba(0,0,0,0.5)' : 'none',
        transition: 'right 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary, #f1f5f9)' }}>
              ✦ AI-assistent
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #94a3b8)', marginTop: 1 }}>
              {contextLabel(context)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {messages.length > 0 && (
              <button onClick={clearChat} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: 'var(--color-text-muted, #94a3b8)',
                fontSize: '0.75rem', cursor: 'pointer',
              }}>Rensa</button>
            )}
            <button onClick={() => setOpen(false)} style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: 'var(--color-text-muted, #94a3b8)',
              fontSize: '0.75rem', cursor: 'pointer',
            }}>×</button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {messages.length === 0 ? (
            <div>
              <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.825rem', marginBottom: 16, lineHeight: 1.6 }}>
                Jag kan analysera uppdrag, jämföra kandidater, förklara matchningsresultat och hjälpa dig sätta ihop starka CV:n. Importera ett CV eller kontrakt via 📎-knappen på sidan.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {quickPrompts.map((q) => (
                  <button key={q} onClick={() => sendMessage(q)} style={{
                    textAlign: 'left', padding: '9px 12px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                    color: 'var(--color-text-secondary, #cbd5e1)', fontSize: '0.8rem',
                    cursor: 'pointer', lineHeight: 1.4,
                    transition: 'background 0.15s',
                  }}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            padding: '8px 12px',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Fråga om uppdrag, konsulter eller CV…"
              disabled={busy}
              rows={1}
              style={{
                flex: 1, resize: 'none', border: 'none', background: 'transparent',
                color: 'var(--color-text-primary, #f1f5f9)',
                fontSize: '0.875rem', lineHeight: 1.5, outline: 'none',
                maxHeight: 120, overflowY: 'auto',
                fontFamily: 'inherit',
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || busy}
              style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                border: 'none',
                background: input.trim() && !busy
                  ? 'linear-gradient(135deg, hsl(220,70%,55%), hsl(260,60%,55%))'
                  : 'rgba(255,255,255,0.1)',
                color: '#fff', cursor: input.trim() && !busy ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, transition: 'background 0.15s',
              }}
            >
              {busy ? <Spinner size={14} /> : '↑'}
            </button>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #64748b)', marginTop: 6, textAlign: 'center' }}>
            Enter skickar · Shift+Enter radbrytning
          </div>
        </div>
      </div>
    </>
  );
}
