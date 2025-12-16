"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Request } from "@/lib/data";
import { useStore } from "@/store/it-flora/useStore";
import { useRole } from "@/components/role-provider";
import { toast } from "@/components/ui/use-toast";
import { useState } from "react";

interface NDAModalProps {
    request: Request;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updatedRequest: Request) => void;
}

export function NDAModal({ request, isOpen, onClose, onUpdate }: NDAModalProps) {
    const { currentUser } = useRole();
    const updateProject = useStore((state) => state.updateProject);
    const projects = useStore((state) => state.projects);
    const [isSigning, setIsSigning] = useState(false);

    const handleSign = () => {
        setIsSigning(true);

        // 1. Update Request state
        const updatedRequest = { ...request, specialistNDASigned: true };
        onUpdate(updatedRequest);

        // 2. Add Specialist to Project Shared List
        if (request.linkedProjectId && currentUser) {
            const project = projects.find(p => p.id === request.linkedProjectId);
            if (project) {
                const sharedWith = new Set(project.sharedWith);
                sharedWith.add(currentUser.id);
                updateProject(project.id, { sharedWith: Array.from(sharedWith) });
            }
        }

        toast({ title: "NDA Signed", description: "You now have access to the project data." });
        setIsSigning(false);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Non-Disclosure Agreement</DialogTitle>
                    <DialogDescription>
                        To access the project details and IT landscape, you must agree to the following terms.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[200px] w-full rounded-md border p-4 text-sm text-muted-foreground bg-muted/50">
                    <p className="mb-4">
                        <strong>CONFIDENTIALITY AGREEMENT</strong>
                    </p>
                    <p className="mb-2">
                        1. <strong>Purpose:</strong> The Recipient (Specialist) agrees to receive confidential information solely for the purpose of evaluating and performing services for the Requesting Entity.
                    </p>
                    <p className="mb-2">
                        2. <strong>Confidential Information:</strong> Includes all data, system architecture, diagrams, user lists, and business logic exposed within the IT Planner tool.
                    </p>
                    <p className="mb-2">
                        3. <strong>Non-Disclosure:</strong> The Recipient shall not disclose any Confidential Information to third parties without prior written consent.
                    </p>
                    <p>
                        4. <strong>Term:</strong> This agreement is effective immediately upon acceptance.
                    </p>
                </ScrollArea>

                <DialogFooter className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isSigning}>Cancel</Button>
                    <Button onClick={handleSign} disabled={isSigning}>I Agree & Sign</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
