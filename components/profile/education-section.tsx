'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Plus, X, Calendar } from "lucide-react";

// Helper to safely format dates
const formatDate = (date: string | Date | undefined) => {
    if (!date) return "";
    try {
        if (typeof date === 'string') return date;
        return date.toLocaleDateString();
    } catch (e) {
        return "";
    }
};

interface Education {
    id: string;
    school: string;
    degree: string;
    fieldOfStudy?: string;
    startDate: string | Date;
    endDate?: string | Date;
}

interface EducationSectionProps {
    education: Education[];
    onChange: (education: Education[]) => void;
    isEditing: boolean;
}

export function EducationSection({ education, onChange, isEditing }: EducationSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    // ... existing ...

    // ... existing ...

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Education
            </h3>

            <div className="space-y-4">
                {education.map((edu) => (
                    <Card key={edu.id} className="relative group">
                        {isEditing && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemove(edu.id)}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </Button>
                        )}
                        <CardContent className="p-4">
                            <h4 className="font-medium text-base">{edu.school}</h4>
                            <div className="text-sm">
                                <span className="font-semibold text-slate-700">{edu.degree}</span>
                                {edu.fieldOfStudy && <span className="text-slate-600"> in {edu.fieldOfStudy}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(edu.startDate)} - {edu.endDate ? formatDate(edu.endDate) : "Present"}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {education.length === 0 && !isAdding && (
                    <div className="text-center p-4 border rounded-lg border-dashed text-muted-foreground text-sm">
                        No education listed.
                    </div>
                )}

                {isEditing && !isAdding && (
                    <Button variant="outline" onClick={() => setIsAdding(true)} className="w-full border-dashed">
                        <Plus className="h-4 w-4 mr-2" /> Add Education
                    </Button>
                )}

                {isAdding && (
                    <Card className="border-blue-200 bg-blue-50/20">
                        <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>School / University</Label>
                                    <Input
                                        placeholder="e.g. MIT"
                                        value={newEdu.school || ""}
                                        onChange={(e) => setNewEdu({ ...newEdu, school: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Degree</Label>
                                    <Input
                                        placeholder="e.g. Bachelor of Science"
                                        value={newEdu.degree || ""}
                                        onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Field of Study (Optional)</Label>
                                <Input
                                    placeholder="e.g. Computer Science"
                                    value={newEdu.fieldOfStudy || ""}
                                    onChange={(e) => setNewEdu({ ...newEdu, fieldOfStudy: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Input
                                        type="date"
                                        value={newEdu.startDate || ""}
                                        onChange={(e) => setNewEdu({ ...newEdu, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Date</Label>
                                    <Input
                                        type="date"
                                        value={newEdu.endDate || ""}
                                        onChange={(e) => setNewEdu({ ...newEdu, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                                <Button onClick={handleAdd}>Add Education</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
