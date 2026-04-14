'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import logger from '@/lib/logger';

// ===== App User (works with or without Firebase) =====
export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isDemo: boolean;
}

// ===== Demo Users for Quick Testing =====
export const DEMO_USERS: AppUser[] = [
  {
    uid: 'demo-alice',
    displayName: 'Alice Johnson',
    email: 'alice@intelboard.dev',
    photoURL: null,
    isDemo: true,
  },
  {
    uid: 'demo-bob',
    displayName: 'Bob Chen',
    email: 'bob@intelboard.dev',
    photoURL: null,
    isDemo: true,
  },
  {
    uid: 'demo-carol',
    displayName: 'Carol Smith',
    email: 'carol@intelboard.dev',
    photoURL: null,
    isDemo: true,
  },
];

const DEMO_AVATARS: Record<string, string> = {
  'demo-alice': '🧑‍💻',
  'demo-bob': '👨‍🔬',
  'demo-carol': '👩‍🎨',
};

export function getDemoAvatar(uid: string): string {
  return DEMO_AVATARS[uid] || uid.charAt(0).toUpperCase();
}

// ===== Storage Keys =====
const SESSION_KEY = 'intelboard_auth_session';

function persistSession(user: AppUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function loadSession(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// ===== Context =====
interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  signInAsDemo: (userId: string) => void;
  signOut: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInAsDemo: () => {},
  signOut: async () => {},
  authError: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // On mount: check for persisted demo session OR Firebase auth
  useEffect(() => {
    // Check localStorage for a persisted demo session
    const stored = loadSession();
    if (stored) {
      setUser(stored);
      setLoading(false);
      logger.info('Restored session from localStorage', { uid: stored.uid });
    }

    // Also listen to Firebase auth if configured
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const appUser: AppUser = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            isDemo: false,
          };
          setUser(appUser);
          persistSession(appUser);
        } else if (!stored) {
          // Only clear if no demo session is active
          setUser(null);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      setAuthError('Firebase is not configured. Use demo login or add Firebase credentials to .env.local.');
      logger.warn('Google Sign-In attempted but Firebase is not configured');
      return;
    }
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      logger.error('Google Sign-In error', { error: String(error) });
      setAuthError('Google Sign-In failed. Please try again.');
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) {
      setAuthError('Firebase is not configured. Use demo login or add Firebase credentials to .env.local.');
      return;
    }
    try {
      setAuthError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      logger.error('Email Sign-In error', { error: String(error) });
      setAuthError('Invalid email or password.');
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    if (!auth) {
      setAuthError('Firebase is not configured. Use demo login or add Firebase credentials to .env.local.');
      return;
    }
    try {
      setAuthError(null);
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Firebase user created — override display name locally
      const appUser: AppUser = {
        uid: cred.user.uid,
        displayName: name,
        email: cred.user.email,
        photoURL: null,
        isDemo: false,
      };
      setUser(appUser);
      persistSession(appUser);
    } catch (error) {
      logger.error('Email Sign-Up error', { error: String(error) });
      setAuthError('Sign up failed. The email may already be in use.');
    }
  };

  const signInAsDemo = (userId: string) => {
    const demoUser = DEMO_USERS.find(u => u.uid === userId);
    if (!demoUser) {
      logger.error('Demo user not found', { userId });
      return;
    }
    setUser(demoUser);
    persistSession(demoUser);
    setAuthError(null);
    logger.info('Signed in as demo user', { uid: demoUser.uid, name: demoUser.displayName });
  };

  const signOut = async () => {
    // Sign out of Firebase if active
    if (auth && !user?.isDemo) {
      try {
        await firebaseSignOut(auth);
      } catch (error) {
        logger.error('Firebase sign out error', { error: String(error) });
      }
    }
    setUser(null);
    clearSession();
    setAuthError(null);
    logger.info('User signed out');
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signInAsDemo,
      signOut,
      authError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
