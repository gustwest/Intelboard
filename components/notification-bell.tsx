"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, MessageSquare, ArrowRight, RefreshCw, Users, FileText, Calendar, BookOpen, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRole } from "@/components/role-provider";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/data";

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
    message: <MessageSquare className="h-4 w-4 text-blue-400" />,
    status_change: <RefreshCw className="h-4 w-4 text-amber-400" />,
    comment: <FileText className="h-4 w-4 text-violet-400" />,
    assignment: <Users className="h-4 w-4 text-emerald-400" />,
    opportunity: <Megaphone className="h-4 w-4 text-rose-400" />,
    terms: <FileText className="h-4 w-4 text-cyan-400" />,
    info: <BookOpen className="h-4 w-4 text-sky-400" />,
};

function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Determine the navigation target for a notification based on its type and title.
 * Returns a URL path to navigate to, or null if it should use custom events (chat).
 */
function getNotificationTarget(notification: AppNotification): string | null {
    const { type, title, relatedId } = notification;
    if (!relatedId) return null;
    const t = title.toLowerCase();

    switch (type) {
        case "message":
            // Chat messages — handled via custom event, not URL navigation
            return null;

        case "status_change":
        case "comment":
        case "opportunity":
        case "terms":
            // Always request-related
            return `/requests/${relatedId}`;

        case "assignment":
            // Could be event, intelboard, or request
            if (t.includes("event") || t.includes("meeting") || t.includes("scheduled") || t.includes("video")) {
                return `/calendar`;
            }
            if (t.includes("intelboard") || t.includes("invited to")) {
                return `/intelboards/${relatedId}`;
            }
            // Default: request assignment
            return `/requests/${relatedId}`;

        case "info":
            // Could be open event or intelboard thread
            if (t.includes("event") || t.includes("open event")) {
                return `/calendar`;
            }
            if (t.includes("thread") || t.includes("intelboard")) {
                return `/intelboards`;
            }
            return null;

        default:
            // Fallback — try to navigate to request
            return `/requests/${relatedId}`;
    }
}

/** Icon for the notification type, with fallback to an event calendar icon for event-like notifs */
function getNotificationIcon(notification: AppNotification): React.ReactNode {
    const { type, title } = notification;
    const t = title.toLowerCase();

    // Event-specific icon override
    if ((type === "assignment" || type === "info") && (t.includes("event") || t.includes("meeting") || t.includes("scheduled") || t.includes("video"))) {
        return <Calendar className="h-4 w-4 text-indigo-400" />;
    }

    return NOTIFICATION_ICONS[type] || <Bell className="h-4 w-4" />;
}

export function NotificationBell({ onOpenChat }: { onOpenChat?: (conversationId: string) => void }) {
    const { currentUser } = useRole();
    const router = useRouter();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const loadNotifications = useCallback(async () => {
        if (!currentUser) return;
        const data = await getNotifications(currentUser.id);
        setNotifications(data as AppNotification[]);
    }, [currentUser]);

    useEffect(() => {
        loadNotifications();
        const interval = setInterval(loadNotifications, 15000);
        return () => clearInterval(interval);
    }, [loadNotifications]);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handleMarkRead = async (id: string) => {
        await markNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    };

    const handleMarkAllRead = async () => {
        if (!currentUser) return;
        await markAllNotificationsRead(currentUser.id);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    const handleNotificationClick = (notification: AppNotification) => {
        handleMarkRead(notification.id);
        setIsOpen(false);

        if (!notification.relatedId) return;

        // Check if this is a chat message (special handling via custom events)
        if (notification.type === "message") {
            if (onOpenChat) {
                onOpenChat(notification.relatedId);
            }
            window.dispatchEvent(new CustomEvent("open-chat", { detail: { conversationId: notification.relatedId } }));
            return;
        }

        // For all other types, navigate to the relevant page
        const target = getNotificationTarget(notification);
        if (target) {
            router.push(target);
        }
    };

    if (!currentUser) return null;

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between p-3 border-b">
                    <h3 className="font-semibold text-sm">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={handleMarkAllRead}
                        >
                            <CheckCheck className="h-3 w-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="max-h-80">
                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            No notifications yet
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map(n => {
                                const target = getNotificationTarget(n);
                                return (
                                    <button
                                        key={n.id}
                                        className={cn(
                                            "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-start gap-3 group",
                                            !n.isRead && "bg-primary/5"
                                        )}
                                        onClick={() => handleNotificationClick(n)}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {getNotificationIcon(n)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-sm leading-tight", !n.isRead && "font-medium")}>
                                                {n.title}
                                            </p>
                                            {n.body && (
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1.5 shrink-0">
                                            {!n.isRead && (
                                                <div className="h-2 w-2 rounded-full bg-blue-500" />
                                            )}
                                            {target && (
                                                <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

