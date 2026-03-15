"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/role-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEventById, rsvpEvent, rateContent, getContentRatings } from "@/lib/actions";
import { RatingStars } from "@/components/rating-stars";
import { ShareInviteDialog } from "@/components/share-invite-dialog";
import { ExperiencePromptDialog } from "@/components/experience-prompt-dialog";
import {
    ArrowLeft, Calendar, Clock, MapPin, Users, Video, Globe, Lock,
    UserCheck, Repeat, FileText, Sparkles, CheckCircle2, XCircle, Loader2,
    Share2, Mail, Download, UserPlus, UserMinus, ExternalLink, ListChecks,
    Bell, Check,
} from "lucide-react";

type EventDetail = Awaited<ReturnType<typeof getEventById>>;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    scheduled: { label: "Scheduled", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Calendar },
    in_progress: { label: "🔴 Live Now", color: "bg-red-500/10 text-red-600 border-red-500/20 animate-pulse", icon: Video },
    completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
    cancelled: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-500/20", icon: XCircle },
};

const TYPE_COLORS: Record<string, string> = {
    meeting: "bg-blue-500",
    deadline: "bg-red-500",
    milestone: "bg-emerald-500",
};

const AUDIENCE_CONFIG: Record<string, { label: string; icon: typeof Lock }> = {
    private: { label: "Private", icon: Lock },
    open: { label: "Open to All", icon: Globe },
    team: { label: "Team Only", icon: UserCheck },
};

