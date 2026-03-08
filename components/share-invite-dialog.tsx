"use client";

import { useState, useEffect } from "react";
import { X, Search, Users, Mail, Send, Check, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getAllUsers, shareEventOrHub } from "@/lib/actions";
import { useRole } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";

type ShareTarget = { type: "member"; id: string; name: string } | { type: "email"; email: string };

export function ShareInviteDialog({
    open,
    onOpenChange,
    itemType,
    itemId,
    itemTitle,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    itemType: "event" | "hub" | "intelboard";
    itemId: string;
    itemTitle: string;
}) {
    const { currentUser } = useRole();
    const { toast } = useToast();
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string | null; role: string }[]>([]);
    const [search, setSearch] = useState("");
    const [emailInput, setEmailInput] = useState("");
    const [targets, setTargets] = useState<ShareTarget[]>([]);
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (open) {
            getAllUsers().then(users => setAllUsers(users.filter(u => u.id !== currentUser?.id)));
        }
    }, [open, currentUser]);

    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) &&
        !targets.some(t => t.type === "member" && t.id === u.id)
    );

    const addMember = (id: string, name: string) => {
        setTargets(prev => [...prev, { type: "member", id, name }]);
        setSearch("");
    };

    const addEmail = () => {
        const email = emailInput.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        if (targets.some(t => t.type === "email" && t.email === email)) return;
        setTargets(prev => [...prev, { type: "email", email }]);
        setEmailInput("");
    };

    const removeTarget = (index: number) => {
        setTargets(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = async () => {
        if (targets.length === 0 || !currentUser) return;
        setSending(true);
        try {
            const memberIds = targets.filter(t => t.type === "member").map(t => (t as any).id);
            const emails = targets.filter(t => t.type === "email").map(t => (t as any).email);
            await shareEventOrHub({
                itemType,
                itemId,
                itemTitle,
                sharedBy: currentUser.id,
                sharedByName: currentUser.name,
                memberIds,
                externalEmails: emails,
                message: message || undefined,
            });
            toast({ title: "Invitations sent!", description: `Shared "${itemTitle}" with ${targets.length} recipient(s).` });
            setTargets([]);
            setMessage("");
            onOpenChange(false);
        } catch (err) {
            toast({ title: "Error", description: "Failed to send invitations.", variant: "destructive" });
        } finally {
            setSending(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
            <div
                className="bg-background border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
                    <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4" />
                        <h3 className="font-semibold text-sm">Share & Invite</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => onOpenChange(false)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Item being shared */}
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sharing</p>
                        <p className="text-sm font-medium text-foreground truncate">{itemTitle}</p>
                    </div>

                    {/* Selected recipients */}
                    {targets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {targets.map((t, i) => (
                                <Badge key={i} variant="secondary" className="gap-1 pr-1 text-xs">
                                    {t.type === "member" ? (
                                        <><Users className="h-2.5 w-2.5" /> {t.name}</>
                                    ) : (
                                        <><Mail className="h-2.5 w-2.5" /> {t.email}</>
                                    )}
                                    <button onClick={() => removeTarget(i)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10">
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    {/* Search members */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-muted-foreground" /> Add Members
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search members..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-8 h-8 text-sm"
                            />
                        </div>
                        {search && filteredUsers.length > 0 && (
                            <ScrollArea className="max-h-32 border rounded-lg">
                                <div className="p-1">
                                    {filteredUsers.slice(0, 8).map(user => (
                                        <button
                                            key={user.id}
                                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left text-xs"
                                            onClick={() => addMember(user.id, user.name)}
                                        >
                                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                                {user.name[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="font-medium truncate">{user.name}</span>
                                                <span className="text-muted-foreground ml-1.5">({user.role})</span>
                                            </div>
                                            <Plus className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>

                    {/* External email input */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-muted-foreground" /> Invite External
                        </label>
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={emailInput}
                                onChange={e => setEmailInput(e.target.value)}
                                className="h-8 text-sm flex-1"
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                            />
                            <Button size="sm" variant="outline" className="h-8 px-3" onClick={addEmail} disabled={!emailInput.trim()}>
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    {/* Optional message */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">Message (optional)</label>
                        <Input
                            placeholder="Add a personal note..."
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
                    <p className="text-[10px] text-muted-foreground">
                        {targets.length} recipient{targets.length !== 1 ? "s" : ""} selected
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            className="h-8 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 gap-1.5"
                            onClick={handleSend}
                            disabled={targets.length === 0 || sending}
                        >
                            <Send className="h-3 w-3" /> {sending ? "Sending..." : "Send Invites"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
