"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/role-provider";
import { getEvents, createEvent, deleteEvent, rsvpEvent, getAllUsers, getUpcomingHubs } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
    Clock, MapPin, Users, Trash2, Loader2, Filter, Video, FileText, Sparkles,
    Lock, Globe, UserCheck, Repeat, Share2, ArrowRight,
    CalendarDays, UserPlus, Radio, MessageSquare, ExternalLink, Eye, EyeOff,
    CheckCircle2, ChevronDown,
} from "lucide-react";
import { MeetingNotesPanel } from "@/components/meeting-notes-panel";
import { ShareInviteDialog } from "@/components/share-invite-dialog";

type CalendarEvent = {
    id: string;
    title: string;
    description?: string | null;
    startTime: Date | string;
    endTime: Date | string;
    requestId?: string | null;
    createdBy: string;
    creatorName?: string | null;
    attendees: string[];
    location?: string | null;
    type: string;
    audience?: string;
    recurring?: string;
    meetingUrl?: string | null;
    meetingId?: string | null;
    meetingStatus?: string | null;
    hasRecording?: boolean;
    transcript?: string | null;
    aiSummary?: string | null;
    aiActionItems?: { text: string; assignee?: string; dueDate?: string; done?: boolean }[];
    agenda?: string | null;
    meetingNotes?: string | null;
    createdAt?: Date | string;
};

type HubEvent = {
    id: string;
    title: string;
    status: string;
    startTime: Date | string | null;
    endTime: Date | string | null;
    meetingUrl: string | null;
    rsvps: { userId: string; status: string; respondedAt: string }[];
    createdBy: string;
    createdAt: Date | string;
    intelboardId: string;
    threadId: string | null;
    creatorName: string | null;
    intelboardTitle: string | null;
};

type ViewUser = { id: string; name: string; email?: string | null; role?: string | null };

const EVENT_COLORS: Record<string, string> = {
    meeting: "bg-blue-500",
    deadline: "bg-red-500",
    milestone: "bg-emerald-500",
};

const EVENT_BORDER_COLORS: Record<string, string> = {
    meeting: "border-l-blue-500",
    deadline: "border-l-red-500",
    milestone: "border-l-emerald-500",
};

const AUDIENCE_CONFIG: Record<string, { label: string; icon: typeof Lock; color: string }> = {
    private: { label: "Private", icon: Lock, color: "text-amber-600" },
    open: { label: "Open", icon: Globe, color: "text-emerald-600" },
    team: { label: "Team", icon: UserCheck, color: "text-blue-600" },
};

const RECURRING_LABELS: Record<string, string> = {
    none: "",
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
};

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

