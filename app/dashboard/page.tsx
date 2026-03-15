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
import {
    REQUEST_TYPE_CONFIG,
    RequestType,
    FeedItem,
    FeedItemThread,
    FeedItemRequest,
    FeedItemEvent,
    FeedItemPost,
    PersonalizedFeedResult,
} from "@/lib/data";
import { getPersonalizedFeed, getHotTopics, followHubCategory } from "@/lib/actions";
import {
    ArrowRight,
    LayoutGrid,
    ListChecks,
    Plus,
    Users,
    Zap,
    FolderOpen,
    MessageSquare,
    CalendarDays,
    CalendarClock,
    Globe,
    Sparkles,
    Flame,
    Target,
    TrendingUp,
    Hash,
    Clock,
    Briefcase,
    ChevronRight,
    Heart,
} from "lucide-react";

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
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function formatEventTime(date: string) {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------
   Feed type config
   ------------------------------------------------------------------ */
const FEED_TYPE_CONFIG = {
    thread: { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "New Discussion", accent: "from-indigo-500 to-violet-500", badgeBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
    post: { icon: <Hash className="h-3.5 w-3.5" />, label: "New Reply", accent: "from-blue-500 to-cyan-500", badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    request: { icon: <Briefcase className="h-3.5 w-3.5" />, label: "Micro-gig", accent: "from-amber-500 to-orange-500", badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    event: { icon: <CalendarDays className="h-3.5 w-3.5" />, label: "Event", accent: "from-emerald-500 to-teal-500", badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const URGENCY_DOT: Record<string, string> = {
    Critical: "bg-red-500",
    High: "bg-orange-500",
    Medium: "bg-amber-500",
    Low: "bg-emerald-500",
};

/* ================================================================== */
export default function DashboardPage() {
    const { role, currentUser } = useRole();
    const router = useRouter();

    const [feed, setFeed] = useState<PersonalizedFeedResult | null>(null);
    const [hotTopics, setHotTopics] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [visibleCount, setVisibleCount] = useState(15);
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

    // Load personalized feed + hot topics
    const loadFeed = useCallback(async () => {
        try {
            const [result, hot] = await Promise.all([
                getPersonalizedFeed(),
                getHotTopics(),
            ]);
            setFeed(result);
            setHotTopics(hot);
            setFollowingIds(new Set(result.followedCategories.map(c => c.id)));
        } catch (e) {
            console.error("Failed to load feed:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadFeed(); }, [loadFeed]);

    const handleFollowCategory = async (categoryId: string) => {
        try {
            const result = await followHubCategory(categoryId);
            if (result.followed) {
                setFollowingIds(prev => new Set([...prev, categoryId]));
            } else {
                setFollowingIds(prev => { const n = new Set(prev); n.delete(categoryId); return n; });
            }
            // Reload feed after follow change
            setTimeout(loadFeed, 500);
        } catch (e) {
            console.error("Failed to follow category:", e);
        }
    };

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    // Derive feed data (must be above loading guard so hooks order is stable)
    const rawFeedItems = feed?.feedItems || [];
    const followedCategories = feed?.followedCategories || [];
    const suggestedCategories = feed?.suggestedCategories || [];

    // Sort feed: live/open events first, then by recency
    const feedItems = useMemo(() => {
        return [...rawFeedItems].sort((a, b) => {
            const isLiveA = a.type === "event" && ((a as FeedItemEvent).meetingStatus === "in_progress" || (a as FeedItemEvent).meetingStatus === "scheduled");
            const isLiveB = b.type === "event" && ((b as FeedItemEvent).meetingStatus === "in_progress" || (b as FeedItemEvent).meetingStatus === "scheduled");
            const isOpenThreadA = a.type === "thread";
            const isOpenThreadB = b.type === "thread";

            // Live events first
            if (isLiveA && !isLiveB) return -1;
            if (!isLiveA && isLiveB) return 1;
            // Open discussions second
            if (isOpenThreadA && !isOpenThreadB && !isLiveB) return -1;
            if (!isOpenThreadA && isOpenThreadB && !isLiveA) return 1;
            // Then by date
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [rawFeedItems]);

    const visibleItems = feedItems.slice(0, visibleCount);
    const hasMore = feedItems.length > visibleCount;
    const totalL1Categories = 12; // total L1 categories in our taxonomy

    if (isLoading) {
        return (
            <div className="container py-8 max-w-6xl">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-64 bg-muted rounded" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl" />)}
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted rounded-2xl" />)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="container py-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {greeting()}, {currentUser?.name?.split(" ")[0] || "there"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Your professional intelligence hub
                    </p>
                </div>
                {(role === "Customer" || role === "Admin" || role === "Guest") && (
                    <NewRequestDialog />
                )}
            </div>

            {/* ── 🔥 Hot Topics Banner ── */}
            {hotTopics.length > 0 && (
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <h2 className="text-sm font-semibold text-foreground">Hot Topics</h2>
                        <span className="text-[10px] text-muted-foreground">Trending in IT right now</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
                        {hotTopics.map((topic) => (
                            <Link key={topic.id} href={`/intel-hub/${topic.slug}`} className="snap-start shrink-0 group">
                                <div className={cn(
                                    "w-[200px] rounded-2xl border p-4 transition-all hover:shadow-lg hover:scale-[1.02] bg-gradient-to-br relative overflow-hidden",
                                    "from-card to-card hover:border-orange-500/30"
                                )}>
                                    {/* Fire accent */}
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-orange-500/5 to-transparent rounded-bl-full" />
                                    <div className="relative">
                                        <span className="text-2xl">{topic.icon}</span>
                                        <h3 className="text-xs font-bold text-foreground mt-2 line-clamp-1 group-hover:text-orange-500 transition-colors">{topic.title}</h3>
                                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 min-h-[28px]">{topic.description}</p>
                                        <div className="flex items-center justify-between mt-3">
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 bg-orange-500/5 text-orange-600 dark:text-orange-400 border-orange-500/20">
                                                {topic.hotLabel}
                                            </Badge>
                                            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                                <Users className="h-2.5 w-2.5" /> {topic.followerCount}
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFollowCategory(topic.id); }}
                                            className={cn(
                                                "w-full mt-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all border",
                                                followingIds.has(topic.id)
                                                    ? "bg-primary/10 text-primary border-primary/20"
                                                    : "bg-orange-500/5 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/10"
                                            )}
                                        >
                                            {followingIds.has(topic.id) ? "✓ Following" : "+ Follow"}
                                        </button>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Two-Column Feed Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ===== LEFT: FEED STREAM (2 cols) ===== */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Feed header */}
                    <div className="flex items-center gap-2 px-1">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">Your Feed</h2>
                        <span className="text-xs text-muted-foreground">
                            {feedItems.length} item{feedItems.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {/* Empty state */}
                    {feedItems.length === 0 && (
                        <div className="bg-card rounded-2xl border p-8 text-center">
                            <Sparkles className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">Your feed is empty</h3>
                            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
                                Follow categories that interest you to get a personalized feed of discussions, events, and micro-gigs from the community.
                            </p>
                            <Link href="/intel-hub">
                                <Button size="sm" className="gap-1.5">
                                    <LayoutGrid className="h-3.5 w-3.5" /> Browse Categories
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Feed items */}
                    {visibleItems.map(item => (
                        <FeedCard key={`${item.type}-${item.id}`} item={item} />
                    ))}

                    {/* Load more */}
                    {hasMore && (
                        <button
                            onClick={() => setVisibleCount(prev => prev + 15)}
                            className="w-full py-3 rounded-2xl border border-dashed text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                        >
                            Load more ({feedItems.length - visibleCount} remaining)
                        </button>
                    )}
                </div>

                {/* ===== RIGHT: SIDEBAR ===== */}
                <div className="space-y-5">
                    {/* Quick Actions */}
                    <div className="bg-card rounded-2xl border p-4 space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h3>
                        <Link href="/intelboards" className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><MessageSquare className="h-4 w-4" /></div>
                            <span className="text-xs font-medium text-foreground group-hover:text-indigo-500 transition-colors">Start Discussion</span>
                        </Link>
                        <Link href="/calendar" className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><CalendarClock className="h-4 w-4" /></div>
                            <span className="text-xs font-medium text-foreground group-hover:text-emerald-500 transition-colors">Schedule Event</span>
                        </Link>
                        <Link href="/board" className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center"><Briefcase className="h-4 w-4" /></div>
                            <span className="text-xs font-medium text-foreground group-hover:text-amber-500 transition-colors">Post a Micro-gig</span>
                        </Link>
                    </div>

                    {/* Your Categories */}
                    <div className="bg-card rounded-2xl border p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Categories</h3>
                            <Link href="/intel-hub" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
                                Browse <ArrowRight className="h-2.5 w-2.5" />
                            </Link>
                        </div>
                        {followedCategories.length === 0 ? (
                            <div className="text-center py-4">
                                <LayoutGrid className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                                <p className="text-[10px] text-muted-foreground">No categories followed yet</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {followedCategories.map(cat => (
                                    <Link
                                        key={cat.id}
                                        href={`/intel-hub/${cat.slug}`}
                                        className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                                    >
                                        <span className="text-base">{cat.icon || "📂"}</span>
                                        <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{cat.title}</span>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 ml-auto shrink-0 group-hover:text-foreground/50 transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grow Your Intel */}
                    <div className="bg-gradient-to-br from-card to-card rounded-2xl border p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-violet-500/5 to-transparent rounded-bl-full" />
                        <div className="flex items-center gap-1.5 mb-2 relative">
                            <Target className="h-3.5 w-3.5 text-violet-500" />
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grow Your Intel</h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-3 relative">
                            Follow topics to build your professional knowledge map
                        </p>
                        {/* Progress ring */}
                        <div className="flex items-center gap-3 mb-3 bg-muted/30 rounded-xl p-3 relative">
                            <div className="relative h-10 w-10 shrink-0">
                                <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                                        strokeDasharray={`${Math.round((followedCategories.length / totalL1Categories) * 88)} 88`}
                                        strokeLinecap="round" className="text-violet-500 transition-all duration-500" />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                                    {followedCategories.length}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-foreground">{followedCategories.length} of {totalL1Categories}</p>
                                <p className="text-[10px] text-muted-foreground">categories followed</p>
                            </div>
                        </div>
                        {/* Suggested topics */}
                        {suggestedCategories.length > 0 && (
                            <div className="space-y-1.5 relative">
                                <p className="text-[10px] font-medium text-muted-foreground mb-1">Explore next:</p>
                                {suggestedCategories.slice(0, 5).map(cat => (
                                    <div key={cat.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors group">
                                        <span className="text-base">{cat.icon || "📂"}</span>
                                        <div className="flex-1 min-w-0">
                                            <Link href={`/intel-hub/${cat.slug}`}>
                                                <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{cat.title}</p>
                                            </Link>
                                        </div>
                                        <button
                                            onClick={() => handleFollowCategory(cat.id)}
                                            className={cn(
                                                "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all",
                                                followingIds.has(cat.id)
                                                    ? "bg-primary/10 text-primary"
                                                    : "bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground"
                                            )}
                                        >
                                            {followingIds.has(cat.id) ? "Following" : "+ Follow"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Community Links */}
                    <div className="bg-card rounded-2xl border p-4">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Explore</h3>
                        <div className="space-y-1">
                            <SidebarLink href="/intelboards" icon={<Globe className="h-3.5 w-3.5 text-indigo-500" />} label="Forums" />
                            <SidebarLink href="/intel-hub" icon={<LayoutGrid className="h-3.5 w-3.5 text-blue-500" />} label="All Categories" />
                            <SidebarLink href="/calendar" icon={<CalendarDays className="h-3.5 w-3.5 text-emerald-500" />} label="Events" />
                            <SidebarLink href="/board" icon={<ListChecks className="h-3.5 w-3.5 text-violet-500" />} label="Open Requests" />
                            <SidebarLink href="/talent" icon={<Users className="h-3.5 w-3.5 text-amber-500" />} label="Members" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ================================================================== */
/*  Feed Card                                                          */
/* ================================================================== */

function FeedCard({ item }: { item: FeedItem }) {
    const config = FEED_TYPE_CONFIG[item.type];

    return (
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all duration-200 group">
            {/* Accent top bar */}
            <div className={cn("h-0.5 bg-gradient-to-r", config.accent)} />

            <div className="p-4">
                {/* Header: Author + Type + Time */}
                <div className="flex items-center gap-2 mb-2.5">
                    {item.type === "thread" || item.type === "post" ? (
                        <AuthorAvatar name={(item as FeedItemThread | FeedItemPost).authorName} avatar={(item as FeedItemThread | FeedItemPost).authorAvatar} />
                    ) : item.type === "request" ? (
                        <AuthorAvatar name={(item as FeedItemRequest).creatorName} />
                    ) : (
                        <AuthorAvatar name={(item as FeedItemEvent).creatorName} />
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate">
                                {item.type === "thread" ? (item as FeedItemThread).authorName :
                                 item.type === "post" ? (item as FeedItemPost).authorName :
                                 item.type === "request" ? (item as FeedItemRequest).creatorName :
                                 (item as FeedItemEvent).creatorName}
                            </span>
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 gap-0.5 shrink-0", config.badgeBg)}>
                                {config.icon} {config.label}
                            </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                    </div>
                </div>

                {/* Content by type */}
                {item.type === "thread" && <ThreadContent item={item as FeedItemThread} />}
                {item.type === "post" && <PostContent item={item as FeedItemPost} />}
                {item.type === "request" && <RequestContent item={item as FeedItemRequest} />}
                {item.type === "event" && <EventContent item={item as FeedItemEvent} />}
            </div>
        </div>
    );
}

/* ── Type-specific content ── */

function ThreadContent({ item }: { item: FeedItemThread }) {
    return (
        <Link href={`/intelboards`} className="block">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                {item.title}
            </h3>
            {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
            )}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                    <span>{item.categoryIcon}</span> {item.categoryTitle}
                </span>
                <span className="flex items-center gap-1">
                    <Globe className="h-2.5 w-2.5" /> {item.boardTitle}
                </span>
                <span className="flex items-center gap-1">
                    <MessageSquare className="h-2.5 w-2.5" /> {item.postCount} replies
                </span>
            </div>
        </Link>
    );
}

function PostContent({ item }: { item: FeedItemPost }) {
    return (
        <Link href={`/intelboards`} className="block">
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground">
                <span>{item.categoryIcon}</span>
                <span className="font-medium text-foreground/70">{item.boardTitle}</span>
                <span>›</span>
                <span className="truncate">{item.threadTitle}</span>
            </div>
            <p className="text-xs text-foreground leading-relaxed line-clamp-3 bg-muted/30 rounded-lg p-2.5 border border-border/50">
                {item.content}
            </p>
            {item.authorRole && (
                <span className="text-[9px] text-muted-foreground mt-1.5 inline-block">{item.authorRole}</span>
            )}
        </Link>
    );
}

function RequestContent({ item }: { item: FeedItemRequest }) {
    return (
        <Link href={`/board?requestId=${item.id}`} className="block">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors mb-1">
                {item.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
            <div className="flex items-center gap-3 flex-wrap">
                {item.requestType && REQUEST_TYPE_CONFIG[item.requestType as RequestType] && (
                    <Badge variant="outline" className={cn(
                        "text-[9px] px-1.5 py-0",
                        REQUEST_TYPE_CONFIG[item.requestType as RequestType].color,
                        REQUEST_TYPE_CONFIG[item.requestType as RequestType].border,
                        REQUEST_TYPE_CONFIG[item.requestType as RequestType].bg,
                    )}>
                        {REQUEST_TYPE_CONFIG[item.requestType as RequestType].icon} {REQUEST_TYPE_CONFIG[item.requestType as RequestType].label}
                    </Badge>
                )}
                {item.urgency && (
                    <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                        <div className={cn("h-1.5 w-1.5 rounded-full", URGENCY_DOT[item.urgency] || "bg-muted")} />
                        {item.urgency}
                    </span>
                )}
                {item.budget && (
                    <span className="text-[10px] text-muted-foreground">{item.budget}</span>
                )}
                {item.industry && (
                    <span className="text-[10px] text-muted-foreground">{item.industry}</span>
                )}
            </div>
        </Link>
    );
}

function EventContent({ item }: { item: FeedItemEvent }) {
    return (
        <Link href={`/events/${item.id}`} className="block">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors mb-1.5">
                {item.title}
            </h3>
            {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
            )}
            <div className="flex items-center gap-4 text-[10px]">
                {item.startTime && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CalendarDays className="h-3 w-3" />
                        {formatEventDate(item.startTime)} · {formatEventTime(item.startTime)}
                    </span>
                )}
                {item.location && (
                    <span className="text-muted-foreground">{item.location}</span>
                )}
                {item.attendeeCount > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-2.5 w-2.5" /> {item.attendeeCount} attending
                    </span>
                )}
            </div>
        </Link>
    );
}

/* ── Shared sub-components ── */

function AuthorAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
    const initials = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
    return avatar ? (
        <img src={avatar} alt={name} className="h-8 w-8 rounded-full object-cover shrink-0" />
    ) : (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {initials}
        </div>
    );
}

function SidebarLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
            {icon}
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{label}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30 ml-auto group-hover:text-foreground/50 transition-colors" />
        </Link>
    );
}
