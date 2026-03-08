"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { NewRequestDialog } from "@/components/new-request-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REQUEST_TYPE_CONFIG, RequestType, ConversationWithDetails, AppNotification } from "@/lib/data";
import { getConversations, getNotifications, getEvents, getAllUsers, getUpcomingHubs } from "@/lib/actions";
import { useStore, Project } from "@/store/it-flora/useStore";
import {
    ArrowRight,
    LayoutGrid,
    ListChecks,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Plus,
    Briefcase,
    Users,
    Star,
    Activity,
    Zap,
    FolderOpen,
    MessageSquare,
    FileText,
    RefreshCw,
    Wrench,
    StarOff,
    CalendarDays,
    CalendarClock,
    Bell,
    User2,
    Video,
    Globe,
    Lock,
    Repeat,
} from "lucide-react";

/* ------------------------------------------------------------------
   Starred-projects helpers (persisted in localStorage)
   ------------------------------------------------------------------ */
const STARRED_KEY = "intelboard_starred_projects";
function loadStarred(): string[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STARRED_KEY) || "[]"); } catch { return []; }
}
function saveStarred(ids: string[]) {
    localStorage.setItem(STARRED_KEY, JSON.stringify(ids));
}

/* ------------------------------------------------------------------
   Time helpers
   ------------------------------------------------------------------ */
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

