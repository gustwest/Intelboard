'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import styles from './chat.module.css';

interface Contact {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastMessage: string;
  avatar: string;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: Date;
  isMine: boolean;
}

export default function ChatPage() {
  const { user, signInAsDemo } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([
    { id: '1', name: 'Community Helper', status: 'online', lastMessage: 'Welcome to Intelboard!', avatar: 'C' },
    { id: '2', name: 'Study Partner', status: 'online', lastMessage: 'Are you joining the study group?', avatar: 'S' },
    { id: '3', name: 'Knowledge Seeker', status: 'offline', lastMessage: 'Thanks for the resources!', avatar: 'K' },
  ]);
  const [activeChat, setActiveChat] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function openChat(contact: Contact) {
    setActiveChat(contact);
    // Demo messages
    setMessages([
      { id: '1', text: `Hey! Welcome to the ${contact.name} chat. How are you?`, senderId: contact.id, senderName: contact.name, timestamp: new Date(Date.now() - 3600000), isMine: false },
      { id: '2', text: 'Thanks! Doing great. Excited to explore the community.', senderId: 'me', senderName: 'Me', timestamp: new Date(Date.now() - 3000000), isMine: true },
      { id: '3', text: 'Have you checked out the quizzes in the Science category? They are really good!', senderId: contact.id, senderName: contact.name, timestamp: new Date(Date.now() - 2400000), isMine: false },
    ]);
  }

  function sendMessage() {
    if (!newMessage.trim()) return;
    const msg: Message = {
      id: Date.now().toString(),
      text: newMessage,
      senderId: 'me',
      senderName: user?.displayName || 'You',
      timestamp: new Date(),
      isMine: true,
    };
    setMessages([...messages, msg]);
    setNewMessage('');

    // Simulate reply
    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        text: "That's interesting! Let me know if you'd like to discuss more about it 😊",
        senderId: activeChat?.id || '',
        senderName: activeChat?.name || '',
        timestamp: new Date(),
        isMine: false,
      };
      setMessages(prev => [...prev, reply]);
    }, 1500);
  }

  if (!user) {
    return (
      <div className="content-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-title">Sign in to Chat</div>
          <div className="empty-state-desc">Connect with other Intelboard members through real-time messaging.</div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {DEMO_USERS.map(u => (
              <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)}>
                {getDemoAvatar(u.uid)} {u.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatContainer}>
      {/* Contact List */}
      <div className={styles.contactList}>
        <div className={styles.contactHeader}>
          <h2 className={styles.contactTitle}>💬 Messages</h2>
        </div>
        <div className={styles.contacts}>
          {contacts.map(contact => (
            <button
              key={contact.id}
              className={`${styles.contactItem} ${activeChat?.id === contact.id ? styles.active : ''}`}
              onClick={() => openChat(contact)}
            >
              <div className={styles.contactAvatar}>
                <span>{contact.avatar}</span>
                <span className={`${styles.statusDot} ${contact.status === 'online' ? styles.online : ''}`}></span>
              </div>
              <div className={styles.contactInfo}>
                <span className={styles.contactName}>{contact.name}</span>
                <span className={styles.contactLastMsg}>{contact.lastMessage}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className={styles.chatWindow}>
        {activeChat ? (
          <>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderUser}>
                <div className={styles.contactAvatar}>
                  <span>{activeChat.avatar}</span>
                  <span className={`${styles.statusDot} ${activeChat.status === 'online' ? styles.online : ''}`}></span>
                </div>
                <div>
                  <span className={styles.chatHeaderName}>{activeChat.name}</span>
                  <span className={styles.chatHeaderStatus}>{activeChat.status}</span>
                </div>
              </div>
            </div>

            <div className={styles.messages}>
              {messages.map(msg => (
                <div key={msg.id} className={`${styles.message} ${msg.isMine ? styles.mine : styles.theirs}`}>
                  <div className={styles.messageBubble}>
                    <p className={styles.messageText}>{msg.text}</p>
                    <span className={styles.messageTime}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.chatInput}>
              <input
                className="input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button className="btn-primary" onClick={sendMessage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className={styles.noChatSelected}>
            <div className={styles.noChatIcon}>💬</div>
            <h3>Select a conversation</h3>
            <p>Choose a contact to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