function formatRelativeDate(dateStr: Date | string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours <= 0) return "Now";
        if (diffHours === 1) return "In 1 hour";
        return `In ${diffHours} hours`;
    }
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isUpcoming(dateStr: Date | string) {
    return new Date(dateStr).getTime() >= Date.now() - 60 * 60 * 1000; // include events that started up to 1h ago
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════

export default function EventsPage() {
    const router = useRouter();
    const { currentUser } = useRole();
    const { toast } = useToast();
    const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
    const [hubs, setHubs] = useState<HubEvent[]>([]);
    const [allUsers, setAllUsers] = useState<ViewUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [shareEvent, setShareEvent] = useState<CalendarEvent | null>(null);
    const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);

    // Calendar state
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [evts, usrs, hbs] = await Promise.all([getEvents(), getAllUsers(), getUpcomingHubs()]);
            setAllEvents(evts);
            setAllUsers(usrs);
            setHubs(hbs as HubEvent[]);
        } catch (e) {
            console.error("Failed to load events data:", e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ─── Derived data ────────────────────────────────────────
    const myEvents = useMemo(() => {
        if (!currentUser) return [];
        return allEvents
            .filter(e =>
                (e.createdBy === currentUser.id || e.attendees.includes(currentUser.id)) &&
                isUpcoming(e.startTime)
            )
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [allEvents, currentUser]);

    const suggestedEvents = useMemo(() => {
        if (!currentUser) return allEvents.filter(e => e.audience === "open" && isUpcoming(e.startTime));
        return allEvents
            .filter(e =>
                e.audience === "open" &&
                e.createdBy !== currentUser.id &&
                !e.attendees.includes(currentUser.id) &&
                isUpcoming(e.startTime)
            )
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [allEvents, currentUser]);

    const pastEvents = useMemo(() => {
        if (!currentUser) return [];
        return allEvents
            .filter(e =>
                (e.createdBy === currentUser.id || e.attendees.includes(currentUser.id)) &&
                !isUpcoming(e.startTime)
            )
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
            .slice(0, 5);
    }, [allEvents, currentUser]);

    // Open & ongoing events you can join right now (live or starting within 2h)
    const happeningNow = useMemo(() => {
        const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
        return allEvents
            .filter(e => {
                const isLiveOrSoon = e.meetingStatus === "in_progress" ||
                    (e.meetingStatus === "scheduled" && new Date(e.startTime).getTime() <= twoHoursFromNow && new Date(e.endTime).getTime() >= Date.now());
                const isOpen = e.audience === "open";
                const isNotMine = !currentUser || (e.createdBy !== currentUser.id && !e.attendees.includes(currentUser.id));
                return isLiveOrSoon && isOpen && isNotMine;
            })
            .sort((a, b) => {
                // Live first, then by start time
                if (a.meetingStatus === "in_progress" && b.meetingStatus !== "in_progress") return -1;
                if (b.meetingStatus === "in_progress" && a.meetingStatus !== "in_progress") return 1;
                return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
            });
    }, [allEvents, currentUser]);

    // Also include open events user IS part of that are live now
    const myLiveEvents = useMemo(() => {
        if (!currentUser) return [];
        return allEvents.filter(e =>
            e.meetingStatus === "in_progress" &&
            (e.createdBy === currentUser.id || e.attendees.includes(currentUser.id))
        );
    }, [allEvents, currentUser]);

    const liveHubs = useMemo(() => hubs.filter(h => h.status === "live"), [hubs]);
    const scheduledHubs = useMemo(() => hubs.filter(h => h.status === "scheduled"), [hubs]);

    // Calendar-filtered events (when calendar is open and a day is selected)
    const calendarFilteredEvents = useMemo(() => {
        if (!selectedDate) return null; // null = no calendar filter active
        return allEvents.filter(e => {
            const d = new Date(e.startTime);
            return d.getFullYear() === selectedDate.getFullYear() &&
                d.getMonth() === selectedDate.getMonth() &&
                d.getDate() === selectedDate.getDate();
        });
    }, [allEvents, selectedDate]);

    const getUserName = (id: string) => allUsers.find(u => u.id === id)?.name || "Unknown";

    const handleQuickRsvp = async (eventId: string) => {
        setRsvpLoadingId(eventId);
        try {
            const result = await rsvpEvent(eventId);
            if ("error" in result) {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            } else {
                toast({ title: result.isAccepted ? "Signed up!" : "Left event" });
                loadData();
            }
        } catch (e) {
            console.error(e);
        }
        setRsvpLoadingId(null);
    };

    // ─── Render ──────────────────────────────────────────────
    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            {/* ═══ Header ═══ */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Events & Meetings</h1>
                    <p className="text-sm text-muted-foreground">Your upcoming events, meetings, and community discussions</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={showCalendar ? "default" : "outline"}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => { setShowCalendar(!showCalendar); if (showCalendar) setSelectedDate(null); }}
                    >
                        {showCalendar ? <EyeOff className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                        {showCalendar ? "Hide Calendar" : "Show Calendar"}
                    </Button>
                    <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
                        <Plus className="h-4 w-4" /> New Event
                    </Button>
                </div>
            </div>

            {/* ═══ Main Layout ═══ */}
            <div className={cn(
                "grid gap-6",
                showCalendar ? "grid-cols-1 lg:grid-cols-[1fr_380px]" : "grid-cols-1"
            )}>
                {/* ─── Left: Event Lists ────────────────────────────── */}
                <div className="space-y-8">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : calendarFilteredEvents !== null ? (
                        /* Calendar day filter active */
                        <CalendarDayView
                            date={selectedDate!}
                            events={calendarFilteredEvents}
                            currentUser={currentUser}
                            getUserName={getUserName}
                            onClear={() => setSelectedDate(null)}
                            onRsvp={handleQuickRsvp}
                            rsvpLoadingId={rsvpLoadingId}
                            onShare={setShareEvent}
                            onNotes={setSelectedEvent}
                        />
                    ) : (
                        <>
                            {/* ═══ Happening Now & Open to Join ═══ */}
                            {(happeningNow.length > 0 || myLiveEvents.length > 0) && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center relative">
                                            <Radio className="h-4 w-4 text-white" />
                                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full animate-ping" />
                                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-foreground">Happening Now</h2>
                                            <p className="text-xs text-muted-foreground">Live events and meetings you can join right now</p>
                                        </div>
                                        <Badge variant="secondary" className="ml-auto text-xs gap-1">
                                            <Radio className="h-2.5 w-2.5 text-red-500" />
                                            {happeningNow.length + myLiveEvents.length} active
                                        </Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {myLiveEvents.map(event => (
                                            <EventCard
                                                key={event.id}
                                                event={event}
                                                currentUser={currentUser}
                                                getUserName={getUserName}
                                                onRsvp={handleQuickRsvp}
                                                rsvpLoading={rsvpLoadingId === event.id}
                                                onShare={setShareEvent}
                                                onNotes={setSelectedEvent}
                                                showRsvpStatus
                                            />
                                        ))}
                                        {happeningNow.map(event => (
                                            <EventCard
                                                key={event.id}
                                                event={event}
                                                currentUser={currentUser}
                                                getUserName={getUserName}
                                                onRsvp={handleQuickRsvp}
                                                rsvpLoading={rsvpLoadingId === event.id}
                                                onShare={setShareEvent}
                                                onNotes={setSelectedEvent}
                                                showSignUpButton
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ═══ Your Events ═══ */}
                            <EventSection
                                title="Your Events"
                                subtitle="Events you've created or signed up for"
                                icon={<CalendarIcon className="h-5 w-5 text-blue-500" />}
                                emptyText="You haven't signed up for any upcoming events yet."
                                emptyAction={
                                    <Button size="sm" variant="outline" className="gap-1.5 mt-2" onClick={() => setShowCreateDialog(true)}>
                                        <Plus className="h-3.5 w-3.5" /> Create Your First Event
                                    </Button>
                                }
                                events={myEvents}
                                currentUser={currentUser}
                                getUserName={getUserName}
                                onRsvp={handleQuickRsvp}
                                rsvpLoadingId={rsvpLoadingId}
                                onShare={setShareEvent}
                                onNotes={setSelectedEvent}
                                showRsvpStatus
                            />

                            {/* ═══ Suggested For You ═══ */}
                            {suggestedEvents.length > 0 && (
                                <EventSection
                                    title="Suggested For You"
                                    subtitle="Open events you might be interested in"
                                    icon={<Sparkles className="h-5 w-5 text-violet-500" />}
                                    events={suggestedEvents}
                                    currentUser={currentUser}
                                    getUserName={getUserName}
                                    onRsvp={handleQuickRsvp}
                                    rsvpLoadingId={rsvpLoadingId}
                                    onShare={setShareEvent}
                                    onNotes={setSelectedEvent}
                                    showSignUpButton
                                />
                            )}

                            {/* ═══ Active Forums & Live Meetings ═══ */}
                            {(liveHubs.length > 0 || scheduledHubs.length > 0) && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                                            <Radio className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-foreground">Active Forums & Live Meetings</h2>
                                            <p className="text-xs text-muted-foreground">Ongoing discussions and meetings you can join</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {liveHubs.map(hub => (
                                            <HubCard key={hub.id} hub={hub} isLive />
                                        ))}
                                        {scheduledHubs.map(hub => (
                                            <HubCard key={hub.id} hub={hub} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ═══ Past Events ═══ */}
                            {pastEvents.length > 0 && (
                                <PastEventsSection
                                    events={pastEvents}
                                    getUserName={getUserName}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* ─── Right: Calendar Panel ────────────────────────── */}
                {showCalendar && (
                    <CalendarPanel
                        allEvents={allEvents}
                        currentDate={currentDate}
                        selectedDate={selectedDate}
                        onDateChange={setCurrentDate}
                        onSelectDate={setSelectedDate}
                    />
                )}
            </div>

            {/* Create Event Dialog */}
            <CreateEventDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                defaultDate={selectedDate || new Date()}
                allUsers={allUsers}
                onCreated={() => { loadData(); setShowCreateDialog(false); }}
            />

            {/* Meeting Notes Panel */}
            {selectedEvent && (
                <MeetingNotesPanel
                    event={selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                    onUpdate={() => {
                        loadData();
                        getEvents().then(evts => {
                            const updated = evts.find((e: any) => e.id === selectedEvent.id);
                            if (updated) setSelectedEvent(updated);
                        });
                    }}
                    getUserName={getUserName}
                />
            )}

            {/* Share / Invite Dialog */}
            {shareEvent && (
                <ShareInviteDialog
                    open={!!shareEvent}
                    onOpenChange={(v) => { if (!v) setShareEvent(null); }}
                    itemType="event"
                    itemId={shareEvent.id}
                    itemTitle={shareEvent.title}
                />
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Event Section Component
// ══════════════════════════════════════════════════════════════

function EventSection({
    title, subtitle, icon, emptyText, emptyAction, events, currentUser, getUserName,
    onRsvp, rsvpLoadingId, onShare, onNotes, showRsvpStatus, showSignUpButton,
}: {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    emptyText?: string;
    emptyAction?: React.ReactNode;
    events: CalendarEvent[];
    currentUser: any;
    getUserName: (id: string) => string;
    onRsvp: (id: string) => void;
    rsvpLoadingId: string | null;
    onShare: (e: CalendarEvent) => void;
    onNotes: (e: CalendarEvent) => void;
    showRsvpStatus?: boolean;
    showSignUpButton?: boolean;
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-card border flex items-center justify-center">
                    {icon}
                </div>
                <div>
                    <h2 className="text-lg font-bold text-foreground">{title}</h2>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
                {events.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">{events.length}</Badge>
                )}
            </div>

            {events.length === 0 ? (
                <div className="bg-card rounded-xl border border-dashed p-8 text-center">
                    <CalendarIcon className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{emptyText}</p>
                    {emptyAction}
                </div>
            ) : (
                <div className="space-y-3">
                    {events.map(event => (
                        <EventCard
                            key={event.id}
                            event={event}
                            currentUser={currentUser}
                            getUserName={getUserName}
                            onRsvp={onRsvp}
                            rsvpLoading={rsvpLoadingId === event.id}
                            onShare={onShare}
                            onNotes={onNotes}
                            showRsvpStatus={showRsvpStatus}
                            showSignUpButton={showSignUpButton}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Event Card Component
// ══════════════════════════════════════════════════════════════

function EventCard({
    event, currentUser, getUserName, onRsvp, rsvpLoading, onShare, onNotes,
    showRsvpStatus, showSignUpButton,
}: {
    event: CalendarEvent;
    currentUser: any;
    getUserName: (id: string) => string;
    onRsvp: (id: string) => void;
    rsvpLoading: boolean;
    onShare: (e: CalendarEvent) => void;
    onNotes: (e: CalendarEvent) => void;
    showRsvpStatus?: boolean;
    showSignUpButton?: boolean;
}) {
    const isLive = event.meetingStatus === "in_progress";
    const audienceConf = AUDIENCE_CONFIG[event.audience || "private"] || AUDIENCE_CONFIG.private;
    const AudienceIcon = audienceConf.icon;
    const recurringLabel = RECURRING_LABELS[event.recurring || "none"];
    const relDate = formatRelativeDate(event.startTime);
    const isCreator = currentUser && event.createdBy === currentUser.id;

    return (
        <div className={cn(
            "bg-card rounded-xl border border-l-4 p-4 transition-all hover:shadow-md group",
            EVENT_BORDER_COLORS[event.type] || "border-l-blue-500",
            isLive && "border-l-red-500 ring-1 ring-red-500/20"
        )}>
            <div className="flex items-start gap-4">
                {/* Date pill */}
                <div className="hidden sm:flex flex-col items-center justify-center min-w-[52px] py-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                        {new Date(event.startTime).toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="text-xl font-bold text-foreground leading-tight">
                        {new Date(event.startTime).getDate()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {new Date(event.startTime).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                    {/* Top row: title + badges */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                            <Link href={`/events/${event.id}`} className="hover:underline">
                                <h3 className="text-sm font-semibold text-foreground leading-tight">{event.title}</h3>
                            </Link>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {isLive && (
                                    <Badge className="text-[9px] py-0 bg-red-500/10 text-red-600 border border-red-500/20 animate-pulse gap-0.5">
                                        <Radio className="h-2 w-2" /> Live
                                    </Badge>
                                )}
                                <Badge variant="outline" className="text-[9px] py-0 gap-0.5">
                                    <div className={cn("h-1.5 w-1.5 rounded-full", EVENT_COLORS[event.type] || "bg-blue-500")} />
                                    {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                                </Badge>
                                <span className={cn("flex items-center gap-0.5 text-[9px]", audienceConf.color)}>
                                    <AudienceIcon className="h-2.5 w-2.5" /> {audienceConf.label}
                                </span>
                                {recurringLabel && (
                                    <span className="flex items-center gap-0.5 text-[9px] text-purple-600">
                                        <Repeat className="h-2.5 w-2.5" /> {recurringLabel}
                                    </span>
                                )}
                                {showRsvpStatus && isCreator && (
                                    <Badge className="text-[9px] py-0 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">Organizer</Badge>
                                )}
                                {showRsvpStatus && !isCreator && (
                                    <Badge className="text-[9px] py-0 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 gap-0.5">
                                        <CheckCircle2 className="h-2 w-2" /> Attending
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <span className={cn(
                            "text-xs font-semibold whitespace-nowrap shrink-0 px-2 py-0.5 rounded-full",
                            relDate === "Now" || relDate === "Tomorrow"
                                ? "bg-amber-500/10 text-amber-600"
                                : "text-muted-foreground"
                        )}>
                            {relDate}
                        </span>
                    </div>

                    {/* Description */}
                    {event.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{event.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(event.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {event.location && !event.meetingUrl && (
                            <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {event.location}
                            </span>
                        )}
                        {event.meetingUrl && (
                            <span className="flex items-center gap-1 text-blue-600">
                                <Video className="h-3 w-3" /> Video Meeting
                            </span>
                        )}
                        {event.attendees.length > 0 && (
                            <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                            </span>
                        )}
                        {event.creatorName && (
                            <span className="text-muted-foreground">
                                by <span className="font-medium text-foreground/80">{event.creatorName}</span>
                            </span>
                        )}
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-2 pt-1">
                        {event.meetingUrl && event.meetingStatus !== "completed" && (
                            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant={isLive ? "default" : "outline"}
                                    className={cn("h-7 gap-1 text-[11px]", isLive && "bg-red-600 hover:bg-red-700 text-white")}
                                >
                                    <Video className="h-3 w-3" /> {isLive ? "Join Live" : "Join"}
                                </Button>
                            </a>
                        )}
                        {showSignUpButton && (
                            <Button
                                size="sm" className="h-7 gap-1 text-[11px]"
                                onClick={() => onRsvp(event.id)}
                                disabled={rsvpLoading}
                            >
                                {rsvpLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                                Sign Up
                            </Button>
                        )}
                        <Link href={`/events/${event.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]">
                                <ArrowRight className="h-3 w-3" /> Details
                            </Button>
                        </Link>
                        <button
                            onClick={() => onNotes(event)}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                        >
                            <FileText className="h-3 w-3" /> Notes
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onShare(event); }}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Share2 className="h-3 w-3" /> Share
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Hub Card Component (Forums / Live Meetings)
// ══════════════════════════════════════════════════════════════

function HubCard({ hub, isLive }: { hub: HubEvent; isLive?: boolean }) {
    const acceptedCount = hub.rsvps.filter(r => r.status === "accepted").length;

    return (
        <div className={cn(
            "bg-card rounded-xl border p-4 transition-all hover:shadow-md",
            isLive && "border-red-500/30 ring-1 ring-red-500/10"
        )}>
            <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                            {isLive && (
                                <Badge className="text-[9px] py-0 bg-red-500/10 text-red-600 border border-red-500/20 animate-pulse gap-0.5">
                                    <Radio className="h-2 w-2" /> Live
                                </Badge>
                            )}
                            <h4 className="text-sm font-semibold text-foreground">{hub.title}</h4>
                        </div>
                        {hub.intelboardTitle && (
                            <Link href={`/intelboards/${hub.intelboardId}`}
                                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                                <MessageSquare className="h-2.5 w-2.5" /> {hub.intelboardTitle}
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {hub.startTime && (
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(hub.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {" · "}
                            {new Date(hub.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                    {acceptedCount > 0 && (
                        <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {acceptedCount}
                        </span>
                    )}
                    {hub.creatorName && (
                        <span>by {hub.creatorName}</span>
                    )}
                </div>

                {hub.meetingUrl && (
                    <a href={hub.meetingUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className={cn(
                            "w-full gap-1.5 text-[11px]",
                            isLive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                        )}>
                            <Video className="h-3 w-3" /> {isLive ? "Join Live Session" : "Join Meeting"}
                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </Button>
                    </a>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Past Events (collapsed)
// ══════════════════════════════════════════════════════════════

function PastEventsSection({ events, getUserName }: { events: CalendarEvent[]; getUserName: (id: string) => string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="space-y-3">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
                <ChevronDown className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")} />
                Past Events ({events.length})
            </button>
            {expanded && (
                <div className="space-y-2 pl-6">
                    {events.map(event => (
                        <Link key={event.id} href={`/events/${event.id}`}
                            className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                        >
                            <div className={cn("h-2 w-2 rounded-full shrink-0 opacity-50", EVENT_COLORS[event.type] || "bg-blue-500")} />
                            <span className="text-xs font-medium text-foreground/70 truncate">{event.title}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                                {new Date(event.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Calendar Day View (when a day is selected in calendar)
// ══════════════════════════════════════════════════════════════

function CalendarDayView({
    date, events, currentUser, getUserName, onClear, onRsvp, rsvpLoadingId, onShare, onNotes,
}: {
    date: Date;
    events: CalendarEvent[];
    currentUser: any;
    getUserName: (id: string) => string;
    onClear: () => void;
    onRsvp: (id: string) => void;
    rsvpLoadingId: string | null;
    onShare: (e: CalendarEvent) => void;
    onNotes: (e: CalendarEvent) => void;
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-blue-500" />
                    <h2 className="text-lg font-bold">
                        {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </h2>
                    <Badge variant="secondary" className="text-xs">{events.length} event{events.length !== 1 ? "s" : ""}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={onClear} className="text-xs gap-1">
                    ← All Events
                </Button>
            </div>

            {events.length === 0 ? (
                <div className="bg-card rounded-xl border border-dashed p-8 text-center">
                    <CalendarIcon className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No events on this day</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {events.map(event => {
                        const isMyEvent = currentUser && (event.createdBy === currentUser.id || event.attendees.includes(currentUser.id));
                        return (
                            <EventCard
                                key={event.id}
                                event={event}
                                currentUser={currentUser}
                                getUserName={getUserName}
                                onRsvp={onRsvp}
                                rsvpLoading={rsvpLoadingId === event.id}
                                onShare={onShare}
                                onNotes={onNotes}
                                showRsvpStatus={isMyEvent}
                                showSignUpButton={!isMyEvent && event.audience === "open"}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Calendar Panel (right side)
// ══════════════════════════════════════════════════════════════

function CalendarPanel({
    allEvents, currentDate, selectedDate, onDateChange, onSelectDate,
}: {
    allEvents: CalendarEvent[];
    currentDate: Date;
    selectedDate: Date | null;
    onDateChange: (d: Date) => void;
    onSelectDate: (d: Date | null) => void;
}) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();

    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

    const eventsForDay = (day: number) =>
        allEvents.filter(e => {
            const d = new Date(e.startTime);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });

    return (
        <div className="bg-card rounded-xl border shadow-sm sticky top-20">
            <div className="flex items-center justify-between p-3 border-b">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDateChange(new Date(year, month - 1, 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => onDateChange(new Date())}>Today</Button>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDateChange(new Date(year, month + 1, 1))}>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="p-2">
                <div className="grid grid-cols-7 mb-1">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                        <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1.5">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-px">
                    {calendarDays.map((day, idx) => {
                        if (day === null) return <div key={`e-${idx}`} className="min-h-[40px]" />;
                        const dayEvents = eventsForDay(day);
                        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                        const isSelected = selectedDate && day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
                        return (
                            <button
                                key={day}
                                onClick={() => {
                                    if (isSelected) {
                                        onSelectDate(null);
                                    } else {
                                        onSelectDate(new Date(year, month, day));
                                    }
                                }}
                                className={cn(
                                    "min-h-[40px] p-1 rounded-lg text-center transition-colors hover:bg-accent/50 relative",
                                    isSelected && "ring-2 ring-primary bg-primary/5"
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full",
                                    isToday && "bg-primary text-primary-foreground"
                                )}>{day}</span>
                                {dayEvents.length > 0 && (
                                    <div className="flex justify-center gap-0.5 mt-0.5">
                                        {dayEvents.slice(0, 3).map(ev => (
                                            <div key={ev.id} className={cn("h-1 w-1 rounded-full", EVENT_COLORS[ev.type] || "bg-blue-500")} />
                                        ))}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Calendar legend */}
            <div className="p-3 border-t flex items-center gap-3 flex-wrap">
                {Object.entries(EVENT_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <div className={cn("h-2 w-2 rounded-full", color)} />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// Create Event Dialog (preserved from original)
// ══════════════════════════════════════════════════════════════

function CreateEventDialog({ open, onOpenChange, defaultDate, allUsers, onCreated }: {
    open: boolean; onOpenChange: (v: boolean) => void; defaultDate: Date; allUsers: ViewUser[]; onCreated: () => void;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [location, setLocation] = useState("");
    const [type, setType] = useState("meeting");
    const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [videoMeeting, setVideoMeeting] = useState(true);
    const [agenda, setAgenda] = useState("");
    const [audience, setAudience] = useState("private");
    const [recurring, setRecurring] = useState("none");

    useEffect(() => {
        if (open) {
            const d = defaultDate;
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            setStartTime(`${dateStr}T09:00`);
            setEndTime(`${dateStr}T10:00`);
            setTitle("");
            setDescription("");
            setLocation("");
            setType("meeting");
            setSelectedAttendees([]);
            setVideoMeeting(true);
            setAgenda("");
            setAudience("private");
            setRecurring("none");
        }
    }, [open, defaultDate]);

    const handleSubmit = async () => {
        if (!title || !startTime || !endTime) {
            toast({ title: "Missing fields", description: "Title, start, and end time are required.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await createEvent({
                title, description, startTime, endTime, location, type,
                attendees: selectedAttendees,
                videoMeeting: type === "meeting" ? videoMeeting : false,
                agenda: agenda || undefined,
                audience,
                recurring,
            });
            toast({
                title: "Event Created",
                description: videoMeeting && type === "meeting" ? "Video meeting link generated." : undefined,
            });
            onCreated();
        } catch {
            toast({ title: "Error", description: "Failed to create event", variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const toggleAttendee = (id: string) => {
        setSelectedAttendees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Event</DialogTitle>
                    <DialogDescription>Schedule a meeting, deadline, or milestone.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                    <div>
                        <Label className="text-xs">Title</Label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kickoff Meeting" />
                    </div>
                    <div>
                        <Label className="text-xs">Description</Label>
                        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Start</Label>
                            <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-xs">End</Label>
                            <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs">Type</Label>
                        <div className="flex gap-2 mt-1">
                            {(["meeting", "deadline", "milestone"] as const).map(t => (
                                <Button key={t} variant={type === t ? "default" : "outline"} size="sm" onClick={() => setType(t)}>
                                    <div className={cn("h-2 w-2 rounded-full mr-1.5", EVENT_COLORS[t])} />
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Audience */}
                    <div>
                        <Label className="text-xs">Audience</Label>
                        <div className="flex gap-2 mt-1">
                            {([
                                { value: "private", label: "Private", icon: Lock, desc: "Only you & attendees" },
                                { value: "open", label: "Open", icon: Globe, desc: "Visible to everyone" },
                                { value: "team", label: "Team", icon: UserCheck, desc: "Your team members" },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setAudience(opt.value)}
                                    className={cn(
                                        "flex-1 flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all",
                                        audience === opt.value
                                            ? "border-primary bg-primary/5 text-primary"
                                            : "border-border hover:border-primary/30 text-muted-foreground"
                                    )}
                                >
                                    <opt.icon className="h-3.5 w-3.5" />
                                    <span className="font-medium">{opt.label}</span>
                                    <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Recurring */}
                    <div>
                        <Label className="text-xs">Recurring</Label>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                            {([
                                { value: "none", label: "One-time" },
                                { value: "daily", label: "Daily" },
                                { value: "weekly", label: "Weekly" },
                                { value: "biweekly", label: "Bi-weekly" },
                                { value: "monthly", label: "Monthly" },
                            ] as const).map(opt => (
                                <Button
                                    key={opt.value}
                                    variant={recurring === opt.value ? "default" : "outline"}
                                    size="sm"
                                    className="text-[11px] h-7 gap-1"
                                    onClick={() => setRecurring(opt.value)}
                                >
                                    {opt.value !== "none" && <Repeat className="h-2.5 w-2.5" />}
                                    {opt.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Video Meeting Toggle */}
                    {type === "meeting" && (
                        <div className="flex items-center justify-between p-3 rounded-xl border bg-blue-500/5 border-blue-500/20">
                            <div className="flex items-center gap-2">
                                <Video className="h-4 w-4 text-blue-600" />
                                <div>
                                    <p className="text-xs font-semibold text-foreground">Video Meeting</p>
                                    <p className="text-[10px] text-muted-foreground">A Teams meeting link will be generated</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setVideoMeeting(!videoMeeting)}
                                className={cn(
                                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                    videoMeeting ? "bg-blue-600" : "bg-muted"
                                )}
                            >
                                <span className={cn(
                                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                                    videoMeeting ? "translate-x-4.5" : "translate-x-0.5"
                                )} />
                            </button>
                        </div>
                    )}

                    {/* Location (only when not video meeting) */}
                    {(type !== "meeting" || !videoMeeting) && (
                        <div>
                            <Label className="text-xs">Location</Label>
                            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 301" />
                        </div>
                    )}

                    {/* Agenda */}
                    {type === "meeting" && (
                        <div>
                            <Label className="text-xs">Agenda (optional)</Label>
                            <textarea
                                value={agenda}
                                onChange={e => setAgenda(e.target.value)}
                                placeholder={"1. Review project status\n2. Discuss next milestones\n3. Q&A"}
                                className="w-full text-xs bg-muted/30 border rounded-lg p-2.5 min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 mt-1"
                            />
                        </div>
                    )}

                    <div>
                        <Label className="text-xs">Attendees</Label>
                        <div className="max-h-32 overflow-y-auto border rounded-lg mt-1 p-1 space-y-0.5">
                            {allUsers.map(u => (
                                <button key={u.id} onClick={() => toggleAttendee(u.id)}
                                    className={cn("w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors",
                                        selectedAttendees.includes(u.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                                    )}
                                >
                                    <div className={cn("h-3 w-3 rounded border", selectedAttendees.includes(u.id) ? "bg-primary border-primary" : "border-muted-foreground/40")} />
                                    {u.name}
                                    {u.role && <span className="text-muted-foreground ml-auto text-[10px]">{u.role}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full gap-2">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (videoMeeting && type === "meeting") ? <Video className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {(videoMeeting && type === "meeting") ? "Create Video Meeting" : "Create Event"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
