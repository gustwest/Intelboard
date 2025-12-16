"use client";

import { useState, useEffect } from "react";
import { Request, specialists, mockUsers } from "@/lib/data";
import { useRole } from "@/components/role-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ProjectLinker } from "@/components/project-linker";
import { ACEditor } from "@/components/ac-editor";

interface RequestDetailsPanelProps {
    request: Request;
    onClose: () => void;
    onUpdate: (updatedRequest: Request) => void;
    isOwner: boolean;
}

export function RequestDetailsPanel({ request, onClose, onUpdate, isOwner }: RequestDetailsPanelProps) {
    const { role } = useRole();
    const [formData, setFormData] = useState(request);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setFormData(request);
        setIsDirty(false);
    }, [request]);

    const handleChange = (field: keyof Request, value: any) => {
        const updated = { ...formData, [field]: value };
        setFormData(updated);
        setIsDirty(true);
    };

    const handleSave = () => {
        onUpdate(formData);
        setIsDirty(false);
    };

    const handleSubmitForIntel = () => {
        onUpdate({ ...formData, status: "Submitted for Review" });
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-[400px] bg-background shadow-2xl border-l z-50 flex flex-col transform transition-transform duration-300 ease-in-out pt-16">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-start bg-muted/30">
                    <div>
                        <h2 className="text-lg font-semibold">{request.title || "Untitled Request"}</h2>
                        <Badge variant="outline" className="mt-1">
                            {request.status}
                        </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                        {/* Admin View: Matched Details */}
                        {role === "Admin" && (
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                                <h3 className="font-semibold mb-3">Admin Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Requested By</Label>
                                        <div className="font-medium mt-1">
                                            {mockUsers.find(u => u.id === request.creatorId)?.company ||
                                                mockUsers.find(u => u.id === request.creatorId)?.name ||
                                                "Unknown"}
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Matched With</Label>
                                        <div className="font-medium mt-1">
                                            {request.assignedSpecialistId
                                                ? specialists.find(s => s.id === request.assignedSpecialistId)?.name
                                                : "No match yet"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Submit Action Block - legacy removed */}
                        {/* Action Needed Block for Customer */}
                        {request.actionNeeded && isOwner && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800 animate-in fade-in slide-in-from-top-4 duration-500">
                                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center">
                                    <Send className="w-4 h-4 mr-2" />
                                    Action Required
                                </h3>
                                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                                    A specialist has responded to your request. Please review their message below or confirm the match.
                                </p>

                                {request.specialistNote && (
                                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded text-sm italic text-muted-foreground mb-4 border">
                                        "{request.specialistNote}"
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button className="flex-1" onClick={() => {
                                        onUpdate({ ...request, status: "Scope Approved", actionNeeded: false });
                                        onClose();
                                    }}>
                                        Accept Match
                                    </Button>
                                    <Button variant="outline" className="flex-1" onClick={() => {
                                        // Logic for replying would go here (e.g. open a chat)
                                        // For now just clear the action flag
                                        onUpdate({ ...request, actionNeeded: false });
                                        onClose();
                                    }}>
                                        Reply
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Project Linker Section */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                                <h3 className="font-semibold mb-3 flex items-center text-sm">
                                    <span className="bg-blue-100 text-blue-700 p-1 rounded mr-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                    </span>
                                    Secure Workspace
                                </h3>
                                {(role === "Customer" || role === "Admin" || (role === "Specialist" && request.assignedSpecialistId && request.specialistNDASigned)) ? (
                                    <ProjectLinker request={formData} onUpdate={(updated) => {
                                        setFormData(updated);
                                        onUpdate(updated);
                                    }} />
                                ) : (
                                    <div className="text-sm text-muted-foreground italic">
                                        Link available after assignment and NDA.
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={formData.title}
                                    onChange={(e) => handleChange("title", e.target.value)}
                                    disabled={!isOwner}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => handleChange("description", e.target.value)}
                                    disabled={!isOwner}
                                    className="min-h-[100px]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="industry">Industry</Label>
                                    <Input
                                        id="industry"
                                        value={formData.industry}
                                        onChange={(e) => handleChange("industry", e.target.value)}
                                        disabled={!isOwner}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="budget">Budget</Label>
                                    <Input
                                        id="budget"
                                        value={formData.budget || ""}
                                        onChange={(e) => handleChange("budget", e.target.value)}
                                        disabled={!isOwner}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="urgency">Urgency</Label>
                                <Select
                                    value={formData.urgency}
                                    onValueChange={(val) => handleChange("urgency", val)}
                                    disabled={!isOwner}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="High">High</SelectItem>
                                        <SelectItem value="Critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Acceptance Criteria */}
                        <ACEditor request={formData} onUpdate={(updated) => {
                            setFormData(updated);
                            onUpdate(updated);
                        }} />

                        {isDirty && (
                            <div className="pt-4">
                                <Button onClick={handleSave} variant="secondary" className="w-full">
                                    Save Changes
                                </Button>
                            </div>
                        )}

                        {/* Submit for Review Action */}
                        {!isDirty && request.status === "New" && isOwner && (
                            <div className="pt-4 border-t mt-6">
                                <Button onClick={handleSubmitForIntel} className="w-full" size="lg">
                                    Submit for Review
                                </Button>
                                <p className="text-xs text-muted-foreground text-center mt-2">
                                    This will notify our specialists to review your request.
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}
