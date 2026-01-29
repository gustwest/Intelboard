"use client";

import { useEffect } from "react";
import { useRole } from "@/components/role-provider";
import { useStore } from "@/store/it-flora/useStore";

export function PlannerAuthSync() {
    const { currentUser, isLoading } = useRole();
    const setCurrentUser = useStore((state) => state.setCurrentUser);

    useEffect(() => {
        if (isLoading) return;

        if (currentUser) {
            // Map RoleProvider user to IT Planner store user format if needed
            // Currently they are compatible or we just sync basic details
            setCurrentUser({
                id: currentUser.id,
                name: currentUser.name,
                role: currentUser.role,
                avatar: currentUser.avatar,
                company: currentUser.company,
                companyId: currentUser.companyId
            });
        } else {
            setCurrentUser(null);
        }
    }, [currentUser, isLoading, setCurrentUser]);

    return null; // This component renders nothing, just handles logic
}
