"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Request } from "@/lib/data";
import { getRequests, addRequest as addRequestAction, updateRequest as updateRequestAction } from "@/lib/actions";

const STORAGE_KEY = "intelboard_requests";

interface RequestContextType {
    requests: Request[];
    isLoaded: boolean;
    addRequest: (request: Request) => Promise<void>;
    updateRequest: (request: Request) => Promise<void>;
    getRequest: (id: string) => Request | undefined;
}

const RequestContext = createContext<RequestContextType | undefined>(undefined);

export function RequestProvider({ children }: { children: ReactNode }) {
    const [requests, setRequests] = useState<Request[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Initial load from Postgres
    useEffect(() => {
        async function load() {
            const data = await getRequests();
            // Handle potentially different data formats if needed
            setRequests(data as any);
            setIsLoaded(true);
        }
        load();
    }, []);

    const addRequest = async (newRequest: Request) => {
        try {
            const result = await addRequestAction(newRequest);
            setRequests(prev => [...prev, result as any]);
        } catch (error) {
            console.error("Error adding request:", error);
        }
    };

    const updateRequest = async (updatedRequest: Request) => {
        try {
            const result = await updateRequestAction(updatedRequest.id, updatedRequest);
            setRequests(prev => prev.map((r) =>
                r.id === updatedRequest.id ? (result as any) : r
            ));
        } catch (error) {
            console.error("Error updating request:", error);
        }
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
