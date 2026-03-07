"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { User } from "@/lib/data";
import { useSession, signIn, signOut } from "next-auth/react";

export type UserRole = "Customer" | "Admin" | "Specialist" | "Guest";

interface RoleContextType {
    role: UserRole;
    setRole: (role: UserRole) => void;
    currentUser: User | null;
    login: (userId: string, name?: string) => void;
    logout: () => void;
    isLoading: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const [role, setRole] = useState<UserRole>("Guest");
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [isLoading, setIsLoading] = useState(true);

    // Sync with NextAuth session
    React.useEffect(() => {
        if (status === "loading") {
            setIsLoading(true);
            return;
        }

        if (session?.user) {
            const user = session.user as any;
            setCurrentUser({
                id: user.id || user.email,
                name: user.name || "",
                role: user.role || "Guest",
                email: user.email,
                avatar: user.image,
                company: (user as any).companyId,
                companyId: (user as any).companyId
            } as any);
            setRole((user.role as UserRole) || "Guest");
        } else if (status === "unauthenticated") {
            setCurrentUser(null);
            setRole("Guest");
        }
        setIsLoading(false);
    }, [session, status]);

    const login = (userId: string, name?: string) => {
        console.log("RoleProvider: Initiating login for userId:", userId);
        // With the new system, login is handled through NextAuth signIn directly
        // This function is kept for backward compatibility with any remaining flows
        signIn("credentials", {
            email: userId,
            password: "password123",
            callbackUrl: "/board"
        });
    };

    const logout = () => {
        signOut();
    };

    return (
        <RoleContext.Provider value={{ role, setRole, currentUser, login, logout, isLoading }}>
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
