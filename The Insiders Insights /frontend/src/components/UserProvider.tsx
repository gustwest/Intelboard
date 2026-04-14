'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AppUser {
  name: string;
  avatar: string;
  color: string;
}

const USERS: AppUser[] = [
  { name: 'Gustav', avatar: '👤', color: '#a855f7' },
  { name: 'Erik', avatar: '👤', color: '#3b82f6' },
  { name: 'Ben', avatar: '👤', color: '#22c55e' },
  { name: 'Jossan', avatar: '👤', color: '#f59e0b' },
];

interface UserContextType {
  currentUser: AppUser | null;
  setUser: (user: AppUser) => void;
  logout: () => void;
  allUsers: AppUser[];
}

const UserContext = createContext<UserContextType>({
  currentUser: null,
  setUser: () => {},
  logout: () => {},
  allUsers: USERS,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('insiders-user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const match = USERS.find(u => u.name === parsed.name);
        if (match) setCurrentUser(match);
      } catch { /* */ }
    }
  }, []);

  const setUser = (user: AppUser) => {
    setCurrentUser(user);
    localStorage.setItem('insiders-user', JSON.stringify(user));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('insiders-user');
  };

  if (!mounted) return <>{children}</>;

  return (
    <UserContext.Provider value={{ currentUser, setUser, logout, allUsers: USERS }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