function formatEventTime(date: string) {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatEventDate(date: string) {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
    message: <MessageSquare className="h-3.5 w-3.5 text-blue-400" />,
    status_change: <RefreshCw className="h-3.5 w-3.5 text-amber-400" />,
    comment: <FileText className="h-3.5 w-3.5 text-violet-400" />,
    assignment: <Users className="h-3.5 w-3.5 text-emerald-400" />,
    opportunity: <Activity className="h-3.5 w-3.5 text-rose-400" />,
    terms: <FileText className="h-3.5 w-3.5 text-cyan-400" />,
    info: <Bell className="h-3.5 w-3.5 text-sky-400" />,
};

function getNewsFeedTarget(n: AppNotification): string | null {
    if (!n.relatedId) return null;
    const t = n.title.toLowerCase();
    switch (n.type) {
        case "message": return null; // chat handled separately
        case "status_change": case "comment": case "opportunity": case "terms":
            return `/requests/${n.relatedId}`;
        case "assignment":
            if (t.includes("event") || t.includes("meeting") || t.includes("scheduled") || t.includes("video")) return `/calendar`;
            if (t.includes("intelboard") || t.includes("invited to")) return `/intelboards/${n.relatedId}`;
            return `/requests/${n.relatedId}`;
        case "info":
            if (t.includes("event") || t.includes("open event")) return `/calendar`;
            if (t.includes("thread") || t.includes("intelboard")) return `/intelboards`;
            return null;
        default: return `/requests/${n.relatedId}`;
    }
}

const HUB_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    scheduled: { label: "Scheduled", color: "text-blue-600", bg: "bg-blue-500/10 border-blue-500/20" },
    live: { label: "Live Now", color: "text-red-600", bg: "bg-red-500/10 border-red-500/20" },
    completed: { label: "Completed", color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

/* ================================================================== */
export default function DashboardPage() {
    const { requests, isLoaded } = useRequests();
    const { role, currentUser } = useRole();
    const { t } = useLanguage();
    const router = useRouter();

    // IT Planner projects
    const projects = useStore(s => s.projects);

    // Conversations + Notifications + Events + Hubs
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
    const [upcomingHubs, setUpcomingHubs] = useState<any[]>([]);
    const [userNames, setUserNames] = useState<Record<string, string>>({});

    // Starred projects
    const [starredIds, setStarredIds] = useState<string[]>([]);
    useEffect(() => { setStarredIds(loadStarred()); }, []);

    const toggleStar = (id: string) => {
        setStarredIds(prev => {
            const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
            saveStarred(next);
            return next;
        });
    };

    // Load conversations, notifications, events, hubs & user names
    const load = useCallback(async () => {
        if (!currentUser) return;
        const [convos, notifs, evts, users, hubs] = await Promise.all([
            getConversations(currentUser.id),
            getNotifications(currentUser.id),
            getEvents(currentUser.id),
            getAllUsers(),
            getUpcomingHubs(),
        ]);
        setConversations(convos as ConversationWithDetails[]);
        setNotifications(notifs as AppNotification[]);
        setUpcomingEvents(evts);
        setUpcomingHubs(hubs);
        const map: Record<string, string> = {};
        users.forEach(u => { map[u.id] = u.name; });
        setUserNames(map);
    }, [currentUser]);

    useEffect(() => { load(); }, [load]);

    const resolveUserName = (id: string) => userNames[id] || (id.includes("@") ? id.split("@")[0] : id.length > 12 ? id.substring(0, 8) + "…" : id);

    // Filter requests by role
    const myRequests = useMemo(() => {
        if (!currentUser) return [];
        if (role === "Admin") return requests;
        if (role === "Customer" || role === "Guest") return requests.filter(r => r.creatorId === currentUser.id);
        if (role === "Specialist") return requests.filter(r =>
            r.assignedSpecialistId === currentUser.id ||
            (r.assignedSpecialistIds || []).includes(currentUser.id)
        );
        return [];
    }, [requests, currentUser, role]);

    // Stats
    const totalRequests = myRequests.length;
    const activeRequests = myRequests.filter(r => !["Done"].includes(r.status)).length;
    const completedRequests = myRequests.filter(r => r.status === "Done").length;
    const actionNeeded = myRequests.filter(r => r.actionNeeded).length;

    // Recent requests (latest 5)
    const recentRequests = useMemo(() => {
        return [...myRequests]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [myRequests]);

    // Type breakdown
    const typeBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        myRequests.forEach(r => { const t2 = r.requestType || "Unspecified"; counts[t2] = (counts[t2] || 0) + 1; });
        return counts;
    }, [myRequests]);

    // My projects (owner or shared)
    const myProjects = useMemo(() => {
        if (!currentUser) return [];
        return projects.filter(p => p.ownerId === currentUser.id || (p.sharedWith || []).includes(currentUser.id));
    }, [projects, currentUser]);

    const starredProjects = useMemo(() => myProjects.filter(p => starredIds.includes(p.id)), [myProjects, starredIds]);
    const otherProjects = useMemo(() => myProjects.filter(p => !starredIds.includes(p.id)), [myProjects, starredIds]);

    // Unread conversations
    const unreadConvos = useMemo(() => conversations.filter(c => c.unreadCount > 0), [conversations]);

    // News feed: recent notifications (latest 8)
    const newsFeed = useMemo(() => {
        return [...notifications]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 8);
    }, [notifications]);

    const unreadNotifs = notifications.filter(n => !n.isRead).length;

    // Upcoming events: this week and this month
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const eventsThisWeek = useMemo(() => {
        return upcomingEvents.filter(e => {
            const d = new Date(e.startTime);
            return d >= now && d <= endOfWeek;
        }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [upcomingEvents, now, endOfWeek]);

    const eventsThisMonth = useMemo(() => {
        return upcomingEvents.filter(e => {
            const d = new Date(e.startTime);
            return d > endOfWeek && d <= endOfMonth;
        }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [upcomingEvents, endOfWeek, endOfMonth]);

    if (!isLoaded) {
        return (
            <div className="container py-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-48 bg-muted rounded" />
                    <div className="grid grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    const statusColors: Record<string, string> = {
        "New": "bg-blue-500",
        "Submitted for Review": "bg-amber-500",
        "Scope Refinement Required": "bg-orange-500",
        "Scope Approved": "bg-emerald-500",
        "Active Efforts": "bg-violet-500",
        "Done": "bg-slate-400",
    };

    const statusLabels: Record<string, string> = {
        "New": "New",
        "Submitted for Review": "In Review",
        "Scope Refinement Required": "Refinement",
        "Scope Approved": "Approved",
        "Active Efforts": "Active",
        "Done": "Done",
    };

    return (
        <div className="container py-6 space-y-6 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {greeting()}, {currentUser?.name?.split(" ")[0] || "there"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Here&apos;s an overview of your IntelBoard activity
                    </p>
                </div>
                {(role === "Customer" || role === "Admin" || role === "Guest") && (
                    <NewRequestDialog />
                )}
            </div>

            {/* ── Quick Links (at top) ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <QuickLinkCard href="/board" icon={<LayoutGrid className="h-5 w-5" />} label="My Requests" color="text-blue-500" bgColor="bg-blue-500/10" />
                <QuickLinkCard href="/calendar" icon={<CalendarDays className="h-5 w-5" />} label="Calendar" color="text-emerald-500" bgColor="bg-emerald-500/10" />
                <QuickLinkCard href="/intelboards" icon={<Globe className="h-5 w-5" />} label="Intelboards" color="text-indigo-500" bgColor="bg-indigo-500/10" />
                <QuickLinkCard href="/talent" icon={<Users className="h-5 w-5" />} label="Talent Directory" color="text-violet-500" bgColor="bg-violet-500/10" />
                <QuickLinkCard href="/profile" icon={<Briefcase className="h-5 w-5" />} label="My Profile" color="text-amber-500" bgColor="bg-amber-500/10" />
            </div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Briefcase className="h-5 w-5" />} label="Total Requests" value={totalRequests} color="text-blue-500" bgColor="bg-blue-500/10" />
                <StatCard icon={<Activity className="h-5 w-5" />} label="Active" value={activeRequests} color="text-violet-500" bgColor="bg-violet-500/10" />
                <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={completedRequests} color="text-emerald-500" bgColor="bg-emerald-500/10" />
                <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Action Needed" value={actionNeeded} color={actionNeeded > 0 ? "text-amber-500" : "text-muted-foreground"} bgColor={actionNeeded > 0 ? "bg-amber-500/10" : "bg-muted/50"} highlight={actionNeeded > 0} />
            </div>

            {/* ── Main 3-column grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ===== LEFT COLUMN (2-wide) ===== */}
                <div className="lg:col-span-2 space-y-6">

                    {/* ── Calendar Events + Intelboard Hubs (combined section) ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Upcoming Calendar Events */}
                        <DashboardCard
                            icon={<CalendarClock className="h-4 w-4 text-emerald-500" />}
                            title="Upcoming Events"
                            linkHref="/calendar"
                            linkText="Open Calendar"
                        >
                            {eventsThisWeek.length === 0 && eventsThisMonth.length === 0 ? (
                                <EmptyState icon={CalendarDays} label="No upcoming events">
                                    <Link href="/calendar">
                                        <Button size="sm" variant="outline" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" /> Schedule Event</Button>
                                    </Link>
                                </EmptyState>
                            ) : (
                                <div className="space-y-1">
                                    {[...eventsThisWeek, ...eventsThisMonth].slice(0, 5).map(evt => (
                                        <Link
                                            key={evt.id}
                                            href="/calendar"
                                            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
                                        >
                                            <div className={cn(
                                                "h-10 w-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-bold shrink-0 border",
                                                evt.type === "meeting" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                                    evt.type === "deadline" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                                        "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                            )}>
                                                <span className="text-sm font-bold leading-none">{new Date(evt.startTime).getDate()}</span>
                                                <span className="text-[7px] uppercase opacity-70">{new Date(evt.startTime).toLocaleDateString(undefined, { month: "short" })}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-xs font-semibold text-foreground truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{evt.title}</p>
                                                    {evt.meetingUrl && <Video className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-muted-foreground">{formatEventDate(evt.startTime)} · {formatEventTime(evt.startTime)}</span>
                                                    {evt.audience === "open" && <Globe className="h-2.5 w-2.5 text-emerald-500" />}
                                                    {evt.recurring && evt.recurring !== "none" && <Repeat className="h-2.5 w-2.5 text-purple-500" />}
                                                </div>
                                                {evt.creatorName && (
                                                    <span className="text-[9px] text-muted-foreground/70">by {evt.creatorName}</span>
                                                )}
                                            </div>
                                        </Link>
                                    ))}
                                    {(eventsThisWeek.length + eventsThisMonth.length) > 5 && (
                                        <Link href="/calendar" className="block text-xs text-muted-foreground text-center py-1 hover:text-foreground transition-colors">
                                            +{eventsThisWeek.length + eventsThisMonth.length - 5} more events
                                        </Link>
                                    )}
                                </div>
                            )}
                        </DashboardCard>

                        {/* Intelboard Hubs */}
                        <DashboardCard
                            icon={<Video className="h-4 w-4 text-indigo-500" />}
                            title="Intelboard Hubs"
                            linkHref="/intelboards"
                            linkText="All Intelboards"
                        >
                            {upcomingHubs.length === 0 ? (
                                <EmptyState icon={Video} label="No active hubs">
                                    <Link href="/intelboards">
                                        <Button size="sm" variant="outline" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" /> Browse Boards</Button>
                                    </Link>
                                </EmptyState>
                            ) : (
                                <div className="space-y-1.5">
                                    {upcomingHubs.slice(0, 5).map(hub => {
                                        const conf = HUB_STATUS_CONFIG[hub.status] || HUB_STATUS_CONFIG.scheduled;
                                        const rsvpCount = (hub.rsvps || []).length;
                                        const acceptedCount = (hub.rsvps || []).filter((r: any) => r.status === "accepted").length;

                                        return (
                                            <Link
                                                key={hub.id}
                                                href={`/intelboards/${hub.intelboardId}`}
                                                className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
                                            >
                                                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border", conf.bg)}>
                                                    <Video className={cn("h-4 w-4", conf.color)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-xs font-semibold text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{hub.title}</p>
                                                        <Badge variant="outline" className={cn("text-[8px] px-1 py-0 shrink-0", conf.color)}>{conf.label}</Badge>
                                                    </div>
                                                    {hub.intelboardTitle && (
                                                        <p className="text-[10px] text-muted-foreground truncate">{hub.intelboardTitle}</p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {hub.startTime && (
                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                                <Clock className="h-2.5 w-2.5" /> {formatEventDate(hub.startTime)} · {formatEventTime(hub.startTime)}
                                                            </span>
                                                        )}
                                                        {rsvpCount > 0 && (
                                                            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                                                                <Users className="h-2.5 w-2.5" /> {acceptedCount}/{rsvpCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {hub.creatorName && (
                                                        <span className="text-[9px] text-muted-foreground/70">by {hub.creatorName}</span>
                                                    )}
                                                </div>
                                                {hub.status === "live" && hub.meetingUrl && (
                                                    <Badge className="bg-red-500 text-white text-[9px] shrink-0 animate-pulse">Join</Badge>
                                                )}
                                            </Link>
                                        );
                                    })}
                                    {upcomingHubs.length > 5 && (
                                        <Link href="/intelboards" className="block text-xs text-muted-foreground text-center py-1 hover:text-foreground transition-colors">
                                            +{upcomingHubs.length - 5} more hubs
                                        </Link>
                                    )}
                                </div>
                            )}
                        </DashboardCard>
                    </div>

                    {/* My Requests (moved here, was at top) */}
                    <DashboardCard
                        icon={<ListChecks className="h-4 w-4 text-blue-500" />}
                        title="My Requests"
                        linkHref="/board"
                        linkText="See all ongoing requests"
                    >
                        {recentRequests.length === 0 ? (
                            <EmptyState icon={FolderOpen} label="No requests yet">
                                {(role === "Customer" || role === "Admin" || role === "Guest") && (
                                    <NewRequestDialog trigger={
                                        <Button size="sm" variant="outline" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" /> Create your first request</Button>
                                    } />
                                )}
                            </EmptyState>
                        ) : (
                            <div className="space-y-0.5">
                                {recentRequests.map(request => (
                                    <Link key={request.id} href={`/board?requestId=${request.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group">
                                        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusColors[request.status] || "bg-muted")} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{request.title}</span>
                                                {request.actionNeeded && (
                                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shrink-0">
                                                        Action Required
                                                    </Badge>
                                                )}
                                                {request.requestType && REQUEST_TYPE_CONFIG[request.requestType] && (
                                                    <Badge variant="outline" className={cn("text-[9px] px-1 py-0 shrink-0", REQUEST_TYPE_CONFIG[request.requestType].color, REQUEST_TYPE_CONFIG[request.requestType].border)}>
                                                        {REQUEST_TYPE_CONFIG[request.requestType].icon}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <div className={cn("h-1.5 w-1.5 rounded-full", statusColors[request.status])} />
                                                    {statusLabels[request.status] || request.status}
                                                </span>
                                                {request.assignedSpecialistId && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <User2 className="h-2.5 w-2.5" />
                                                        {resolveUserName(request.assignedSpecialistId)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground shrink-0">{new Date(request.createdAt).toLocaleDateString()}</span>
                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </DashboardCard>
                </div>

                {/* ===== RIGHT COLUMN ===== */}
                <div className="space-y-6">
                    {/* My Projects (IT Planner) — moved to right */}
                    <DashboardCard
                        icon={<Wrench className="h-4 w-4 text-teal-500" />}
                        title="My Projects"
                        linkHref="/it-planner"
                        linkText="Open Planner"
                    >
                        {myProjects.length === 0 ? (
                            <EmptyState icon={FolderOpen} label="No projects yet">
                                <Link href="/it-planner">
                                    <Button size="sm" variant="outline" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" /> Create a project</Button>
                                </Link>
                            </EmptyState>
                        ) : (
                            <div className="space-y-1">
                                {/* Starred first */}
                                {starredProjects.map(p => (
                                    <ProjectRow key={p.id} project={p} isStarred onToggleStar={toggleStar} />
                                ))}
                                {starredProjects.length > 0 && otherProjects.length > 0 && (
                                    <div className="border-t my-1.5" />
                                )}
                                {otherProjects.slice(0, 4).map(p => (
                                    <ProjectRow key={p.id} project={p} isStarred={false} onToggleStar={toggleStar} />
                                ))}
                                {otherProjects.length > 4 && (
                                    <Link href="/it-planner" className="block text-xs text-muted-foreground text-center py-1 hover:text-foreground transition-colors">
                                        +{otherProjects.length - 4} more projects
                                    </Link>
                                )}
                            </div>
                        )}
                    </DashboardCard>

                    {/* Messages */}
                    <DashboardCard
                        icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
                        title="Messages"
                        badge={unreadConvos.length > 0 ? `${unreadConvos.length} new` : undefined}
                    >
                        {conversations.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No messages yet</p>
                        ) : (
                            <div className="space-y-1">
                                {conversations.slice(0, 4).map(convo => (
                                    <button
                                        key={convo.id}
                                        onClick={() => window.dispatchEvent(new CustomEvent("open-chat", { detail: { conversationId: convo.id } }))}
                                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors w-full text-left group"
                                    >
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                            {(convo.participants?.[0]?.name || "?").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-xs font-semibold text-foreground truncate">{convo.requestTitle || convo.participants?.map(p => p.name).join(", ") || "Chat"}</p>
                                                {convo.unreadCount > 0 && (
                                                    <Badge variant="secondary" className="text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0 px-1.5 py-0">{convo.unreadCount} new</Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground truncate">{convo.lastMessage?.text || "New conversation"}</p>
                                        </div>
                                    </button>
                                ))}
                                {conversations.length > 4 && (
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent("open-chat", {}))}
                                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-2 flex items-center justify-center gap-1"
                                    >
                                        See all messages <ArrowRight className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </DashboardCard>

                    {/* Latest News */}
                    <DashboardCard
                        icon={<Zap className="h-4 w-4 text-amber-500" />}
                        title="Latest News"
                        badge={unreadNotifs > 0 ? `${unreadNotifs} new` : undefined}
                    >
                        {newsFeed.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
                        ) : (
                            <div className="space-y-0.5">
                                {newsFeed.map(n => {
                                    const target = getNewsFeedTarget(n);
                                    return (
                                        <button
                                            key={n.id}
                                            className={cn("w-full flex items-start gap-2.5 p-2 rounded-lg transition-colors text-left group cursor-pointer", !n.isRead ? "bg-primary/5" : "hover:bg-muted/30")}
                                            onClick={() => { if (target) router.push(target); }}
                                        >
                                            <div className="mt-0.5 shrink-0">{NOTIFICATION_ICONS[n.type] || <Activity className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn("text-xs leading-snug", !n.isRead ? "font-medium text-foreground" : "text-foreground/70")}>{n.title}</p>
                                                {n.body && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{n.body}</p>}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                <span className="text-[9px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                                                {target && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
}

/* ================================================================== */
/*  Sub-components                                                    */
/* ================================================================== */

function DashboardCard({ icon, title, badge, linkHref, linkText, children }: {
    icon: React.ReactNode; title: string; badge?: string;
    linkHref?: string; linkText?: string; children: React.ReactNode;
}) {
    return (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    {badge && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary">
                            {badge}
                        </Badge>
                    )}
                </div>
                {linkHref && linkText && (
                    <Link href={linkHref} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
                        {linkText} <ArrowRight className="h-3 w-3" />
                    </Link>
                )}
            </div>
            <div className="p-3">{children}</div>
        </div>
    );
}

function StatCard({ icon, label, value, color, bgColor, highlight }: {
    icon: React.ReactNode; label: string; value: number; color: string; bgColor: string; highlight?: boolean;
}) {
    return (
        <div className={cn(
            "rounded-xl border p-4 flex items-center gap-3 transition-all",
            highlight ? "border-amber-500/30 bg-amber-500/5 shadow-sm shadow-amber-500/10" : "bg-card"
        )}>
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", bgColor, color)}>
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
        </div>
    );
}

function QuickLinkCard({ href, icon, label, color, bgColor }: { href: string; icon: React.ReactNode; label: string; color: string; bgColor: string }) {
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-md hover:scale-[1.02] bg-card group"
            )}
        >
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", bgColor, color)}>
                {icon}
            </div>
            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{label}</span>
        </Link>
    );
}

function ProjectRow({ project, isStarred, onToggleStar }: { project: Project; isStarred: boolean; onToggleStar: (id: string) => void }) {
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
            <button onClick={() => onToggleStar(project.id)} className="shrink-0 text-muted-foreground hover:text-amber-500 transition-colors">
                {isStarred ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> : <StarOff className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
            </button>
            <Link href={`/it-planner?project=${project.id}`} className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{project.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{project.description}</p>
            </Link>
        </div>
    );
}

function EmptyState({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children?: React.ReactNode }) {
    return (
        <div className="text-center py-6">
            <Icon className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{label}</p>
            {children}
        </div>
    );
}
