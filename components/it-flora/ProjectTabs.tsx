"use client";

import { useEffect, useState } from 'react';
import { Plus, X, Trash2, FileText, LayoutGrid, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { cn } from '@/lib/utils';
import { useStore } from '@/store/it-flora/useStore';
import { getProjectViews, createProjectView, deleteProjectView } from '@/lib/actions';

export function ProjectTabs() {
    const activeProjectId = useStore((state) => state.activeProjectId);
    const activeTool = useStore((state) => state.activeTool);
    const activeViewId = useStore((state) => state.activeViewId);
    const setActiveViewId = useStore((state) => state.setActiveViewId);

    const [views, setViews] = useState<any[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");

    // Fetch views when project changes
    useEffect(() => {
        if (!activeProjectId) {
            setViews([]);
            return;
        }

        const fetchViews = async () => {
            try {
                const fetchedViews = await getProjectViews(activeProjectId);
                setViews(fetchedViews);

                // If we have views but no active view selected (or selected view is not in new list), select first one
                if (fetchedViews.length > 0) {
                    const currentViewExists = fetchedViews.some((v: any) => v.id === activeViewId);
                    if (!activeViewId || !currentViewExists) {
                        // Filter by active tool to find a relevant default if possible
                        const toolViews = fetchedViews.filter((v: any) => v.type === activeTool);
                        if (toolViews.length > 0) {
                            setActiveViewId(toolViews[0].id);
                        } else {
                            // If no views for this tool, maybe don't select anything or let the UI show "Empty"
                            setActiveViewId(null);
                        }
                    }
                } else {
                    setActiveViewId(null);
                }
            } catch (error) {
                console.error("Failed to fetch views:", error);
            }
        };

        fetchViews();
    }, [activeProjectId, activeTool, activeViewId, setActiveViewId]);
    // Added activeTool dependency to potentially re-select if we switch tools, 
    // though arguably we might want to keep selection if valid.
    // Actually, usually we want to switch active view when tool switches if the current view is incompatible.
    // The logic inside checks if current view exists.

    // Filter views by active tool
    const currentToolViews = views.filter(v => v.type === activeTool);

    const handleCreate = async () => {
        if (!activeProjectId || !newName.trim()) return;
        try {
            const newView = await createProjectView(activeProjectId, newName.trim(), activeTool);
            setViews([...views, newView]);
            setNewName("");
            setIsCreating(false);
            setActiveViewId(newView.id);
        } catch (error) {
            console.error("Failed to create view:", error);
        }
    };

    const handleDelete = async (viewId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this sheet?")) return;
        try {
            await deleteProjectView(viewId);
            const updatedViews = views.filter(v => v.id !== viewId);
            setViews(updatedViews);

            if (activeViewId === viewId) {
                const remainingToolViews = updatedViews.filter(v => v.type === activeTool);
                setActiveViewId(remainingToolViews.length > 0 ? remainingToolViews[0].id : null);
            }
        } catch (error) {
            console.error("Failed to delete view:", error);
        }
    };

    if (!activeProjectId) return null;

    return (
        <div className="flex items-end gap-1 px-4 border-b border-border bg-slate-100/50 w-full overflow-x-auto h-10 no-scrollbar">
            {currentToolViews.map(view => (
                <div
                    key={view.id}
                    onClick={() => setActiveViewId(view.id)}
                    className={cn(
                        "group flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-medium cursor-pointer border-t border-x border-transparent min-w-[120px] max-w-[200px] transition-all relative select-none",
                        activeViewId === view.id
                            ? "bg-white text-primary border-border shadow-sm -mb-px pb-2.5 z-10"
                            : "bg-slate-200/50 text-muted-foreground hover:bg-slate-200 hover:text-foreground border-slate-200/0 mb-1"
                    )}
                >
                    {view.type === 'flowchart' ? (
                        <LayoutGrid className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    ) : (
                        <Network className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    )}
                    <span className="truncate flex-1">{view.name}</span>

                    <button
                        onClick={(e) => handleDelete(view.id, e)}
                        className={cn(
                            "opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-red-100 hover:text-red-500 transition-all",
                            activeViewId === view.id && "opacity-0 group-hover:opacity-100" // Always show close on active? No, hover is fine.
                        )}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ))}

            {isCreating ? (
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-t-lg border border-border -mb-px mb-1 h-8 animate-in fade-in zoom-in-95 duration-200">
                    <Input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Sheet Name..."
                        className="h-6 text-xs w-32 border-none focus-visible:ring-0 px-1 bg-transparent"
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleCreate();
                            if (e.key === 'Escape') setIsCreating(false);
                        }}
                    />
                    <Button size="icon" variant="ghost" className="h-5 w-5 hover:text-green-600" onClick={handleCreate}>
                        <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5 hover:text-red-600" onClick={() => setIsCreating(false)}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ) : (
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-slate-200 text-muted-foreground transition-colors mb-1 ml-1"
                    title="Add new sheet"
                >
                    <Plus className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
