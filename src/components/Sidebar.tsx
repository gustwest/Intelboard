import { Plus, LayoutGrid, Settings, Edit, Trash2, Search, FolderPlus, Sparkles, UserCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';
import { generateBankFlora } from '@/lib/simulation';
import { Select } from '@/components/ui/select';
import { useSession, signOut } from "next-auth/react";

interface SidebarProps {
    onAddSystem: () => void;
    onAddProject: () => void;
    onEditProject: (projectId: string) => void;
    onManageSystems: () => void;
    onOpenCatalogue: () => void;
    onImportAI: () => void;
    onOpenUserManagement: () => void;
}

export function Sidebar({ onAddSystem, onAddProject, onEditProject, onManageSystems, onOpenCatalogue, onImportAI, onOpenUserManagement }: SidebarProps) {
    const systems = useStore((state) => state.systems);
    const projects = useStore((state) => state.projects);
    const activeProjectId = useStore((state) => state.activeProjectId);
    const setActiveProject = useStore((state) => state.setActiveProject);
    const { data } = useSession();

    // currentUser removed from store, using session data
    const currentUser = data?.user ? { ...data.user, id: data.user.id, role: 'user' } : null; // Mapping for compatibility or use logic directly
    // Note: VisibleProjects logic relied on currentUser.role. 
    // We should simplify visibility logic or fetch real permissions.
    // For now, let's assume 'user' role.

    // Filter projects based on visibility
    const visibleProjects = projects.filter(p => {
        if (!currentUser) return false;
        if (currentUser.role === 'Administrator') return true;
        return p.ownerId === currentUser.id || p.sharedWith?.includes(currentUser.id);
    });

    const activeProject = visibleProjects.find(p => p.id === activeProjectId);

    // Filter systems list based on active project
    const displayedSystems = activeProjectId
        ? systems.filter(s => activeProject?.systemIds.includes(s.id))
        : systems;

    return (
        <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 flex flex-col h-full">
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900">System Flora</h1>
                <p className="text-sm text-slate-500">Manage your IT landscape</p>
            </div>

            {/* Project Selector */}
            <div className="mb-6 space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Project View
                    </label>
                    {activeProjectId && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => onEditProject(activeProjectId)}
                                title="Edit Project"
                            >
                                <Settings className="h-3 w-3" />
                            </Button>
                        </>
                    )}
                </div>
                <Select
                    value={activeProjectId || ''}
                    onChange={(e) => setActiveProject(e.target.value || null)}
                    className="w-full text-sm"
                >
                    <option value="">All Systems (Master)</option>
                    {visibleProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </Select>
                <Button onClick={onAddProject} variant="ghost" size="sm" className="w-full text-xs justify-start px-1 text-blue-600 hover:text-blue-700">
                    <FolderPlus className="mr-2 h-3 w-3" />
                    New Project
                </Button>
                <div className="space-y-2 mt-2">
                    {activeProjectId && (
                        <Button
                            onClick={() => onManageSystems()}
                            variant="secondary"
                            size="sm"
                            className="w-full text-xs justify-start"
                        >
                            <Settings className="mr-2 h-3 w-3" />
                            Manage Systems
                        </Button>
                    )}
                    <Button
                        onClick={onOpenCatalogue}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs justify-start border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                    >
                        <Search className="mr-2 h-3 w-3" />
                        Data Catalogue
                    </Button>
                    <Button
                        onClick={() => window.location.href = '/architect'}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs justify-start border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                    >
                        <Lightbulb className="mr-2 h-3 w-3" />
                        Architecture Advisor
                    </Button>
                    <Button
                        onClick={() => window.location.href = '/live-score'}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs justify-start border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 mt-4"
                    >
                        <span className="mr-2 text-base leading-none">🏐</span>
                        Live Scoring (Beta)
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

                <Button onClick={generateBankFlora} variant="outline" className="w-full text-xs">
                    Generate Demo Bank
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    {activeProjectId ? `${activeProject?.name} Systems` : `All Systems`} ({displayedSystems.length})
                </h2>
                <div className="space-y-1">
                    {displayedSystems.map((system) => (
                        <div
                            key={system.id}
                            className="px-2 py-1.5 text-sm rounded-md hover:bg-slate-200/50 cursor-pointer text-slate-700 truncate"
                            title={system.name}
                        >
                            {system.name}
                        </div>
                    ))}
                    {displayedSystems.length === 0 && (
                        <p className="text-sm text-slate-400 italic px-2">No systems visible.</p>
                    )}
                </div>
            </div>


            {/* User Profile */}
            <div className="mt-4 pt-4 border-t border-slate-200">
                <div
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 cursor-pointer transition-colors"
                    onClick={onOpenUserManagement}
                >
                    {data?.user?.image ? (
                        <img
                            src={data.user.image}
                            alt={data.user.name || ''}
                            className="w-9 h-9 rounded-full bg-white border border-slate-200"
                        />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                            {data?.user?.name || 'Guest User'}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                            {data?.user?.email}
                        </div>
                    </div>
                </div>
                <div className="mt-2">
                    <Button
                        onClick={() => signOut()}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                    >
                        Sign Out
                    </Button>
                </div>
            </div>
        </div>
    );
}
