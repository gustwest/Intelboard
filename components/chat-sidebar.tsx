"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, X, ArrowLeft, Plus, Search, Users, FileText, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/role-provider";
import { getConversations, createConversation, getAllUsers } from "@/lib/actions";
import { ChatView } from "@/components/chat-view";
import type { ConversationWithDetails } from "@/lib/data";

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

export function ChatSidebar() {
    const { currentUser } = useRole();
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [tab, setTab] = useState<string>("all");
    const [showNewChat, setShowNewChat] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string | null; role: string; avatar: string | null }[]>([]);

    const loadConversations = useCallback(async () => {
        if (!currentUser) return;
        const data = await getConversations(currentUser.id);
        setConversations(data as ConversationWithDetails[]);
    }, [currentUser]);

    useEffect(() => {
        if (isOpen) {
            loadConversations();
            const interval = setInterval(loadConversations, 10000);
            return () => clearInterval(interval);
        }
    }, [isOpen, loadConversations]);

    const handleOpenChat = (conversationId: string) => {
        setActiveConversationId(conversationId);
        setIsOpen(true);
    };

    const handleNewDirectChat = async (userId: string) => {
        if (!currentUser) return;
        try {
            const convo = await createConversation("direct", [currentUser.id, userId]);
            await loadConversations();
            setActiveConversationId(convo.id);
            setShowNewChat(false);
        } catch (error) {
            console.error("Failed to create conversation:", error);
        }
    };

    const loadUsers = async () => {
        const users = await getAllUsers();
        setAllUsers(users.filter(u => u.id !== currentUser?.id));
    };

    const filteredConversations = conversations.filter(c => {
        if (tab === "all") return true;
        return c.type === tab;
    });

    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    const activeConversation = conversations.find(c => c.id === activeConversationId);

    const getConversationName = (convo: ConversationWithDetails) => {
        if (convo.title) return convo.title;
        if (convo.type === "request") return `Request Chat`;
        const others = convo.participants.filter(p => p.id !== currentUser?.id);
        if (others.length === 0) return "Chat";
        if (others.length === 1) return others[0].name;
        return others.map(p => p.name.split(" ")[0]).join(", ");
    };

    const getConversationIcon = (type: string) => {
        switch (type) {
            case "direct": return <User2 className="h-4 w-4" />;
            case "group": return <Users className="h-4 w-4" />;
            case "request": return <FileText className="h-4 w-4" />;
            default: return <MessageCircle className="h-4 w-4" />;
        }
    };

    if (!currentUser) return null;

    return (
        <>
            {/* Chat Toggle Button */}
            <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) setActiveConversationId(null);
                }}
            >
                <MessageCircle className="h-4 w-4" />
                {totalUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white px-1">
                        {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                )}
            </Button>

            {/* Chat Sidebar Panel */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[150] bg-black/20 backdrop-blur-[1px]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Sidebar */}
                    <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-background border-l shadow-2xl z-[160] flex flex-col animate-in slide-in-from-right-4 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b">
                            {activeConversationId ? (
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveConversationId(null)}>
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                    <div>
                                        <h3 className="font-semibold text-sm">{activeConversation ? getConversationName(activeConversation) : "Chat"}</h3>
                                        {activeConversation && (
                                            <p className="text-[10px] text-muted-foreground">
                                                {activeConversation.participants.length} participant{activeConversation.participants.length !== 1 ? "s" : ""}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <h3 className="font-semibold text-sm">Messages</h3>
                            )}
                            <div className="flex items-center gap-1">
                                {!activeConversationId && !showNewChat && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => { setShowNewChat(true); loadUsers(); }}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Content */}
                        {activeConversationId ? (
                            <ChatView
                                conversationId={activeConversationId}
                                currentUserId={currentUser.id}
                                currentUserName={currentUser.name}
                            />
                        ) : showNewChat ? (
                            /* New Chat - User Selection */
                            <div className="flex flex-col flex-1">
                                <div className="px-4 py-3 border-b">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewChat(false)}>
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        <h4 className="font-medium text-sm">New Conversation</h4>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search people..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-8 h-8 text-sm"
                                        />
                                    </div>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="p-2">
                                        {allUsers
                                            .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(user => (
                                                <button
                                                    key={user.id}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
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
                                            ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        ) : (
                            /* Conversation List */
                            <div className="flex flex-col flex-1">
                                {/* Filter Tabs */}
                                <div className="flex gap-1 px-3 py-2 border-b">
                                    {TAB_FILTERS.map(f => (
                                        <Button
                                            key={f.id}
                                            variant={tab === f.id ? "default" : "ghost"}
                                            size="sm"
                                            className="h-6 text-xs px-2.5"
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
                                        <div className="divide-y">
                                            {filteredConversations.map(convo => (
                                                <button
                                                    key={convo.id}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                                                        convo.unreadCount > 0 && "bg-primary/5"
                                                    )}
                                                    onClick={() => handleOpenChat(convo.id)}
                                                >
                                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white shrink-0">
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
                                                                {convo.lastMessage
                                                                    ? convo.lastMessage.text
                                                                    : "No messages yet"}
                                                            </p>
                                                            {convo.unreadCount > 0 && (
                                                                <Badge className="h-4 min-w-4 flex items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white px-1 ml-2 shrink-0">
                                                                    {convo.unreadCount}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {convo.type === "request" && (
                                                            <Badge variant="outline" className="text-[9px] mt-1 h-4 px-1.5 text-violet-400 border-violet-400/30">
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
                </>
            )}
        </>
    );
}
