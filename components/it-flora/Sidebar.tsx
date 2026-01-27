"use client";

import { Plus, Settings, Search, FolderPlus, Sparkles, UserCircle, Lightbulb, Check, X, Briefcase } from 'lucide-react';
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

    // Pending Approvals State
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);

    useEffect(() => {
        if (currentUser?.companyId) {
            getCompanyUsers(currentUser.companyId).then(users => {
                setPendingUsers(users.filter((u: any) => u.approvalStatus === 'PENDING'));
            });
        } else {
            setPendingUsers([]);
        }
    }, [currentUser?.companyId]);

    const handleApprove = async (userId: string) => {
        const result = await approveUserAccess(userId);
        if (result.success) {
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
            // simplified toast/alert
            alert(`Approved ${result.user?.name}`);
        }
    };

    // Filter projects based on visibility
    const visibleProjects = projects.filter(p => {
        // Admins can see everything
        if (currentUser?.role === 'Administrator' || currentUser?.role === 'Admin') return true;

        // If we have a current user, check ownership or sharing
        if (currentUser) {
            return p.ownerId === currentUser.id || p.sharedWith?.includes(currentUser.id);
        }

        // Default visibility for Guests/Unauthenticated on a new device
        // They should be able to see "shared" or owner-less projects in the room
        return !p.ownerId || p.ownerId === 'unknown' || p.sharedWith?.includes('guest');
    });

    const activeProject = visibleProjects.find(p => p.id === activeProjectId);

    // Filter systems list based on active project OR ownership
    const displayedSystems = activeProjectId
        ? systems.filter(s => activeProject?.systemIds.includes(s.id))
        : systems.filter(s => {
            if (!currentUser) return false;
            // Admins can see everything (optional, but good for demo/debug)
            if (currentUser.role === 'Administrator') return true;

            // Strict ownership or shared check
            return s.ownerId === currentUser.id || s.sharedWith?.includes(currentUser.id);
        });

    return (
        <div className="w-64 border-r border-border bg-card p-4 flex flex-col h-full shadow-sm">
            <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-tight">IT Planner</h2>
                <p className="text-sm text-muted-foreground">Manage IT Landscape</p>
            </div>

            {/* Project Selector */}
            <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Project
                    </label>
                    {activeProjectId && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onEditProject(activeProjectId)}
                            title="Edit Project"
                        >
                            <Settings className="h-3 w-3" />
                        </Button>
                    )}
                </div>

                <Select
                    value={activeProjectId || "master"}
                    onValueChange={(val) => setActiveProject(val === "master" ? null : val)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="master">All Systems (Master)</SelectItem>
                            {visibleProjects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>

                <Button onClick={onAddProject} variant="ghost" size="sm" className="w-full justify-start px-2 text-primary hover:text-primary/80">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New Project
                </Button>

                <div className="space-y-2 pt-2 border-t border-border">
                    {activeProjectId && (
                        <Button
                            onClick={() => onManageSystems()}
                            variant="secondary"
                            size="sm"
                            className="w-full justify-start"
                        >
                            <Settings className="mr-2 h-4 w-4" />
                            Manage Systems
                        </Button>
                    )}
                    <Button
                        onClick={onOpenCatalogue}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                    >
                        <Search className="mr-2 h-4 w-4" />
                        Data Catalogue
                    </Button>
                    <Button
                        onClick={() => window.location.href = '/talent'}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start mt-1"
                    >
                        <Briefcase className="mr-2 h-4 w-4" />
                        Talent Directory
                    </Button>
                    <Button
                        onClick={() => window.location.href = '/architect'}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    >
                        <Lightbulb className="mr-2 h-4 w-4" />
                        Architecture Advisor
                    </Button>
                </div>
            </div>

            <div className="space-y-2 mb-6">
                <Button onClick={onAddSystem} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add System
                </Button>

                <Button
                    onClick={onImportAI}
                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0"
                >
                    <Sparkles className="mr-2 h-4 w-4" />
                    AI Import
                </Button>

                <Button onClick={generateBankFlora} variant="outline" className="w-full">
                    Generate Demo Bank
                </Button>
            </div>

            <div className="flex-1 overflow-auto -mx-2 px-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    {activeProjectId ? `${activeProject?.name} Systems` : `All Systems`} ({displayedSystems.length})
                </h3>
                <div className="space-y-1">
                    {displayedSystems.map((system) => (
                        <div
                            key={system.id}
                            className="px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-foreground/80 truncate transition-colors"
                            title={system.name}
                        >
                            {system.name}
                        </div>
                    ))}
                    {displayedSystems.length === 0 && (
                        <p className="text-sm text-muted-foreground italic px-2">No systems visible.</p>
                    )}
                </div>
            </div>

            {/* Pending Approvals Section */}
            {pendingUsers.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                    <h3 className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-2 flex items-center">
                        <UserCircle className="w-3 h-3 mr-1" />
                        Pending Approvals ({pendingUsers.length})
                    </h3>
                    <div className="space-y-2">
                        {pendingUsers.map(user => (
                            <div key={user.id} className="p-2 bg-amber-50 rounded-md border border-amber-100 dark:bg-amber-900/20 dark:border-amber-800">
                                <div className="text-xs font-semibold mb-1">{user.name}</div>
                                <div className="text-[10px] text-muted-foreground mb-2 truncate">{user.email}</div>
                                <Button size="sm" className="w-full h-6 text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-0" onClick={() => handleApprove(user.id)}>
                                    Approve Access
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* User Profile */}
            <div className="mt-4 pt-4 border-t border-border">
                <Link href="/account">
                    <div
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                        <Avatar className="h-9 w-9 border border-border">
                            <AvatarImage src={currentUser?.avatar} alt={currentUser?.name || "User"} />
                            <AvatarFallback>
                                {currentUser?.name ? currentUser.name[0] : <UserCircle className="w-5 h-5" />}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                                {currentUser?.name || 'Guest User'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                                {currentUser?.role || 'Viewer'}
                            </div>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
