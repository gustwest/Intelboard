"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Request, initialRequests } from "@/lib/data";

const STORAGE_KEY = "intelboard_requests";

interface RequestContextType {
    requests: Request[];
    isLoaded: boolean;
    addRequest: (request: Request) => void;
    updateRequest: (request: Request) => void;
    getRequest: (id: string) => Request | undefined;
}

const RequestContext = createContext<RequestContextType | undefined>(undefined);

export function RequestProvider({ children }: { children: ReactNode }) {
    // Initialize with empty to avoid hydration mismatch, load in useEffect
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Initial load
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setRequests(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse requests", e);
                setRequests(initialRequests);
            }
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(initialRequests));
            setRequests(initialRequests);
        }
        setIsLoaded(true);
    }, []);

    const addRequest = (newRequest: Request) => {
        const updated = [...requests, newRequest];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setRequests(updated);
    };

    const updateRequest = (updatedRequest: Request) => {
        const updated = requests.map((r) =>
            r.id === updatedRequest.id ? updatedRequest : r
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setRequests(updated);
    };

    const getRequest = (id: string) => {
        return requests.find((r) => r.id === id);
    };

    return (
        <RequestContext.Provider
            value={{
                requests,
                isLoaded,
                addRequest,
                updateRequest,
                getRequest,
            }}
        >
            {children}
        </RequestContext.Provider>
    );
}

export function useRequests() {
    const context = useContext(RequestContext);
    if (context === undefined) {
        throw new Error("useRequests must be used within a RequestProvider");
    }
    return context;
}
