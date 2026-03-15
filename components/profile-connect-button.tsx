"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, UserCheck, Clock } from "lucide-react";
import { sendConnectionRequest, getConnectionStatus, respondToConnection } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";

export function ProfileConnectButton({ targetUserId }: { targetUserId: string }) {
    const { toast } = useToast();
    const [status, setStatus] = useState<"none" | "pending" | "accepted" | "declined">("none");
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [isRequester, setIsRequester] = useState(true);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        getConnectionStatus(targetUserId).then((result) => {
            setStatus(result.status);
            setConnectionId(result.connectionId ?? null);
            setIsRequester((result as any).isRequester ?? true);
            setLoading(false);
        });
    }, [targetUserId]);

    const handleConnect = async () => {
        setActionLoading(true);
        const result = await sendConnectionRequest(targetUserId);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            setStatus("pending");
            setIsRequester(true);
            toast({ title: "Request Sent", description: "Connection request sent!" });
        }
        setActionLoading(false);
    };

    const handleAccept = async () => {
        if (!connectionId) return;
        setActionLoading(true);
        const result = await respondToConnection(connectionId, true);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            setStatus("accepted");
            toast({ title: "Connected!", description: "You are now connected." });
        }
        setActionLoading(false);
    };

    if (loading) return null;

    if (status === "accepted") {
        return (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 gap-1 px-3 py-1.5">
                <UserCheck className="h-3.5 w-3.5" /> Connected
            </Badge>
        );
    }

    if (status === "pending" && !isRequester) {
        return (
            <Button onClick={handleAccept} disabled={actionLoading} className="gap-1.5 bg-green-600 hover:bg-green-700">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Accept Connection
            </Button>
        );
    }

    if (status === "pending" && isRequester) {
        return (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 px-3 py-1.5">
                <Clock className="h-3.5 w-3.5" /> Request Pending
            </Badge>
        );
    }

    return (
        <Button onClick={handleConnect} disabled={actionLoading} variant="outline" className="gap-1.5">
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Connect
        </Button>
    );
}
