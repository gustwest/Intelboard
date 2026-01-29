"use client";

import { useTransition } from "react";
import { approveUser, rejectUser } from "@/app/dashboard/settings/approvals/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";

interface PendingUser {
    id: string;
    name: string | null;
    email: string | null;
    createdAt?: Date | null;
}

interface ApprovalDashboardProps {
    pendingUsers: PendingUser[];
}

export function ApprovalDashboard({ pendingUsers }: ApprovalDashboardProps) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    function handleApprove(userId: string) {
        startTransition(async () => {
            const result = await approveUser(userId);
            if (result.success) {
                toast({ title: "User Approved" });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

    function handleReject(userId: string) {
        startTransition(async () => {
            const result = await rejectUser(userId);
            if (result.success) {
                toast({ title: "User Rejected" });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

    if (pendingUsers.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Approvals</CardTitle>
                    <CardDescription>No pending approval requests.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
                <CardDescription>Review usage requests from your company domain.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {pendingUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            <div className="flex items-center gap-4">
                                <Avatar>
                                    <AvatarImage src={`https://avatar.vercel.sh/${user.email}`} />
                                    <AvatarFallback>{user.name?.charAt(0) || "?"}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{user.name || "Unknown Name"}</p>
                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => handleReject(user.id)}
                                    disabled={isPending}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    Reject
                                </Button>
                                <Button
                                    onClick={() => handleApprove(user.id)}
                                    disabled={isPending}
                                >
                                    Approve
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
