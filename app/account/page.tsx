'use client';

import { Suspense, useState, useEffect } from "react";
import { useRole } from "@/components/role-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Building, Shield, Check, Clock, UserPlus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getCompanyUsers, inviteUser, approveUserAccess, updateUserProfile, updateUserRole, scrapeLinkedInProfile } from "@/lib/actions";
import { User as UserType } from "@/lib/data";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export default function AccountPage() {
    const { currentUser, role } = useRole();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState("");
    const [bio, setBio] = useState("");
    const [experience, setExperience] = useState("");
    const [skills, setSkills] = useState("");
    const [linkedin, setLinkedin] = useState("");

    // Invite state
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [isInviting, setIsInviting] = useState(false);

    const router = useRouter();

    useEffect(() => {
        if (currentUser) {
            setNewName(currentUser.name || "");
            setBio((currentUser as any).bio || "");
            setExperience((currentUser as any).experience || "");
            setSkills(((currentUser as any).skills || []).join(", "));
            setLinkedin((currentUser as any).linkedin || "");

            if (currentUser.companyId && (role === "Admin" || currentUser.role === "Admin")) {
                loadCompanyUsers(currentUser.companyId);
            }
        }
    }, [currentUser, role]);

    const loadCompanyUsers = async (companyId: string) => {
        const users = await getCompanyUsers(companyId);
        setCompanyUsers(users);
    };

    const handleUpdateProfile = async () => {
        if (!currentUser?.id) return;
        setIsLoading(true);
        try {
            const result = await updateUserProfile(currentUser.id, {
                name: newName,
                bio,
                experience,
                skills: skills.split(",").map(s => s.trim()).filter(Boolean),
                linkedin
            });
            if (result.success) {
                toast({
                    title: "Profile updated",
                    description: "Your profile has been updated successfully.",
                });
                setIsEditing(false);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to update profile",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An expected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
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

    if (!currentUser) {
        return <div className="p-8 text-center">Loading user profile...</div>;
    }

    const pendingUsers = companyUsers.filter(u => u.approvalStatus === 'PENDING');
    const activeUsers = companyUsers.filter(u => u.approvalStatus === 'APPROVED');
    const isAdmin = role === "Admin" || currentUser.role === "Admin";

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/it-planner">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Account Management</h1>
                        <p className="text-muted-foreground">Manage your profile and settings.</p>
                    </div>
                </div>

                <div className="grid gap-8 md:grid-cols-3">
                    {/* Profile Section */}
                    <div className="md:col-span-2 space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Details</CardTitle>
                                <CardDescription>Your personal information.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <Avatar className="h-20 w-20 border-2 border-white shadow-lg">
                                        <AvatarImage src={currentUser.avatar} />
                                        <AvatarFallback className="text-xl bg-slate-100">{currentUser.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-semibold text-lg">{currentUser.name}</div>
                                        <div className="text-sm text-muted-foreground">{currentUser.email}</div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant="outline">{role}</Badge>
                                            {currentUser.companyId && (
                                                <Badge variant="secondary" className="flex items-center gap-1">
                                                    <Building className="h-3 w-3" />
                                                    {currentUser.companyId === 'bdd84592-d64e-4860-9dc4-37a5050df06a' ? 'Autoliv Inc.' : 'Company'}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Full Name</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="name"
                                                value={isEditing ? newName : currentUser.name || ""}
                                                onChange={(e) => setNewName(e.target.value)}
                                                disabled={!isEditing}
                                            />
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <Button onClick={handleUpdateProfile} disabled={isLoading}>Save</Button>
                                                    <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                                                </div>
                                            ) : (
                                                <Button variant="outline" onClick={() => setIsEditing(true)}>Edit</Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input id="email" value={currentUser.email || ""} disabled className="bg-slate-50" />
                                        <p className="text-[0.8rem] text-muted-foreground">Email address cannot be changed.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Professional Profile</CardTitle>
                                <CardDescription>Showcase your skills and experience to get matched with projects.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4">
                                    <div className="grid gap-2">
                                        <Label>Bio / Summary</Label>
                                        <textarea
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="Tell us about yourself..."
                                            value={isEditing ? bio : (currentUser as any).bio || ""}
                                            onChange={(e) => setBio(e.target.value)}
                                            disabled={!isEditing}
                                        />
                                        <p className="text-xs text-muted-foreground">Detailed bio available in view mode.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Job Title / Role</Label>
                                            <Input value={currentUser.role} disabled />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Experience</Label>
                                            <Input
                                                placeholder="e.g. 5 years"
                                                value={isEditing ? experience : (currentUser as any).experience || ""}
                                                onChange={(e) => setExperience(e.target.value)}
                                                disabled={!isEditing}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Skills (Comma separated)</Label>
                                        <Input
                                            placeholder="React, Node.js, TypeScript..."
                                            value={isEditing ? skills : ((currentUser as any).skills || []).join(", ")}
                                            onChange={(e) => setSkills(e.target.value)}
                                            disabled={!isEditing}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>LinkedIn URL</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="https://linkedin.com/in/..."
                                                value={isEditing ? linkedin : (currentUser as any).linkedin || ""}
                                                onChange={(e) => setLinkedin(e.target.value)}
                                                disabled={!isEditing}
                                            />
                                            {isEditing && (
                                                <Button
                                                    variant="outline"
                                                    onClick={async () => {
                                                        if (!linkedin) {
                                                            return;
                                                        }
                                                        setIsLoading(true);
                                                        try {
                                                            const result = await scrapeLinkedInProfile(linkedin);
                                                            if (result.success && result.data) {
                                                                setBio(result.data.bio);
                                                                setSkills(result.data.skills.join(", "));
                                                                setExperience(result.data.experience);
                                                                toast({ title: "Profile Imported", description: "Data fetched from LinkedIn." });
                                                            }
                                                        } catch (e) {
                                                            toast({ title: "Import Failed", description: "Could not fetch data.", variant: "destructive" });
                                                        } finally {
                                                            setIsLoading(false);
                                                        }
                                                    }}
                                                    disabled={isLoading || !linkedin}
                                                    type="button"
                                                >
                                                    {isLoading ? "Fetching..." : "Import"}
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">Enter URL and click Import to auto-fill bio and skills.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Team Management Section (Admins Only) */}
                        {isAdmin && currentUser.companyId && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Team Management</span>
                                        <Badge variant="default" className="bg-slate-900">Admin Access</Badge>
                                    </CardTitle>
                                    <CardDescription>Manage members of your organization.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">

                                    {/* Invite User */}
                                    <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <UserPlus className="h-4 w-4" />
                                            Invite New Member
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input
                                                placeholder="Full Name"
                                                value={inviteName}
                                                onChange={(e) => setInviteName(e.target.value)}
                                            />
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Email Address"
                                                    type="email"
                                                    value={inviteEmail}
                                                    onChange={(e) => setInviteEmail(e.target.value)}
                                                />
                                                <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail || !inviteName}>
                                                    Invite
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pending Approvals */}
                                    {pendingUsers.length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-2">
                                                <Clock className="h-4 w-4" />
                                                Pending Access Requests ({pendingUsers.length})
                                            </h3>
                                            <div className="grid gap-3">
                                                {pendingUsers.map(user => (
                                                    <div key={user.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-9 w-9">
                                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <div className="font-medium text-sm">{user.name}</div>
                                                                <div className="text-xs text-muted-foreground">{user.email}</div>
                                                            </div>
                                                        </div>
                                                        <Button size="sm" onClick={() => handleApproveAccess(user.id)}>Approve</Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <Separator />

                                    {/* Active Users */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            Active Team Members
                                        </h3>
                                        <div className="grid gap-2">
                                            {activeUsers.map(user => (
                                                <div key={user.id} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-slate-50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={user.image} />
                                                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-medium text-sm">{user.name} {user.id === currentUser.id && "(You)"}</div>
                                                            <div className="text-xs text-muted-foreground">{user.email}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {user.id !== currentUser.id ? (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="outline" size="sm" className="h-7 gap-1">
                                                                        {user.role}
                                                                        <MoreHorizontal className="h-3 w-3 opacity-50" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={async () => {
                                                                        const result = await updateUserRole(user.id, "Admin");
                                                                        if (result.success) loadCompanyUsers(currentUser.companyId!);
                                                                        else toast({ title: "Error", description: result.error, variant: "destructive" });
                                                                    }}>
                                                                        Make Admin
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={async () => {
                                                                        const result = await updateUserRole(user.id, "User");
                                                                        if (result.success) loadCompanyUsers(currentUser.companyId!);
                                                                        else toast({ title: "Error", description: result.error, variant: "destructive" });
                                                                    }}>
                                                                        Make User
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        ) : (
                                                            <Badge variant="outline" className="border-slate-200 bg-slate-50">{user.role}</Badge>
                                                        )}
                                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>
                                                    </div>
                                                </div>
                                            ))}
                                            {activeUsers.length === 0 && (
                                                <div className="text-sm text-muted-foreground text-center py-4">No active members yet.</div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Sidebar / Info */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Security</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3 text-sm text-green-600">
                                    <Shield className="h-4 w-4" />
                                    <span>Account is secure</span>
                                </div>
                                <Button variant="outline" className="w-full justify-start" disabled>
                                    Change Password
                                </Button>
                                <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" disabled>
                                    Delete Account
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div >
    );
}

// Wrap in Suspense for useSearchParams if we add them later, good practice
export function AccountPageSuspense() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AccountPage />
        </Suspense>
    );
}
