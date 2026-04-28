'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, RefreshCw, X, Send, Bot } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface QuickAction {
  label: string;
  message: string;
}

const PAGE_QUICK_ACTIONS: Record<string, QuickAction[]> = {
  'customer_detail': [
    { label: '📊 Sammanfatta kunden', message: 'Ge mig en sammanfattning av denna kund, deras data och prestationer.' },
    { label: '🎯 Vilka KPI:er sticker ut?', message: 'Vilka KPI:er presterar bäst och sämst för denna kund?' },
    { label: '📈 Föreslå förbättringar', message: 'Baserat på kundens data, vilka förbättringar föreslår du?' },
  ],
  'sources': [
    { label: '❓ Vad är en källa?', message: 'Förklara vad en källa (source) är i plattformen och hur det fungerar.' },
    { label: '📤 Hur laddar man upp data?', message: 'Hur laddar man upp en ny rapport/dataset för en kund?' },
    { label: '🔍 Vilka källor finns?', message: 'Vilka datakällor finns uppsatta i systemet just nu?' },
  ],
  'modules': [
    { label: '🧩 Vad är en modul?', message: 'Förklara vad en modul/KPI-definition är och hur formler fungerar.' },
    { label: '➕ Skapa engagement-modul', message: 'Hjälp mig skapa en modul för Engagement Rate med lämpliga tröskelvärden.' },
    { label: '📋 Lista alla moduler', message: 'Vilka moduler finns uppsatta och vad mäter de?' },
  ],
  'dashboard': [
    { label: '📊 Förklara trenderna', message: 'Förklara de viktigaste trenderna i dashboarden.' },
    { label: '⚡ Vilka insikter sticker ut?', message: 'Vilka insikter är mest intressanta baserat på den aggregerade datan?' },
  ],
  'default': [
    { label: '❓ Vad är The Insiders?', message: 'Vad är The Insiders Insights-plattformen och hur fungerar den?' },
    { label: '🏗️ Hur är allt uppsatt?', message: 'Förklara hur plattformen är uppbyggd — kunder, källor, datasets, moduler.' },
    { label: '📖 Vanliga termer', message: 'Förklara de vanligaste termerna i plattformen: dataset, granularitet, modul, källa.' },
  ],
};

// Simple markdown rendering
function renderMarkdown(text: string) {
  // Split into lines and process
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} style={{ margin: '6px 0', paddingLeft: '20px', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          {listItems.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />)}
        </ul>
      );
      listItems = [];
    }
  };

  const inlineFormat = (s: string) => {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:rgba(0,212,255,0.15);padding:1px 5px;border-radius:4px;font-size:0.75rem">$1</code>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={i} style={{ margin: '10px 0 4px', fontSize: '0.8125rem', fontWeight: 700, color: '#e2e8f0' }} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(4)) }} />);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} style={{ margin: '12px 0 4px', fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(3)) }} />);
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} style={{ margin: '12px 0 4px', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
    } else if (line.match(/^[-*]\s/)) {
      listItems.push(line.replace(/^[-*]\s/, ''));
    } else if (line.trim() === '') {
      flushList();
      // skip blank
    } else {
      flushList();
      elements.push(<p key={i} style={{ margin: '4px 0', fontSize: '0.8125rem', lineHeight: 1.6, color: '#e2e8f0' }} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    }
  }
  flushList();
  return elements;
}


