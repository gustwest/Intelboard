import { useState, useEffect, useCallback } from 'react';
import { useStore, Project } from "@/store/it-flora/useStore";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Image as ImageIcon, Trash2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

interface ProjectNotesProps {
    projectId: string;
}

export function ProjectNotes({ projectId }: ProjectNotesProps) {
    const { projects, updateProject } = useStore();
    const [notes, setNotes] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const project = projects.find(p => p.id === projectId);

    useEffect(() => {
        if (project) {
            setNotes(project.notes || '');
            setImages(project.projectImages || []);
        }
    }, [project]);

    const handleSave = () => {
        setIsSaving(true);
        updateProject(projectId, {
            notes,
            projectImages: images
        });

        // Simulate save duration
        setTimeout(() => {
            setIsSaving(false);
            toast({
                title: "Notes & Media saved",
                description: "Your project updates have been saved.",
            });
        }, 500);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    setImages(prev => [...prev, result]);
                };
                reader.readAsDataURL(file);
            }
        });
    }, []);

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] }
    });

    if (!project) return null;

    return (
        <Card className="border-slate-200 shadow-xl bg-white/95 backdrop-blur-sm h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 shrink-0">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    Project Notes & Media
                </CardTitle>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-8 gap-2 text-xs font-semibold"
                    >
                        <Save className="h-3.5 w-3.5" />
                        Save
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-1 overflow-y-auto space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="project-notes" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</Label>
                    <Textarea
                        id="project-notes"
                        placeholder="Type project documentation here..."
                        className="min-h-[150px] resize-none border-slate-200 focus:ring-1 focus:ring-primary text-sm leading-relaxed bg-transparent"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Photos & Attachments</Label>

                    {/* Image Grid */}
                    <div className="grid grid-cols-2 gap-2">
                        {images.map((img, idx) => (
                            <div key={idx} className="group relative aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
                                <img src={img} alt={`Attachment ${idx}`} className="w-full h-full object-cover" />
                                <button
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-red-50 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}

                        {/* Dropzone / Add Button */}
                        <div
                            {...getRootProps()}
                            className={cn(
                                "aspect-square rounded-md border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary hover:bg-slate-50 transition-all text-slate-400",
                                isDragActive && "border-primary bg-slate-50 text-primary"
                            )}
                        >
                            <input {...getInputProps()} />
                            <Plus className="h-6 w-6" />
                            <span className="text-[10px] font-medium">Add Photo</span>
                        </div>
                    </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-right italic pt-2">
                    {notes.length} characters • {images.length} photos
                </p>
            </CardContent>
        </Card>
    );
}
