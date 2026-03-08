"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRole } from "@/components/role-provider";
import {
    getIntelboard, joinIntelboard, createThread, getThread,
    createPost, startHub, getAllUsers, rsvpToHub, getHubWithDetails, createHubComment,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    ArrowLeft, Plus, Loader2, Lock, Globe, MessageSquare, Users,
    Pin, CheckCircle2, Circle, Send, Video, Zap, Clock, ChevronRight,
    Sparkles, X, ExternalLink, ThumbsUp, ThumbsDown, HelpCircle,
    CalendarClock, Radio, Check,
} from "lucide-react";
import Link from "next/link";

type BoardData = Awaited<ReturnType<typeof getIntelboard>>;
type ThreadData = Awaited<ReturnType<typeof getThread>>;
type HubDetail = Awaited<ReturnType<typeof getHubWithDetails>>;

const HUB_STATUS_CONFIG = {
    scheduled: { label: "Scheduled", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: CalendarClock },
    live: { label: "Live Now", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: Radio },
    completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: Check },
};

export default function IntelboardDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { currentUser } = useRole();
    const { toast } = useToast();
    const boardId = params.id as string;

    const [board, setBoard] = useState<BoardData>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateThread, setShowCreateThread] = useState(false);
    const [selectedThread, setSelectedThread] = useState<ThreadData>(null);
    const [threadLoading, setThreadLoading] = useState(false);

    // Hub detail panel
    const [selectedHub, setSelectedHub] = useState<HubDetail>(null);
    const [hubDetailLoading, setHubDetailLoading] = useState(false);
    const [hubComment, setHubComment] = useState("");
    const [isPostingHubComment, setIsPostingHubComment] = useState(false);

    // New thread form
    const [newThreadTitle, setNewThreadTitle] = useState("");
    const [newThreadDesc, setNewThreadDesc] = useState("");
    const [isCreatingThread, setIsCreatingThread] = useState(false);

    // New post form
    const [newPostContent, setNewPostContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);

    // Hub form
    const [showStartHub, setShowStartHub] = useState(false);
    const [hubTitle, setHubTitle] = useState("");
    const [isStartingHub, setIsStartingHub] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const data = await getIntelboard(boardId);
        setBoard(data);
        setLoading(false);
    }, [boardId]);

    useEffect(() => { load(); }, [load]);

    const openThread = async (id: string) => {
        setSelectedHub(null);
        setThreadLoading(true);
        const data = await getThread(id);
        setSelectedThread(data);
        setThreadLoading(false);
    };

    const openHub = async (hubId: string) => {
        setSelectedThread(null);
        setHubDetailLoading(true);
        const data = await getHubWithDetails(hubId);
        setSelectedHub(data);
        setHubDetailLoading(false);
    };

    const handleRsvp = async (hubId: string, status: 'accepted' | 'declined' | 'maybe') => {
        await rsvpToHub(hubId, status);
        toast({ title: status === 'accepted' ? "✅ Accepted" : status === 'maybe' ? "🤔 Maybe" : "❌ Declined" });
        openHub(hubId);
        load();
    };

    const handleHubComment = async () => {
        if (!hubComment || !selectedHub) return;
        setIsPostingHubComment(true);
        try {
            await createHubComment(selectedHub.id, hubComment);
            setHubComment("");
            openHub(selectedHub.id);
        } catch {
            toast({ title: "Error", variant: "destructive" });
        }
        setIsPostingHubComment(false);
    };

    const handleCreateThread = async () => {
        if (!newThreadTitle) return;
        setIsCreatingThread(true);
        try {
            const thread = await createThread(boardId, newThreadTitle, newThreadDesc || undefined);
            toast({ title: "Thread created" });
            setShowCreateThread(false);
            setNewThreadTitle(""); setNewThreadDesc("");
            load();
            openThread(thread.id);
        } catch {
            toast({ title: "Error", variant: "destructive" });
        }
        setIsCreatingThread(false);
    };

    const handlePost = async () => {
        if (!newPostContent || !selectedThread) return;
        setIsPosting(true);
        try {
            await createPost(selectedThread.id, newPostContent);
            setNewPostContent("");
            openThread(selectedThread.id);
            load();
        } catch {
            toast({ title: "Error", variant: "destructive" });
        }
        setIsPosting(false);
    };

    const handleStartHub = async (instant: boolean) => {
        if (!hubTitle) return;
        setIsStartingHub(true);
        try {
            const hub = await startHub({
                threadId: selectedThread?.id,
                intelboardId: boardId,
                title: hubTitle,
                instant,
            });
            toast({
                title: instant ? "🔴 Hub is Live!" : "Hub Scheduled",
                description: `Meeting link: ${hub.meetingUrl}`,
            });
            setShowStartHub(false); setHubTitle("");
            load();
            openHub(hub.id);
        } catch {
            toast({ title: "Error", variant: "destructive" });
        }
        setIsStartingHub(false);
    };

    const isMember = currentUser && board?.memberIds.includes(currentUser.id);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!board) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-12 text-center">
                <h2 className="text-xl font-bold">Intelboard not found</h2>
                <Link href="/intelboards"><Button variant="outline" className="mt-4">← Back</Button></Link>
            </div>
        );
    }

    const statusIcon = { open: <Circle className="h-3 w-3 text-emerald-500" />, resolved: <CheckCircle2 className="h-3 w-3 text-blue-500" />, closed: <CheckCircle2 className="h-3 w-3 text-muted-foreground" /> };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-6">
                <Link href="/intelboards" className="text-xs text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> Back to Intelboards
                </Link>
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {board.visibility === "invite_only" ? <Lock className="h-4 w-4 text-amber-600" /> : <Globe className="h-4 w-4 text-emerald-600" />}
                            <h1 className="text-xl font-bold">{board.title}</h1>
                            {board.category && <Badge variant="outline" className="text-[10px]">{board.category}</Badge>}
                        </div>
                        {board.description && <p className="text-sm text-muted-foreground">{board.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isMember && board.visibility === "open" && (
                            <Button size="sm" onClick={async () => {
                                await joinIntelboard(boardId);
                                toast({ title: "Joined!" });
                                load();
                            }}>Join</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setShowStartHub(true)} className="gap-1.5">
                            <Video className="h-3.5 w-3.5" /> Start Hub
                        </Button>
                        <Button size="sm" onClick={() => setShowCreateThread(true)} className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> New Thread
                        </Button>
                    </div>
                </div>

                {/* Members bar */}
                <div className="flex items-center gap-2 mt-3">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="flex -space-x-1">
                        {board.members.slice(0, 8).map(m => (
                            <div key={m.id} title={m.name || ""} className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 border-2 border-background flex items-center justify-center text-[8px] font-bold text-white">
                                {(m.name || "?")[0]}
                            </div>
                        ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{board.members.length} members · {board.totalPosts} posts</span>
                </div>
            </div>

            {/* Main content */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6">
                {/* Left: Threads + Hub Cards */}
                <div className="space-y-4">
                    {/* Hub Cards Section */}
                    {board.hubs.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hubs</h3>
                            {board.hubs.map(hub => {
                                const config = HUB_STATUS_CONFIG[hub.status as keyof typeof HUB_STATUS_CONFIG] || HUB_STATUS_CONFIG.scheduled;
                                const StatusIcon = config.icon;
                                const rsvps = (hub.rsvps || []) as { userId: string; status: string }[];
                                const accepted = rsvps.filter(r => r.status === 'accepted').length;
                                const maybe = rsvps.filter(r => r.status === 'maybe').length;
                                const declined = rsvps.filter(r => r.status === 'declined').length;
                                const totalResponded = accepted + maybe + declined;
                                const myRsvp = currentUser ? rsvps.find(r => r.userId === currentUser.id) : undefined;

                                return (
                                    <button
                                        key={hub.id}
                                        onClick={() => openHub(hub.id)}
                                        className={cn(
                                            "w-full text-left p-4 rounded-xl border transition-all hover:shadow-md group",
                                            hub.status === "live" ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10" :
                                                hub.status === "completed" ? "border-emerald-500/20 bg-card" :
                                                    "border-blue-500/20 bg-card hover:border-blue-500/30",
                                            selectedHub?.id === hub.id && "ring-2 ring-primary/30"
                                        )}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                                                    hub.status === "live" ? "bg-red-500/20 animate-pulse" :
                                                        hub.status === "completed" ? "bg-emerald-500/10" : "bg-blue-500/10"
                                                )}>
                                                    <StatusIcon className={cn("h-4 w-4",
                                                        hub.status === "live" ? "text-red-600" :
                                                            hub.status === "completed" ? "text-emerald-600" : "text-blue-600"
                                                    )} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-semibold">{hub.title}</h4>
                                                        <Badge variant="outline" className={cn("text-[9px] py-0 border", config.color)}>
                                                            {config.label}
                                                        </Badge>
                                                    </div>
                                                    {hub.startTime && (
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                                            <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                                                            {new Date(hub.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {hub.status === "live" && hub.meetingUrl && (
                                                <a href={hub.meetingUrl} target="_blank" rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold flex items-center gap-1 hover:bg-red-600 transition-colors shrink-0"
                                                >
                                                    <ExternalLink className="h-3 w-3" /> Join
                                                </a>
                                            )}
                                        </div>

                                        {/* RSVP Status Bar */}
                                        <div className="mt-3 flex items-center gap-3">
                                            <div className="flex items-center gap-4 text-[10px]">
                                                <span className="flex items-center gap-1 text-emerald-600">
                                                    <ThumbsUp className="h-2.5 w-2.5" /> {accepted}
                                                </span>
                                                <span className="flex items-center gap-1 text-amber-600">
                                                    <HelpCircle className="h-2.5 w-2.5" /> {maybe}
                                                </span>
                                                <span className="flex items-center gap-1 text-red-500">
                                                    <ThumbsDown className="h-2.5 w-2.5" /> {declined}
                                                </span>
                                            </div>

                                            {totalResponded > 0 && (
                                                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                                    <div className="h-full flex">
                                                        {accepted > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(accepted / totalResponded) * 100}%` }} />}
                                                        {maybe > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(maybe / totalResponded) * 100}%` }} />}
                                                        {declined > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(declined / totalResponded) * 100}%` }} />}
                                                    </div>
                                                </div>
                                            )}

                                            <span className="text-[10px] text-muted-foreground">{totalResponded} responded</span>

                                            {/* Your RSVP quick indicator */}
                                            {myRsvp && (
                                                <Badge variant="secondary" className="text-[8px] py-0">
                                                    You: {myRsvp.status}
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Threads */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threads</h3>

                        {board.threads.length === 0 ? (
                            <div className="text-center py-12 border rounded-xl bg-muted/20">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No threads yet. Start a discussion!</p>
                                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreateThread(true)}>
                                    <Plus className="h-3 w-3 mr-1" /> New Thread
                                </Button>
                            </div>
                        ) : (
                            board.threads.map(thread => (
                                <button
                                    key={thread.id}
                                    onClick={() => openThread(thread.id)}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border transition-all hover:shadow-sm hover:border-primary/20 group",
                                        selectedThread?.id === thread.id ? "border-primary bg-primary/5" : "bg-card"
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-2 min-w-0">
                                            {thread.isPinned && <Pin className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />}
                                            {statusIcon[thread.status as keyof typeof statusIcon] || statusIcon.open}
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">{thread.title}</h4>
                                                {thread.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{thread.description}</p>}
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-0.5" />
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                                        <span>{thread.postCount} posts</span>
                                        {thread.hubCount > 0 && <span className="flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{thread.hubCount} hubs</span>}
                                        <span>Last activity {new Date(thread.lastActivityAt).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Detail Panel (Thread or Hub) */}
                <div className="bg-card border rounded-xl flex flex-col h-[calc(100vh-200px)] sticky top-6">
                    {/* Hub Detail Panel */}
                    {selectedHub && !hubDetailLoading ? (
                        <>
                            <div className="p-4 border-b space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold">{selectedHub.title}</h3>
                                            {(() => {
                                                const c = HUB_STATUS_CONFIG[selectedHub.status as keyof typeof HUB_STATUS_CONFIG] || HUB_STATUS_CONFIG.scheduled;
                                                return <Badge variant="outline" className={cn("text-[9px] py-0 border", c.color)}>{c.label}</Badge>;
                                            })()}
                                        </div>
                                        {selectedHub.creator && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Created by {selectedHub.creator.name} • {new Date(selectedHub.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        {selectedHub.status === "live" && selectedHub.meetingUrl && (
                                            <a href={selectedHub.meetingUrl} target="_blank" rel="noopener noreferrer"
                                                className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold flex items-center gap-1 hover:bg-red-600 transition-colors"
                                            >
                                                <Video className="h-3 w-3" /> Join
                                            </a>
                                        )}
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedHub(null)}>
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* RSVP Section */}
                                <div className="p-3 rounded-lg bg-muted/30 border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-semibold">Attendance</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {selectedHub.accepted + selectedHub.maybe + selectedHub.declined} responded
                                        </span>
                                    </div>

                                    {/* RSVP Progress Bar */}
                                    {(selectedHub.accepted + selectedHub.maybe + selectedHub.declined) > 0 && (
                                        <div className="h-2 bg-muted/50 rounded-full overflow-hidden mb-2">
                                            <div className="h-full flex">
                                                {selectedHub.accepted > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(selectedHub.accepted / (selectedHub.accepted + selectedHub.maybe + selectedHub.declined)) * 100}%` }} />}
                                                {selectedHub.maybe > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(selectedHub.maybe / (selectedHub.accepted + selectedHub.maybe + selectedHub.declined)) * 100}%` }} />}
                                                {selectedHub.declined > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(selectedHub.declined / (selectedHub.accepted + selectedHub.maybe + selectedHub.declined)) * 100}%` }} />}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-[10px] mb-3">
                                        <span className="flex items-center gap-1 text-emerald-600"><ThumbsUp className="h-2.5 w-2.5" /> {selectedHub.accepted} Accepted</span>
                                        <span className="flex items-center gap-1 text-amber-600"><HelpCircle className="h-2.5 w-2.5" /> {selectedHub.maybe} Maybe</span>
                                        <span className="flex items-center gap-1 text-red-500"><ThumbsDown className="h-2.5 w-2.5" /> {selectedHub.declined} Declined</span>
                                    </div>

                                    {/* Accepted user avatars */}
                                    {selectedHub.rsvpsWithUsers.filter(r => r.status === 'accepted').length > 0 && (
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="text-[9px] text-muted-foreground">Attending:</span>
                                            <div className="flex -space-x-1">
                                                {selectedHub.rsvpsWithUsers.filter(r => r.status === 'accepted').slice(0, 6).map(r => (
                                                    <div key={r.userId} title={r.user.name || ""}
                                                        className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 border-2 border-background flex items-center justify-center text-[7px] font-bold text-white"
                                                    >
                                                        {(r.user.name || "?")[0]}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* RSVP buttons */}
                                    {selectedHub.status !== "completed" && (
                                        <div className="flex gap-1.5">
                                            {([
                                                { status: 'accepted' as const, label: 'Accept', icon: ThumbsUp, activeClass: "bg-emerald-500 text-white border-emerald-500" },
                                                { status: 'maybe' as const, label: 'Maybe', icon: HelpCircle, activeClass: "bg-amber-500 text-white border-amber-500" },
                                                { status: 'declined' as const, label: 'Decline', icon: ThumbsDown, activeClass: "bg-red-500 text-white border-red-500" },
                                            ]).map(opt => {
                                                const myRsvp = currentUser ? selectedHub.rsvpsWithUsers.find(r => r.userId === currentUser.id) : undefined;
                                                const isActive = myRsvp?.status === opt.status;
                                                return (
                                                    <Button
                                                        key={opt.status}
                                                        size="sm"
                                                        variant={isActive ? "default" : "outline"}
                                                        className={cn("text-[10px] h-7 gap-1 flex-1", isActive && opt.activeClass)}
                                                        onClick={() => handleRsvp(selectedHub.id, opt.status)}
                                                    >
                                                        <opt.icon className="h-3 w-3" /> {opt.label}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Completed hub AI summary */}
                                {selectedHub.status === "completed" && selectedHub.aiSummary && (
                                    <div className="p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/10">
                                        <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 mb-1">
                                            <Sparkles className="h-2.5 w-2.5" /> AI Summary
                                        </div>
                                        <p className="text-[11px] text-foreground/80">{selectedHub.aiSummary}</p>
                                    </div>
                                )}
                            </div>

                            {/* Pre-meeting / Hub Discussion */}
                            <div className="px-4 pt-2 pb-1">
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {selectedHub.status === "completed" ? "Discussion" : "Pre-meeting Discussion"}
                                </span>
                            </div>

                            <ScrollArea className="flex-1 px-4 py-2">
                                <div className="space-y-3">
                                    {selectedHub.comments.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-6">
                                            {selectedHub.status === "completed"
                                                ? "No discussion for this hub."
                                                : "Add questions, agenda items, or details before the meeting starts."}
                                        </p>
                                    ) : (
                                        selectedHub.comments.map(comment => (
                                            <div key={comment.id} className="flex gap-2.5">
                                                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
                                                    {(comment.author.name || "?")[0]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-[11px] font-semibold">{comment.author.name}</span>
                                                        {"role" in comment.author && comment.author.role && (
                                                            <Badge variant="secondary" className="text-[7px] py-0">{comment.author.role as string}</Badge>
                                                        )}
                                                        <span className="text-[9px] text-muted-foreground">
                                                            {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Hub comment composer */}
                            {selectedHub.status !== "completed" && (
                                <div className="p-3 border-t">
                                    <div className="flex gap-2">
                                        <Input
                                            value={hubComment}
                                            onChange={e => setHubComment(e.target.value)}
                                            placeholder="Add a question or agenda item..."
                                            className="text-xs"
                                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleHubComment()}
                                        />
                                        <Button size="icon" onClick={handleHubComment} disabled={isPostingHubComment || !hubComment} className="h-9 w-9 shrink-0">
                                            {isPostingHubComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : /* Thread Detail Panel */
                        selectedThread && !threadLoading ? (
                            <>
                                <div className="p-4 border-b">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold">{selectedThread.title}</h3>
                                            {selectedThread.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedThread.description}</p>}
                                        </div>
                                        <div className="flex gap-1">
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setShowStartHub(true); setHubTitle(selectedThread.title + " — Hub"); }}>
                                                <Video className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedThread(null)}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Hub banners for this thread */}
                                    {selectedThread.hubs.filter(h => h.status === "live").map(hub => (
                                        <a key={hub.id} href={hub.meetingUrl || "#"} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs hover:bg-red-500/10 transition-colors"
                                        >
                                            <span className="animate-pulse">🔴</span>
                                            <span className="font-medium text-red-600">{hub.title} — Join Now</span>
                                        </a>
                                    ))}

                                    {/* Scheduled hubs with RSVP count */}
                                    {selectedThread.hubs.filter(h => h.status === "scheduled").map(hub => (
                                        <button key={hub.id} onClick={() => openHub(hub.id)}
                                            className="w-full flex items-center gap-2 mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs hover:bg-blue-500/10 transition-colors text-left"
                                        >
                                            <CalendarClock className="h-3 w-3 text-blue-600" />
                                            <span className="font-medium text-blue-600">{hub.title}</span>
                                            <span className="text-muted-foreground ml-auto">View details →</span>
                                        </button>
                                    ))}

                                    {/* Completed hubs summaries */}
                                    {selectedThread.hubs.filter(h => h.status === "completed" && h.aiSummary).map(hub => (
                                        <div key={hub.id} className="mt-2 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/10">
                                            <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 mb-1">
                                                <Sparkles className="h-2.5 w-2.5" /> Hub Summary — {hub.title}
                                            </div>
                                            <p className="text-[11px] text-foreground/80 line-clamp-3">{hub.aiSummary}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Posts */}
                                <ScrollArea className="flex-1 p-4">
                                    <div className="space-y-3">
                                        {selectedThread.posts.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-8">No posts yet. Be the first to contribute!</p>
                                        ) : (
                                            selectedThread.posts.map(post => (
                                                <div key={post.id} className={cn("flex gap-2.5", post.parentPostId && "ml-6")}>
                                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                                        {(post.author.name || "?")[0]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-xs font-semibold">{post.author.name}</span>
                                                            {"role" in post.author && post.author.role && (
                                                                <Badge variant="secondary" className="text-[8px] py-0">{post.author.role as string}</Badge>
                                                            )}
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {new Date(post.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{post.content}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>

                                {/* Post composer */}
                                <div className="p-3 border-t">
                                    <div className="flex gap-2">
                                        <Input
                                            value={newPostContent}
                                            onChange={e => setNewPostContent(e.target.value)}
                                            placeholder="Share your input..."
                                            className="text-xs"
                                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handlePost()}
                                        />
                                        <Button size="icon" onClick={handlePost} disabled={isPosting || !newPostContent} className="h-9 w-9 shrink-0">
                                            {isPosting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (threadLoading || hubDetailLoading) ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-center p-6">
                                <div>
                                    <MessageSquare className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">Select a thread or hub to view details</p>
                                </div>
                            </div>
                        )}
                </div>
            </div>

            {/* Create Thread Dialog */}
            <Dialog open={showCreateThread} onOpenChange={setShowCreateThread}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>New Thread</DialogTitle>
                        <DialogDescription>Start a discussion in {board.title}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div>
                            <Label className="text-xs">Title</Label>
                            <Input value={newThreadTitle} onChange={e => setNewThreadTitle(e.target.value)} placeholder="e.g. API Gateway Architecture" />
                        </div>
                        <div>
                            <Label className="text-xs">Description (optional)</Label>
                            <textarea value={newThreadDesc} onChange={e => setNewThreadDesc(e.target.value)}
                                placeholder="What should be discussed?"
                                className="w-full text-xs bg-muted/30 border rounded-lg p-2.5 min-h-[50px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 mt-1"
                            />
                        </div>
                        <Button onClick={handleCreateThread} disabled={isCreatingThread || !newThreadTitle} className="w-full gap-2">
                            {isCreatingThread ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Create Thread
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Start Hub Dialog */}
            <Dialog open={showStartHub} onOpenChange={setShowStartHub}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Start a Hub</DialogTitle>
                        <DialogDescription>
                            {selectedThread ? `Launch a meeting for "${selectedThread.title}"` : `Start a meeting in ${board.title}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div>
                            <Label className="text-xs">Hub Title</Label>
                            <Input value={hubTitle} onChange={e => setHubTitle(e.target.value)} placeholder="e.g. Quick sync on deployment" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                onClick={() => handleStartHub(true)}
                                disabled={isStartingHub || !hubTitle}
                                className="gap-1.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white"
                            >
                                {isStartingHub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                Start Now
                            </Button>
                            <Button
                                onClick={() => handleStartHub(false)}
                                disabled={isStartingHub || !hubTitle}
                                variant="outline"
                                className="gap-1.5"
                            >
                                <Clock className="h-3.5 w-3.5" />
                                Schedule
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">
                            "Start Now" notifies all members instantly. "Schedule" creates a planned meeting.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
