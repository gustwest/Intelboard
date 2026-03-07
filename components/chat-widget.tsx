"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, X, Minus, Maximize2, Plus, Search, Users, FileText, User2, ArrowLeft, ExternalLink, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/role-provider";
import { getConversations, createConversation, getAllUsers, getRequestById, updateRequest, addParticipantToConversation } from "@/lib/actions";
import { ChatView } from "@/components/chat-view";
import { RequestDetailsPanel } from "@/components/request-details-panel";
import type { ConversationWithDetails, Request } from "@/lib/data";

const MAX_OPEN_WINDOWS = 3;
const WINDOW_WIDTH = 328;
const WINDOW_GAP = 8;

const TAB_FILTERS = [
    { id: "all", label: "All" },
    { id: "direct", label: "Direct" },
    { id: "group", label: "Groups" },
    { id: "request", label: "Requests" },
] as const;

function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

type OpenWindow = {
    conversationId: string;
    minimized: boolean;
};

export function ChatWidget() {
    const { currentUser } = useRole();
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
    const [showContactList, setShowContactList] = useState(false);
    const [showNewChat, setShowNewChat] = useState(false);
    const [tab, setTab] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string | null; role: string; avatar: string | null }[]>([]);
    const [floatingRequest, setFloatingRequest] = useState<Request | null>(null);
    const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);
    const [addPersonConvoId, setAddPersonConvoId] = useState<string | null>(null);
    const [addPersonSearch, setAddPersonSearch] = useState("");

    const loadConversations = useCallback(async () => {
        if (!currentUser) return;
        const data = await getConversations(currentUser.id);
        setConversations(data as ConversationWithDetails[]);
    }, [currentUser]);

    useEffect(() => {
        loadConversations();
        const interval = setInterval(loadConversations, 15000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    // Listen for notification-triggered events
    useEffect(() => {
        const handleOpenChat = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.conversationId) {
                openChatWindow(detail.conversationId);
            }
        };
        const handleOpenRequest = async (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.requestId) {
                const req = await getRequestById(detail.requestId);
                if (req) setFloatingRequest(req as unknown as Request);
            }
        };
        window.addEventListener("open-chat", handleOpenChat);
        window.addEventListener("open-request", handleOpenRequest);
        return () => {
            window.removeEventListener("open-chat", handleOpenChat);
            window.removeEventListener("open-request", handleOpenRequest);
        };
    }, []);

    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    const openChatWindow = (conversationId: string) => {
        // If already open, just expand it
        const existing = openWindows.find(w => w.conversationId === conversationId);
        if (existing) {
            setOpenWindows(prev => prev.map(w =>
                w.conversationId === conversationId ? { ...w, minimized: false } : w
            ));
            return;
        }

        // If at max, close the oldest
        let updated = [...openWindows];
        if (updated.length >= MAX_OPEN_WINDOWS) {
            updated = updated.slice(1);
        }
        updated.push({ conversationId, minimized: false });
        setOpenWindows(updated);
        setShowContactList(false);
    };

    const closeWindow = (conversationId: string) => {
        setOpenWindows(prev => prev.filter(w => w.conversationId !== conversationId));
    };

    const toggleMinimize = (conversationId: string) => {
        setOpenWindows(prev => prev.map(w =>
            w.conversationId === conversationId ? { ...w, minimized: !w.minimized } : w
        ));
    };

    const toggleGroupUser = (userId: string) => {
        setSelectedGroupUsers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleCreateGroupChat = async () => {
        if (!currentUser || selectedGroupUsers.length === 0) return;
        const participantIds = [currentUser.id, ...selectedGroupUsers];
        const type = participantIds.length === 2 ? "direct" : "group";
        const convo = await createConversation(type, participantIds);
        setSelectedGroupUsers([]);
        setShowNewChat(false);
        setShowContactList(false);
        openChatWindow(convo.id);
        loadConversations();
    };

    const handleAddPersonToChat = async (userId: string) => {
        if (!addPersonConvoId) return;
        await addParticipantToConversation(addPersonConvoId, userId);
        setAddPersonConvoId(null);
        setAddPersonSearch("");
        loadConversations();
    };

    const handleNewDirectChat = async (userId: string) => {
        if (!currentUser) return;
        try {
            const convo = await createConversation("direct", [currentUser.id, userId]);
            await loadConversations();
            openChatWindow(convo.id);
            setShowNewChat(false);
            setSelectedGroupUsers([]);
        } catch (error) {
            console.error("Failed to create conversation:", error);
        }
    };

    const loadUsers = async () => {
        const users = await getAllUsers();
        setAllUsers(users.filter(u => u.id !== currentUser?.id));
    };

    const getConversationName = (convo: ConversationWithDetails) => {
        if (convo.type === "request") {
            return convo.requestTitle || convo.title || "Request Chat";
        }
        if (convo.title) return convo.title;
        const others = convo.participants.filter(p => p.id !== currentUser?.id);
        if (others.length === 0) return "Chat";
        if (others.length === 1) return others[0].name;
        return others.map(p => p.name.split(" ")[0]).join(", ");
    };

    const openRequestPanel = async (requestId: string | null | undefined) => {
        if (!requestId) return;
        const req = await getRequestById(requestId);
        if (req) setFloatingRequest(req as unknown as Request);
    };

    const getConversationIcon = (type: string) => {
        switch (type) {
            case "direct": return <User2 className="h-3.5 w-3.5" />;
            case "group": return <Users className="h-3.5 w-3.5" />;
            case "request": return <FileText className="h-3.5 w-3.5" />;
            default: return <MessageCircle className="h-3.5 w-3.5" />;
        }
    };

    const filteredConversations = conversations.filter(c => {
        if (tab === "all") return true;
        return c.type === tab;
    });

    if (!currentUser) return null;

    // Calculate the launcher bubble position (always rightmost)
    const launcherRight = 24;
    // Chat windows stack left of the launcher
    const getWindowRight = (index: number) => {
        return launcherRight + 64 + (index * (WINDOW_WIDTH + WINDOW_GAP));
    };

    return (
        <div className="fixed bottom-0 right-0 z-[400] pointer-events-none">
            {/* --- Floating Chat Windows --- */}
            {openWindows.map((win, i) => {
                const convo = conversations.find(c => c.id === win.conversationId);
                const name = convo ? getConversationName(convo) : "Chat";
                const icon = convo ? getConversationIcon(convo.type) : <MessageCircle className="h-3.5 w-3.5" />;

                return (
                    <div
                        key={win.conversationId}
                        className={cn(
                            "fixed bottom-0 pointer-events-auto transition-all duration-200 ease-out",
                            win.minimized ? "h-[44px]" : "h-[420px]"
                        )}
                        style={{
                            right: `${getWindowRight(i)}px`,
                            width: `${WINDOW_WIDTH}px`,
                        }}
                    >
                        <div className={cn(
                            "bg-background border rounded-t-xl shadow-2xl flex flex-col overflow-hidden h-full",
                            !win.minimized && "ring-1 ring-black/5"
                        )}>
                            {/* Window Header */}
                            <div
                                className="flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground cursor-pointer shrink-0 select-none"
                                onClick={() => toggleMinimize(win.conversationId)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                                        {icon}
                                    </div>
                                    {convo?.type === "request" && convo.requestId ? (
                                        <button
                                            className="text-sm font-medium truncate hover:underline decoration-white/50 underline-offset-2 flex items-center gap-1"
                                            onClick={(e) => { e.stopPropagation(); openRequestPanel(convo.requestId); }}
                                            title="Open request"
                                        >
                                            {name}
                                            <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />
                                        </button>
                                    ) : (
                                        <span className="text-sm font-medium truncate">{name}</span>
                                    )}
                                    {convo?.type === "request" && (
                                        <Badge className="text-[8px] h-3.5 px-1 bg-violet-500/30 text-violet-200 border-0">
                                            REQ
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                        onClick={(e) => { e.stopPropagation(); loadUsers(); setAddPersonConvoId(addPersonConvoId === win.conversationId ? null : win.conversationId); setAddPersonSearch(""); }}
                                        title="Add person"
                                    >
                                        <UserPlus className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                        onClick={(e) => { e.stopPropagation(); toggleMinimize(win.conversationId); }}
                                    >
                                        {win.minimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                        onClick={(e) => { e.stopPropagation(); closeWindow(win.conversationId); }}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* Add Person Dropdown */}
                            {addPersonConvoId === win.conversationId && !win.minimized && (
                                <div className="border-b bg-muted/30 p-2 space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                        <Input
                                            placeholder="Search to add..."
                                            value={addPersonSearch}
                                            onChange={(e) => setAddPersonSearch(e.target.value)}
                                            className="pl-7 h-7 text-xs"
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <ScrollArea className="max-h-32">
                                        {allUsers
                                            .filter(u => u.id !== currentUser.id && !convo?.participants.some(p => p.id === u.id))
                                            .filter(u => u.name.toLowerCase().includes(addPersonSearch.toLowerCase()))
                                            .map(user => (
                                                <button
                                                    key={user.id}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors text-left text-xs"
                                                    onClick={(e) => { e.stopPropagation(); handleAddPersonToChat(user.id); }}
                                                >
                                                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                                        {user.name[0].toUpperCase()}
                                                    </div>
                                                    <span className="truncate">{user.name}</span>
                                                    <span className="text-[9px] text-muted-foreground ml-auto">{user.role}</span>
                                                </button>
                                            ))}
                                    </ScrollArea>
                                </div>
                            )}

                            {/* Chat Content (hidden when minimized) */}
                            {!win.minimized && (
                                <div className="flex-1 min-h-0">
                                    <ChatView
                                        conversationId={win.conversationId}
                                        currentUserId={currentUser.id}
                                        currentUserName={currentUser.name}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* --- Contact List / Conversation Picker --- */}
            {showContactList && (
                <div
                    className="fixed bottom-[72px] pointer-events-auto"
                    style={{ right: `${launcherRight}px`, width: `${WINDOW_WIDTH}px` }}
                >
                    <div className="bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden h-[480px] ring-1 ring-black/5">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground">
                            {showNewChat ? (
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => { setShowNewChat(false); setSelectedGroupUsers([]); }}>
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <h3 className="font-semibold text-sm">New Chat</h3>
                                </div>
                            ) : (
                                <h3 className="font-semibold text-sm">Messaging</h3>
                            )}
                            <div className="flex items-center gap-0.5">
                                {!showNewChat && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                        onClick={() => { setShowNewChat(true); setSelectedGroupUsers([]); loadUsers(); }}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                    onClick={() => { setShowContactList(false); setShowNewChat(false); setSelectedGroupUsers([]); }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        {showNewChat ? (
                            /* New Chat — User picker with multi-select for group */
                            <div className="flex flex-col flex-1 min-h-0">
                                {/* Selected users bar */}
                                {selectedGroupUsers.length > 0 && (
                                    <div className="px-3 py-2 border-b bg-muted/30">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {selectedGroupUsers.map(uid => {
                                                const u = allUsers.find(x => x.id === uid);
                                                return u ? (
                                                    <Badge key={uid} variant="secondary" className="text-xs h-6 gap-1 pr-1">
                                                        {u.name.split(" ")[0]}
                                                        <button onClick={() => toggleGroupUser(uid)} className="hover:bg-black/10 rounded-full p-0.5">
                                                            <X className="h-2.5 w-2.5" />
                                                        </button>
                                                    </Badge>
                                                ) : null;
                                            })}
                                        </div>
                                        <Button
                                            size="sm"
                                            className="w-full mt-2 h-7 text-xs bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500"
                                            onClick={handleCreateGroupChat}
                                        >
                                            <Users className="h-3 w-3 mr-1.5" />
                                            {selectedGroupUsers.length === 1 ? "Start Chat" : `Create Group (${selectedGroupUsers.length + 1})`}
                                        </Button>
                                    </div>
                                )}

                                <div className="px-3 py-2 border-b">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search people..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-8 h-8 text-sm"
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1.5">Click to start 1:1 chat • Use checkboxes for group</p>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="p-1.5">
                                        {allUsers
                                            .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(user => {
                                                const isSelected = selectedGroupUsers.includes(user.id);
                                                return (
                                                    <div
                                                        key={user.id}
                                                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                                                    >
                                                        {/* Checkbox for group select */}
                                                        <button
                                                            className={cn(
                                                                "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                                isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-muted-foreground/30 hover:border-indigo-400"
                                                            )}
                                                            onClick={() => toggleGroupUser(user.id)}
                                                        >
                                                            {isSelected && <Check className="h-3 w-3" />}
                                                        </button>
                                                        {/* Click name for direct chat */}
                                                        <button
                                                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                                            onClick={() => handleNewDirectChat(user.id)}
                                                        >
                                                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                                {user.name[0].toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{user.name}</p>
                                                                <p className="text-[10px] text-muted-foreground">{user.role}</p>
                                                            </div>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </ScrollArea>
                            </div>
                        ) : (
                            /* Conversation List */
                            <div className="flex flex-col flex-1 min-h-0">
                                {/* Filter Tabs */}
                                <div className="flex gap-1 px-2.5 py-1.5 border-b">
                                    {TAB_FILTERS.map(f => (
                                        <Button
                                            key={f.id}
                                            variant={tab === f.id ? "default" : "ghost"}
                                            size="sm"
                                            className="h-6 text-[11px] px-2"
                                            onClick={() => setTab(f.id)}
                                        >
                                            {f.label}
                                        </Button>
                                    ))}
                                </div>

                                <ScrollArea className="flex-1">
                                    {filteredConversations.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-muted-foreground">
                                            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            No conversations yet
                                            <p className="text-xs mt-1">Click + to start a new chat</p>
                                        </div>
                                    ) : (
                                        <div className="p-1.5 space-y-0.5">
                                            {filteredConversations.map(convo => (
                                                <button
                                                    key={convo.id}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left",
                                                        convo.unreadCount > 0 && "bg-primary/5"
                                                    )}
                                                    onClick={() => openChatWindow(convo.id)}
                                                >
                                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white shrink-0">
                                                        {getConversationIcon(convo.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <p className={cn(
                                                                "text-sm truncate",
                                                                convo.unreadCount > 0 ? "font-semibold" : "font-medium"
                                                            )}>
                                                                {getConversationName(convo)}
                                                            </p>
                                                            {convo.lastMessage && (
                                                                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                                                    {timeAgo(convo.lastMessage.createdAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between mt-0.5">
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {convo.lastMessage ? convo.lastMessage.text : "No messages yet"}
                                                            </p>
                                                            {convo.unreadCount > 0 && (
                                                                <Badge className="h-4 min-w-4 flex items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white px-1 ml-2 shrink-0">
                                                                    {convo.unreadCount}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {convo.type === "request" && (
                                                            <Badge variant="outline" className="text-[9px] mt-1 h-3.5 px-1 text-violet-400 border-violet-400/30">
                                                                Request Thread
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- Floating Request Details Panel --- */}
            {floatingRequest && (
                <div className="pointer-events-auto">
                    <RequestDetailsPanel
                        request={floatingRequest}
                        onClose={() => setFloatingRequest(null)}
                        onUpdate={async (updated) => {
                            await updateRequest(floatingRequest.id, updated);
                            setFloatingRequest(updated);
                        }}
                        isOwner={floatingRequest.creatorId === currentUser?.id}
                        centered
                    />
                </div>
            )}

            {/* --- Launcher Bubble --- */}
            <div
                className="fixed bottom-6 pointer-events-auto"
                style={{ right: `${launcherRight}px` }}
            >
                <button
                    className="relative h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
                    onClick={() => {
                        setShowContactList(!showContactList);
                        setShowNewChat(false);
                    }}
                >
                    {showContactList ? (
                        <X className="h-6 w-6 group-hover:rotate-90 transition-transform" />
                    ) : (
                        <MessageCircle className="h-6 w-6" />
                    )}
                    {totalUnread > 0 && !showContactList && (
                        <span className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white px-1.5 ring-2 ring-background">
                            {totalUnread > 99 ? "99+" : totalUnread}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
