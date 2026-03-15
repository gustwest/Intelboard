"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRole } from "@/components/role-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getHubCategory, followHubCategory, createHubCategory, ensureCategoryForum, getCategoryForumInsights, rateCategorySkill, getCategorySkillRating, addCategoryExperience, getCategoryExperiences, fetchAndSaveWikiDefinition } from "@/lib/actions";
import { fetchCategoryKnowledge, type CategoryKnowledge, type KnowledgeItem } from "@/lib/knowledge-sources";
import { RatingStars } from "@/components/rating-stars";
import { ExperiencePromptDialog } from "@/components/experience-prompt-dialog";
import {
    ArrowLeft,
    ChevronRight,
    Users,
    Plus,
    Bell,
    BellOff,
    FolderTree,
    BookOpen,
    MessageSquare,
    Video,
    ArrowRight,
    Layers,
    Home,
    Share2,
    ExternalLink,
    Globe,
    Newspaper,
    MessageCircle,
    RefreshCw,
    Loader2,
    Sparkles,
    Lightbulb,
    Clock,
    PenLine,
    Send,
    ChevronDown,
    ChevronUp,
    BookOpenText,
    Download,
} from "lucide-react";
import { ShareInviteDialog } from "@/components/share-invite-dialog";

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-600 dark:text-blue-400", gradient: "from-blue-500 to-blue-600" },
    sky: { bg: "bg-sky-500/10", border: "border-sky-500/20", text: "text-sky-600 dark:text-sky-400", gradient: "from-sky-500 to-sky-600" },
    cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-600 dark:text-cyan-400", gradient: "from-cyan-500 to-cyan-600" },
    red: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-600 dark:text-red-400", gradient: "from-red-500 to-red-600" },
    orange: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-600 dark:text-orange-400", gradient: "from-orange-500 to-orange-600" },
    violet: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-600 dark:text-violet-400", gradient: "from-violet-500 to-violet-600" },
    purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-600 dark:text-purple-400", gradient: "from-purple-500 to-purple-600" },
    amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-600 dark:text-amber-400", gradient: "from-amber-500 to-amber-600" },
    slate: { bg: "bg-slate-500/10", border: "border-slate-500/20", text: "text-slate-600 dark:text-slate-400", gradient: "from-slate-500 to-slate-600" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", gradient: "from-emerald-500 to-emerald-600" },
    stone: { bg: "bg-stone-500/10", border: "border-stone-500/20", text: "text-stone-600 dark:text-stone-400", gradient: "from-stone-500 to-stone-600" },
    green: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-600 dark:text-green-400", gradient: "from-green-500 to-green-600" },
    teal: { bg: "bg-teal-500/10", border: "border-teal-500/20", text: "text-teal-600 dark:text-teal-400", gradient: "from-teal-500 to-teal-600" },
    pink: { bg: "bg-pink-500/10", border: "border-pink-500/20", text: "text-pink-600 dark:text-pink-400", gradient: "from-pink-500 to-pink-600" },
    indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-600 dark:text-indigo-400", gradient: "from-indigo-500 to-indigo-600" },
    lime: { bg: "bg-lime-500/10", border: "border-lime-500/20", text: "text-lime-600 dark:text-lime-400", gradient: "from-lime-500 to-lime-600" },
    yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400", gradient: "from-yellow-500 to-yellow-600" },
    fuchsia: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", text: "text-fuchsia-600 dark:text-fuchsia-400", gradient: "from-fuchsia-500 to-fuchsia-600" },
};

function getColor(c: string | null) {
    return COLOR_MAP[c || "blue"] || COLOR_MAP.blue;
}

// ─── Knowledge Source Icons ──────────────────────────────────────────

function SourceIcon({ source }: { source: string }) {
    switch (source) {
        case "wikipedia": return <Globe className="h-3.5 w-3.5 text-blue-500" />;
        case "devto": return <Newspaper className="h-3.5 w-3.5 text-emerald-500" />;
        case "hackernews": return <MessageCircle className="h-3.5 w-3.5 text-orange-500" />;
        default: return <ExternalLink className="h-3.5 w-3.5" />;
    }
}

