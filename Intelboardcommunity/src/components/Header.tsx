'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import { searchCategories, SearchResult } from '@/lib/search';
import styles from './Header.module.css';

export default function Header({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, signInWithGoogle, signInWithEmail, signInAsDemo, signOut, authError } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setShowLoginPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length > 1) {
      const results = searchCategories(q);
      setSearchResults(results.slice(0, 8));
      setShowResults(true);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    await signInWithEmail(loginEmail, loginPassword);
    setLoginLoading(false);
    // If no error, panel will auto-close because user state changes
  }

  function handleDemoLogin(uid: string) {
    signInAsDemo(uid);
    setShowLoginPanel(false);
  }

  // Get user initial for avatar
  function getUserInitial(): string {
    if (!user) return '?';
    if (user.isDemo) return getDemoAvatar(user.uid);
    return user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?';
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>⚡</span>
          <span className={styles.logoText}>Intelboard</span>
        </Link>
      </div>

      <div className={styles.center} ref={searchRef}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search categories, topics, discussions..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery.length > 1 && setShowResults(true)}
          />
          {searchQuery && (
            <button className={styles.clearBtn} onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); }}>
              ✕
            </button>
          )}
        </div>
        {showResults && searchResults.length > 0 && (
          <div className={styles.searchDropdown}>
            {searchResults.map((result) => (
              <Link
                key={result.id}
                href={`/category/${result.slug}`}
                className={styles.searchResult}
                onClick={() => { setShowResults(false); setSearchQuery(''); }}
              >
                <span className={styles.resultIcon}>{result.icon}</span>
                <div className={styles.resultInfo}>
                  <span className={styles.resultTitle}>{result.title}</span>
                  <span className={styles.resultDesc}>{result.description}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className={styles.right}>
        <Link href="/my-board" className={styles.iconBtn} title="My Board">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </Link>
        <Link href="/chat" className={styles.iconBtn} title="Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </Link>
        <Link href="/contacts" className={styles.iconBtn} title="Contacts">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </Link>

        {user ? (
          <div className={styles.userSection} ref={userMenuRef}>
            <button className={styles.avatarBtn} onClick={() => setShowUserMenu(!showUserMenu)}>
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className={styles.avatar} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <span>{getUserInitial()}</span>
                </div>
              )}
            </button>
            {showUserMenu && (
              <div className={styles.userMenu}>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{user.displayName}</span>
                  <span className={styles.userEmail}>{user.email}</span>
                  {user.isDemo && <span className={styles.demoBadge}>Demo User</span>}
                </div>
                <hr className={styles.divider} />
                <button className={styles.menuItem} onClick={signOut}>Sign Out</button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.loginSection} ref={loginRef}>
            <button className="btn-primary" onClick={() => setShowLoginPanel(!showLoginPanel)}>
              Sign In
            </button>

            {showLoginPanel && (
              <div className={styles.loginPanel}>
                {/* Quick Login Section */}
                <div className={styles.loginSectionHeader}>Quick Login</div>
                <div className={styles.demoUsers}>
                  {DEMO_USERS.map(demoUser => (
                    <button
                      key={demoUser.uid}
                      className={styles.demoUserBtn}
                      onClick={() => handleDemoLogin(demoUser.uid)}
                      title={`Sign in as ${demoUser.displayName}`}
                    >
                      <span className={styles.demoAvatar}>{getDemoAvatar(demoUser.uid)}</span>
                      <div className={styles.demoInfo}>
                        <span className={styles.demoName}>{demoUser.displayName}</span>
                        <span className={styles.demoEmail}>{demoUser.email}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className={styles.loginDivider}>
                  <span>or</span>
                </div>

                {/* Email Login */}
                <form onSubmit={handleEmailLogin} className={styles.emailForm}>
                  <input
                    className="input"
                    type="email"
                    placeholder="Email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <input
                    className="input"
                    type="password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button className="btn-primary" type="submit" disabled={loginLoading} style={{ width: '100%', justifyContent: 'center' }}>
                    {loginLoading ? 'Signing in...' : 'Sign in with Email'}
                  </button>
                </form>

                {authError && (
                  <div className={styles.authError}>{authError}</div>
                )}

                <div className={styles.loginDivider}>
                  <span>or</span>
                </div>

                {/* Google Sign-In */}
                <button className={styles.googleBtn} onClick={signInWithGoogle}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
