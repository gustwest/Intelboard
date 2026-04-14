'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { getAIChat, saveAIChat, clearAIChat, AIMessage, getNotes } from '@/lib/communityStore';
import styles from './AskAITab.module.css';

export default function AskAITab({ categoryId, categoryName, wikiContent }: { categoryId: string; categoryName: string; wikiContent: string }) {
  const { user, signInAsDemo } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    setMessages(getAIChat(categoryId, user.uid));
  }, [categoryId, user?.uid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function generateResponse(question: string): string {
    const q = question.toLowerCase();
    const notes = getNotes(categoryId);
    const bestPractices = notes.filter(n => n.tag === 'best-practice').map(n => n.body);
    const tips = notes.filter(n => n.tag === 'tip').map(n => n.body);
    const warnings = notes.filter(n => n.tag === 'warning').map(n => n.body);

    // Build contextual response from available content
    let response = '';

    if (q.includes('best practice') || q.includes('recommend') || q.includes('should')) {
      if (bestPractices.length > 0) {
        response = `Based on community best practices for **${categoryName}**:\n\n`;
        bestPractices.slice(0, 3).forEach((bp, i) => {
          response += `${i + 1}. ${bp}\n\n`;
        });
      } else {
        response = `There are no community best practices noted for ${categoryName} yet. Here's what I know from the knowledge base:\n\n`;
        response += wikiContent ? wikiContent.slice(0, 500) + '...' : `${categoryName} is a broad topic. Try contributing the first best practice note!`;
      }
    } else if (q.includes('tip') || q.includes('advice') || q.includes('help')) {
      if (tips.length > 0) {
        response = `Here are community tips for **${categoryName}**:\n\n`;
        tips.slice(0, 3).forEach((t, i) => {
          response += `💡 ${i + 1}. ${t}\n\n`;
        });
      } else {
        response = `No community tips have been shared yet for ${categoryName}. `;
        response += wikiContent ? `Here's a summary from the knowledge base:\n\n${wikiContent.slice(0, 400)}...` : 'Be the first to add a tip in the Notes tab!';
      }
    } else if (q.includes('warning') || q.includes('avoid') || q.includes('careful') || q.includes('danger')) {
      if (warnings.length > 0) {
        response = `⚠️ Community warnings for **${categoryName}**:\n\n`;
        warnings.slice(0, 3).forEach((w, i) => {
          response += `${i + 1}. ${w}\n\n`;
        });
      } else {
        response = `No warnings have been reported by the community for ${categoryName}. This is generally a good sign!`;
      }
    } else if (q.includes('what is') || q.includes('explain') || q.includes('tell me about') || q.includes('overview')) {
      response = wikiContent
        ? `**${categoryName}** — Here's what the knowledge base says:\n\n${wikiContent.slice(0, 600)}...\n\nFor the full article, check the Overview tab.`
        : `**${categoryName}** is a category in the Intelboard knowledge base. Fetch the Wikipedia content from the Overview tab to get detailed information!`;
    } else if (q.includes('who') || q.includes('expert') || q.includes('mentor')) {
      response = `Check the **Experts** tab to find community members who are experts or learners in ${categoryName}. You can also set your own expertise level there!`;
    } else {
      // Generic contextual response
      const notesCount = notes.length;
      response = `Great question about **${categoryName}**! `;
      if (wikiContent) {
        response += `Based on the knowledge base:\n\n${wikiContent.slice(0, 400)}...\n\n`;
      }
      if (notesCount > 0) {
        response += `The community has shared ${notesCount} note${notesCount > 1 ? 's' : ''} — check the Notes tab for insights from practitioners.`;
      } else {
        response += `No community notes have been shared yet. You could be the first to contribute!`;
      }
    }

    return response;
  }

  function handleSend() {
    if (!user || !input.trim()) return;

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setThinking(true);

    // Simulate AI thinking delay
    setTimeout(() => {
      const response = generateResponse(userMsg.content);
      const aiMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      const final = [...updatedMessages, aiMsg];
      setMessages(final);
      saveAIChat(categoryId, user.uid, final);
      setThinking(false);
    }, 800 + Math.random() * 700);
  }

  function handleClear() {
    if (!user) return;
    clearAIChat(categoryId, user.uid);
    setMessages([]);
  }

  if (!user) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🤖</div>
        <div className="empty-state-title">Sign in to ask questions</div>
        <div className="empty-state-desc">Get AI-powered answers about {categoryName}</div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
          {DEMO_USERS.map(u => (
            <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
              {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>🤖 Ask AI about {categoryName}</h2>
          <p className={styles.subtitle}>Questions are answered using Wikipedia content and community notes</p>
        </div>
        {messages.length > 0 && (
          <button className="btn-ghost" onClick={handleClear} style={{ fontSize: 'var(--text-xs)' }}>
            🗑️ Clear chat
          </button>
        )}
      </div>

      <div className={styles.chatArea}>
        {messages.length === 0 && (
          <div className={styles.welcomeMessage}>
            <div className={styles.welcomeIcon}>🤖</div>
            <p>Hi! I can answer questions about <strong>{categoryName}</strong>. Try asking:</p>
            <div className={styles.suggestions}>
              {[
                `What is ${categoryName}?`,
                `Best practices for ${categoryName}?`,
                `Any tips for learning about ${categoryName}?`,
                `Who are the experts?`,
              ].map((q, i) => (
                <button key={i} className={styles.suggestion} onClick={() => { setInput(q); }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
            <div className={styles.msgAvatar}>
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className={styles.msgContent}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              <span className={styles.msgTime}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {thinking && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.msgAvatar}>🤖</div>
            <div className={styles.msgContent}>
              <div className={styles.thinking}>
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className={styles.inputArea}>
        <input
          className="input"
          placeholder={`Ask about ${categoryName}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button className="btn-primary" onClick={handleSend} disabled={!input.trim() || thinking}>
          Send
        </button>
      </div>
    </div>
  );
}
