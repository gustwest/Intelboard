'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: string;
    name: string;
    email: string;
    sport: string;
    position: string;
    avatar: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    signup: (name: string, email: string, password: string, sport: string, position: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        // Check localStorage for existing user session
        const savedUser = localStorage.getItem('sportsapp_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
    }, []);

    const login = async (email: string, password: string) => {
        // Mock login - in real app, this would call an API
        await new Promise(resolve => setTimeout(resolve, 500));

        const mockUser: User = {
            id: '1',
            name: 'Alex Johnson',
            email,
            sport: 'Basketball',
            position: 'Point Guard',
            avatar: '🏀'
        };

        setUser(mockUser);
        localStorage.setItem('sportsapp_user', JSON.stringify(mockUser));
    };

    const signup = async (name: string, email: string, password: string, sport: string, position: string) => {
        // Mock signup - in real app, this would call an API
        await new Promise(resolve => setTimeout(resolve, 500));

        const newUser: User = {
            id: Date.now().toString(),
            name,
            email,
            sport,
            position,
            avatar: sport === 'Basketball' ? '🏀' : sport === 'Soccer' ? '⚽' : '🏈'
        };

        setUser(newUser);
        localStorage.setItem('sportsapp_user', JSON.stringify(newUser));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('sportsapp_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
