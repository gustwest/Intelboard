"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getMessages, sendMessage, markMessagesRead } from "@/lib/actions";
import type { Message } from "@/lib/data";

interface ChatViewProps {
    conversationId: string;
    currentUserId: string;
    currentUserName: string;
}

// Palette of colors for other participants (blue first, then distinct colors for 3rd, 4th, etc.)
const PARTICIPANT_COLORS = [
    { bg: "bg-blue-600", text: "text-white", avatar: "from-blue-500 to-blue-700" },
    { bg: "bg-amber-600", text: "text-white", avatar: "from-amber-500 to-amber-700" },
    { bg: "bg-rose-600", text: "text-white", avatar: "from-rose-500 to-rose-700" },
    { bg: "bg-cyan-600", text: "text-white", avatar: "from-cyan-500 to-cyan-700" },
    { bg: "bg-purple-600", text: "text-white", avatar: "from-purple-500 to-purple-700" },
    { bg: "bg-pink-600", text: "text-white", avatar: "from-pink-500 to-pink-700" },
];

const MY_COLOR = { bg: "bg-emerald-600", text: "text-white", avatar: "from-emerald-500 to-emerald-700" };

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

export function ChatView({ conversationId, currentUserId, currentUserName }: ChatViewProps) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const loadMessages = useCallback(async () => {
        const msgs = await getMessages(conversationId);
        setMessages(msgs as Message[]);
    }, [conversationId]);

    useEffect(() => {
        loadMessages();
        markMessagesRead(conversationId, currentUserId);
        const interval = setInterval(loadMessages, 5000);
        return () => clearInterval(interval);
    }, [conversationId, currentUserId, loadMessages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Build a stable color map for other participants
    const participantColorMap = useMemo(() => {
        const map: Record<string, typeof PARTICIPANT_COLORS[0]> = {};
        let colorIndex = 0;
        messages.forEach(msg => {
            if (msg.senderId !== currentUserId && !map[msg.senderId]) {
                map[msg.senderId] = PARTICIPANT_COLORS[colorIndex % PARTICIPANT_COLORS.length];
                colorIndex++;
            }
        });
        return map;
    }, [messages, currentUserId]);

    const getColor = (senderId: string) => {
        if (senderId === currentUserId) return MY_COLOR;
        return participantColorMap[senderId] || PARTICIPANT_COLORS[0];
    };

    const handleSend = async () => {
        if (!newMessage.trim() || sending) return;
        setSending(true);
        try {
            const msg = await sendMessage(conversationId, currentUserId, newMessage.trim(), currentUserName);
            if (msg) {
                setMessages(prev => [...prev, msg as Message]);
                setNewMessage("");
            }
        } finally {
            setSending(false);
        }
    };

    const formatTime = (date: string) => {
        return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const formatDate = (date: string) => {
        const d = new Date(date);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return "Today";
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
        return d.toLocaleDateString();
    };

    const handleNameClick = (senderId: string) => {
        router.push(`/profile/${senderId}`);
    };

    // Group messages by date
    const groupedMessages: { date: string; messages: Message[] }[] = [];
    messages.forEach(msg => {
        const dateKey = formatDate(msg.createdAt);
        const lastGroup = groupedMessages[groupedMessages.length - 1];
        if (lastGroup && lastGroup.date === dateKey) {
            lastGroup.messages.push(msg);
        } else {
            groupedMessages.push({ date: dateKey, messages: [msg] });
        }
    });

    return (
        <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 px-3" ref={scrollRef}>
                <div className="py-3 space-y-0.5">
                    {groupedMessages.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-12">
                            No messages yet. Start the conversation!
                        </div>
                    )}
                    {groupedMessages.map((group) => (
                        <div key={group.date}>
                            <div className="flex items-center gap-3 my-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-[10px] text-muted-foreground font-medium uppercase">{group.date}</span>
                                <div className="flex-1 h-px bg-border" />
                            </div>
                            {group.messages.map((msg, i) => {
                                const isMe = msg.senderId === currentUserId;
                                const showSender = i === 0 || group.messages[i - 1].senderId !== msg.senderId;
                                const color = getColor(msg.senderId);
                                const senderName = msg.senderName || "Unknown";
                                const initials = getInitials(senderName);

                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex items-end gap-1.5 mb-1",
                                            isMe ? "flex-row-reverse" : "flex-row"
                                        )}
                                    >
                                        {/* Avatar */}
                                        {!isMe && showSender ? (
                                            <button
                                                className={cn(
                                                    "h-6 w-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[9px] font-bold shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all cursor-pointer",
                                                    color.avatar
                                                )}
                                                onClick={() => handleNameClick(msg.senderId)}
                                                title={senderName}
                                            >
                                                {initials}
                                            </button>
                                        ) : !isMe ? (
                                            <div className="w-6 shrink-0" />
                                        ) : null}

                                        {/* Message bubble */}
                                        <div className="max-w-[75%] flex flex-col">
                                            {/* Sender name label */}
                                            {showSender && (
                                                <button
                                                    className={cn(
                                                        "text-[10px] font-semibold mb-0.5 cursor-pointer hover:underline underline-offset-2 w-fit",
                                                        isMe ? "self-end mr-1 text-emerald-400" : "self-start ml-1 text-blue-400",
                                                        !isMe && participantColorMap[msg.senderId] === PARTICIPANT_COLORS[1] && "text-amber-400",
                                                        !isMe && participantColorMap[msg.senderId] === PARTICIPANT_COLORS[2] && "text-rose-400",
                                                        !isMe && participantColorMap[msg.senderId] === PARTICIPANT_COLORS[3] && "text-cyan-400",
                                                        !isMe && participantColorMap[msg.senderId] === PARTICIPANT_COLORS[4] && "text-purple-400",
                                                        !isMe && participantColorMap[msg.senderId] === PARTICIPANT_COLORS[5] && "text-pink-400",
                                                    )}
                                                    onClick={() => handleNameClick(msg.senderId)}
                                                    title={senderName}
                                                >
                                                    {isMe ? "You" : initials}
                                                </button>
                                            )}

                                            <div
                                                className={cn(
                                                    "rounded-2xl px-3 py-2 text-sm",
                                                    color.bg, color.text,
                                                    isMe ? "rounded-br-md" : "rounded-bl-md"
                                                )}
                                            >
                                                <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
                                                <p className="text-[9px] mt-0.5 opacity-60 text-right">
                                                    {formatTime(msg.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </ScrollArea>

            <div className="p-3 border-t">
                <div className="flex gap-2 items-end">
                    <Textarea
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="min-h-[40px] max-h-[120px] resize-none text-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <Button
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-full"
                        onClick={handleSend}
                        disabled={!newMessage.trim() || sending}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
