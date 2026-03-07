'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Briefcase, Clock, X, Trash2 } from "lucide-react";
import Link from "next/link";
import { searchUsers } from "@/lib/actions";
import { useRole } from "@/components/role-provider";

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

export default function TalentSearchPage() {
    const { currentUser } = useRole();
    const [query, setQuery] = useState("");
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState<string | null>(null);
    const [searchHistory, setSearchHistoryState] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Load search history on mount
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

            // Save to search history
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

    useEffect(() => {
        handleSearch();
    }, [roleFilter]);

    const filteredSuggestions = searchHistory.filter(h =>
        !query || h.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Talent Directory</h1>
                        <p className="text-muted-foreground mt-1">Find specialists and team members for your projects.</p>
                    </div>
                    <Link href="/account">
                        <Button variant="outline">Update My Profile</Button>
                    </Link>
                </div>

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

                        {/* Search Suggestions Dropdown */}
                        {showSuggestions && filteredSuggestions.length > 0 && (
                            <div
                                ref={suggestionsRef}
                                className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 overflow-hidden"
                            >
                                <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
                                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Recent Searches
                                    </span>
                                    <button
                                        onClick={handleClearHistory}
                                        className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        Clear
                                    </button>
                                </div>
                                {filteredSuggestions.map((suggestion, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer group"
                                        onClick={() => handleSelectSuggestion(suggestion)}
                                    >
                                        <span className="text-sm text-slate-700 flex items-center gap-2">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            {suggestion}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveHistoryItem(suggestion);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                        <Button
                            variant={roleFilter === "Specialist" ? "default" : "outline"}
                            onClick={() => setRoleFilter(roleFilter === "Specialist" ? null : "Specialist")}
                            className="whitespace-nowrap"
                        >
                            Specialists
                        </Button>
                        <Button
                            variant={roleFilter === "Admin" ? "default" : "outline"}
                            onClick={() => setRoleFilter(roleFilter === "Admin" ? null : "Admin")}
                            className="whitespace-nowrap"
                        >
                            Admins
                        </Button>
                        <Button onClick={() => handleSearch()} className="bg-blue-600 hover:bg-blue-700">
                            Search
                        </Button>
                    </div>
                </div>

                {/* Results Grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-64 bg-slate-200 rounded-xl animate-pulse"></div>
                        ))}
                    </div>
                ) : users.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {users.map((user) => (
                            <Link href={`/profile/${user.id}`} key={user.id} className="group">
                                <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-blue-200 cursor-pointer overflow-hidden border-slate-200">
                                    <div className="h-2 bg-gradient-to-r from-slate-100 to-slate-200 group-hover:from-blue-500 group-hover:to-indigo-500 transition-colors duration-300"></div>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-12 w-12 border border-slate-100">
                                                    <AvatarImage src={user.image} />
                                                    <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h3 className="font-semibold text-lg group-hover:text-blue-700 transition-colors">{user.name}</h3>
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                        {user.role}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5rem]">
                                                {user.bio || "No bio available."}
                                            </p>

                                            {user.skills && user.skills.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 pt-2">
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
                                        </div>

                                        <div className="pt-4 mt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
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
                            </Link>
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
            </div>
        </div>
    );
}
