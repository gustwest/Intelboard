"use client";

import { useState } from "react";
import { Request, ACStatus } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus, Check, X, Edit2 } from "lucide-react";
import { useRole } from "@/components/role-provider";

interface ACEditorProps {
    request: Request;
    onUpdate: (updatedRequest: Request) => void;
}

export function ACEditor({ request, onUpdate }: ACEditorProps) {
    const { role } = useRole();
    const [newAC, setNewAC] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState("");

    const handleAddAC = () => {
        if (!newAC.trim()) return;
        const updated = {
            ...request,
            acceptanceCriteria: [...request.acceptanceCriteria, newAC],
            acStatus: "Draft" as ACStatus,
        };
        onUpdate(updated);
        setNewAC("");
    };

    const handleRemoveAC = (index: number) => {
        const updated = {
            ...request,
            acceptanceCriteria: request.acceptanceCriteria.filter((_, i) => i !== index),
            acStatus: "Draft" as ACStatus,
        };
        onUpdate(updated);
    };

    const handleStartEdit = (index: number) => {
        setEditingIndex(index);
        setEditValue(request.acceptanceCriteria[index]);
    };

    const handleSaveEdit = (index: number) => {
        const newCriteria = [...request.acceptanceCriteria];
        newCriteria[index] = editValue;
        const updated = {
            ...request,
            acceptanceCriteria: newCriteria,
            acStatus: "Draft" as ACStatus,
        };
        onUpdate(updated);
        setEditingIndex(null);
    };

    const handleGenerateAI = async () => {
        setIsGenerating(true);
        // Simulate AI delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const suggestions = [
            `Define clear success metrics for ${request.title}`,
            "Ensure compliance with industry standards",
            "Document all API endpoints and data flows",
            "Conduct user acceptance testing with key stakeholders"
        ];

        const updated = {
            ...request,
            acceptanceCriteria: [...request.acceptanceCriteria, ...suggestions],
            acStatus: "Proposed" as ACStatus,
        };
        onUpdate(updated);
        setIsGenerating(false);
    };

    const handleApprove = () => {
        const updated = {
            ...request,
            acStatus: "Agreed" as ACStatus
        };
        onUpdate(updated);
    }

    const canEdit = role === "Admin" || role === "Specialist" || (role === "Customer" && request.acStatus !== "Agreed");

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-bold">Acceptance Criteria</CardTitle>
                <Badge variant={request.acStatus === "Agreed" ? "default" : "secondary"}>
                    {request.acStatus}
                </Badge>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="space-y-2">
                    {request.acceptanceCriteria.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                            No acceptance criteria defined yet.
                        </p>
                    )}
                    {request.acceptanceCriteria.map((ac, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between p-2 rounded-md border bg-slate-50 dark:bg-slate-900"
                        >
                            {editingIndex === index ? (
                                <div className="flex items-center gap-2 w-full">
                                    <Input
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="h-8"
                                    />
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSaveEdit(index)}>
                                        <Check className="h-4 w-4 text-green-500" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingIndex(null)}>
                                        <X className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <span className="text-sm">{ac}</span>
                                    {canEdit && (
                                        <div className="flex items-center">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => handleStartEdit(index)}
                                            >
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleRemoveAC(index)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {canEdit && (
                    <div className="flex gap-2">
                        <Input
                            placeholder="Add new criteria..."
                            value={newAC}
                            onChange={(e) => setNewAC(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddAC()}
                        />
                        <Button size="icon" onClick={handleAddAC}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                <div className="flex justify-between pt-4 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateAI}
                        disabled={isGenerating || !canEdit}
                        className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-900 dark:hover:bg-purple-900/20"
                    >
                        <Sparkles className="mr-2 h-3 w-3" />
                        {isGenerating ? "Generating..." : "AI Suggest"}
                    </Button>

                    {(role === "Admin" || role === "Customer") && request.acStatus !== "Agreed" && (
                        <Button size="sm" onClick={handleApprove} variant="default">
                            Approve Criteria
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
