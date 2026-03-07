"use client";

import { Plus, Settings, Search, FolderPlus, Sparkles, UserCircle, Star, Share2, ChevronDown, ChevronRight, LayoutGrid, Network, Database, Server, LayoutTemplate, FileText, Users, CloudCog } from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getCompanyUsers, approveUserAccess } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { useStore, SystemType } from '@/store/it-flora/useStore';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from "next/link";

// Category definitions for grouping systems
const SYSTEM_CATEGORIES: { label: string; types: SystemType[]; icon: React.ElementType; color: string }[] = [
    { label: 'Source Systems', types: ['Source System'], icon: Database, color: 'text-blue-400' },
    { label: 'Data Warehousing', types: ['Data Warehouse', 'Data Vault'], icon: Server, color: 'text-violet-400' },
    { label: 'Data Lakes', types: ['Data Lake'], icon: Database, color: 'text-cyan-400' },
    { label: 'Analytics & Reporting', types: ['Data Mart', 'PBI Report'], icon: LayoutTemplate, color: 'text-amber-400' },
    { label: 'Other Systems', types: ['Other'], icon: FileText, color: 'text-muted-foreground' },
];

// Quick-add system type definitions
const QUICK_ADD_TYPES: { type: SystemType; label: string; icon: React.ElementType; color: string }[] = [
    { type: 'Source System', label: 'Source System', icon: Database, color: 'text-blue-400' },
    { type: 'Data Warehouse', label: 'Data Warehouse', icon: Server, color: 'text-violet-400' },
    { type: 'Data Lake', label: 'Data Lake', icon: CloudCog, color: 'text-cyan-400' },
    { type: 'Data Vault', label: 'Data Vault', icon: Server, color: 'text-emerald-400' },
    { type: 'Data Mart', label: 'Data Mart', icon: LayoutTemplate, color: 'text-amber-400' },
    { type: 'PBI Report', label: 'PBI Report', icon: FileText, color: 'text-orange-400' },
];

interface SidebarProps {
    onAddSystem: () => void;
    onAddProject: () => void;
    onEditProject: (projectId: string) => void;
    onManageSystems: () => void;
    onOpenCatalogue: () => void;
    onImportAI: () => void;
    onFocusSystem?: (systemId: string) => void;
}

