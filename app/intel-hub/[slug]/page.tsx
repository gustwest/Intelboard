"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRole } from "@/components/role-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getHubCategory, followHubCategory, createHubCategory } from "@/lib/actions";
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
} from "lucide-react";

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

    const load = useCallback(async () => {
        if (!currentUser || !slug) return;
        const data = await getHubCategory(slug, currentUser.id);
        setSpace(data);
        setLoading(false);
    }, [slug, currentUser]);

    useEffect(() => { load(); }, [load]);

    const handleFollow = async () => {
        if (!space) return;
        await followHubCategory(space.id);
        setSpace((prev: any) => ({
            ...prev,
            isFollowed: !prev.isFollowed,
            followerCount: prev.isFollowed ? prev.followerCount - 1 : prev.followerCount + 1,
        }));
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant={space.isFollowed ? "secondary" : "default"}
                            onClick={handleFollow}
                            className="gap-1.5"
                        >
                            {space.isFollowed ? <><BellOff className="h-3.5 w-3.5" /> Following</> : <><Bell className="h-3.5 w-3.5" /> Follow</>}
                        </Button>
                    </div>
                </div>
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
        </div>
    );
}
