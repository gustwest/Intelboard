"use client";

import { useState } from "react";
import { useStore } from "@/store/it-flora/useStore";
import { Request } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PlusCircle, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useRole } from "@/components/role-provider";

interface ProjectLinkerProps {
    request: Request;
    onUpdate: (updatedRequest: Request) => void;
}

export function ProjectLinker({ request, onUpdate }: ProjectLinkerProps) {
    const { currentUser } = useRole();
    const projects = useStore((state) => state.projects);
    const addProject = useStore((state) => state.addProject);
    const updateProject = useStore((state) => state.updateProject);

    const [selectedProjectId, setSelectedProjectId] = useState<string>(request.linkedProjectId || "");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");

    // Filter projects the user owns or is shared with
    const availableProjects = projects.filter(p =>
        currentUser?.role === "Admin" ||
        p.ownerId === currentUser?.id ||
        (p.sharedWith || []).includes(currentUser?.id || "")
    );

    const handleLink = () => {
        if (!selectedProjectId) return;

        // share with admin automatically
        // In a real app, we'd look up the admin ID properly
        const adminId = "admin1";

        // Find the project and update its sharing if needed
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
            const sharedWith = new Set(project.sharedWith);
            sharedWith.add(adminId); // Share with Admin

            // If specialist is already assigned, share with them too if NDA signed (or maybe just prepare it)
            // For now, only Admin. Specialist gets access after NDA.

            updateProject(project.id, { sharedWith: Array.from(sharedWith) });
        }

        onUpdate({ ...request, linkedProjectId: selectedProjectId });
        toast({ title: "Project Linked", description: "IT Planner project linked successfully." });
    };

    const handleCreateProject = () => {
        // Redirect to IT Planner with params to trigger creation there
        const encodedTitle = encodeURIComponent(request.title);
        window.location.href = `/it-planner?createForRequestId=${request.id}&requestTitle=${encodedTitle}`;
    };

    const linkedProject = projects.find(p => p.id === request.linkedProjectId);

    if (request.linkedProjectId && linkedProject) {
        return (
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                        <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm">Linked Project</h4>
                        <p className="text-sm text-muted-foreground">{linkedProject.name}</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <a href={`/it-planner?projectId=${linkedProject.id}`} target="_blank" rel="noopener noreferrer">
                        Open in IT Planner
                    </a>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select IT Planner Project..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableProjects.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={handleLink} disabled={!selectedProjectId}>Link</Button>
            </div>

            <div className="text-center text-xs text-muted-foreground">
                or
            </div>

            <Button variant="outline" className="w-full border-dashed" onClick={handleCreateProject}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Project
            </Button>
        </div>
    );
}
