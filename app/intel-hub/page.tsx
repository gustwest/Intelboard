"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRole } from "@/components/role-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getHubCategories, followHubCategory, searchHubCategories, seedHubCategories } from "@/lib/actions";
import {
    Search,
    ChevronRight,
    Users,
    Plus,
    BookOpen,
    Sparkles,
    Bell,
    BellOff,
    FolderTree,
    ArrowRight,
    Layers,
    Filter,
    Share2,
} from "lucide-react";
import { ShareInviteDialog } from "@/components/share-invite-dialog";

type Category = {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    parentId: string | null;
    depth: number;
    followerCount: number;
    isFollowed: boolean;
};

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

export default function IntelHubPage() {
    const { currentUser } = useRole();
    const [categories, setCategories] = useState<Category[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [filter, setFilter] = useState<"all" | "following">("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [shareItem, setShareItem] = useState<Category | null>(null);

    const load = useCallback(async () => {
        if (!currentUser) return;
        try {
            const cats = await getHubCategories(currentUser.id);
            if (cats.length === 0) {
                // Auto-seed on first visit
                try {
                    await seedHubCategories();
                    const seeded = await getHubCategories(currentUser.id);
                    setCategories(seeded);
                } catch (seedErr) {
                    console.error("Failed to seed categories:", seedErr);
                    setCategories([]);
                }
            } else {
                setCategories(cats);
            }
        } catch (err) {
            console.error("Failed to load categories:", err);
            setCategories([]);
        }
        setLoading(false);
    }, [currentUser]);

    useEffect(() => { load(); }, [load]);

    // Search debounce
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults(null); return; }
        const timeout = setTimeout(async () => {
            const results = await searchHubCategories(searchQuery);
            setSearchResults(results);
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const handleFollow = async (categoryId: string) => {
        await followHubCategory(categoryId);
        setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, isFollowed: !c.isFollowed, followerCount: c.isFollowed ? c.followerCount - 1 : c.followerCount + 1 } : c));
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Build tree structure
    const roots = useMemo(() => categories.filter(c => !c.parentId), [categories]);
    const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);

    const filteredRoots = useMemo(() => {
        if (filter === "following") {
            // Show categories that the user follows, or have followed children
            const followedIds = new Set(categories.filter(c => c.isFollowed).map(c => c.id));
            // Also show parents of followed items
            const parentIds = new Set<string>();
            categories.filter(c => c.isFollowed && c.parentId).forEach(c => {
                let pid = c.parentId;
                while (pid) {
                    parentIds.add(pid);
                    const parent = categories.find(p => p.id === pid);
                    pid = parent?.parentId || null;
                }
            });
            return roots.filter(r => followedIds.has(r.id) || parentIds.has(r.id));
        }
        return roots;
    }, [roots, filter, categories]);

    if (loading) {
        return (
            <div className="container py-8 max-w-7xl">
                <div className="animate-pulse space-y-6">
                    <div className="h-10 w-64 bg-muted rounded" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    const displayList = searchResults || undefined;

    return (
        <div className="container py-6 max-w-7xl space-y-6">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 border p-8">
                <div className="absolute top-0 right-0 opacity-10">
                    <Layers className="h-48 w-48 text-indigo-500" />
                </div>
                <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="h-5 w-5 text-indigo-500" />
                        <Badge variant="outline" className="text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[10px]">Knowledge Base</Badge>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Intel Hub</h1>
                    <p className="text-muted-foreground mt-1 max-w-xl">
                        Explore, follow, and contribute to shared knowledge spaces. Dive into topic areas that matter to you.
                    </p>

                    {/* Search */}
                    <div className="relative mt-4 max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search spaces, topics, and categories..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-background/80 backdrop-blur text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 mt-4">
                        <Button
                            size="sm"
                            variant={filter === "all" ? "default" : "outline"}
                            onClick={() => setFilter("all")}
                            className="gap-1.5 text-xs h-8"
                        >
                            <FolderTree className="h-3.5 w-3.5" /> All Spaces
                        </Button>
                        <Button
                            size="sm"
                            variant={filter === "following" ? "default" : "outline"}
                            onClick={() => setFilter("following")}
                            className="gap-1.5 text-xs h-8"
                        >
                            <Bell className="h-3.5 w-3.5" /> Following
                        </Button>
                    </div>
                </div>
            </div>

            {/* Search Results */}
            {displayList && (
                <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5" /> Search Results ({displayList.length})
                    </h2>
                    {displayList.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No matching spaces found</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {displayList.map(cat => (
                                <CategoryCardSmall key={cat.id} category={cat} onFollow={handleFollow} onShare={setShareItem} categories={categories} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Category Tree */}
            {!displayList && (
                <div className="space-y-8">
                    {filteredRoots.map(root => {
                        const children = getChildren(root.id);
                        const color = getColor(root.color);
                        const isExpanded = expandedIds.has(root.id);

                        return (
                            <div key={root.id} className="space-y-3">
                                {/* Root category header */}
                                <div className={cn("flex items-center justify-between p-5 rounded-2xl border transition-all", color.bg, color.border)}>
                                    <div className="flex items-center gap-4">
                                        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br", color.gradient, "text-white shadow-lg")}>
                                            {root.icon || "📁"}
                                        </div>
                                        <div>
                                            <Link href={`/intel-hub/${root.slug}`} className="group">
                                                <h2 className={cn("text-lg font-bold group-hover:underline underline-offset-2", color.text)}>{root.title}</h2>
                                            </Link>
                                            <p className="text-xs text-muted-foreground mt-0.5">{root.description}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {root.followerCount} followers</span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><FolderTree className="h-3 w-3" /> {children.length} sub-spaces</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant={root.isFollowed ? "secondary" : "outline"}
                                            onClick={() => handleFollow(root.id)}
                                            className="gap-1.5 text-xs h-8"
                                        >
                                            {root.isFollowed ? <><BellOff className="h-3 w-3" /> Following</> : <><Bell className="h-3 w-3" /> Follow</>}
                                        </Button>
                                        {children.length > 0 && (
                                            <Button size="sm" variant="ghost" onClick={() => toggleExpand(root.id)} className="h-8 w-8 p-0">
                                                <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                                            </Button>
                                        )}
                                        <Link href={`/intel-hub/${root.slug}`}>
                                            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"><ArrowRight className="h-3.5 w-3.5" /></Button>
                                        </Link>
                                    </div>
                                </div>

                                {/* Children grid */}
                                {(isExpanded || children.length <= 6) && children.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pl-4">
                                        {children.map(child => {
                                            const grandchildren = getChildren(child.id);
                                            return (
                                                <CategoryCard
                                                    key={child.id}
                                                    category={child}
                                                    childCount={grandchildren.length}
                                                    onFollow={handleFollow}
                                                    onShare={setShareItem}
                                                    grandchildren={grandchildren}
                                                    allCategories={categories}
                                                    expandedIds={expandedIds}
                                                    toggleExpand={toggleExpand}
                                                    getChildren={getChildren}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {filteredRoots.length === 0 && filter === "following" && (
                        <div className="text-center py-12">
                            <Bell className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">You&apos;re not following any spaces yet</p>
                            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setFilter("all")}>
                                <FolderTree className="h-3.5 w-3.5" /> Browse All Spaces
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Share / Invite Dialog */}
            {shareItem && (
                <ShareInviteDialog
                    open={!!shareItem}
                    onOpenChange={(v) => { if (!v) setShareItem(null); }}
                    itemType="hub"
                    itemId={shareItem.id}
                    itemTitle={shareItem.title}
                />
            )}
        </div>
    );
}

/* Sub-components */

function CategoryCard({
    category, childCount, onFollow, onShare, grandchildren, allCategories, expandedIds, toggleExpand, getChildren
}: {
    category: Category; childCount: number; onFollow: (id: string) => void; onShare: (cat: Category) => void;
    grandchildren: Category[]; allCategories: Category[];
    expandedIds: Set<string>; toggleExpand: (id: string) => void;
    getChildren: (id: string) => Category[];
}) {
    const color = getColor(category.color);
    const isExpanded = expandedIds.has(category.id);

    return (
        <div className="space-y-2">
            <div className={cn("rounded-xl border p-4 transition-all hover:shadow-md hover:scale-[1.01] bg-card group relative", color.border)}>
                <Link href={`/intel-hub/${category.slug}`} className="block">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">{category.icon || "📂"}</span>
                            <div>
                                <h3 className={cn("text-sm font-semibold group-hover:underline underline-offset-2", color.text)}>{category.title}</h3>
                                {category.description && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{category.description}</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {category.followerCount}</span>
                            {childCount > 0 && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><FolderTree className="h-2.5 w-2.5" /> {childCount}</span>
                            )}
                        </div>
                        <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); onFollow(category.id); }}
                            className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                category.isFollowed ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground border-border hover:border-primary/30 hover:text-primary"
                            )}
                        >
                            {category.isFollowed ? "Following" : "Follow"}
                        </button>
                    </div>
                </Link>
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(category); }}
                    className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
                >
                    <Share2 className="h-3 w-3" /> Share
                </button>
            </div>

            {/* Render grandchildren if expanded */}
            {childCount > 0 && isExpanded && (
                <div className="pl-4 space-y-1.5">
                    {grandchildren.map(gc => {
                        const gcChildren = getChildren(gc.id);
                        return (
                            <CategoryCard
                                key={gc.id}
                                category={gc}
                                childCount={gcChildren.length}
                                onFollow={onFollow}
                                onShare={onShare}
                                grandchildren={gcChildren}
                                allCategories={allCategories}
                                expandedIds={expandedIds}
                                toggleExpand={toggleExpand}
                                getChildren={getChildren}
                            />
                        );
                    })}
                </div>
            )}

            {childCount > 0 && !isExpanded && (
                <button
                    onClick={() => toggleExpand(category.id)}
                    className="pl-4 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                >
                    <ChevronRight className="h-3 w-3" /> {childCount} sub-spaces
                </button>
            )}
        </div>
    );
}

function CategoryCardSmall({ category, onFollow, onShare, categories }: { category: any; onFollow: (id: string) => void; onShare: (cat: Category) => void; categories: Category[] }) {
    const color = getColor(category.color);

    // Build breadcrumb
    const path: string[] = [];
    let current = category;
    while (current.parentId) {
        const parent = categories.find(c => c.id === current.parentId);
        if (!parent) break;
        path.unshift(parent.title);
        current = parent;
    }

    return (
        <div className={cn("rounded-xl border p-4 transition-all hover:shadow-md bg-card group relative", color.border)}>
            <Link href={`/intel-hub/${category.slug}`} className="block">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{category.icon || "📂"}</span>
                    <div className="min-w-0">
                        <h3 className={cn("text-sm font-semibold truncate group-hover:underline", color.text)}>{category.title}</h3>
                        {path.length > 0 && (
                            <p className="text-[9px] text-muted-foreground truncate">{path.join(" → ")}</p>
                        )}
                    </div>
                </div>
                {category.description && (
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{category.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {category.followerCount}</span>
                    <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); onFollow(category.id); }}
                        className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                            category.isFollowed ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground border-border hover:border-primary/30"
                        )}
                    >
                        {category.isFollowed ? "Following" : "Follow"}
                    </button>
                </div>
            </Link>
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(category); }}
                className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
            >
                <Share2 className="h-3 w-3" /> Share
            </button>
        </div>
    );
}
