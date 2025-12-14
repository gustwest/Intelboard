"use client";

import { Request } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, CheckCircle2 } from "lucide-react";

interface RequestApprovalProps {
    request: Request;
    onUpdate: (updatedRequest: Request) => void;
}

export function RequestApproval({ request, onUpdate }: RequestApprovalProps) {
    const handleApprove = () => {
        onUpdate({ ...request, status: "Pending Review" });
    };

    if (request.status === "Pending Review") {
        return (
            <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10">
                <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                    <div className="flex flex-col items-center space-y-2">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mb-2" />
                        <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Request Submitted for Review</h3>
                        <p className="text-muted-foreground max-w-md">
                            Your request has been sent to our specialist team. They will review your requirements and get back to you with a tailored proposal.
                        </p>
                    </div>
                    <Button asChild variant="outline" className="mt-4">
                        <a href="/board">Review your board/requests</a>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Only show approval flow for New or Analyzing requests
    if (request.status !== "New" && request.status !== "Analyzing") {
        return null;
    }

    return (
        <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-900/10">
            <CardHeader>
                <CardTitle className="text-blue-800 dark:text-blue-300">Ready to proceed?</CardTitle>
                <CardDescription>
                    Submit your request for specialist review. It&apos;s okay if details are missing—our specialists will help you refine them.
                </CardDescription>
            </CardHeader>
            <CardFooter>
                <Button
                    onClick={handleApprove}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 gap-2"
                    size="lg"
                >
                    <Send className="h-4 w-4" />
                    Approve & Submit for Review
                </Button>
            </CardFooter>
        </Card>
    );
}
