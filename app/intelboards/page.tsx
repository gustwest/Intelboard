"use client";

import { useState, useEffect, useCallback } from "react";
import { useRole } from "@/components/role-provider";
import { getIntelboards, createIntelboard, getAllUsers, joinIntelboard } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    Plus, Loader2, Lock, Globe, MessageSquare, Users, Zap,
    Search, ArrowRight,
} from "lucide-react";
import Link from "next/link";

type Board = {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    visibility: string;
    memberIds: string[];
    invitedRoles: string[];
    createdBy: string;
    status: string;
    createdAt: Date | string;
};

type ViewUser = { id: string; name: string; email?: string | null; role?: string | null };

const CATEGORY_COLORS: Record<string, string> = {
    technology: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    strategy: "bg-violet-500/10 text-violet-600 border-violet-500/20",
    design: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    operations: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    general: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

export default function IntelboardsPage() {
    const { currentUser } = useRole();
    const { toast } = useToast();
    const [boards, setBoards] = useState<Board[]>([]);
    const [allUsers, setAllUsers] = useState<ViewUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "my">("all");

    const load = useCallback(async () => {
        setLoading(true);
        const [b, u] = await Promise.all([getIntelboards(), getAllUsers()]);
        setBoards(b);
        setAllUsers(u);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = boards.filter(b => {
        if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === "my" && currentUser && !b.memberIds.includes(currentUser.id)) return false;
        return true;
    });

    const getUserName = (id: string) => allUsers.find(u => u.id === id)?.name || "Unknown";

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Intelboards</h1>
                    <p className="text-sm text-muted-foreground">Collaborative spaces for discussions, expertise, and decision-making</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> New Intelboard
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search boards..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>All</Button>
                <Button variant={filter === "my" ? "default" : "outline"} size="sm" onClick={() => setFilter("my")}>My Boards</Button>
            </div>

            {/* Board Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                    <h3 className="font-semibold text-lg text-foreground mb-1">
                        {search || filter === "my" ? "No matching boards" : "No Intelboards yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        {search || filter === "my" ? "Try adjusting your filters" : "Create your first collaborative space"}
                    </p>
                    {!search && filter !== "my" && (
                        <Button onClick={() => setShowCreate(true)} className="gap-2">
                            <Plus className="h-4 w-4" /> Create Intelboard
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(board => {
                        const isMember = currentUser && board.memberIds.includes(currentUser.id);
                        const isCreator = currentUser && board.createdBy === currentUser.id;

                        return (
                            <Link
                                key={board.id}
                                href={`/intelboards/${board.id}`}
                                className="group block border rounded-xl p-5 bg-card hover:shadow-lg hover:border-primary/20 transition-all duration-200"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {board.visibility === "invite_only" ? (
                                            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                                <Lock className="h-4 w-4 text-amber-600" />
                                            </div>
                                        ) : (
                                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                <Globe className="h-4 w-4 text-emerald-600" />
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{board.title}</h3>
                                            {board.category && (
                                                <Badge variant="outline" className={cn("text-[9px] mt-0.5", CATEGORY_COLORS[board.category] || CATEGORY_COLORS.general)}>
                                                    {board.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                                </div>

                                {board.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{board.description}</p>
                                )}

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3 w-3" /> {board.memberIds.length}
                                        </span>
                                        <span className="text-muted-foreground/40">•</span>
                                        <span>by {getUserName(board.createdBy)}</span>
                                    </div>
                                    {isMember && (
                                        <Badge variant="secondary" className="text-[9px] py-0">Member</Badge>
                                    )}
                                    {!isMember && board.visibility === "open" && (
                                        <button
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                await joinIntelboard(board.id);
                                                toast({ title: "Joined!" });
                                                load();
                                            }}
                                            className="text-[10px] font-medium text-primary hover:underline"
                                        >
                                            Join
                                        </button>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Create Dialog */}
            <CreateIntelboardDialog
                open={showCreate}
                onOpenChange={setShowCreate}
                allUsers={allUsers}
                onCreated={() => { load(); setShowCreate(false); }}
            />
        </div>
    );
}

function CreateIntelboardDialog({ open, onOpenChange, allUsers, onCreated }: {
    open: boolean; onOpenChange: (v: boolean) => void; allUsers: ViewUser[]; onCreated: () => void;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("");
    const [visibility, setVisibility] = useState("open");
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setTitle(""); setDescription(""); setCategory(""); setVisibility("open"); setSelectedMembers([]);
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!title) {
            toast({ title: "Title required", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await createIntelboard({
                title, description: description || undefined, category: category || undefined,
                visibility, memberIds: visibility === "invite_only" ? selectedMembers : [],
            });
            toast({ title: "Intelboard Created" });
            onCreated();
        } catch {
            toast({ title: "Error", description: "Failed to create", variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Create Intelboard</DialogTitle>
                    <DialogDescription>Start a new collaborative space for discussions and meetings.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                    <div>
                        <Label className="text-xs">Title</Label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cloud Architecture Review" />
                    </div>
                    <div>
                        <Label className="text-xs">Description</Label>
                        <textarea
                            value={description} onChange={e => setDescription(e.target.value)}
                            placeholder="What's this board about?"
                            className="w-full text-xs bg-muted/30 border rounded-lg p-2.5 min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 mt-1"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Category</Label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            {["technology", "strategy", "design", "operations", "general"].map(c => (
                                <Button key={c} variant={category === c ? "default" : "outline"} size="sm"
                                    onClick={() => setCategory(category === c ? "" : c)} className="text-xs capitalize"
                                >{c}</Button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs">Visibility</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <button onClick={() => setVisibility("open")}
                                className={cn("p-3 rounded-xl border text-left transition-all",
                                    visibility === "open" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/50"
                                )}
                            >
                                <Globe className="h-4 w-4 text-emerald-600 mb-1" />
                                <p className="text-xs font-semibold">Open</p>
                                <p className="text-[10px] text-muted-foreground">Anyone can join and participate</p>
                            </button>
                            <button onClick={() => setVisibility("invite_only")}
                                className={cn("p-3 rounded-xl border text-left transition-all",
                                    visibility === "invite_only" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/50"
                                )}
                            >
                                <Lock className="h-4 w-4 text-amber-600 mb-1" />
                                <p className="text-xs font-semibold">Invite Only</p>
                                <p className="text-[10px] text-muted-foreground">Only invited members can access</p>
                            </button>
                        </div>
                    </div>
                    {visibility === "invite_only" && (
                        <div>
                            <Label className="text-xs">Invite Members</Label>
                            <div className="max-h-32 overflow-y-auto border rounded-lg mt-1 p-1 space-y-0.5">
                                {allUsers.map(u => (
                                    <button key={u.id}
                                        onClick={() => setSelectedMembers(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                                        className={cn("w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors",
                                            selectedMembers.includes(u.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                                        )}
                                    >
                                        <div className={cn("h-3 w-3 rounded border", selectedMembers.includes(u.id) ? "bg-primary border-primary" : "border-muted-foreground/40")} />
                                        {u.name}
                                        {u.role && <span className="text-muted-foreground ml-auto text-[10px]">{u.role}</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full gap-2">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        Create Intelboard
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
