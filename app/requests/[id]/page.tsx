"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { initialRequests, Request, RequestStatus, mockUsers } from "@/lib/data";
import { ACEditor } from "@/components/ac-editor";
import { RequestRefinement } from "@/components/request-refinement";
import { AttachmentsList } from "@/components/attachments-list";
import { RequestApproval } from "@/components/request-approval";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/use-toast";

import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";

export default function RequestDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { getRequest, updateRequest, isLoaded } = useRequests();
    const { currentUser } = useRole();
    const [request, setRequest] = useState<Request | null>(null);

    useEffect(() => {
        if (isLoaded && params.id) {
            const found = getRequest(params.id as string);
            if (found) {
                const timer = setTimeout(() => {
                    setRequest(found);
                }, 0);
                return () => clearTimeout(timer);
            }
        }
    }, [params.id, isLoaded, getRequest]);

    const handleStatusChange = (newStatus: RequestStatus) => {
        if (!request) return;
        updateRequest({ ...request, status: newStatus });

        // Simulate Email Notification
        if (newStatus === "Matched" || newStatus === "Microgig Active") {
            toast({
                title: "📧 Email Sent",
                description: `Notification sent to ${currentUser?.name || "User"} regarding status update: ${newStatus}`,
                duration: 5000,
            });
        }
    };

    const handleAssignSpecialist = (specialistId: string) => {
        if (!request) return;
        const specialist = mockUsers.find(u => u.id === specialistId);
        updateRequest({
            ...request,
            assignedSpecialistId: specialistId,
            status: "Matched"
        });

        // Simulate Email Notification
        toast({
            title: "📧 Match Confirmed!",
            description: `Email sent to ${specialist?.name} with request details.`,
            duration: 5000,
        });
    };

    const handleUpdate = (updated: Request) => {
        // Update local state
        setRequest(updated);
        // Update storage
        updateRequest(updated);
    };

    if (!request) {
        return <div className="p-8">Loading...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/board">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold truncate">{request.title}</h1>
                <Badge>{request.status}</Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
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
                    <div className="bg-card rounded-lg border p-6 shadow-sm space-y-4">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Industry</h3>
                            <p>{request.industry}</p>
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
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Created</h3>
                            <div className="flex items-center text-sm">
                                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                                {new Date(request.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
