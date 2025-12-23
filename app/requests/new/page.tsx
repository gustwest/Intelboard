"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Request, RequestStatus } from "@/lib/data";
import { SmartImport } from "@/components/smart-import";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Link as LinkIcon, Paperclip } from "lucide-react";
import { getProjects, addProject } from "@/lib/actions";
import { useEffect } from "react";

export default function NewRequestPage() {
    const router = useRouter();
    const { addRequest } = useRequests();
    const { currentUser } = useRole();
    const { t } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        industry: "",
        deadline: "",
    });

    const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
    const [newAC, setNewAC] = useState("");
    const [userProjects, setUserProjects] = useState<any[]>([]);
    const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
    const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [attachments, setAttachments] = useState<string[]>([]);

    useEffect(() => {
        const fetchProjects = async () => {
            if (currentUser) {
                const projects = await getProjects();
                setUserProjects(projects);
            }
        };
        fetchProjects();
    }, [currentUser]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        if (!currentUser) {
            alert("You must be logged in to create a request.");
            setIsLoading(false);
            return;
        }

        let finalProjectId = linkedProjectId;

        try {
            // 1. Handle New Project Creation if needed
            if (isCreatingNewProject && newProjectName.trim()) {
                const newProject = await addProject({
                    name: newProjectName.trim(),
                    ownerId: currentUser.id,
                    description: `Project created from request: ${formData.title}`,
                });
                finalProjectId = newProject.id;

                // Open the new project in a new tab
                window.open(`/it-planner?projectId=${newProject.id}`, '_blank');
            }

            const attributesRecord: Record<string, string> = {};
            if (formData.industry) attributesRecord["Industry"] = formData.industry;
            if (formData.deadline) attributesRecord["Deadline"] = formData.deadline;

            // 2. Create the Request
            const newRequest: Request = {
                id: `r${Date.now()}`,
                title: formData.title,
                description: formData.description,
                status: "New" as RequestStatus,
                industry: formData.industry || "Other",
                budget: "",
                tags: [],
                createdAt: new Date().toISOString(),
                urgency: "Medium",
                creatorId: currentUser.id,
                acceptanceCriteria: acceptanceCriteria,
                acStatus: acceptanceCriteria.length > 0 ? "Proposed" : "Draft",
                attachments: attachments,
                linkedProjectId: finalProjectId || undefined,
                attributes: attributesRecord,
            };

            await addRequest(newRequest);
            router.push(`/board?requestId=${newRequest.id}`);
        } catch (error) {
            console.error("Failed to submit request:", error);
            alert("Failed to create request. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSmartImport = (data: {
        title: string;
        description: string;
        urgency: "Low" | "Medium" | "High" | "Critical";
        attributes: Record<string, string>;
        acceptanceCriteria: string[];
    }) => {
        setFormData(prev => ({
            ...prev,
            title: data.title,
            description: data.description,
            industry: data.attributes["Industry"] || prev.industry,
            deadline: data.attributes["Timeline"] || data.attributes["Deadline"] || prev.deadline,
        }));
        setAcceptanceCriteria(data.acceptanceCriteria);
    };

    const addAC = () => {
        if (newAC.trim()) {
            setAcceptanceCriteria([...acceptanceCriteria, newAC.trim()]);
            setNewAC("");
        }
    };

    const removeAC = (index: number) => {
        setAcceptanceCriteria(acceptanceCriteria.filter((_, i) => i !== index));
    };

    return (
        <div className="container mx-auto py-10">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">{t.request.createTitle}</h1>
                    <p className="text-muted-foreground">
                        {t.request.createDesc}
                    </p>
                </div>

                <SmartImport onImport={handleSmartImport} />

                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>{t.request.details}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">{t.request.titleLabel}</Label>
                                <Input
                                    id="title"
                                    placeholder="e.g., Digital Transformation Strategy"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t.request.descLabel}</Label>
                                <Textarea
                                    id="description"
                                    placeholder={t.request.userStoryPlaceholder}
                                    className="min-h-[150px] font-mono text-sm leading-relaxed"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="industry">{t.request.industryLabel} ({t.common.optional})</Label>
                                    <Input
                                        id="industry"
                                        placeholder="e.g. Finance"
                                        value={formData.industry}
                                        onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="deadline">{t.request.deadlineLabel} ({t.common.optional})</Label>
                                    <Input
                                        id="deadline"
                                        placeholder="e.g. Q1 2026"
                                        value={formData.deadline}
                                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t pt-4">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <LinkIcon className="h-4 w-4 text-muted-foreground" />
                                            {t.request.linkedProjectLabel} ({t.common.optional})
                                        </Label>
                                        <Select
                                            value={isCreatingNewProject ? "create-new" : (linkedProjectId || "none")}
                                            onValueChange={(v) => {
                                                if (v === "create-new") {
                                                    setIsCreatingNewProject(true);
                                                    setLinkedProjectId(null);
                                                } else {
                                                    setIsCreatingNewProject(false);
                                                    setLinkedProjectId(v === "none" ? null : v);
                                                }
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t.request.projectSelectPlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                <SelectItem value="create-new" className="text-primary font-medium">
                                                    + {t.request.createNewProject}
                                                </SelectItem>
                                                {userProjects.length > 0 && (
                                                    <>
                                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                                                            Existing Projects
                                                        </div>
                                                        {userProjects.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                        ))}
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {isCreatingNewProject && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                                            <Label htmlFor="newProjectName">{t.request.newProjectNameLabel}</Label>
                                            <Input
                                                id="newProjectName"
                                                placeholder="e.g. Q1 Efficiency Initiative"
                                                value={newProjectName}
                                                onChange={(e) => setNewProjectName(e.target.value)}
                                                required={isCreatingNewProject}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                                        {t.request.attachmentsLabel} ({t.common.optional})
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="file"
                                            className="hidden"
                                            id="file-upload"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    setAttachments([...attachments, e.target.files[0].name]);
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-start text-muted-foreground font-normal"
                                            onClick={() => document.getElementById('file-upload')?.click()}
                                        >
                                            {attachments.length > 0 ? `${attachments.length} files attached` : "Attach files..."}
                                        </Button>
                                    </div>
                                    {attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {attachments.map((file, i) => (
                                                <Badge key={i} variant="secondary" className="flex items-center gap-1">
                                                    {file}
                                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} />
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>{t.request.acLabel} ({t.common.optional})</Label>
                                </div>

                                <div className="flex gap-2">
                                    <Input
                                        placeholder={t.request.acPlaceholder}
                                        value={newAC}
                                        onChange={(e) => setNewAC(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addAC();
                                            }
                                        }}
                                    />
                                    <Button type="button" variant="outline" onClick={addAC}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>

                                {acceptanceCriteria.length > 0 && (
                                    <ul className="space-y-2 border rounded-md p-4 bg-slate-50">
                                        {acceptanceCriteria.map((ac, index) => (
                                            <li key={index} className="flex items-start justify-between gap-2 group">
                                                <div className="flex gap-2 text-sm">
                                                    <span className="text-muted-foreground font-mono">{index + 1}.</span>
                                                    <span>{ac}</span>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => removeAC(index)}
                                                >
                                                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button type="submit" size="lg" disabled={isLoading}>
                                    {isLoading ? t.common.loading : t.request.submitButton}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
