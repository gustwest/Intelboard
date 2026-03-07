"use client";

import { cn } from "@/lib/utils";
import {
    PlusCircle, ArrowRight, UserPlus, CheckCircle2, MessageSquare,
    FileText, Calendar, DollarSign, Clock, Shield
} from "lucide-react";

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    created: { icon: <PlusCircle className="h-3.5 w-3.5" />, color: "text-blue-500 bg-blue-500/10", label: "Request Created" },
    status_changed: { icon: <ArrowRight className="h-3.5 w-3.5" />, color: "text-amber-500 bg-amber-500/10", label: "Status Changed" },
    criteria_proposed: { icon: <FileText className="h-3.5 w-3.5" />, color: "text-violet-500 bg-violet-500/10", label: "Criteria Proposed" },
    criteria_approved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-emerald-500 bg-emerald-500/10", label: "Criteria Approved" },
    specialist_assigned: { icon: <UserPlus className="h-3.5 w-3.5" />, color: "text-indigo-500 bg-indigo-500/10", label: "Specialist Assigned" },
    comment_added: { icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-slate-500 bg-slate-500/10", label: "Comment Added" },
    terms_proposed: { icon: <DollarSign className="h-3.5 w-3.5" />, color: "text-cyan-500 bg-cyan-500/10", label: "Terms Proposed" },
    terms_accepted: { icon: <Shield className="h-3.5 w-3.5" />, color: "text-emerald-500 bg-emerald-500/10", label: "Terms Accepted" },
    meeting_scheduled: { icon: <Calendar className="h-3.5 w-3.5" />, color: "text-pink-500 bg-pink-500/10", label: "Meeting Scheduled" },
    updated: { icon: <ArrowRight className="h-3.5 w-3.5" />, color: "text-slate-500 bg-slate-500/10", label: "Updated" },
};

interface ActivityEntry {
    id: string;
    requestId: string;
    userId: string;
    userName: string;
    action: string;
    details: Record<string, any>;
    createdAt: string | Date;
}

function formatTime(date: string | Date) {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function getDetailDescription(action: string, details: Record<string, any>): string | null {
    switch (action) {
        case "status_changed":
            return details.oldStatus && details.newStatus
                ? `${details.oldStatus} → ${details.newStatus}`
                : null;
        case "specialist_assigned":
            return details.specialistName ? `Assigned to ${details.specialistName}` : null;
        case "criteria_proposed":
            return details.criteria?.length ? `${details.criteria.length} criteria proposed` : null;
        case "terms_proposed":
            return details.rate ? `Rate: ${details.rate}, Duration: ${details.duration}` : null;
        case "terms_accepted":
            if (details.bothAccepted) return `Both parties accepted — Rate: ${details.rate}, Duration: ${details.duration}`;
            return details.role ? `Accepted by ${details.role}` : null;
        case "meeting_scheduled":
            return details.title ? `"${details.title}"` : null;
        case "created":
            return details.requestType ? `Type: ${details.requestType}` : null;
        default:
            return details.description || null;
    }
}

export function RequestActivityTimeline({ activities }: { activities: ActivityEntry[] }) {
    if (!activities.length) {
        return (
            <div className="text-center py-6">
                <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {activities.map((entry, idx) => {
                const config = ACTION_CONFIG[entry.action] || ACTION_CONFIG.updated;
                const detail = getDetailDescription(entry.action, entry.details);
                const isLast = idx === activities.length - 1;

                return (
                    <div key={entry.id} className="flex gap-3 group">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center">
                            <div className={cn(
                                "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                                config.color
                            )}>
                                {config.icon}
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                        </div>

                        {/* Content */}
                        <div className="pb-4 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-foreground">{config.label}</span>
                                <span className="text-[10px] text-muted-foreground">•</span>
                                <span className="text-[10px] text-muted-foreground">{formatTime(entry.createdAt)}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                by {entry.userName}
                            </p>
                            {detail && (
                                <p className="text-xs text-foreground/70 mt-1 bg-muted/50 rounded-lg px-2.5 py-1.5 inline-block">
                                    {detail}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
