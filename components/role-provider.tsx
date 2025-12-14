"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { User, mockUsers } from "@/lib/data";

export type UserRole = "Customer" | "Admin" | "Specialist" | "Guest";

interface RoleContextType {
    role: UserRole;
    setRole: (role: UserRole) => void;
    currentUser: User | null;
    login: (userId: string) => void;
    logout: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<UserRole>("Customer");
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Load from local storage on mount
    React.useEffect(() => {
        const storedUser = localStorage.getItem("intelboard_user");
        if (storedUser) {
            const user = JSON.parse(storedUser);
            setCurrentUser(user);
            setRole(user.role);
        }
    }, []);

    const login = (userId: string) => {
        const user = mockUsers.find(u => u.id === userId);
        if (user) {
            setCurrentUser(user);
            setRole(user.role);
            localStorage.setItem("intelboard_user", JSON.stringify(user));
        }
    };

    const logout = () => {
        setCurrentUser(null);
        setRole("Customer"); // Default
        localStorage.removeItem("intelboard_user");
    };

    return (
        <RoleContext.Provider value={{ role, setRole, currentUser, login, logout }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    const context = useContext(RoleContext);
    if (context === undefined) {
        throw new Error("useRole must be used within a RoleProvider");
    }
    return context;
}
