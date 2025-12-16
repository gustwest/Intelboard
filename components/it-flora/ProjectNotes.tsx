import { useState, useEffect } from 'react';
import { useStore, Project } from "@/store/it-flora/useStore";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';

interface ProjectNotesProps {
    projectId: string;
}

export function ProjectNotes({ projectId }: ProjectNotesProps) {
    const { projects, updateProject } = useStore();
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const project = projects.find(p => p.id === projectId);

    useEffect(() => {
        if (project) {
            setNotes(project.notes || '');
        }
    }, [project]);

    const handleSave = () => {
        setIsSaving(true);
        updateProject(projectId, { notes });

        // Simulate save duration
        setTimeout(() => {
            setIsSaving(false);
            toast({
                title: "Notes saved",
                description: "Your project notes have been saved locally.",
            });
        }, 500);
    };

    if (!project) return null;

    return (
        <Card className="mt-8 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xl font-bold">Project Notes</CardTitle>
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2"
                >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Notes'}
                </Button>
            </CardHeader>
            <CardContent>
                <div className="grid gap-2">
                    <Label htmlFor="project-notes" className="sr-only">Notes</Label>
                    <Textarea
                        id="project-notes"
                        placeholder="Type your project notes here..."
                        className="min-h-[200px] resize-y font-mono text-sm leading-relaxed"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground text-right w-full">
                        {notes.length} characters
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
