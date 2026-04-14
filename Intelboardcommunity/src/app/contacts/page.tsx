'use client';

import React, { useState } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import styles from './contacts.module.css';

interface UserContact {
  id: string;
  name: string;
  email: string;
  status: 'online' | 'offline';
  avatar: string;
}

export default function ContactsPage() {
  const { user, signInAsDemo } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<UserContact[]>([
    { id: '1', name: 'Community Helper', email: 'helper@intelboard.com', status: 'online', avatar: 'C' },
    { id: '2', name: 'Study Partner', email: 'study@intelboard.com', status: 'online', avatar: 'S' },
    { id: '3', name: 'Knowledge Seeker', email: 'seeker@intelboard.com', status: 'offline', avatar: 'K' },
    { id: '4', name: 'Research Expert', email: 'expert@intelboard.com', status: 'offline', avatar: 'R' },
  ]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    // In production, this would send an invitation
    alert(`Invitation sent to ${inviteEmail}!`);
    setInviteEmail('');
    setShowInvite(false);
  }

  function handleRemoveContact(id: string) {
    setContacts(contacts.filter(c => c.id !== id));
  }

  if (!user) {
    return (
      <div className="content-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">Sign in to View Contacts</div>
          <div className="empty-state-desc">Manage your Intelboard contacts and invite others to join.</div>
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
    <div className="content-wrapper">
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>👥 Contacts</h1>
          <p className={styles.pageDesc}>Manage your connections and invite others to Intelboard</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite(true)}>+ Invite User</button>
      </div>

      <div className={styles.searchBar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className={styles.searchInput}
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{contacts.length}</span>
          <span className={styles.statLabel}>Total Contacts</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{contacts.filter(c => c.status === 'online').length}</span>
          <span className={styles.statLabel}>Online Now</span>
        </div>
      </div>

      <div className={styles.contactGrid}>
        {filteredContacts.map(contact => (
          <div key={contact.id} className={`${styles.contactCard} glass-card`}>
            <div className={styles.contactTop}>
              <div className={styles.avatar}>
                <span>{contact.avatar}</span>
                <span className={`${styles.statusDot} ${contact.status === 'online' ? styles.online : ''}`}></span>
              </div>
              <div className={styles.contactInfo}>
                <h3 className={styles.contactName}>{contact.name}</h3>
                <p className={styles.contactEmail}>{contact.email}</p>
                <span className={`${styles.statusBadge} ${contact.status === 'online' ? styles.onlineBadge : ''}`}>
                  {contact.status}
                </span>
              </div>
            </div>
            <div className={styles.contactActions}>
              <a href="/chat" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                💬 Chat
              </a>
              <button className="btn-ghost" onClick={() => handleRemoveContact(contact.id)} title="Remove contact">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredContacts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No contacts found</div>
          <div className="empty-state-desc">Try a different search term or invite new users.</div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '0.5rem' }}>Invite User</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: '1.5rem' }}>
              Send an invitation to join Intelboard Community
            </p>
            <input
              className="input"
              placeholder="Enter email address"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleInvite}>Send Invitation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
