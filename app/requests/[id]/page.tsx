"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, Calendar, Tag } from "lucide-react";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { ProjectLinker } from "@/components/project-linker";
import { RequestRefinement } from "@/components/request-refinement";
import { AttachmentsList } from "@/components/attachments-list";
import { ACEditor } from "@/components/ac-editor";
import { RequestApproval } from "@/components/request-approval";
import { NDAModal } from "@/components/nda-modal";
import { Request } from "@/lib/data";

export default function RequestDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { getRequest, updateRequest } = useRequests();
    const { currentUser } = useRole();
    const [request, setRequest] = useState<Request | undefined>(undefined);
    const [isNDAOpen, setIsNDAOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const id = params.id as string;

    useEffect(() => {
        if (id) {
            const foundRequest = getRequest(id);
            setRequest(foundRequest);
            setIsLoading(false);
        }
    }, [id, getRequest]);

    const handleUpdate = (updatedRequest: Request) => {
        updateRequest(updatedRequest);
        setRequest(updatedRequest);
    };

    const handleViewProject = () => {
        if (!request) return;
        if (request.specialistNDASigned) {
            window.open("/it-planner", "_blank");
        } else {
            setIsNDAOpen(true);
        }
    };

    if (isLoading) {
        return <div className="p-8">Loading...</div>;
    }

    if (!request) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-xl font-bold mb-4">Request Not Found</h1>
                <Button asChild>
                    <Link href="/board">Back to Board</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 pt-6 pb-20">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/board">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold truncate">{request.title}</h1>
                </div>
                <Badge>{request.status}</Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    {/* Project Link Section */}
                    <div className="bg-card rounded-lg border p-6 shadow-sm">
                        <h2 className="font-semibold mb-4 flex items-center gap-2">
                            <Lock className="h-4 w-4 text-blue-500" />
                            Secure Workspace
                        </h2>

                        {(currentUser?.role === "Customer" || currentUser?.role === "Admin" || currentUser?.id === request.creatorId) ? (
                            <ProjectLinker request={request} onUpdate={handleUpdate} />
                        ) : (
                            // Specialist Link View
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    This request has a dedicated IT Planner workspace.
                                </p>
                                {request.linkedProjectId ? (
                                    <Button onClick={handleViewProject} className="w-full">
                                        {request.specialistNDASigned ? "Open IT Planner Project" : "View Project (Sign NDA)"}
                                    </Button>
                                ) : (
                                    <div className="p-4 bg-muted rounded text-center text-sm text-muted-foreground">
                                        No project workspace available yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <RequestRefinement request={request} onUpdate={handleUpdate} />

                    <div className="bg-card rounded-lg border p-6 shadow-sm">
                        <h2 className="font-semibold mb-2">Description</h2>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                            {request.description}
                        </p>
                    </div>

                    <AttachmentsList request={request} onUpdate={handleUpdate} />

                    <ACEditor request={request} onUpdate={handleUpdate} />

                    <RequestApproval request={request} onUpdate={handleUpdate} />
                </div>

                <div className="space-y-6">
                    {/* Sidebar Details */}
                    <div className="bg-card rounded-lg border p-6 shadow-sm space-y-4">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Industry</h3>
                            <p>{request.industry || "Not specified"}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Tags</h3>
                            <div className="flex flex-wrap gap-2">
                                {(request.tags || []).map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                        <Tag className="mr-1 h-3 w-3" />
                                        {tag}
                                    </Badge>
                                ))}
                                {(!request.tags || request.tags.length === 0) && (
                                    <span className="text-sm text-muted-foreground">No tags</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Created</h3>
                            <div className="flex items-center text-sm">
                                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                                {new Date(request.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Budget</h3>
                            <p>{request.budget || "Not specified"}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Urgency</h3>
                            <p>{request.urgency || "Normal"}</p>
                        </div>
                    </div>
                </div>
            </div>

            <NDAModal
                request={request}
                isOpen={isNDAOpen}
                onClose={() => setIsNDAOpen(false)}
                onUpdate={handleUpdate}
            />
        </div>
    );
}