export function Sidebar({ onAddSystem, onAddProject, onEditProject, onManageSystems, onOpenCatalogue, onImportAI, onFocusSystem }: SidebarProps) {
    const systems = useStore((state) => state.systems);
    const addSystem = useStore((state) => state.addSystem);
    const projects = useStore((state) => state.projects);
    const activeProjectId = useStore((state) => state.activeProjectId);
    const setActiveProject = useStore((state) => state.setActiveProject);
    const currentUser = useStore((state) => state.currentUser);
    const starredProjectIds = useStore((state) => state.starredProjectIds);
    const toggleStarProject = useStore((state) => state.toggleStarProject);

    // Global Tool & View State
    const activeTool = useStore((state) => state.activeTool);
    const setActiveTool = useStore((state) => state.setActiveTool);

    // Category collapse state
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

    // System search for lineage
    const [systemSearch, setSystemSearch] = useState('');

    // Pending Approvals State
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);

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

    // Sort: starred first, then alphabetically
    const sortedProjects = useMemo(() => {
        return [...visibleProjects].sort((a, b) => {
            const aStarred = starredProjectIds.includes(a.id);
            const bStarred = starredProjectIds.includes(b.id);
            if (aStarred && !bStarred) return -1;
            if (!aStarred && bStarred) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [visibleProjects, starredProjectIds]);

    // Group systems by category for lineage view
    const systemsByCategory = useMemo(() => {
        const filtered = systemSearch
            ? systems.filter(s => s.name.toLowerCase().includes(systemSearch.toLowerCase()))
            : systems;

        return SYSTEM_CATEGORIES.map(cat => ({
            ...cat,
            systems: filtered.filter(s => cat.types.includes(s.type))
        })).filter(cat => cat.systems.length > 0);
    }, [systems, systemSearch]);

    const toggleCategory = (label: string) => {
        setCollapsedCategories(prev => ({ ...prev, [label]: !prev[label] }));
    };

    return (
        <div className="w-72 border-r border-border bg-card flex flex-col h-full shadow-sm">
            {/* 1. Header & Tool Switcher */}
            <div className="p-4 pb-3 border-b border-border">
                <h2 className="text-lg font-semibold tracking-tight mb-3 text-card-foreground">Planning Tools</h2>
                <div className="flex bg-muted p-1 rounded-lg grid grid-cols-2 gap-1">
                    <button
                        onClick={() => setActiveTool('flowchart')}
                        className={cn(
                            "flex items-center justify-center py-1.5 text-xs font-medium rounded-md transition-all",
                            activeTool === 'flowchart'
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
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
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        )}
                    >
                        <Network className="w-3.5 h-3.5 mr-1.5" />
                        Lineage
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* 2. Project List */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Projects
                        </label>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-primary"
                            onClick={onAddProject}
                            title="Create New Project"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="space-y-0.5">
                        {sortedProjects.length === 0 && (
                            <div className="px-2 py-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                                No projects yet
                            </div>
                        )}
                        {sortedProjects.map((p) => {
                            const isActive = p.id === activeProjectId;
                            const isStarred = starredProjectIds.includes(p.id);
                            const isShared = p.sharedWith && p.sharedWith.length > 0;

                            return (
                                <div
                                    key={p.id}
                                    className={cn(
                                        "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-sm",
                                        isActive
                                            ? "bg-primary/15 text-primary border border-primary/20"
                                            : "text-foreground hover:bg-accent border border-transparent"
                                    )}
                                    onClick={() => setActiveProject(p.id)}
                                >
                                    {/* Star Button */}
                                    <button
                                        className={cn(
                                            "shrink-0 transition-colors",
                                            isStarred
                                                ? "text-secondary"
                                                : "text-muted-foreground/40 hover:text-secondary opacity-0 group-hover:opacity-100"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleStarProject(p.id);
                                        }}
                                        title={isStarred ? "Unstar project" : "Star project"}
                                    >
                                        <Star className={cn("h-3.5 w-3.5", isStarred && "fill-current")} />
                                    </button>

                                    <span className="flex-1 truncate font-medium">{p.name}</span>

                                    {/* Shared indicator */}
                                    {isShared && (
                                        <span className="shrink-0 text-muted-foreground" title={`Shared with ${p.sharedWith.length} user(s)`}>
                                            <Users className="h-3 w-3" />
                                        </span>
                                    )}

                                    {/* Settings button */}
                                    <button
                                        className="shrink-0 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditProject(p.id);
                                        }}
                                        title="Project Settings & Sharing"
                                    >
                                        <Settings className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Lineage Mode: Categorized System Catalog */}
                {activeTool === 'lineage' && (
                    <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                System Catalog
                            </label>
                            <span className="text-[10px] text-muted-foreground/70 tabular-nums">{systems.length} total</span>
                        </div>

                        {/* Search */}
                        <div className="relative mb-3">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                            <input
                                value={systemSearch}
                                onChange={(e) => setSystemSearch(e.target.value)}
                                placeholder="Search systems..."
                                className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>

                        {/* Quick Add Buttons */}
                        <div className="mb-3">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                                Quick Add
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {QUICK_ADD_TYPES.map((item) => {
                                    const ItemIcon = item.icon;
                                    return (
                                        <button
                                            key={item.type}
                                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-primary/30 transition-all text-xs text-card-foreground group cursor-grab active:cursor-grabbing"
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('application/it-flora-system-type', item.type);
                                                e.dataTransfer.setData('application/it-flora-system-label', item.label);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onClick={() => {
                                                const name = prompt(`Enter ${item.label} name:`);
                                                if (name?.trim()) {
                                                    addSystem({
                                                        name: name.trim(),
                                                        type: item.type,
                                                        description: '',
                                                        position: { x: Math.random() * 500 + 100, y: Math.random() * 300 + 100 },
                                                    });
                                                }
                                            }}
                                            title={`Drag onto canvas or click to add ${item.label}`}
                                        >
                                            <ItemIcon className={cn("h-3.5 w-3.5 shrink-0", item.color)} />
                                            <span className="truncate">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Category Groups */}
                        <div className="space-y-1">
                            {systemsByCategory.length === 0 && (
                                <div className="px-2 py-3 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                                    {systemSearch ? 'No systems match your search' : 'No systems defined yet — use Quick Add above'}
                                </div>
                            )}
                            {systemsByCategory.map((cat) => {
                                const isCollapsed = collapsedCategories[cat.label];
                                const CatIcon = cat.icon;

                                return (
                                    <div key={cat.label} className="rounded-lg border border-border overflow-hidden bg-card">
                                        {/* Category Header */}
                                        <button
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-accent/50 transition-colors"
                                            onClick={() => toggleCategory(cat.label)}
                                        >
                                            {isCollapsed
                                                ? <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                                : <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                            }
                                            <CatIcon className={cn("h-3.5 w-3.5 shrink-0", cat.color)} />
                                            <span className="text-card-foreground flex-1 text-left">{cat.label}</span>
                                            <span className="text-[10px] text-muted-foreground tabular-nums bg-muted px-1.5 py-0.5 rounded-full">
                                                {cat.systems.length}
                                            </span>
                                        </button>

                                        {/* System Items */}
                                        {!isCollapsed && (
                                            <div className="border-t border-border">
                                                {cat.systems.map((system) => (
                                                    <button
                                                        key={system.id}
                                                        className="w-full flex items-center gap-2 px-3 pl-8 py-1.5 text-xs text-card-foreground hover:bg-accent/50 hover:text-primary transition-colors"
                                                        onClick={() => onFocusSystem?.(system.id)}
                                                        title={system.description || system.name}
                                                    >
                                                        <span className="truncate flex-1 text-left">{system.name}</span>
                                                        {system.assets.length > 0 && (
                                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                                                {system.assets.length} asset{system.assets.length !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 4. Global Tools Bottom */}
                <div className="pt-3 border-t border-border space-y-1">
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