export default function AIAssistant() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Detect context from URL
  const getContext = useCallback((): { customerId: string | null; pageContext: string } => {
    const match = pathname.match(/\/kunder\/([^/]+)/);
    if (match) return { customerId: match[1], pageContext: 'customer_detail' };
    if (pathname.includes('/sources')) return { customerId: null, pageContext: 'sources' };
    if (pathname.includes('/moduler')) return { customerId: null, pageContext: 'modules' };
    if (pathname.includes('/rapporter')) return { customerId: null, pageContext: 'reports' };
    if (pathname.includes('/loggar')) return { customerId: null, pageContext: 'logs' };
    if (pathname.includes('/admin')) return { customerId: null, pageContext: 'admin' };
    return { customerId: null, pageContext: 'home' };
  }, [pathname]);

  // Get quick actions for current page
  const quickActions = PAGE_QUICK_ACTIONS[getContext().pageContext] || PAGE_QUICK_ACTIONS['default'];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const { customerId, pageContext } = getContext();

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          session_id: sessionId,
          customer_id: customerId,
          page_context: pageContext,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!sessionId) setSessionId(data.session_id);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Misslyckades att nå AI-tjänsten. Försök igen om en stund.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // -- Styles --
  const C = {
    bg: '#0c0a10',
    card: 'var(--brand-surface)',
    border: 'rgba(255,255,255,0.06)',
    accent: 'var(--brand-accent)',
    accentGlow: 'rgba(0,212,255,0.4)',
    text: '#e2e8f0',
    dim: 'rgba(255,255,255,0.3)',
  };

  // -- Closed: floating bubble --
  if (!isOpen) {
    return (
      <div id="ai-assistant-root">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Öppna AI-assistent"
          style={{
            position: 'fixed', bottom: '24px', right: '24px',
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand-accent) 0%, #7c3aed 50%, #4f46e5 100%)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 30px ${C.accentGlow}, 0 0 60px rgba(0,212,255,0.15)`,
            zIndex: 100000, transition: 'all 0.3s ease',
            fontSize: '1.5rem', color: '#fff',
            animation: 'ai-pulse 3s ease-in-out infinite',
          }}
          onMouseEnter={e => {
            (e.target as HTMLElement).style.transform = 'scale(1.1)';
            (e.target as HTMLElement).style.boxShadow = `0 6px 40px ${C.accentGlow}`;
          }}
          onMouseLeave={e => {
            (e.target as HTMLElement).style.transform = 'scale(1)';
            (e.target as HTMLElement).style.boxShadow = `0 4px 30px ${C.accentGlow}`;
          }}
        >
          <Sparkles size={24} color="#fff" />
        </button>
        <style>{`
          @keyframes ai-pulse {
            0%, 100% { box-shadow: 0 4px 30px ${C.accentGlow}, 0 0 60px rgba(0,212,255,0.1); }
            50% { box-shadow: 0 4px 30px ${C.accentGlow}, 0 0 80px rgba(0,212,255,0.25); }
          }
        `}</style>
      </div>
    );
  }

  // -- Open: chat panel --
  return (
    <div id="ai-assistant-root">
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        width: '420px', height: '600px',
        borderRadius: '20px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.1)`,
        zIndex: 100000,
        fontFamily: 'var(--font-inter-tight), system-ui, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(79,70,229,0.08) 100%)',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--brand-accent), #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(0,212,255,0.3)',
            }}>
              <Bot size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: C.text }}>Insiders AI</div>
              <div style={{ fontSize: '0.6875rem', color: C.dim }}>
                {getContext().customerId ? '📍 Kundkontext aktiv' : '🌐 Plattformsassistent'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => { setMessages([]); setSessionId(null); }}
              title="Ny konversation"
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.dim, transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              title="Stäng"
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.dim, transition: 'all 0.15s',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '14px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          {messages.length === 0 && (
            <div style={{ padding: '20px 8px', textAlign: 'center' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(124,58,237,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid rgba(0,212,255,0.2)`,
                }}>
                  <Bot size={32} className="brand-text-accent" />
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: C.text, marginBottom: '4px' }}>
                Hej! Jag är Insiders AI
              </div>
              <div style={{ fontSize: '0.8125rem', color: C.dim, lineHeight: 1.5, marginBottom: '20px' }}>
                Jag kan förklara plattformen, analysera kunddata, skapa moduler och svara på alla dina frågor.
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.message)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: `1px solid ${C.border}`,
                      background: 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      color: C.text,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      textAlign: 'left',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLElement).style.background = 'rgba(0,212,255,0.08)';
                      (e.target as HTMLElement).style.borderColor = 'rgba(0,212,255,0.2)';
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                      (e.target as HTMLElement).style.borderColor = C.border;
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: msg.role === 'user' ? '80%' : '92%',
                padding: msg.role === 'user' ? '10px 14px' : '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(124,58,237,0.2))'
                  : 'rgba(255,255,255,0.03)',
                border: msg.role === 'user'
                  ? '1px solid rgba(0,212,255,0.2)'
                  : `1px solid ${C.border}`,
              }}>
                {msg.role === 'assistant' ? (
                  <div>{renderMarkdown(msg.content)}</div>
                ) : (
                  <div style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: C.text }}>
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '12px 18px', borderRadius: '16px 16px 16px 4px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span style={{ animation: 'ai-dot 1.4s ease-in-out infinite', animationDelay: '0s' }}>●</span>
                <span style={{ animation: 'ai-dot 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>●</span>
                <span style={{ animation: 'ai-dot 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>●</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions (when in conversation) */}
        {messages.length > 0 && !isLoading && (
          <div style={{
            padding: '6px 14px',
            display: 'flex', gap: '6px', overflowX: 'auto',
            borderTop: `1px solid ${C.border}`,
          }}>
            {quickActions.slice(0, 3).map((action, i) => (
              <button
                key={i}
                onClick={() => sendMessage(action.message)}
                style={{
                  padding: '5px 10px', borderRadius: '8px',
                  border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', color: C.dim,
                  fontSize: '0.6875rem', whiteSpace: 'nowrap',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 14px',
          borderTop: `1px solid ${C.border}`,
          background: 'rgba(10,10,20,0.6)',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ställ en fråga..."
              rows={1}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`,
                borderRadius: '12px', color: C.text,
                fontSize: '0.8125rem', outline: 'none',
                resize: 'none', fontFamily: 'inherit',
                lineHeight: 1.5, maxHeight: '80px',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = 'rgba(0,212,255,0.3)'}
              onBlur={e => (e.target as HTMLElement).style.borderColor = C.border}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
                background: input.trim()
                  ? 'linear-gradient(135deg, var(--brand-accent), #7c3aed)'
                  : 'rgba(255,255,255,0.05)',
                color: '#fff',
                transition: 'all 0.2s',
                opacity: !input.trim() || isLoading ? 0.4 : 1,
                boxShadow: input.trim() ? '0 2px 12px rgba(0,212,255,0.3)' : 'none',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ai-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
        #ai-assistant-root .ai-dot { font-size: 0.5rem; color: ${C.accent}; }
      `}</style>
    </div>
  );
}
