"use client";


import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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
import { useStore } from "@/store/it-flora/useStore";
import { getCompanyUsers, requestCompanyAccess, getCompanyByDomain } from "@/lib/actions";
import Image from "next/image";

const generateId = () => `u${Date.now()}`;

export function LoginDialog() {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { login } = useRole();
    const { t } = useLanguage();
    const users = useStore((state) => state.users);
    const addUser = useStore((state) => state.addUser);
    const setCurrentUser = useStore((state) => state.setCurrentUser);

    // Login State
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

    // Sign Up State
    const [signUpRole, setSignUpRole] = useState<UserRole>("Specialist");
    const [signUpStep, setSignUpStep] = useState<"details" | "profile">("details");
    const [newUserData, setNewUserData] = useState<Partial<User>>({});

    // Autoliv State
    const [isAutoliv, setIsAutoliv] = useState(false);
    const [autolivUsers, setAutolivUsers] = useState<any[]>([]);
    const [companyId, setCompanyId] = useState<string>("");
    const [requestMode, setRequestMode] = useState(false);

    const handleAutolivClick = async () => {
        setIsAutoliv(true);
        // Fetch company and users
        const company = await getCompanyByDomain("autoliv.com");
        if (company) {
            setCompanyId(company.id);
            const users = await getCompanyUsers(company.id);
            // Filter only approved users for the login list
            setAutolivUsers(users.filter((u: any) => u.approvalStatus === 'APPROVED'));
        }
    };

    const handleRequestAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const name = formData.get("name") as string;
        const email = formData.get("email") as string;

        const result = await requestCompanyAccess(email, name, companyId);
        if (result.success) {
            alert("Request sent! An approval email has been sent to the administrator.");
            setRequestMode(false);
        } else {
            alert(result.error);
        }
    };

    const handleRoleSelect = (role: UserRole) => {
        setSelectedRole(role);
    };

    const handleUserSelect = async (userId: string) => {
        // Sync with IT Planner store
        const user = users.find(u => u.id === userId);

        // If it's an Autoliv user (from the fetched list), we use direct signIn
        const autolivUser = autolivUsers.find(u => u.id === userId);

        if (autolivUser) {
            const result = await signIn("credentials", {
                email: autolivUser.email,
                password: "password123", // Default seeded password
                redirect: false,
            });

            if (result?.error) {
                alert("Login failed: " + result.error);
                return;
            }

            // Manually set store user for client-side compat
            setCurrentUser({
                id: autolivUser.id,
                name: autolivUser.name,
                role: autolivUser.role as UserRole,
                company: autolivUser.companyId, // Map ID as company prop for store compat? or Name?
                companyId: autolivUser.companyId,
                avatar: autolivUser.image
            });
        } else {
            // Mock User flow
            login(userId, user?.name);
            if (user) {
                setCurrentUser({
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    company: user.company,
                    companyId: user.companyId,
                    avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`
                });
            }
        }

        setOpen(false);
        setSelectedRole(null);
        router.push("/board");
    };

    const handleSignUpDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const name = formData.get("name") as string;
        const company = formData.get("company") as string;

        setNewUserData({
            name,
            role: signUpRole,
            company,
        });

        if (signUpRole === "Specialist") {
            setSignUpStep("profile");
        } else {
            completeSignUp({
                id: generateId(),
                name,
                role: signUpRole,
                company,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
            });
        }
    };

    const completeSignUp = (user: User) => {
        // Persist to shared store
        addUser({
            name: user.name,
            role: user.role,
            company: user.company,
            avatar: user.avatar
        });

        alert("Account created and synced across devices! You can now log in.");
        setOpen(false);
        setSelectedRole(null);
    };

    const filteredUsers = users.filter((u) => u.role === selectedRole);

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
                                {/* Corporate Client Button Removed */}
                                <Button
                                    variant="outline"
                                    className="h-24 flex-col gap-2 border-blue-800 bg-blue-50/50 hover:bg-blue-100/50"
                                    onClick={handleAutolivClick}
                                >
                                    {/* Simple Text Fallback if Image fails, but we use Image */}
                                    <div className="relative h-8 w-32">
                                        <Image
                                            src="/autoliv-logo.png"
                                            alt="Autoliv"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-blue-900">
                                        Corporate Login
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
                        {/* Autoliv View Overlay or Conditional */}
                        {isAutoliv && (
                            <div className="absolute inset-0 bg-background z-10 p-6 flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <Button variant="ghost" onClick={() => setIsAutoliv(false)} className="-ml-2">
                                        ← Back
                                    </Button>
                                    <div className="relative h-8 w-24">
                                        <Image src="/autoliv-logo.png" alt="Autoliv" fill className="object-contain" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {!requestMode ? (
                                        <>
                                            <div className="text-center space-y-2 mb-4">
                                                <h3 className="font-semibold text-lg">Employee Login</h3>
                                                <p className="text-sm text-muted-foreground">Select your profile to continue</p>
                                            </div>
                                            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                                                {autolivUsers.map((user) => (
                                                    <Button
                                                        key={user.id}
                                                        variant="outline"
                                                        className="justify-start h-auto py-3"
                                                        onClick={() => handleUserSelect(user.id)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                                                                {user.name.slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="flex flex-col items-start">
                                                                <span className="font-medium">{user.name}</span>
                                                                <span className="text-xs text-muted-foreground">{user.email}</span>
                                                            </div>
                                                        </div>
                                                    </Button>
                                                ))}
                                                {autolivUsers.length === 0 && (
                                                    <p className="text-center text-sm text-muted-foreground py-4">No active employees found.</p>
                                                )}
                                            </div>
                                            <div className="pt-4 border-t mt-4">
                                                <Button variant="link" className="w-full" onClick={() => setRequestMode(true)}>
                                                    Not in the list? Request Access
                                                </Button>
                                            </div>
                                        </>
                                    ) : (
                                        <form onSubmit={handleRequestAccess} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                            <div className="text-center space-y-2 mb-4">
                                                <h3 className="font-semibold text-lg">Request Access</h3>
                                                <p className="text-sm text-muted-foreground">Enter your Autoliv email to join the team</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="req-name">Full Name</Label>
                                                <Input id="req-name" name="name" required placeholder="Gustav Westergren" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="req-email">Autoliv Email</Label>
                                                <Input id="req-email" name="email" type="email" required placeholder="name@autoliv.com" />
                                            </div>
                                            <div className="flex gap-2 pt-2">
                                                <Button type="button" variant="outline" className="flex-1" onClick={() => setRequestMode(false)}>Cancel</Button>
                                                <Button type="submit" className="flex-1 bg-[#003B75] hover:bg-[#002f5e]">Submit Request</Button>
                                            </div>
                                        </form>
                                    )}
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
                                    const { skills, files, ...rest } = profileData;
                                    completeSignUp({
                                        id: generateId(),
                                        name: newUserData.name!,
                                        role: "Specialist",
                                        ...rest,
                                        cvFile: files[0]?.name,
                                        personalLetterFile: files[1]?.name,
                                        skills: skills.split(',').map(s => ({ name: s.trim(), category: "General" })).filter(s => s.name)
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
