"use client";

import { Plus, Settings, Search, FolderPlus, Sparkles, UserCircle, Lightbulb, Briefcase, LayoutGrid, Network } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCompanyUsers, approveUserAccess } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/it-flora/useStore';
import { generateBankFlora } from '@/lib/it-flora/simulation';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from "next/link";

interface SidebarProps {
    onAddSystem: () => void;
    onAddProject: () => void;
    onEditProject: (projectId: string) => void;
    onManageSystems: () => void;
    onOpenCatalogue: () => void;
    onImportAI: () => void;
}

export function Sidebar({ onAddSystem, onAddProject, onEditProject, onManageSystems, onOpenCatalogue, onImportAI }: SidebarProps) {
    const systems = useStore((state) => state.systems);
    const projects = useStore((state) => state.projects);
    const activeProjectId = useStore((state) => state.activeProjectId);
    const setActiveProject = useStore((state) => state.setActiveProject);
    const currentUser = useStore((state) => state.currentUser);

    // Global Tool & View State
    const activeTool = useStore((state) => state.activeTool);
    const setActiveTool = useStore((state) => state.setActiveTool);
    const activeViewId = useStore((state) => state.activeViewId);
    const setActiveViewId = useStore((state) => state.setActiveViewId);

    // Sidebar Tool Mode
    // const [activeTool, setActiveTool] = useState<'flowchart' | 'lineage'>('flowchart'); // MOVED TO STORE

    // Pending Approvals State
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);

    // const [activeViewId, setActiveViewId] = useState<string | null>(null); // MOVED TO STORE

    // Sync pending users
    useEffect(() => {
        if (currentUser?.companyId) {
            getCompanyUsers(currentUser.companyId).then(users => {
                setPendingUsers(users.filter((u: any) => u.approvalStatus === 'PENDING'));
            });
        }
    }, [currentUser?.companyId]);


    const handleApprove = async (userId: string) => {
        const result = await approveUserAccess(userId);
        if (result.success) {
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
            alert(`Approved ${result.user?.name}`);
        }
    };


    const visibleProjects = projects.filter(p => {
        if (currentUser?.role === 'Administrator' || currentUser?.role === 'Admin') return true;
        if (currentUser) return p.ownerId === currentUser.id || p.sharedWith?.includes(currentUser.id);
        return !p.ownerId || p.ownerId === 'unknown' || p.sharedWith?.includes('guest');
    });

    const activeProject = visibleProjects.find(p => p.id === activeProjectId);

    return (
        <div className="w-64 border-r border-border bg-card flex flex-col h-full shadow-sm">
            {/* 1. Header & Tool Switcher */}
            <div className="p-4 pb-2 border-b border-border">
                <h2 className="text-lg font-semibold tracking-tight mb-4">Planning Tools</h2>
                <div className="flex bg-muted p-1 rounded-lg grid grid-cols-2 gap-1">
                    <button
                        onClick={() => setActiveTool('flowchart')}
                        className={cn(
                            "flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all",
                            activeTool === 'flowchart'
                                ? "bg-white text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                        )}
                    >
                        <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                        Flowchart
                    </button>
                    <button
                        onClick={() => setActiveTool('lineage')}
                        className={cn(
                            "flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all",
                            activeTool === 'lineage'
                                ? "bg-white text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                        )}
                    >
                        <Network className="w-3.5 h-3.5 mr-1.5" />
                        Lineage
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* 2. Project Selection */}
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Active Project
                            </label>
                            {activeProjectId && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => onEditProject(activeProjectId)}
                                    title="Project Settings"
                                >
                                    <Settings className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                        <Select
                            value={activeProjectId || ""}
                            onValueChange={(val) => setActiveProject(val === "master" ? null : val)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Project..." />
                            </SelectTrigger>
                            <SelectContent>
                                {visibleProjects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={onAddProject} variant="ghost" size="sm" className="w-full justify-start px-2 mt-1 text-primary hover:text-primary/80 h-7 text-xs">
                            <FolderPlus className="mr-2 h-3 w-3" />
                            Create New Project
                        </Button>
                    </div>

                    {/* 3. Project Tabs (Views) - REMOVED (Moved to Top Sheet Bar) */}
                </div>

                {/* 4. Global Tools Bottom */}
                <div className="mt-8 pt-4 border-t border-border space-y-2">
                    <Button onClick={onAddSystem} variant="outline" size="sm" className="w-full justify-start">
                        <Plus className="mr-2 h-3 w-3" />
                        Add System
                    </Button>
                    <Button onClick={onManageSystems} variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                        <Settings className="mr-2 h-3 w-3" />
                        Manage Systems
                    </Button>
                    <Button onClick={onOpenCatalogue} variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                        <Search className="mr-2 h-3 w-3" />
                        Data Catalogue
                    </Button>
                </div>
            </div>

            {/* Footer Profile */}
            <div className="border-t border-border p-3 mt-auto">
                <Link href="/account" className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors">
                    <Avatar className="h-8 w-8 border border-border">
                        <AvatarImage src={currentUser?.avatar} alt={currentUser?.name || "User"} />
                        <AvatarFallback>
                            {currentUser?.name ? currentUser.name[0] : <UserCircle className="w-4 h-4" />}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                            {currentUser?.name || 'Guest User'}
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
