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
import { Building, Shield, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { updateUserProfile } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

export default function AccountPage() {
    const { currentUser, role } = useRole();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState("");

    const router = useRouter();

    useEffect(() => {
        if (currentUser) {
            setNewName(currentUser.name || "");
        }
    }, [currentUser]);

    const handleUpdateProfile = async () => {
        if (!currentUser?.id) return;
        setIsLoading(true);
        try {
            const result = await updateUserProfile(currentUser.id, {
                name: newName,
                // We preserve other fields as they are handled in /profile
            });
            if (result.success) {
                toast({
                    title: "Account updated",
                    description: "Your account details have been saved.",
                });
                setIsEditing(false);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to update account",
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

    if (!currentUser) {
        return <div className="p-8 text-center">Loading account...</div>;
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
                        <h1 className="text-3xl font-bold tracking-tight">Account Details</h1>
                        <p className="text-muted-foreground">Manage your login details and security settings.</p>
                    </div>
                </div>

                <div className="grid gap-8 md:grid-cols-3">
                    {/* Account Details Section */}
                    <div className="md:col-span-2 space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Personal Information</CardTitle>
                                <CardDescription>Your basic account identity.</CardDescription>
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
