'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { TEAM, colorForEmail, defaultNameForEmail } from '@/lib/team';

export interface AppUser {
  name: string;
  email: string;
  color: string;
}

const TEAM_USERS: AppUser[] = TEAM.map(m => ({
  name: defaultNameForEmail(m.email),
  email: m.email,
  color: m.color,
}));

interface UserContextType {
  currentUser: AppUser | null;
  allUsers: AppUser[];
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
}

const UserContext = createContext<UserContextType>({
  currentUser: null,
  allUsers: TEAM_USERS,
  sessionStatus: 'loading',
});

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const sessionEmail = session?.user?.email?.toLowerCase() || null;

  const currentUser: AppUser | null = sessionEmail
    ? {
        name: session?.user?.name || defaultNameForEmail(sessionEmail),
        email: sessionEmail,
        color: colorForEmail(sessionEmail),
      }
    : null;

  // Replace the email-derived placeholder with the Google display name for the logged-in user.
  let allUsers: AppUser[] = currentUser
    ? TEAM_USERS.map(u => (u.email === currentUser.email ? { ...u, name: currentUser.name } : u))
    : TEAM_USERS;

  // Include the current user even if they aren't (yet) part of the static roster.
  if (currentUser && !TEAM_USERS.some(u => u.email === currentUser.email)) {
    allUsers = [currentUser, ...allUsers];
  }

  return (
    <UserContext.Provider value={{ currentUser, allUsers, sessionStatus: status }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