function generateICS(event: NonNullable<EventDetail>) {
    const formatDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//IntelBoard//Event//EN",
        "BEGIN:VEVENT",
        `DTSTART:${formatDate(event.startTime)}`,
        `DTEND:${formatDate(event.endTime)}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${(event.description || "").replace(/\n/g, "\\n")}`,
        event.location ? `LOCATION:${event.location}` : "",
        event.meetingUrl ? `URL:${event.meetingUrl}` : "",
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateMailto(event: NonNullable<EventDetail>) {
    const date = new Date(event.startTime).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const time = `${new Date(event.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(event.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const subject = encodeURIComponent(`Event: ${event.title} — ${date}`);
    const body = encodeURIComponent(
        [
            event.title,
            "",
            event.description || "",
            "",
            `📅 Date: ${date}`,
            `🕐 Time: ${time}`,
            event.location ? `📍 Location: ${event.location}` : "",
            event.meetingUrl ? `🔗 Join: ${event.meetingUrl}` : "",
            "",
            `RSVP: ${typeof window !== "undefined" ? window.location.href : ""}`,
        ].filter(Boolean).join("\n")
    );

    window.open(`mailto:?subject=${subject}&body=${body}`);
}

/** Derive a pseudo-category slug from the event title for the experience prompt */
function deriveCategory(event: NonNullable<EventDetail>): string {
    return event.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 50);
}

export default function EventDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { currentUser } = useRole();
    const eventId = params.id as string;

    const [event, setEvent] = useState<EventDetail>(null);
    const [loading, setLoading] = useState(true);
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const [isAccepted, setIsAccepted] = useState(false);
    const [isInvited, setIsInvited] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [showExperiencePrompt, setShowExperiencePrompt] = useState(false);

    // Rating state
    const [userRating, setUserRating] = useState(0);
    const [avgRating, setAvgRating] = useState(0);
    const [ratingCount, setRatingCount] = useState(0);

    const load = useCallback(async () => {
        try {
            const data = await getEventById(eventId);
            setEvent(data);
            if (data) {
                setIsAccepted(data.isAccepted);
                setIsInvited(data.isInvited);
            }

            // Load ratings
            const ratings = await getContentRatings(eventId, "event");
            setUserRating(ratings.userScore);
            setAvgRating(ratings.avgScore);
            setRatingCount(ratings.count);
        } catch (e) {
            console.error("Failed to load event:", e);
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => { load(); }, [load]);

    const handleRsvp = async () => {
        setRsvpLoading(true);
        try {
            const result = await rsvpEvent(eventId);
            if (!("error" in result)) {
                setIsAccepted(result.isAccepted);
                load(); // Reload to get updated attendee list
                // Show experience prompt after accepting
                if (result.isAccepted) {
                    setShowExperiencePrompt(true);
                }
            }
        } catch (e) { console.error(e); }
        setRsvpLoading(false);
    };

    const handleRate = async (score: number) => {
        setUserRating(score);
        await rateContent(eventId, "event", score);
        const ratings = await getContentRatings(eventId, "event");
        setAvgRating(ratings.avgScore);
        setRatingCount(ratings.count);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                <h1 className="text-xl font-bold mb-2">Event Not Found</h1>
                <p className="text-sm text-muted-foreground mb-4">This event may have been deleted or you don&apos;t have access.</p>
                <Button variant="outline" onClick={() => router.push("/dashboard")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
                </Button>
            </div>
        );
    }

    const statusConf = STATUS_CONFIG[event.meetingStatus] || STATUS_CONFIG.scheduled;
    const StatusIcon = statusConf.icon;
    const audienceConf = AUDIENCE_CONFIG[event.audience || "private"] || AUDIENCE_CONFIG.private;
    const AudienceIcon = audienceConf.icon;
    const isLive = event.meetingStatus === "in_progress";
    const startDate = new Date(event.startTime);
    const endDate = new Date(event.endTime);

    // Invitation state: user was invited but hasn't accepted yet
    const isPendingInvite = isInvited && !isAccepted;

    // Determine RSVP button state
    const getRsvpButton = () => {
        if (rsvpLoading) {
            return { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "...", variant: "default" as const };
        }
        if (isAccepted) {
            return { icon: <UserMinus className="h-4 w-4" />, label: "Leave Event", variant: "secondary" as const };
        }
        if (isPendingInvite) {
            return { icon: <Check className="h-4 w-4" />, label: "Accept & Join", variant: "default" as const };
        }
        return { icon: <UserPlus className="h-4 w-4" />, label: "Sign Up", variant: "default" as const };
    };
    const rsvpBtn = getRsvpButton();

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                <span>/</span>
                <Link href="/calendar" className="hover:text-foreground transition-colors">Calendar</Link>
                <span>/</span>
                <span className="text-foreground font-medium truncate max-w-[300px]">{event.title}</span>
            </div>

            {/* ─── Invitation Banner ─────────────────────────────── */}
            {isPendingInvite && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                    <Bell className="h-5 w-5 text-amber-500 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">You&apos;ve been invited to this event</p>
                        <p className="text-xs text-muted-foreground">Accept the invitation to confirm your attendance. The host will be notified.</p>
                    </div>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={handleRsvp} disabled={rsvpLoading}>
                        {rsvpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Accept & Join
                    </Button>
                </div>
            )}

            {/* ─── Header Card ─────────────────────────────────────── */}
            <div className={cn(
                "relative overflow-hidden rounded-2xl border p-8",
                isLive ? "border-red-500/30 bg-red-500/5" : "bg-card"
            )}>
                {/* Background decoration */}
                <div className="absolute top-0 right-0 opacity-5">
                    <Calendar className="h-48 w-48 text-foreground" />
                </div>

                <div className="relative space-y-5">
                    {/* Status + Type badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[11px] font-semibold border px-2.5 py-0.5", statusConf.color)}>
                            <StatusIcon className="h-3.5 w-3.5 mr-1" />{statusConf.label}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] gap-1 px-2.5 py-0.5">
                            <div className={cn("h-2 w-2 rounded-full", TYPE_COLORS[event.type] || "bg-blue-500")} />
                            {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] gap-1 px-2.5 py-0.5">
                            <AudienceIcon className="h-3 w-3" />{audienceConf.label}
                        </Badge>
                        {event.recurring && event.recurring !== "none" && (
                            <Badge variant="outline" className="text-[11px] gap-1 px-2.5 py-0.5 text-purple-600">
                                <Repeat className="h-3 w-3" />{event.recurring}
                            </Badge>
                        )}
                        {isAccepted && (
                            <Badge className="text-[11px] gap-1 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <Check className="h-3 w-3" /> Attending
                            </Badge>
                        )}
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl font-bold text-foreground">{event.title}</h1>

                    {/* Creator */}
                    <div className="flex items-center gap-3">
                        {event.creatorAvatar ? (
                            <img src={event.creatorAvatar} alt={event.creatorName || ""} className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold">
                                {(event.creatorName || "U").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                        )}
                        <span className="text-sm text-muted-foreground">
                            Hosted by <span className="font-semibold text-foreground">{event.creatorName}</span>
                        </span>
                    </div>

                    {/* Date / Time / Location row */}
                    <div className="flex items-center gap-6 flex-wrap text-sm">
                        <span className="flex items-center gap-1.5 text-foreground">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            {startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1.5 text-foreground">
                            <Clock className="h-4 w-4 text-amber-500" />
                            {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {event.location && (
                            <span className="flex items-center gap-1.5 text-foreground">
                                <MapPin className="h-4 w-4 text-emerald-500" />{event.location}
                            </span>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 flex-wrap pt-2">
                        {/* Join Meeting */}
                        {event.meetingUrl && event.meetingStatus !== "completed" && (
                            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="lg" className={cn("gap-2", isLive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700")}>
                                    <Video className="h-4 w-4" />{isLive ? "Join Live" : "Join Meeting"}
                                </Button>
                            </a>
                        )}

                        {/* RSVP */}
                        <Button
                            size="lg"
                            variant={rsvpBtn.variant}
                            className={cn("gap-2", isPendingInvite && "bg-amber-600 hover:bg-amber-700")}
                            onClick={handleRsvp}
                            disabled={rsvpLoading}
                        >
                            {rsvpBtn.icon} {rsvpBtn.label}
                        </Button>

                        {/* Calendar Export */}
                        <Button variant="outline" size="lg" className="gap-2" onClick={() => generateICS(event)}>
                            <Download className="h-4 w-4" /> Add to Calendar
                        </Button>

                        {/* Email Forward */}
                        <Button variant="outline" size="lg" className="gap-2" onClick={() => generateMailto(event)}>
                            <Mail className="h-4 w-4" /> Forward via Email
                        </Button>

                        {/* Share */}
                        <Button variant="outline" size="lg" className="gap-2" onClick={() => setShowShare(true)}>
                            <Share2 className="h-4 w-4" /> Share & Invite
                        </Button>
                    </div>
                </div>
            </div>

            {/* ─── Content Grid ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
                {/* Main Content */}
                <div className="space-y-6">
                    {/* Description */}
                    {event.description && (
                        <div className="bg-card rounded-xl border p-6">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-500" /> About This Event
                            </h2>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{event.description}</p>
                        </div>
                    )}

                    {/* Agenda */}
                    {event.agenda && (
                        <div className="bg-card rounded-xl border p-6">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-violet-500" /> Agenda
                            </h2>
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono bg-muted/30 rounded-lg p-4 border">
                                {event.agenda}
                            </div>
                        </div>
                    )}

                    {/* AI Summary */}
                    {event.aiSummary && (
                        <div className="bg-card rounded-xl border p-6 border-violet-500/20">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-violet-500" /> AI Summary
                            </h2>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{event.aiSummary}</p>
                        </div>
                    )}

                    {/* AI Action Items */}
                    {event.aiActionItems && event.aiActionItems.length > 0 && (
                        <div className="bg-card rounded-xl border p-6">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Action Items
                            </h2>
                            <ul className="space-y-2.5">
                                {event.aiActionItems.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm">
                                        <div className={cn(
                                            "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                            item.done ? "bg-emerald-500 border-emerald-500" : "border-border"
                                        )}>
                                            {item.done && <CheckCircle2 className="h-3 w-3 text-white" />}
                                        </div>
                                        <div>
                                            <span className={cn(item.done && "line-through text-muted-foreground")}>{item.text}</span>
                                            {item.assignee && (
                                                <span className="text-[10px] text-muted-foreground ml-2">→ {item.assignee}</span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Meeting Notes */}
                    {event.meetingNotes && (
                        <div className="bg-card rounded-xl border p-6">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-amber-500" /> Meeting Notes
                            </h2>
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {event.meetingNotes}
                            </div>
                        </div>
                    )}

                    {/* Meeting Link Card */}
                    {event.meetingUrl && (
                        <div className="bg-card rounded-xl border p-6">
                            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                <Video className="h-4 w-4 text-blue-500" /> Meeting Link
                            </h2>
                            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline break-all"
                            >
                                {event.meetingUrl} <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-5">
                    {/* Attendees */}
                    <div className="bg-card rounded-xl border p-5">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4 text-indigo-500" /> Attendees ({event.attendeeDetails.length})
                        </h3>
                        {event.attendeeDetails.length > 0 ? (
                            <div className="space-y-2.5">
                                {event.attendeeDetails.map((att: any) => (
                                    <div key={att.id} className="flex items-center gap-2.5">
                                        {att.avatar ? (
                                            <img src={att.avatar} alt={att.name || ""} className="h-8 w-8 rounded-full object-cover" />
                                        ) : (
                                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-white text-[10px] font-bold">
                                                {(att.name || "U").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{att.name}</p>
                                            {att.role && <p className="text-[10px] text-muted-foreground">{att.role}</p>}
                                        </div>
                                        {att.accepted ? (
                                            <Badge className="text-[8px] py-0 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                <Check className="h-2 w-2 mr-0.5" /> Attending
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[8px] py-0 text-amber-600">
                                                Invited
                                            </Badge>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No attendees yet. Be the first to sign up!</p>
                        )}
                    </div>

                    {/* Rate This Event */}
                    <div className="bg-card rounded-xl border p-5">
                        <h3 className="text-sm font-semibold mb-3">Rate This Event</h3>
                        <RatingStars
                            value={userRating}
                            onChange={handleRate}
                            size="lg"
                            avgScore={avgRating}
                            count={ratingCount}
                        />
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-card rounded-xl border p-5 space-y-2">
                        <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => generateICS(event)}>
                            <Download className="h-3.5 w-3.5" /> Download .ics File
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => generateMailto(event)}>
                            <Mail className="h-3.5 w-3.5" /> Email to Colleague
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => setShowShare(true)}>
                            <Share2 className="h-3.5 w-3.5" /> Share & Invite
                        </Button>
                        <Link href="/calendar" className="block">
                            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                                <Calendar className="h-3.5 w-3.5" /> View in Calendar
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Share Dialog */}
            <ShareInviteDialog
                open={showShare}
                onOpenChange={setShowShare}
                itemType="event"
                itemId={event.id}
                itemTitle={event.title}
            />

            {/* Experience Prompt Dialog */}
            {event && (
                <ExperiencePromptDialog
                    open={showExperiencePrompt}
                    onOpenChange={setShowExperiencePrompt}
                    categorySlug={deriveCategory(event)}
                    contextName={event.title}
                    contextType="event"
                />
            )}
        </div>
    );
}
