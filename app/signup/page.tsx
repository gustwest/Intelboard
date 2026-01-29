"use client";

import { useState } from "react";
import { registerUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function SignupPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const { toast } = useToast();

    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        setMessage(null);

        try {
            const result = await registerUser(formData);
            if (result.error) {
                toast({
                    title: "Registration Failed",
                    description: result.error,
                    variant: "destructive",
                });
            } else {
                setMessage(result.message || "Success");
                toast({
                    title: "Success",
                    description: result.message,
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Something went wrong. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
                    <CardDescription className="text-center">
                        Enter your email below to create your account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {message ? (
                        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-md text-green-800 dark:text-green-200 text-center">
                            <p className="font-semibold">{message}</p>
                            <p className="mt-2 text-sm">
                                <Link href="/api/auth/signin" className="underline">Go to Login</Link>
                            </p>
                        </div>
                    ) : (
                        <form action={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input id="name" name="name" placeholder="John Doe" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" type="email" placeholder="m@example.com" required />
                                <p className="text-xs text-muted-foreground">
                                    Corporate email? We'll automatically detect your company.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" name="password" type="password" required />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? "Creating account..." : "Sign Up"}
                            </Button>
                        </form>
                    )}
                </CardContent>
                <CardFooter className="flex justify-center">
                    <div className="text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <Link href="/api/auth/signin" className="underline hover:text-primary">
                            Sign in
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
