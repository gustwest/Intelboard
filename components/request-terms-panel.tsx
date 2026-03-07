"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useRole } from "@/components/role-provider";
import { proposeTerms, acceptTerms } from "@/lib/actions";
import { DollarSign, Clock, CheckCircle2, Loader2, Send } from "lucide-react";

interface RequestTermsPanelProps {
    requestId: string;
    agreedRate?: string | null;
    agreedDuration?: string | null;
    paymentStatus?: string | null;
    termsAcceptedByCustomer?: boolean;
    termsAcceptedBySpecialist?: boolean;
    onUpdate?: () => void;
}

export function RequestTermsPanel({
    requestId,
    agreedRate,
    agreedDuration,
    paymentStatus,
    termsAcceptedByCustomer = false,
    termsAcceptedBySpecialist = false,
    onUpdate,
}: RequestTermsPanelProps) {
    const { role } = useRole();
    const { toast } = useToast();
    const [rate, setRate] = useState(agreedRate || "");
    const [duration, setDuration] = useState(agreedDuration || "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canPropose = role === "Admin" || role === "Specialist";
    const canAccept = (role === "Customer" && !termsAcceptedByCustomer) || (role === "Specialist" && !termsAcceptedBySpecialist);
    const bothAccepted = termsAcceptedByCustomer && termsAcceptedBySpecialist;

    const handlePropose = async () => {
        if (!rate || !duration) {
            toast({ title: "Missing fields", description: "Please enter both rate and duration.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        const result = await proposeTerms(requestId, { rate, duration });
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Terms Proposed", description: "Waiting for all parties to accept." });
            onUpdate?.();
        }
        setIsSubmitting(false);
    };

    const handleAccept = async () => {
        setIsSubmitting(true);
        const acceptRole = role === "Customer" ? "customer" : "specialist";
        const result = await acceptTerms(requestId, acceptRole as "customer" | "specialist");
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Terms Accepted", description: "Your acceptance has been recorded." });
            onUpdate?.();
        }
        setIsSubmitting(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-cyan-500" />
                <h4 className="text-sm font-semibold">Payment & Terms</h4>
                {bothAccepted && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-300 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Agreed
                    </Badge>
                )}
                {paymentStatus === "terms_proposed" && !bothAccepted && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300 text-[10px]">
                        <Clock className="h-3 w-3 mr-1" /> Pending Acceptance
                    </Badge>
                )}
            </div>

            {/* Current terms display */}
            {agreedRate && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Proposed Rate</span>
                        <span className="text-sm font-medium">{agreedRate}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Duration</span>
                        <span className="text-sm font-medium">{agreedDuration}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full ${termsAcceptedByCustomer ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            <span className="text-[10px] text-muted-foreground">Customer</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full ${termsAcceptedBySpecialist ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            <span className="text-[10px] text-muted-foreground">Specialist</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Propose form (Admin/Specialist only) */}
            {canPropose && !bothAccepted && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Rate</Label>
                            <Input
                                placeholder="e.g. $150/hr"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Duration</Label>
                            <Input
                                placeholder="e.g. 3 months"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>
                    <Button onClick={handlePropose} disabled={isSubmitting} size="sm" className="w-full">
                        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                        Propose Terms
                    </Button>
                </div>
            )}

            {/* Accept button (when terms are proposed and user hasn't accepted yet) */}
            {paymentStatus === "terms_proposed" && canAccept && (
                <Button onClick={handleAccept} disabled={isSubmitting} variant="outline" size="sm" className="w-full border-emerald-300 text-emerald-600 hover:bg-emerald-50">
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Accept Terms
                </Button>
            )}
        </div>
    );
}
