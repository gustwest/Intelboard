import { Plus, Settings, Search, FolderPlus, Sparkles, UserCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/it-flora/useStore';
import { generateBankFlora } from '@/lib/it-flora/simulation';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
    const currentUser = useStore((state) => state.currentUser);

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

            {/* User Profile */}
            <div className="mt-4 pt-4 border-t border-border">
                <div
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={onOpenUserManagement}
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
            </div>
        </div>
    );
}
