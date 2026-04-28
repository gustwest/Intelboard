import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, getStoredUser, setToken, setStoredUser, clearToken, BeachVibesUser } from '../api/client';

interface AuthContextType {
  user: BeachVibesUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: BeachVibesUser) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BeachVibesUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await getToken();
        const savedUser = await getStoredUser();
        if (savedToken && savedUser) {
          setTokenState(savedToken);
          setUser(savedUser);
        }
      } catch (e) {
        console.warn('Failed to restore auth:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (newToken: string, newUser: BeachVibesUser) => {
    await setToken(newToken);
    await setStoredUser(newUser);
    setTokenState(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    await clearToken();
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
