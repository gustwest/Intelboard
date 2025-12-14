"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { UserRole, mockUsers, User } from "@/lib/data";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { ConsultantProfileForm } from "@/components/consultant-profile-form";

const generateId = () => `u${Date.now()}`;

export function LoginDialog() {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { login } = useRole();
    const { t } = useLanguage();

    // Login State
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

    // Sign Up State
    const [signUpRole, setSignUpRole] = useState<UserRole>("Specialist");
    const [signUpStep, setSignUpStep] = useState<"details" | "profile">("details");
    const [newUserData, setNewUserData] = useState<Partial<User>>({});

    const handleRoleSelect = (role: UserRole) => {
        setSelectedRole(role);
    };

    const handleUserSelect = (userId: string) => {
        login(userId);
        setOpen(false);
        setSelectedRole(null);
        router.push("/board");
    };

    const handleSignUpDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        setNewUserData({
            name: formData.get("name") as string,
            role: signUpRole,
            company: formData.get("company") as string,
        });

        if (signUpRole === "Specialist") {
            setSignUpStep("profile");
        } else {
            // Complete sign up for non-specialists immediately (mock)
            completeSignUp({
                id: generateId(),
                name: formData.get("name") as string,
                role: signUpRole,
                company: formData.get("company") as string,
            });
        }
    };

    const completeSignUp = (user: User) => {
        // In a real app, we would save to backend. 
        // Here we just log them in directly.
        // We need to temporarily add them to mockUsers or just set them as current user
        // For this demo, we'll just use the login function which expects an ID from mockUsers.
        // To make this work properly without modifying data.ts extensively, we'll just simulate success
        // and force a login state update in RoleProvider (which we might need to expose a direct setUser method for).
        // For now, let's just alert and close.

        alert("Account created! (Simulation)");
        setOpen(false);
        // Ideally: login(user); 
    };

    const filteredUsers = mockUsers.filter((u) => u.role === selectedRole);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">{t.common.login}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <Tabs defaultValue="login" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="login">Login</TabsTrigger>
                        <TabsTrigger value="signup">Sign Up</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                        <DialogHeader>
                            <DialogTitle>Select your role</DialogTitle>
                            <DialogDescription>
                                Choose your user type to continue.
                            </DialogDescription>
                        </DialogHeader>
                        {!selectedRole ? (
                            <div className="grid gap-4 py-4">
                                <Button
                                    variant="outline"
                                    className="h-24 flex-col gap-2"
                                    onClick={() => handleRoleSelect("Customer")}
                                >
                                    <span className="text-lg font-semibold">Corporate Client / Agency</span>
                                    <span className="text-sm text-muted-foreground">
                                        Post requests and find specialists
                                    </span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-24 flex-col gap-2"
                                    onClick={() => handleRoleSelect("Specialist")}
                                >
                                    <span className="text-lg font-semibold">Specialist / Consultant</span>
                                    <span className="text-sm text-muted-foreground">
                                        Find projects and microgigs
                                    </span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRoleSelect("Admin")}
                                >
                                    IntelBoard Admin
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRoleSelect("Guest")}
                                >
                                    Continue as Guest
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4 py-4">
                                <Button variant="ghost" onClick={() => setSelectedRole(null)} className="mb-2">
                                    ← Back
                                </Button>
                                <div className="grid gap-2">
                                    {filteredUsers.map((user) => (
                                        <Button
                                            key={user.id}
                                            variant="outline"
                                            className="justify-start"
                                            onClick={() => handleUserSelect(user.id)}
                                        >
                                            <div className="flex flex-col items-start">
                                                <span className="font-semibold">{user.name}</span>
                                                {user.company && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {user.company}
                                                    </span>
                                                )}
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="signup">
                        <DialogHeader>
                            <DialogTitle>Create an Account</DialogTitle>
                        </DialogHeader>

                        {signUpStep === "details" ? (
                            <form onSubmit={handleSignUpDetailsSubmit} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>I am a...</Label>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant={signUpRole === "Customer" ? "default" : "outline"}
                                            onClick={() => setSignUpRole("Customer")}
                                            className="flex-1"
                                        >
                                            Client
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={signUpRole === "Specialist" ? "default" : "outline"}
                                            onClick={() => setSignUpRole("Specialist")}
                                            className="flex-1"
                                        >
                                            Specialist
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input id="name" name="name" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" name="email" type="email" required />
                                </div>
                                {signUpRole === "Customer" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="company">Company Name</Label>
                                        <Input id="company" name="company" required />
                                    </div>
                                )}
                                <Button type="submit" className="w-full">
                                    {signUpRole === "Specialist" ? "Next: Build Profile" : "Create Account"}
                                </Button>
                            </form>
                        ) : (
                            <div className="py-4">
                                <ConsultantProfileForm onComplete={(profileData) => {
                                    completeSignUp({
                                        id: generateId(),
                                        name: newUserData.name!,
                                        role: "Specialist",
                                        ...profileData
                                    });
                                }} />
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
