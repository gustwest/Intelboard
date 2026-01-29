"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { User, mockUsers } from "@/lib/data";
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
                company: (user as any).companyId, // Map companyId to company prop for display/logic
                companyId: (user as any).companyId // Ensure companyId is also set directly
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

        // Find actual mock user to get their real name (fallback if name not provided)
        const mockUser = mockUsers.find(u => u.id === userId);
        const resolvedName = name || mockUser?.name || userId;

        // Construct a pseudo-email for NextAuth to handle roles correctly
        let email = `${userId}@intelboard.com`;

        // Match roles for special cases
        if (userId === "admin1") email = "admin@intelboard.com";
        else if (userId.startsWith("s")) email = `${userId}@specialist.com`;
        else if (userId.startsWith("c")) email = `${userId}@client.com`;
        else if (userId === "guest1") email = "guest@intelboard.com";

        console.log("RoleProvider: signIn with email:", email, "name:", resolvedName);
        signIn("credentials", {
            email,
            password: "password",
            name: resolvedName,
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
