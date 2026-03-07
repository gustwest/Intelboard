"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole } from "@/components/role-provider";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import { quickLoginAccounts } from "@/lib/data";
import { Building, User, KeyRound, Loader2, LogIn, ArrowRight, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LoginDialogProps {
    trigger?: React.ReactNode;
    defaultOpen?: boolean;
}

export function LoginDialog({ trigger, defaultOpen }: LoginDialogProps) {
    const [open, setOpen] = useState(defaultOpen || false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [quickLoginLoading, setQuickLoginLoading] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    const handleEmailLogin = async () => {
        if (!email || !password) {
            toast({ title: "Missing fields", description: "Please enter email and password.", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                toast({ title: "Login failed", description: result.error === "CredentialsSignin" ? "Invalid email or password." : result.error, variant: "destructive" });
            } else {
                setOpen(false);
                router.push("/board");
                router.refresh();
            }
        } catch (error) {
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickLogin = async (email: string, password: string, label: string) => {
        setQuickLoginLoading(email);
        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                toast({ title: "Quick login failed", description: `Could not log in as ${label}. Make sure the seed scripts have been run.`, variant: "destructive" });
            } else {
                setOpen(false);
                router.push("/board");
                router.refresh();
            }
        } catch (error) {
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setQuickLoginLoading(null);
        }
    };

    const getRoleIcon = (icon: string) => {
        switch (icon) {
            case "🏢": return <Building className="h-4 w-4" />;
            case "👤": return <User className="h-4 w-4" />;
            case "🔑": return <KeyRound className="h-4 w-4" />;
            default: return null;
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "Customer": return "bg-blue-50 text-blue-700 border-blue-200";
            case "Specialist": return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "Admin": return "bg-purple-50 text-purple-700 border-purple-200";
            default: return "bg-gray-50 text-gray-700 border-gray-200";
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg">
                        <LogIn className="mr-2 h-4 w-4" />
                        Login / Sign Up
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Welcome to IntelBoard</DialogTitle>
                    <DialogDescription>
                        Sign in to access the platform.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="quick" className="w-full mt-2">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="quick">Quick Login</TabsTrigger>
                        <TabsTrigger value="email">Email & Password</TabsTrigger>
                    </TabsList>

                    {/* Quick Login Tab */}
                    <TabsContent value="quick" className="mt-4 space-y-3">
                        <p className="text-xs text-muted-foreground mb-3">
                            Select a demo account to log in instantly.
                        </p>

                        {/* Corporate Customers */}
                        <div className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Corporate Customers</span>
                            {quickLoginAccounts.filter(a => a.role === "Customer").map((account) => (
                                <button
                                    key={account.email}
                                    onClick={() => handleQuickLogin(account.email, account.password, account.label)}
                                    disabled={!!quickLoginLoading}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left hover:shadow-sm hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-60 disabled:cursor-not-allowed ${getRoleBadgeColor(account.role)} bg-card border-border`}
                                >
                                    <div className={`flex items-center justify-center h-9 w-9 rounded-full bg-blue-100 text-blue-600`}>
                                        {quickLoginLoading === account.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-slate-900">{account.label}</div>
                                        <div className="text-[11px] text-muted-foreground truncate">{account.email}</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>

                        {/* Specialists */}
                        <div className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Specialists</span>
                            {quickLoginAccounts.filter(a => a.role === "Specialist").map((account) => (
                                <button
                                    key={account.email}
                                    onClick={() => handleQuickLogin(account.email, account.password, account.label)}
                                    disabled={!!quickLoginLoading}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left hover:shadow-sm hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-60 disabled:cursor-not-allowed ${getRoleBadgeColor(account.role)} bg-card border-border`}
                                >
                                    <div className={`flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 text-emerald-600`}>
                                        {quickLoginLoading === account.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-slate-900">{account.label}</div>
                                        <div className="text-[11px] text-muted-foreground truncate">{account.email}</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>

                        {/* Admin */}
                        <div className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</span>
                            {quickLoginAccounts.filter(a => a.role === "Admin").map((account) => (
                                <button
                                    key={account.email}
                                    onClick={() => handleQuickLogin(account.email, account.password, account.label)}
                                    disabled={!!quickLoginLoading}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left hover:shadow-sm hover:border-purple-300 hover:bg-purple-50/50 disabled:opacity-60 disabled:cursor-not-allowed ${getRoleBadgeColor(account.role)} bg-card border-border`}
                                >
                                    <div className={`flex items-center justify-center h-9 w-9 rounded-full bg-purple-100 text-purple-600`}>
                                        {quickLoginLoading === account.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-slate-900">{account.label}</div>
                                        <div className="text-[11px] text-muted-foreground truncate">{account.email}</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    </TabsContent>

                    {/* Email & Password Tab */}
                    <TabsContent value="email" className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="login-email">Email</Label>
                            <Input
                                id="login-email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="login-password">Password</Label>
                            <Input
                                id="login-password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                            />
                        </div>
                        <Button
                            onClick={handleEmailLogin}
                            disabled={isLoading}
                            className="w-full"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                        <div className="flex items-center justify-center gap-1 pt-2">
                            <p className="text-xs text-muted-foreground">
                                Don&apos;t have an account?
                            </p>
                            <Link
                                href="/signup"
                                onClick={() => setOpen(false)}
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                Create one here
                            </Link>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
