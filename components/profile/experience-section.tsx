'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Plus, X, Calendar } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Experience {
    id: string; // Temporary ID for new items
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    description?: string;
}

interface ExperienceSectionProps {
    experiences: Experience[];
    onChange: (experiences: Experience[]) => void;
    isEditing: boolean;
}

export function ExperienceSection({ experiences, onChange, isEditing }: ExperienceSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newExp, setNewExp] = useState<Partial<Experience>>({});

    const handleAdd = () => {
        if (!newExp.company || !newExp.title) return;
        onChange([
            ...experiences,
            {
                id: crypto.randomUUID(),
                company: newExp.company,
                title: newExp.title,
                startDate: newExp.startDate || new Date().toISOString().split('T')[0],
                endDate: newExp.endDate || undefined,
                description: newExp.description || ""
            }
        ]);
        setNewExp({});
        setIsAdding(false);
    };

    const handleRemove = (id: string) => {
        onChange(experiences.filter(e => e.id !== id));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Work Experience
            </h3>

            <div className="space-y-4">
                {experiences.map((exp) => (
                    <Card key={exp.id} className="relative group">
                        {isEditing && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemove(exp.id)}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </Button>
                        )}
                        <CardContent className="p-4">
                            <h4 className="font-medium text-base">{exp.title}</h4>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                                <span className="font-medium text-foreground">{exp.company}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-xs">
                                    <Calendar className="h-3 w-3" />
                                    {exp.startDate} - {exp.endDate || "Present"}
                                </span>
                            </div>
                            {exp.description && (
                                <p className="text-sm text-slate-600 whitespace-pre-line border-l-2 pl-3 border-slate-200">
                                    {exp.description}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {experiences.length === 0 && !isAdding && (
                    <div className="text-center p-4 border rounded-lg border-dashed text-muted-foreground text-sm">
                        No work experience listed.
                    </div>
                )}

                {isEditing && !isAdding && (
                    <Button variant="outline" onClick={() => setIsAdding(true)} className="w-full border-dashed">
                        <Plus className="h-4 w-4 mr-2" /> Add Position
                    </Button>
                )}

                {isAdding && (
                    <Card className="border-blue-200 bg-blue-50/20">
                        <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Job Title</Label>
                                    <Input
                                        placeholder="e.g. Senior Developer"
                                        value={newExp.title || ""}
                                        onChange={(e) => setNewExp({ ...newExp, title: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Company</Label>
                                    <Input
                                        placeholder="e.g. Acme Corp"
                                        value={newExp.company || ""}
                                        onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Input
                                        type="date"
                                        value={newExp.startDate || ""}
                                        onChange={(e) => setNewExp({ ...newExp, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Date (Leave empty if current)</Label>
                                    <Input
                                        type="date"
                                        value={newExp.endDate || ""}
                                        onChange={(e) => setNewExp({ ...newExp, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea
                                    placeholder="Describe your responsibilities and achievements..."
                                    value={newExp.description || ""}
                                    onChange={(e) => setNewExp({ ...newExp, description: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                                <Button onClick={handleAdd}>Add Position</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
