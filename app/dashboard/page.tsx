"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { NewRequestDialog } from "@/components/new-request-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REQUEST_TYPE_CONFIG, RequestType, ConversationWithDetails, AppNotification } from "@/lib/data";
import { getConversations, getNotifications } from "@/lib/actions";
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

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
    message: <MessageSquare className="h-3.5 w-3.5 text-blue-400" />,
    status_change: <RefreshCw className="h-3.5 w-3.5 text-amber-400" />,
    comment: <FileText className="h-3.5 w-3.5 text-violet-400" />,
    assignment: <Users className="h-3.5 w-3.5 text-emerald-400" />,
};

/* ================================================================== */
export default function DashboardPage() {
    const { requests, isLoaded } = useRequests();
    const { role, currentUser } = useRole();
    const { t } = useLanguage();

    // IT Planner projects
    const projects = useStore(s => s.projects);

    // Conversations + Notifications
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

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

    // Load conversations & notifications
    const load = useCallback(async () => {
        if (!currentUser) return;
        const [convos, notifs] = await Promise.all([
            getConversations(currentUser.id),
            getNotifications(currentUser.id),
        ]);
        setConversations(convos as ConversationWithDetails[]);
        setNotifications(notifs as AppNotification[]);
    }, [currentUser]);

    useEffect(() => { load(); }, [load]);

    // Filter requests by role
    const myRequests = useMemo(() => {
        if (!currentUser) return [];
        if (role === "Admin") return requests;
        if (role === "Customer" || role === "Guest") return requests.filter(r => r.creatorId === currentUser.id);
        if (role === "Specialist") return requests.filter(r => r.assignedSpecialistId === currentUser.id);
        return [];
    }, [requests, currentUser, role]);

    // Stats
    const totalRequests = myRequests.length;
    const activeRequests = myRequests.filter(r => !["Done"].includes(r.status)).length;
    const completedRequests = myRequests.filter(r => r.status === "Done").length;
    const actionNeeded = myRequests.filter(r => r.actionNeeded).length;
    const newRequests = myRequests.filter(r => r.status === "New").length;
    const inReview = myRequests.filter(r => r.status === "Submitted for Review").length;
    const activeEfforts = myRequests.filter(r => r.status === "Active Efforts").length;

    // Recent requests (latest 5)
    const recentRequests = useMemo(() => {
        return [...myRequests]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [myRequests]);

    // Type / urgency breakdowns
    const typeBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        myRequests.forEach(r => { const t2 = r.requestType || "Unspecified"; counts[t2] = (counts[t2] || 0) + 1; });
        return counts;
    }, [myRequests]);

    const urgencyBreakdown = useMemo(() => {
        const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        myRequests.forEach(r => { counts[r.urgency || "Medium"] += 1; });
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
                    {/* Pipeline */}
                    <DashboardCard
                        icon={<LayoutGrid className="h-4 w-4 text-indigo-500" />}
                        title="Pipeline Overview"
                        linkHref="/board"
                        linkText="View Board"
                    >
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <PipelineStep label="New" count={newRequests} color="bg-blue-500" />
                            <PipelineStep label="In Review" count={inReview} color="bg-amber-500" />
                            <PipelineStep label="Refinement" count={myRequests.filter(r => r.status === "Scope Refinement Required").length} color="bg-orange-500" />
                            <PipelineStep label="Approved" count={myRequests.filter(r => r.status === "Scope Approved").length} color="bg-emerald-500" />
                            <PipelineStep label="Active" count={activeEfforts} color="bg-violet-500" />
                            <PipelineStep label="Done" count={completedRequests} color="bg-slate-400" />
                        </div>
                    </DashboardCard>

                    {/* Recent Requests */}
                    <DashboardCard
                        icon={<Clock className="h-4 w-4 text-blue-500" />}
                        title="Recent Requests"
                        linkHref="/board"
                        linkText="View All"
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
                            <div className="space-y-1">
                                {recentRequests.map(request => (
                                    <Link key={request.id} href={`/board?requestId=${request.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                                        <div className={cn("h-2 w-2 rounded-full shrink-0", statusColors[request.status] || "bg-muted")} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{request.title}</span>
                                                {request.requestType && REQUEST_TYPE_CONFIG[request.requestType] && (
                                                    <Badge variant="outline" className={cn("text-[9px] px-1 py-0 shrink-0", REQUEST_TYPE_CONFIG[request.requestType].color, REQUEST_TYPE_CONFIG[request.requestType].border)}>
                                                        {REQUEST_TYPE_CONFIG[request.requestType].icon}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{request.description}</p>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground shrink-0">{new Date(request.createdAt).toLocaleDateString()}</span>
                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </DashboardCard>

                    {/* My Projects (IT Planner) */}
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
                </div>

                {/* ===== RIGHT COLUMN ===== */}
                <div className="space-y-6">
                    {/* Unread Messages */}
                    <DashboardCard
                        icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
                        title="Messages"
                        badge={unreadConvos.length > 0 ? `${unreadConvos.length} unread` : undefined}
                    >
                        {unreadConvos.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">All caught up! 🎉</p>
                        ) : (
                            <div className="space-y-1">
                                {unreadConvos.slice(0, 4).map(convo => (
                                    <button
                                        key={convo.id}
                                        onClick={() => window.dispatchEvent(new CustomEvent("open-chat", { detail: { conversationId: convo.id } }))}
                                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors w-full text-left group"
                                    >
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                            {(convo.participants?.[0]?.name || "?").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{convo.requestTitle || convo.participants?.map(p => p.name).join(", ") || "Chat"}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{convo.lastMessage?.text || "New conversation"}</p>
                                        </div>
                                        <Badge variant="secondary" className="text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">{convo.unreadCount}</Badge>
                                    </button>
                                ))}
                            </div>
                        )}
                    </DashboardCard>

                    {/* News Feed */}
                    <DashboardCard
                        icon={<Zap className="h-4 w-4 text-amber-500" />}
                        title="Latest News"
                        badge={unreadNotifs > 0 ? `${unreadNotifs} new` : undefined}
                    >
                        {newsFeed.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
                        ) : (
                            <div className="space-y-0.5">
                                {newsFeed.map(n => (
                                    <div key={n.id} className={cn("flex items-start gap-2.5 p-2 rounded-lg transition-colors text-left", !n.isRead ? "bg-primary/5" : "hover:bg-muted/30")}>
                                        <div className="mt-0.5 shrink-0">{NOTIFICATION_ICONS[n.type] || <Activity className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-xs leading-snug", !n.isRead ? "font-medium text-foreground" : "text-foreground/70")}>{n.title}</p>
                                            {n.body && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{n.body}</p>}
                                        </div>
                                        <span className="text-[9px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </DashboardCard>

                    {/* By Type */}
                    <DashboardCard icon={<ListChecks className="h-4 w-4 text-violet-500" />} title="By Type">
                        {Object.keys(typeBreakdown).length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No data</p>
                        ) : (
                            <div className="space-y-3">
                                {Object.entries(typeBreakdown).map(([type, count]) => {
                                    const config = REQUEST_TYPE_CONFIG[type as RequestType];
                                    const pct = totalRequests > 0 ? (count / totalRequests) * 100 : 0;
                                    return (
                                        <div key={type}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">{config ? <span>{config.icon}</span> : <Briefcase className="h-3 w-3" />}{config?.label || type}</span>
                                                <span className="text-xs text-muted-foreground">{count}</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </DashboardCard>

                    {/* By Urgency */}
                    <DashboardCard icon={<Zap className="h-4 w-4 text-amber-500" />} title="By Urgency">
                        <div className="space-y-2.5">
                            {(["Critical", "High", "Medium", "Low"] as const).map(level => {
                                const count = urgencyBreakdown[level] || 0;
                                const colors: Record<string, { dot: string; bar: string }> = {
                                    Critical: { dot: "bg-red-500", bar: "from-red-500 to-red-400" },
                                    High: { dot: "bg-orange-500", bar: "from-orange-500 to-amber-400" },
                                    Medium: { dot: "bg-amber-500", bar: "from-amber-500 to-yellow-400" },
                                    Low: { dot: "bg-emerald-500", bar: "from-emerald-500 to-green-400" },
                                };
                                const pct = totalRequests > 0 ? (count / totalRequests) * 100 : 0;
                                return (
                                    <div key={level}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-foreground/80 flex items-center gap-1.5"><div className={cn("h-2 w-2 rounded-full", colors[level].dot)} />{level}</span>
                                            <span className="text-xs text-muted-foreground">{count}</span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", colors[level].bar)} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </DashboardCard>

                    {/* Quick Links */}
                    <DashboardCard icon={<Star className="h-4 w-4 text-yellow-500" />} title="Quick Links">
                        <div className="space-y-1.5">
                            <QuickLink href="/board" icon={<LayoutGrid className="h-4 w-4" />} label="My Requests" />
                            <QuickLink href="/it-planner" icon={<Wrench className="h-4 w-4" />} label="Planning Tools" />
                            <QuickLink href="/talent" icon={<Users className="h-4 w-4" />} label="Talent Directory" />
                            <QuickLink href="/profile" icon={<Briefcase className="h-4 w-4" />} label="My Profile" />
                        </div>
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
        <div className="bg-background border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    {icon}{title}
                    {badge && <Badge variant="secondary" className="text-[9px] ml-1">{badge}</Badge>}
                </h2>
                {linkHref && (
                    <Link href={linkHref}>
                        <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground hover:text-foreground">
                            {linkText || "View"} <ArrowRight className="h-3 w-3" />
                        </Button>
                    </Link>
                )}
            </div>
            {children}
        </div>
    );
}

function StatCard({ icon, label, value, color, bgColor, highlight }: {
    icon: React.ReactNode; label: string; value: number; color: string; bgColor: string; highlight?: boolean;
}) {
    return (
        <div className={cn("rounded-2xl border p-4 transition-all duration-200", highlight ? "border-amber-500/20 shadow-sm shadow-amber-500/5" : "border-border")}>
            <div className="flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", bgColor, color)}>{icon}</div>
                <div>
                    <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
                    <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                </div>
            </div>
        </div>
    );
}

function PipelineStep({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div className="text-center">
            <div className="flex items-center justify-center mb-2">
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold", color)}>{count}</div>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground truncate">{label}</p>
        </div>
    );
}

function ProjectRow({ project, isStarred, onToggleStar }: { project: Project; isStarred: boolean; onToggleStar: (id: string) => void }) {
    return (
        <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
            <button onClick={(e) => { e.stopPropagation(); onToggleStar(project.id); }} className="shrink-0 text-muted-foreground hover:text-yellow-500 transition-colors">
                {isStarred ? <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" /> : <StarOff className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
            <Link href={`/it-planner?project=${project.id}`} className="flex-1 min-w-0 flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center">
                    <Wrench className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{project.name}</p>
                    {project.description && <p className="text-[10px] text-muted-foreground truncate">{project.description}</p>}
                </div>
            </Link>
            <Badge variant="outline" className="text-[9px] shrink-0">{project.systemIds?.length || 0} systems</Badge>
        </div>
    );
}

function EmptyState({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children?: React.ReactNode }) {
    return (
        <div className="text-center py-8">
            <Icon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{label}</p>
            {children}
        </div>
    );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors group text-sm">
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">{icon}</span>
            <span className="text-foreground/80 group-hover:text-foreground transition-colors">{label}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-foreground/50 ml-auto transition-colors" />
        </Link>
    );
}
