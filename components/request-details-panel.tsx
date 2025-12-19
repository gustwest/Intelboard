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
import { X, Send, Maximize2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ProjectLinker } from "@/components/project-linker";
import { ACEditor } from "@/components/ac-editor";
import { updateRequest, getRequestCreator } from "@/lib/actions";
import { Comment } from "@/lib/data";
import { Paperclip, MessageSquare, ImageIcon, Plus, Trash2 } from "lucide-react";

interface RequestDetailsPanelProps {
    request: Request;
    onClose: () => void;
    onUpdate: (updatedRequest: Request) => void;
    isOwner: boolean;
}

export function RequestDetailsPanel({ request, onClose, onUpdate, isOwner }: RequestDetailsPanelProps) {
    const { role, currentUser } = useRole();
    const [formData, setFormData] = useState<Request>(request);
    const [isDirty, setIsDirty] = useState(false);
    const [newComment, setNewComment] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [creator, setCreator] = useState<any>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    useEffect(() => {
        setFormData(request);
        setIsDirty(false);

        async function fetchCreator() {
            if (request.creatorId) {
                const c = await getRequestCreator(request.creatorId);
                setCreator(c);
            }
        }
        fetchCreator();
    }, [request]);

    const handleChange = (field: keyof Request, value: any) => {
        const updated = { ...formData, [field]: value };
        setFormData(updated);
        setIsDirty(true);
    };

    const handleSave = async (updatedData = formData) => {
        const result = await updateRequest(request.id, updatedData) as unknown as Request;
        if (result) {
            onUpdate(result);
            setIsDirty(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        const comment: Comment = {
            id: crypto.randomUUID(),
            text: newComment,
            authorId: currentUser?.id || "unknown",
            authorName: currentUser?.name || "User",
            authorRole: role,
            createdAt: new Date().toISOString(),
        };

        const updatedComments = [...(formData.comments || []), comment];
        const updated = { ...formData, comments: updatedComments };

        setFormData(updated);
        setNewComment("");
        await handleSave(updated);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;
                const updatedAttachments = [...(formData.attachments || []), base64String];
                const updated = { ...formData, attachments: updatedAttachments };
                setFormData(updated);
                await handleSave(updated);
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Upload failed:", error);
            setIsUploading(false);
        }
    };

    const removeAttachment = async (index: number) => {
        const updatedAttachments = formData.attachments?.filter((_, i) => i !== index) || [];
        const updated = { ...formData, attachments: updatedAttachments };
        setFormData(updated);
        await handleSave(updated);
    };

    const handleSubmitForIntel = () => {
        onUpdate({ ...formData, status: "Submitted for Review" });
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[90] bg-black/5 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-6 top-6 bottom-6 w-[550px] bg-background shadow-[0_20px_50px_rgba(0,0,0,0.3)] border rounded-3xl z-[100] flex flex-col animate-in slide-in-from-right-8 duration-300 overflow-hidden">
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
                                            {creator?.company || creator?.name || "Loading..."}
                                            {creator?.email && <span className="text-[10px] block text-muted-foreground opacity-70">({creator.email})</span>}
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

                        {/* Attachments Section */}
                        <div className="space-y-3 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-2">
                                    <Paperclip className="h-4 w-4" />
                                    Attachments ({formData.attachments?.length || 0})
                                </Label>
                                <label className="cursor-pointer">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                        disabled={isUploading}
                                    />
                                    <Badge variant="outline" className="flex items-center gap-1 hover:bg-muted">
                                        <Plus className="h-3 w-3" /> Add
                                    </Badge>
                                </label>
                            </div>

                            {formData.attachments && formData.attachments.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {formData.attachments.map((att, i) => (
                                        <div key={i} className="group relative rounded-md border overflow-hidden aspect-video bg-muted/30 cursor-pointer" onClick={() => setPreviewImage(att)}>
                                            <img src={att} alt={`Attachment ${i}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white">
                                                    <Maximize2 className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="destructive" className="h-8 w-8" onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeAttachment(i);
                                                }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground italic text-center py-4 border rounded-md border-dashed">
                                    No attachments yet
                                </div>
                            )}
                        </div>

                        {/* Communication Section */}
                        <div className="space-y-4 pt-6 border-t pb-20">
                            <Label className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Communication
                            </Label>

                            <div className="space-y-4">
                                {formData.comments && formData.comments.length > 0 ? (
                                    formData.comments.map((comment: any) => (
                                        <div
                                            key={comment.id}
                                            className={cn(
                                                "flex flex-col max-w-[85%] rounded-lg p-3 text-sm shrink-0",
                                                comment.authorId === currentUser?.id
                                                    ? "ml-auto bg-primary text-primary-foreground rounded-tr-none"
                                                    : "bg-muted rounded-tl-none border shadow-sm"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-4 mb-1">
                                                <span className="font-bold text-[10px] uppercase opacity-70">
                                                    {comment.authorName} ({comment.authorRole})
                                                </span>
                                                <span className="text-[10px] opacity-50">
                                                    {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="whitespace-pre-wrap leading-snug">{comment.text}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-muted-foreground italic text-center py-4">
                                        Start a conversation with Intel Admin...
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Textarea
                                    placeholder="Type your message..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    className="min-h-[60px] resize-none"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAddComment();
                                        }
                                    }}
                                />
                                <Button
                                    size="icon"
                                    className="h-auto aspect-square self-stretch"
                                    onClick={handleAddComment}
                                    disabled={!newComment.trim()}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {isDirty && (
                            <div className="pt-4 fixed bottom-4 right-4 left-4 bg-background/80 backdrop-blur pb-2 z-10">
                                <Button onClick={() => handleSave()} variant="secondary" className="w-full shadow-lg border">
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

            {/* Image Preview Modal */}
            <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] p-1 overflow-hidden">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Image Preview</DialogTitle>
                    </DialogHeader>
                    {previewImage && (
                        <div className="relative w-full h-full flex items-center justify-center bg-black/5 rounded-lg overflow-auto">
                            <img
                                src={previewImage}
                                alt="Preview"
                                className="max-w-full max-h-full object-contain shadow-2xl"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