function SourceLabel({ source }: { source: string }) {
    switch (source) {
        case "wikipedia": return <span className="text-blue-500">Wikipedia</span>;
        case "devto": return <span className="text-emerald-500">DEV.to</span>;
        case "hackernews": return <span className="text-orange-500">Hacker News</span>;
        default: return <span>{source}</span>;
    }
}

// ─── Knowledge Article Card ─────────────────────────────────────────

function ArticleCard({ item }: { item: KnowledgeItem }) {
    return (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
            <div className="flex items-start gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors bg-card">
                <div className="mt-0.5 shrink-0">
                    <SourceIcon source={item.source} />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground truncate group-hover:text-indigo-500 transition-colors">
                        {item.title}
                    </h4>
                    {item.summary && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{item.summary}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-medium"><SourceLabel source={item.source} /></span>
                        {item.publishedAt && (
                            <span className="text-[10px] text-muted-foreground">
                                {new Date(item.publishedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0 mt-1" />
            </div>
        </a>
    );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function IntelHubSpacePage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const { currentUser } = useRole();

    const [space, setSpace] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateSub, setShowCreateSub] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newIcon, setNewIcon] = useState("");
    const [creating, setCreating] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState(false);

    // Knowledge state
    const [knowledge, setKnowledge] = useState<CategoryKnowledge | null>(null);
    const [knowledgeLoading, setKnowledgeLoading] = useState(false);
    const [knowledgeTab, setKnowledgeTab] = useState<"overview" | "articles" | "discussions">("overview");

    // Wikipedia definition state
    const [wikiExpanded, setWikiExpanded] = useState(false);
    const [wikiFetching, setWikiFetching] = useState(false);

    // Auto-forum state
    const [forumInfo, setForumInfo] = useState<{ id: string; title: string } | null>(null);

    // Community insights state
    const [insights, setInsights] = useState<any[]>([]);

    // Skill self-rating state
    const [skillLevel, setSkillLevel] = useState(0);

    // Experience state
    const [experiences, setExperiences] = useState<any[]>([]);
    const [showExpForm, setShowExpForm] = useState(false);
    const [expTitle, setExpTitle] = useState("");
    const [expContent, setExpContent] = useState("");
    const [expSaving, setExpSaving] = useState(false);

    const load = useCallback(async () => {
        if (!currentUser || !slug) return;
        const data = await getHubCategory(slug, currentUser.id);
        setSpace(data);
        setLoading(false);
    }, [slug, currentUser]);

    useEffect(() => { load(); }, [load]);

    // Auto-create forum and fetch knowledge when space loads
    useEffect(() => {
        if (!space?.id) return;

        // Auto-create forum
        const createForum = async () => {
            try {
                const result = await ensureCategoryForum(space.id, space.title);
                setForumInfo({ id: result.id, title: result.title });
                // Reload space data to get the linked board
                if (result.isNew) load();
            } catch (e) {
                console.error("Failed to ensure forum:", e);
            }
        };
        createForum();

        // Fetch knowledge (only if not already loaded)
        if (!knowledge) {
            fetchKnowledge();
        }

        // Fetch community insights
        const loadInsights = async () => {
            try {
                const data = await getCategoryForumInsights(space.id);
                setInsights(data);
            } catch (e) {
                console.error("Failed to load insights:", e);
            }
        };
        loadInsights();

        // Fetch skill rating
        const loadSkill = async () => {
            try {
                const { level } = await getCategorySkillRating(space.id);
                setSkillLevel(level);
            } catch (e) { console.error("Failed to load skill:", e); }
        };
        loadSkill();

        // Fetch experiences
        const loadExps = async () => {
            try {
                const exps = await getCategoryExperiences(space.id);
                setExperiences(exps);
            } catch (e) { console.error("Failed to load experiences:", e); }
        };
        loadExps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [space?.id]);

    const fetchKnowledge = async () => {
        if (!space?.title) return;
        setKnowledgeLoading(true);
        try {
            const data = await fetchCategoryKnowledge(space.title);
            setKnowledge(data);
        } catch (e) {
            console.error("Failed to fetch knowledge:", e);
        } finally {
            setKnowledgeLoading(false);
        }
    };

    const [showExperiencePrompt, setShowExperiencePrompt] = useState(false);

    const handleFollow = async () => {
        if (!space) return;
        const wasFollowed = space.isFollowed;
        await followHubCategory(space.id);
        setSpace((prev: any) => ({
            ...prev,
            isFollowed: !prev.isFollowed,
            followerCount: prev.isFollowed ? prev.followerCount - 1 : prev.followerCount + 1,
        }));
        // Show experience prompt when following (not unfollowing)
        if (!wasFollowed) {
            setShowExperiencePrompt(true);
        }
    };

    const handleFollowChild = async (childId: string) => {
        await followHubCategory(childId);
        setSpace((prev: any) => ({
            ...prev,
            children: prev.children.map((c: any) =>
                c.id === childId ? { ...c, isFollowed: !c.isFollowed, followerCount: c.isFollowed ? c.followerCount - 1 : c.followerCount + 1 } : c
            ),
        }));
    };

    const handleCreateSub = async () => {
        if (!newTitle.trim() || !space) return;
        setCreating(true);
        const slugified = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        try {
            await createHubCategory({
                title: newTitle,
                slug: slugified,
                description: newDesc || undefined,
                icon: newIcon || undefined,
                parentId: space.id,
            });
            setNewTitle("");
            setNewDesc("");
            setNewIcon("");
            setShowCreateSub(false);
            load();
        } catch {
            // handle error
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="container py-8 max-w-5xl">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 w-32 bg-muted rounded" />
                    <div className="h-10 w-64 bg-muted rounded" />
                    <div className="h-20 bg-muted rounded-xl" />
                </div>
            </div>
        );
    }

    if (!space) {
        return (
            <div className="container py-8 max-w-5xl text-center">
                <p className="text-muted-foreground">Space not found</p>
                <Link href="/intel-hub"><Button variant="outline" className="mt-4 gap-1.5"><ArrowLeft className="h-4 w-4" /> Back to Intel Hub</Button></Link>
            </div>
        );
    }

    const color = getColor(space.color);

    return (
        <div className="container py-6 max-w-5xl space-y-6">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                <Link href="/intel-hub" className="flex items-center gap-1 hover:text-foreground transition-colors">
                    <Home className="h-3 w-3" /> Intel Hub
                </Link>
                {space.ancestors?.map((a: any) => (
                    <span key={a.id} className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3" />
                        <Link href={`/intel-hub/${a.slug}`} className="hover:text-foreground transition-colors">
                            {a.icon} {a.title}
                        </Link>
                    </span>
                ))}
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-foreground">{space.icon} {space.title}</span>
            </nav>

            {/* Space Header */}
            <div className={cn("relative overflow-hidden rounded-2xl border p-6", color.bg, color.border)}>
                <div className="absolute top-0 right-0 opacity-5">
                    <Layers className="h-40 w-40 text-foreground" />
                </div>
                <div className="relative flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="text-4xl">{space.icon || "📂"}</span>
                            <div>
                                <h1 className={cn("text-2xl font-bold", color.text)}>{space.title}</h1>
                                {space.description && (
                                    <p className="text-sm text-muted-foreground mt-1 max-w-xl">{space.description}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-4">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {space.followerCount} followers</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><FolderTree className="h-3.5 w-3.5" /> {space.children?.length || 0} sub-spaces</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {space.linkedBoards?.length || 0} discussions</span>
                            <Badge variant="outline" className="text-[10px]">Depth {space.depth}</Badge>
                        </div>
                        {/* Skill Self-Rating */}
                        <div className="flex items-center gap-3 mt-3 bg-background/30 rounded-lg p-2.5 border border-border/30">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Your skill:</span>
                            <RatingStars
                                value={skillLevel}
                                onChange={async (level) => {
                                    setSkillLevel(level);
                                    await rateCategorySkill(space.id, level);
                                }}
                                size="sm"
                                showLabel
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                            onClick={() => setShowShareDialog(true)}
                        >
                            <Share2 className="h-3.5 w-3.5" /> Share & Invite
                        </Button>
                        <Button
                            size="sm"
                            variant={space.isFollowed ? "secondary" : "outline"}
                            onClick={handleFollow}
                            className={cn("gap-1.5", !space.isFollowed && "bg-background/50 hover:bg-background/80 border-border/50")}
                        >
                            {space.isFollowed ? <><BellOff className="h-3.5 w-3.5" /> Following</> : <><Bell className="h-3.5 w-3.5" /> Follow</>}
                        </Button>
                    </div>
                </div>
            </div>

            {/* ─── Community Insights (Experience-First) ──────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Lightbulb className="h-4 w-4 text-violet-500" /> Community Insights
                    </h2>
                    {forumInfo && (
                        <Link href={`/intelboards/${forumInfo.id}`}>
                            <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-7">
                                <MessageSquare className="h-3 w-3" /> Open Forum
                            </Button>
                        </Link>
                    )}
                </div>

                {insights.length > 0 ? (
                    <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground">
                            Real experiences, challenges, and practical applications from the community
                        </p>
                        {insights.map((thread: any) => (
                            <Link key={thread.id} href={`/intelboards/${thread.forumId}`} className="group block">
                                <div className="flex items-start gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors bg-card">
                                    {thread.authorAvatar ? (
                                        <img src={thread.authorAvatar} alt={thread.authorName} className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5" />
                                    ) : (
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                                            {thread.authorName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-foreground truncate group-hover:text-violet-500 transition-colors">
                                            {thread.title}
                                        </h4>
                                        {thread.description && (
                                            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{thread.description}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                                            <span className="font-medium text-foreground/70">{thread.authorName}</span>
                                            <span className="flex items-center gap-0.5">
                                                <MessageSquare className="h-2.5 w-2.5" /> {thread.postCount} replies
                                            </span>
                                            <span className="flex items-center gap-0.5">
                                                <Clock className="h-2.5 w-2.5" /> {new Date(thread.lastActivityAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0 mt-2" />
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 bg-card rounded-xl border">
                        <Lightbulb className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground mb-1">No community insights yet</p>
                        <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">
                            Be the first to share your experience! Start a discussion in the forum to share challenges, solutions, and practical knowledge.
                        </p>
                        {forumInfo && (
                            <Link href={`/intelboards/${forumInfo.id}`}>
                                <Button size="sm" variant="outline" className="mt-3 gap-1.5 text-xs">
                                    <Plus className="h-3 w-3" /> Start a Discussion
                                </Button>
                            </Link>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Share Your Experience ─────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <PenLine className="h-4 w-4 text-emerald-500" /> Share Your Experience
                    </h2>
                    {!showExpForm && (
                        <Button size="sm" variant="outline" onClick={() => setShowExpForm(true)} className="gap-1.5 text-xs h-7">
                            <Plus className="h-3 w-3" /> Write
                        </Button>
                    )}
                </div>

                {showExpForm && (
                    <div className="bg-card rounded-xl border p-4 space-y-3">
                        <input
                            type="text"
                            placeholder="Experience title (e.g. 'Migrating to Kubernetes at scale')"
                            value={expTitle}
                            onChange={(e) => setExpTitle(e.target.value)}
                            className="w-full text-sm font-medium bg-transparent border-b border-border/50 pb-2 focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                        />
                        <textarea
                            placeholder="Describe your involvement, challenges faced, and lessons learned..."
                            value={expContent}
                            onChange={(e) => setExpContent(e.target.value)}
                            rows={4}
                            className="w-full text-xs bg-transparent border rounded-lg border-border/50 p-2.5 focus:outline-none focus:border-primary placeholder:text-muted-foreground/50 resize-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setShowExpForm(false); setExpTitle(""); setExpContent(""); }} className="text-xs h-7">
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                disabled={!expTitle.trim() || !expContent.trim() || expSaving}
                                onClick={async () => {
                                    setExpSaving(true);
                                    try {
                                        const result = await addCategoryExperience(space.id, expTitle.trim(), expContent.trim());
                                        if (result.success) {
                                            setShowExpForm(false);
                                            setExpTitle("");
                                            setExpContent("");
                                            // Reload experiences
                                            const exps = await getCategoryExperiences(space.id);
                                            setExperiences(exps);
                                        }
                                    } catch (e) { console.error(e); }
                                    setExpSaving(false);
                                }}
                                className="gap-1.5 text-xs h-7"
                            >
                                <Send className="h-3 w-3" /> Publish
                            </Button>
                        </div>
                    </div>
                )}

                {/* Existing experiences */}
                {experiences.length > 0 && (
                    <div className="space-y-2">
                        {experiences.map((exp: any) => (
                            <div key={exp.id} className="bg-card rounded-xl border p-3">
                                <div className="flex items-start gap-3">
                                    {exp.userAvatar ? (
                                        <img src={exp.userAvatar} alt={exp.userName} className="h-7 w-7 rounded-full object-cover shrink-0 mt-0.5" />
                                    ) : (
                                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5">
                                            {(exp.userName || "U").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-semibold text-foreground">{exp.title}</h4>
                                        <p className="text-[10px] text-muted-foreground line-clamp-3 mt-0.5">{exp.content}</p>
                                        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                                            <span className="font-medium text-foreground/70">{exp.userName}</span>
                                            <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Knowledge & Resources ─────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-amber-500" /> Knowledge & Resources
                    </h2>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs h-7"
                        onClick={fetchKnowledge}
                        disabled={knowledgeLoading}
                    >
                        {knowledgeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Refresh
                    </Button>
                </div>

                {/* Knowledge tabs */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
                    {[
                        { key: "overview" as const, icon: Globe, label: "Overview" },
                        { key: "articles" as const, icon: Newspaper, label: "Articles" },
                        { key: "discussions" as const, icon: MessageCircle, label: "Discussions" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setKnowledgeTab(tab.key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all",
                                knowledgeTab === tab.key
                                    ? "bg-background shadow-sm font-medium text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <tab.icon className="h-3 w-3" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Knowledge content */}
                {knowledgeLoading && !knowledge ? (
                    <div className="py-8 text-center bg-card rounded-xl border">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-xs text-muted-foreground mt-2">Fetching knowledge from external sources...</p>
                    </div>
                ) : knowledge ? (
                    <div className="space-y-3">
                        {/* Overview tab: Wikipedia definition */}
                        {knowledgeTab === "overview" && (
                            <div className="space-y-3">
                                {/* Wikipedia Definition Card */}
                                {space.wikiContent ? (
                                    <div className="bg-card rounded-xl border overflow-hidden">
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-500/5">
                                            <div className="flex items-center gap-2">
                                                <BookOpenText className="h-4 w-4 text-blue-500" />
                                                <span className="text-xs font-semibold text-foreground">Definition</span>
                                                <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-500 px-1.5 py-0">
                                                    Wikipedia
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {space.wikiFetchedAt && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Updated {new Date(space.wikiFetchedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="gap-1 text-[10px] h-6 text-blue-500 hover:text-blue-600"
                                                    disabled={wikiFetching}
                                                    onClick={async () => {
                                                        setWikiFetching(true);
                                                        try {
                                                            const result = await fetchAndSaveWikiDefinition(space.id);
                                                            if ('error' in result) {
                                                                console.error(result.error);
                                                            } else {
                                                                setSpace((prev: any) => ({
                                                                    ...prev,
                                                                    wikiTitle: result.wikiTitle,
                                                                    wikiSummary: result.wikiSummary,
                                                                    wikiContent: result.wikiContent,
                                                                    wikiUrl: result.wikiUrl,
                                                                    wikiImageUrl: result.wikiImageUrl,
                                                                    wikiFetchedAt: result.wikiFetchedAt,
                                                                }));
                                                            }
                                                        } catch (e) { console.error(e); }
                                                        setWikiFetching(false);
                                                    }}
                                                >
                                                    {wikiFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                                    Check for Updates
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-4">
                                            <div className="flex items-start gap-4">
                                                {space.wikiImageUrl && (
                                                    <img
                                                        src={space.wikiImageUrl}
                                                        alt={space.wikiTitle || space.title}
                                                        className="w-24 h-24 rounded-lg object-cover shrink-0 border"
                                                    />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="text-sm font-semibold text-foreground mb-2">{space.wikiTitle || space.title}</h3>
                                                    <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                                        {wikiExpanded
                                                            ? space.wikiContent
                                                            : (space.wikiContent.length > 600
                                                                ? space.wikiContent.substring(0, 600) + "..."
                                                                : space.wikiContent)
                                                        }
                                                    </div>
                                                    {space.wikiContent.length > 600 && (
                                                        <button
                                                            onClick={() => setWikiExpanded(!wikiExpanded)}
                                                            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 font-medium mt-3 transition-colors"
                                                        >
                                                            {wikiExpanded ? (
                                                                <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                                                            ) : (
                                                                <><ChevronDown className="h-3.5 w-3.5" /> Read full article</>
                                                            )}
                                                        </button>
                                                    )}
                                                    <div className="mt-3 pt-3 border-t flex items-center gap-3">
                                                        <a
                                                            href={space.wikiUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline"
                                                        >
                                                            View on Wikipedia <ExternalLink className="h-2.5 w-2.5" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-card rounded-xl border space-y-3">
                                        <BookOpenText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">No definition loaded yet</p>
                                            <p className="text-xs text-muted-foreground mt-1">Get the definition and background information from Wikipedia</p>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="gap-2"
                                            disabled={wikiFetching}
                                            onClick={async () => {
                                                setWikiFetching(true);
                                                try {
                                                    const result = await fetchAndSaveWikiDefinition(space.id);
                                                    if ('error' in result) {
                                                        console.error(result.error);
                                                    } else {
                                                        setSpace((prev: any) => ({
                                                            ...prev,
                                                            wikiTitle: result.wikiTitle,
                                                            wikiSummary: result.wikiSummary,
                                                            wikiContent: result.wikiContent,
                                                            wikiUrl: result.wikiUrl,
                                                            wikiImageUrl: result.wikiImageUrl,
                                                            wikiFetchedAt: result.wikiFetchedAt,
                                                        }));
                                                    }
                                                } catch (e) { console.error(e); }
                                                setWikiFetching(false);
                                            }}
                                        >
                                            {wikiFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                            Get Definition from Wikipedia
                                        </Button>
                                    </div>
                                )}

                                {/* Quick stats */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-card rounded-xl border p-3 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                            <Newspaper className="h-4 w-4 text-emerald-500" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-foreground">{knowledge.articles.length}</p>
                                            <p className="text-[10px] text-muted-foreground">DEV.to Articles</p>
                                        </div>
                                    </div>
                                    <div className="bg-card rounded-xl border p-3 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                            <MessageCircle className="h-4 w-4 text-orange-500" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-foreground">{knowledge.discussions.length}</p>
                                            <p className="text-[10px] text-muted-foreground">HN Discussions</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Articles tab */}
                        {knowledgeTab === "articles" && (
                            <div className="space-y-2">
                                {knowledge.articles.length > 0 ? (
                                    knowledge.articles.map((item, i) => <ArticleCard key={i} item={item} />)
                                ) : (
                                    <div className="text-center py-6 bg-card rounded-xl border">
                                        <Newspaper className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1" />
                                        <p className="text-xs text-muted-foreground">No articles found for this topic</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Discussions tab */}
                        {knowledgeTab === "discussions" && (
                            <div className="space-y-2">
                                {knowledge.discussions.length > 0 ? (
                                    knowledge.discussions.map((item, i) => <ArticleCard key={i} item={item} />)
                                ) : (
                                    <div className="text-center py-6 bg-card rounded-xl border">
                                        <MessageCircle className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1" />
                                        <p className="text-xs text-muted-foreground">No discussions found for this topic</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-6 bg-card rounded-xl border">
                        <Sparkles className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Click Refresh to load knowledge sources</p>
                    </div>
                )}
            </div>

            {/* Sub-spaces */}
            {(space.children?.length > 0 || true) && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <FolderTree className="h-4 w-4 text-muted-foreground" /> Sub-Spaces ({space.children?.length || 0})
                        </h2>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateSub(!showCreateSub)} className="gap-1.5 text-xs h-7">
                            <Plus className="h-3 w-3" /> Create Sub-Space
                        </Button>
                    </div>

                    {/* Create sub-space form */}
                    {showCreateSub && (
                        <div className="bg-card rounded-xl border p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input
                                    value={newIcon}
                                    onChange={e => setNewIcon(e.target.value)}
                                    placeholder="Icon (emoji)"
                                    className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    maxLength={4}
                                />
                                <input
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    placeholder="Space name"
                                    className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 md:col-span-2"
                                />
                            </div>
                            <input
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                placeholder="Description (optional)"
                                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            />
                            <div className="flex items-center gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setShowCreateSub(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleCreateSub} disabled={!newTitle.trim() || creating} className="gap-1.5">
                                    <Plus className="h-3 w-3" /> {creating ? "Creating..." : "Create"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {space.children?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {space.children.map((child: any) => {
                                const childColor = getColor(child.color);
                                return (
                                    <Link key={child.id} href={`/intel-hub/${child.slug}`} className="group">
                                        <div className={cn("rounded-xl border p-4 transition-all hover:shadow-md hover:scale-[1.01] bg-card", childColor.border)}>
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-xl">{child.icon || "📂"}</span>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className={cn("text-sm font-semibold group-hover:underline underline-offset-2 truncate", childColor.text)}>{child.title}</h3>
                                                    {child.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{child.description}</p>}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-3">
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {child.followerCount}</span>
                                                <button
                                                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleFollowChild(child.id); }}
                                                    className={cn(
                                                        "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                                        child.isFollowed ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground border-border hover:border-primary/30"
                                                    )}
                                                >
                                                    {child.isFollowed ? "Following" : "Follow"}
                                                </button>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : !showCreateSub && (
                        <div className="text-center py-8 bg-card rounded-xl border">
                            <FolderTree className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No sub-spaces yet. Be the first to create one!</p>
                        </div>
                    )}
                </div>
            )}

            {/* Linked Intelboards */}
            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" /> Discussions & Boards ({space.linkedBoards?.length || 0})
                </h2>
                {space.linkedBoards?.length > 0 ? (
                    <div className="space-y-2">
                        {space.linkedBoards.map((board: any) => (
                            <Link key={board.id} href={`/intelboards/${board.id}`} className="group">
                                <div className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors bg-card">
                                    <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                        <MessageSquare className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{board.title}</h4>
                                        {board.description && <p className="text-[10px] text-muted-foreground truncate">{board.description}</p>}
                                    </div>
                                    <Badge variant="outline" className="text-[9px] shrink-0">{board.visibility}</Badge>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0" />
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-card rounded-xl border">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No discussions linked to this space yet</p>
                        <Link href="/intelboards">
                            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs">
                                <Plus className="h-3 w-3" /> Browse Intelboards
                            </Button>
                        </Link>
                    </div>
                )}
            </div>

            {/* Share / Invite Dialog */}
            <ShareInviteDialog
                open={showShareDialog}
                onOpenChange={setShowShareDialog}
                itemType="hub"
                itemId={space.id}
                itemTitle={space.title}
            />

            {/* Experience Prompt Dialog */}
            <ExperiencePromptDialog
                open={showExperiencePrompt}
                onOpenChange={setShowExperiencePrompt}
                categorySlug={space.slug}
                contextName={space.title}
                contextType="category"
            />
        </div>
    );
}
