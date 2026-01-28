'use client';

import { Suspense, useState, useEffect } from "react";
import { useRole } from "@/components/role-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, UserPlus, Clock, MoreHorizontal, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getCompanyUsers, inviteUser, approveUserAccess, updateUserRole } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TeamPage() {
    const { currentUser, role } = useRole();
    const { toast } = useToast();
    const [companyUsers, setCompanyUsers] = useState<any[]>([]);

    // Invite state
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [isInviting, setIsInviting] = useState(false);

    useEffect(() => {
        if (currentUser?.companyId) {
            loadCompanyUsers(currentUser.companyId);
        }
    }, [currentUser]);

    const loadCompanyUsers = async (companyId: string) => {
        const users = await getCompanyUsers(companyId);
        setCompanyUsers(users);
    };

    const handleInviteUser = async () => {
        if (!currentUser?.companyId || !inviteEmail || !inviteName) return;
        setIsInviting(true);
        try {
            const result = await inviteUser(inviteEmail, inviteName, currentUser.companyId);
            if (result.success) {
                toast({
                    title: "User invited",
                    description: `Invited ${inviteName} successfully.`
                });
                setInviteEmail("");
                setInviteName("");
                loadCompanyUsers(currentUser.companyId);
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to invite user",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsInviting(false);
        }
    };

    const handleApproveAccess = async (userId: string) => {
        try {
            const result = await approveUserAccess(userId);
            if (result.success) {
                toast({
                    title: "Access approved",
                    description: "User access has been approved.",
                });
                if (currentUser?.companyId) loadCompanyUsers(currentUser?.companyId);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to approve access",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An error occurred.",
                variant: "destructive",
            });
        }
    };

    if (!currentUser) return <div className="p-8">Loading...</div>;

    const isAdmin = role === "Admin" || currentUser.role === "Admin";
    const pendingUsers = companyUsers.filter(u => u.approvalStatus === 'PENDING');
    const activeUsers = companyUsers.filter(u => u.approvalStatus === 'APPROVED');

    if (!currentUser.companyId) {
        return (
            <div className="min-h-screen bg-slate-50/50 p-8">
                <div className="max-w-4xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>Team Management</CardTitle>
                            <CardDescription>You are not part of any organization.</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/board">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
                        <p className="text-muted-foreground">Manage your organization's members and permissions.</p>
                    </div>
                </div>

                <div className="grid gap-8">
                    {/* Invite Section (Admin Only) */}
                    {isAdmin && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <UserPlus className="h-5 w-5" />
                                    Invite New Member
                                </CardTitle>
                                <CardDescription>Add new users to your organization.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-4 items-end">
                                    <div className="grid gap-2 flex-1">
                                        <label className="text-sm font-medium">Full Name</label>
                                        <Input
                                            placeholder="John Doe"
                                            value={inviteName}
                                            onChange={(e) => setInviteName(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2 flex-1">
                                        <label className="text-sm font-medium">Email Address</label>
                                        <Input
                                            placeholder="john@example.com"
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                        />
                                    </div>
                                    <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail || !inviteName}>
                                        {isInviting ? "Inviting..." : "Invite"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Pending Approvals (Admin Only) */}
                    {isAdmin && pendingUsers.length > 0 && (
                        <Card className="border-amber-200 bg-amber-50/30">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-amber-700">
                                    <Clock className="h-5 w-5" />
                                    Pending Access Requests ({pendingUsers.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-4">
                                {pendingUsers.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-4 bg-white border border-amber-100 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <Avatar>
                                                <AvatarFallback className="bg-amber-100 text-amber-700">{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium">{user.name}</div>
                                                <div className="text-sm text-muted-foreground">{user.email}</div>
                                            </div>
                                        </div>
                                        <Button size="sm" onClick={() => handleApproveAccess(user.id)} className="bg-amber-600 hover:bg-amber-700">
                                            Approve Access
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {/* Team List */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Active Team Members
                            </CardTitle>
                            <CardDescription>All users with access to your projects.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {activeUsers.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                            <AvatarImage src={user.image} />
                                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {user.name}
                                                {user.id === currentUser.id && <Badge variant="secondary" className="text-xs">You</Badge>}
                                            </div>
                                            <div className="text-sm text-muted-foreground">{user.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                                            {user.role}
                                        </Badge>

                                        {/* Admin Actions */}
                                        {isAdmin && user.id !== currentUser.id && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={async () => {
                                                        const result = await updateUserRole(user.id, "Admin");
                                                        if (result.success) {
                                                            toast({ title: "Role Updated", description: `${user.name} is now an Admin.` });
                                                            loadCompanyUsers(currentUser.companyId!);
                                                        } else {
                                                            toast({ title: "Error", description: result.error, variant: "destructive" });
                                                        }
                                                    }}>
                                                        Make Admin
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={async () => {
                                                        const result = await updateUserRole(user.id, "User");
                                                        if (result.success) {
                                                            toast({ title: "Role Updated", description: `${user.name} is now a User.` });
                                                            loadCompanyUsers(currentUser.companyId!);
                                                        } else {
                                                            toast({ title: "Error", description: result.error, variant: "destructive" });
                                                        }
                                                    }}>
                                                        Make User
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {activeUsers.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    No active members found.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
