'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Briefcase, Clock, X, Trash2, UserPlus, UserCheck, UserX, Loader2, Users, Link2 } from "lucide-react";
import NextLink from "next/link";
import { searchUsers, sendConnectionRequest, respondToConnection, removeConnection, getMyConnections, getMyInteractions } from "@/lib/actions";
import { useRole } from "@/components/role-provider";
import { useToast } from "@/components/ui/use-toast";

const SEARCH_HISTORY_KEY = "intelboard_search_history";
const MAX_HISTORY = 20;

function getSearchHistory(userId: string): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(`${SEARCH_HISTORY_KEY}_${userId}`);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveSearchHistory(userId: string, history: string[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`${SEARCH_HISTORY_KEY}_${userId}`, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// --- User Card (shared between tabs) ---

function UserCard({ user, actionSlot }: { user: any; actionSlot?: React.ReactNode }) {
    return (
        <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-blue-200 overflow-hidden border-slate-200 group">
            <div className="h-1.5 bg-gradient-to-r from-slate-100 to-slate-200 group-hover:from-blue-500 group-hover:to-indigo-500 transition-colors duration-300" />
            <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <NextLink href={`/profile/${user.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-11 w-11 border border-slate-100 shrink-0">
                            <AvatarImage src={user.image} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-base group-hover:text-blue-700 transition-colors truncate">{user.name}</h3>
                            <p className="text-xs text-muted-foreground truncate">{user.jobTitle || user.role}</p>
                        </div>
                    </NextLink>
                    {actionSlot && <div className="shrink-0">{actionSlot}</div>}
                </div>

                <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5rem]">
                    {user.bio || "No bio available."}
                </p>

                {user.skills && user.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {user.skills.slice(0, 3).map((skill: any, i: number) => (
                            <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                                {typeof skill === 'object' ? skill.name : skill}
                            </Badge>
                        ))}
                        {user.skills.length > 3 && (
                            <span className="text-[10px] text-muted-foreground self-center">+{user.skills.length - 3}</span>
                        )}
                    </div>
                )}

                <div className="pt-3 mt-1 border-t flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {user.experience || "N/A exp."}
                    </span>
                    {user.availability === 'Available' && (
                        <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">Available</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// --- Connect Button ---

function ConnectButton({ userId, existingStatus, onStatusChange }: { userId: string; existingStatus?: any; onStatusChange?: () => void }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleConnect = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLoading(true);
        const result = await sendConnectionRequest(userId);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Request Sent", description: "Connection request sent successfully." });
            onStatusChange?.();
        }
        setLoading(false);
    };

    if (existingStatus === "accepted") {
        return (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs gap-1">
                <UserCheck className="h-3 w-3" /> Connected
            </Badge>
        );
    }
    if (existingStatus === "pending") {
        return (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                <Clock className="h-3 w-3" /> Pending
            </Badge>
        );
    }

    return (
        <Button size="sm" variant="outline" onClick={handleConnect} disabled={loading} className="text-xs h-7 gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Connect
        </Button>
    );
}

export default function TalentSearchPage() {
    const { currentUser } = useRole();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("all");

    // All Members state
    const [query, setQuery] = useState("");
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState<string | null>(null);
    const [searchHistory, setSearchHistoryState] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Connection status map for All Members tab
    const [connectionStatusMap, setConnectionStatusMap] = useState<Record<string, string>>({});

    // My Network state
    const [myConnections, setMyConnections] = useState<any>({ connections: [], pendingReceived: [], pendingSent: [] });
    const [interactions, setInteractions] = useState<any[]>([]);
    const [networkLoading, setNetworkLoading] = useState(false);

    // Load search history
    useEffect(() => {
        if (currentUser?.id) {
            setSearchHistoryState(getSearchHistory(currentUser.id));
        }
    }, [currentUser?.id]);

    // Close suggestions on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
                inputRef.current && !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearch = async (searchQuery?: string) => {
        const q = searchQuery ?? query;
        setIsLoading(true);
        setShowSuggestions(false);
        try {
            const results = await searchUsers(q, { role: roleFilter || undefined });
            setUsers(results);

            if (q.trim() && currentUser?.id) {
                const updated = [q.trim(), ...searchHistory.filter(h => h.toLowerCase() !== q.trim().toLowerCase())].slice(0, MAX_HISTORY);
                setSearchHistoryState(updated);
                saveSearchHistory(currentUser.id, updated);
            }
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearHistory = () => {
        if (currentUser?.id) {
            setSearchHistoryState([]);
            saveSearchHistory(currentUser.id, []);
        }
    };

    const handleRemoveHistoryItem = (item: string) => {
        if (currentUser?.id) {
            const updated = searchHistory.filter(h => h !== item);
            setSearchHistoryState(updated);
            saveSearchHistory(currentUser.id, updated);
        }
    };

    const handleSelectSuggestion = (suggestion: string) => {
        setQuery(suggestion);
        setShowSuggestions(false);
        handleSearch(suggestion);
    };

    useEffect(() => { handleSearch(); }, [roleFilter]);

    const loadNetwork = async () => {
        setNetworkLoading(true);
        try {
            const [conns, ints] = await Promise.all([getMyConnections(), getMyInteractions()]);
            setMyConnections(conns);
            setInteractions(ints);

            // Build status map for All Members tab
            const statusMap: Record<string, string> = {};
            for (const c of conns.connections) statusMap[c.user?.id] = "accepted";
            for (const c of conns.pendingReceived) statusMap[c.user?.id] = "pending";
            for (const c of conns.pendingSent) statusMap[c.user?.id] = "pending";
            setConnectionStatusMap(statusMap);
        } catch (error) {
            console.error("Failed to load network", error);
        } finally {
            setNetworkLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser) loadNetwork();
    }, [currentUser?.id]);

    const handleAcceptConnection = async (connectionId: string) => {
        const result = await respondToConnection(connectionId, true);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Connection Accepted" });
            loadNetwork();
        }
    };

    const handleDeclineConnection = async (connectionId: string) => {
        const result = await respondToConnection(connectionId, false);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Request Declined" });
            loadNetwork();
        }
    };

    const handleRemoveConnection = async (connectionId: string) => {
        const result = await removeConnection(connectionId);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Connection Removed" });
            loadNetwork();
        }
    };

    const filteredSuggestions = searchHistory.filter(h =>
        !query || h.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);

    const totalNetworkCount = myConnections.connections.length + myConnections.pendingReceived.length;

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Members</h1>
                        <p className="text-muted-foreground mt-1">Find and connect with people in your community.</p>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-white border">
                        <TabsTrigger value="all" className="gap-1.5">
                            <Users className="h-4 w-4" />
                            All Members
                        </TabsTrigger>
                        <TabsTrigger value="network" className="gap-1.5">
                            <Link2 className="h-4 w-4" />
                            My Network
                            {totalNetworkCount > 0 && (
                                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{totalNetworkCount}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ─── All Members Tab ─── */}
                    <TabsContent value="all" className="mt-6 space-y-6">
                        {/* Search Bar */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    ref={inputRef}
                                    placeholder="Search by name, skills, or bio..."
                                    className="pl-10 h-10 bg-slate-50 border-slate-200"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    onFocus={() => setShowSuggestions(true)}
                                />
                                {showSuggestions && filteredSuggestions.length > 0 && (
                                    <div ref={suggestionsRef} className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
                                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> Recent Searches
                                            </span>
                                            <button onClick={handleClearHistory} className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1">
                                                <Trash2 className="h-3 w-3" /> Clear
                                            </button>
                                        </div>
                                        {filteredSuggestions.map((suggestion, i) => (
                                            <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer group" onClick={() => handleSelectSuggestion(suggestion)}>
                                                <span className="text-sm text-slate-700 flex items-center gap-2">
                                                    <Clock className="h-3 w-3 text-muted-foreground" /> {suggestion}
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); handleRemoveHistoryItem(suggestion); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                                <Button variant={roleFilter === "Specialist" ? "default" : "outline"} onClick={() => setRoleFilter(roleFilter === "Specialist" ? null : "Specialist")} className="whitespace-nowrap">Specialists</Button>
                                <Button variant={roleFilter === "Admin" ? "default" : "outline"} onClick={() => setRoleFilter(roleFilter === "Admin" ? null : "Admin")} className="whitespace-nowrap">Admins</Button>
                                <Button onClick={() => handleSearch()} className="bg-blue-600 hover:bg-blue-700">Search</Button>
                            </div>
                        </div>

                        {/* Results Grid */}
                        {isLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-64 bg-slate-200 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : users.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {users.map((user) => (
                                    <UserCard
                                        key={user.id}
                                        user={user}
                                        actionSlot={
                                            currentUser && user.id !== currentUser.id ? (
                                                <ConnectButton userId={user.id} existingStatus={connectionStatusMap[user.id]} onStatusChange={loadNetwork} />
                                            ) : null
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <div className="inline-flex justify-center items-center w-12 h-12 rounded-full bg-slate-100 mb-4">
                                    <Search className="h-6 w-6 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-medium text-slate-900">No matching profiles found</h3>
                                <p className="text-slate-500 mt-1">Try adjusting your search terms or filters.</p>
                            </div>
                        )}
                    </TabsContent>

                    {/* ─── My Network Tab ─── */}
                    <TabsContent value="network" className="mt-6 space-y-8">
                        {!currentUser ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Log in to see your network.</p>
                            </div>
                        ) : networkLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {/* Pending Requests Received */}
                                {myConnections.pendingReceived.length > 0 && (
                                    <section>
                                        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <UserPlus className="h-5 w-5 text-amber-600" />
                                            Pending Requests
                                            <Badge variant="secondary" className="text-xs">{myConnections.pendingReceived.length}</Badge>
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {myConnections.pendingReceived.map((conn: any) => (
                                                <UserCard
                                                    key={conn.id}
                                                    user={conn.user}
                                                    actionSlot={
                                                        <div className="flex gap-1">
                                                            <Button size="sm" variant="default" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleAcceptConnection(conn.id)}>
                                                                <UserCheck className="h-3 w-3" /> Accept
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleDeclineConnection(conn.id)}>
                                                                <UserX className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Connections */}
                                <section>
                                    <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                        <UserCheck className="h-5 w-5 text-green-600" />
                                        Connections
                                        <Badge variant="secondary" className="text-xs">{myConnections.connections.length}</Badge>
                                    </h2>
                                    {myConnections.connections.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {myConnections.connections.map((conn: any) => (
                                                <UserCard
                                                    key={conn.id}
                                                    user={conn.user}
                                                    actionSlot={
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-red-600" onClick={() => handleRemoveConnection(conn.id)}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    }
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 bg-white rounded-xl border border-dashed border-slate-200">
                                            <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                            <p className="text-sm text-muted-foreground">No connections yet. Browse All Members to connect with people.</p>
                                        </div>
                                    )}
                                </section>

                                {/* Pending Sent */}
                                {myConnections.pendingSent.length > 0 && (
                                    <section>
                                        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-amber-500" />
                                            Sent Requests
                                            <Badge variant="secondary" className="text-xs">{myConnections.pendingSent.length}</Badge>
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {myConnections.pendingSent.map((conn: any) => (
                                                <UserCard
                                                    key={conn.id}
                                                    user={conn.user}
                                                    actionSlot={
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                                                            <Clock className="h-3 w-3" /> Pending
                                                        </Badge>
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Interactions */}
                                {interactions.length > 0 && (
                                    <section>
                                        <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                                            <Link2 className="h-5 w-5 text-blue-500" />
                                            People You&apos;ve Interacted With
                                        </h2>
                                        <p className="text-sm text-muted-foreground mb-4">Members who share categories, events, or discussions with you.</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {interactions.map((user: any) => (
                                                <UserCard
                                                    key={user.id}
                                                    user={user}
                                                    actionSlot={
                                                        <ConnectButton userId={user.id} onStatusChange={loadNetwork} />
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
