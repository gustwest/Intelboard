"use client";

import { useEffect } from "react";
import { useRole } from "@/components/role-provider";
import { useStore } from "@/store/it-flora/useStore";

export function PlannerAuthSync() {
    const { currentUser } = useRole();
    const setCurrentUser = useStore((state) => state.setCurrentUser);

    useEffect(() => {
        if (currentUser) {
            // Map RoleProvider user to IT Planner store user format if needed
            // Currently they are compatible or we just sync basic details
            setCurrentUser({
                id: currentUser.id,
                name: currentUser.name,
                role: currentUser.role,
                avatar: currentUser.avatar,
                company: currentUser.company
            });
        } else {
            setCurrentUser(null);
        }
    }, [currentUser, setCurrentUser]);

    return null; // This component renders nothing, just handles logic
}
