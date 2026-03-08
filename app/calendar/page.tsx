"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRole } from "@/components/role-provider";
import { getEvents, createEvent, deleteEvent, getAllUsers } from "@/lib/actions";
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
    Lock, Globe, UserCheck, Repeat, RefreshCw, Share2,
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

type ViewUser = { id: string; name: string; email?: string | null; role?: string | null };

const EVENT_COLORS: Record<string, string> = {
    meeting: "bg-blue-500",
    deadline: "bg-red-500",
    milestone: "bg-emerald-500",
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

export default function CalendarPage() {
    const { currentUser } = useRole();
    const { toast } = useToast();
    const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
    const [allUsers, setAllUsers] = useState<ViewUser[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [filterMyEvents, setFilterMyEvents] = useState(false);
    const [filterType, setFilterType] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [shareEvent, setShareEvent] = useState<CalendarEvent | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const loadData = useCallback(async () => {
        setLoading(true);
        const [evts, usrs] = await Promise.all([getEvents(), getAllUsers()]);
        setAllEvents(evts);
        setAllUsers(usrs);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredEvents = useMemo(() => {
        let filtered = allEvents;
        if (filterMyEvents && currentUser) {
            filtered = filtered.filter(e => e.createdBy === currentUser.id || e.attendees.includes(currentUser.id));
        }
        if (filterType) {
            filtered = filtered.filter(e => e.type === filterType);
        }
        return filtered;
    }, [allEvents, filterMyEvents, filterType, currentUser]);

    const eventsForDay = useCallback((day: number) => {
        return filteredEvents.filter(e => {
            const d = new Date(e.startTime);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });
    }, [filteredEvents, year, month]);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => setCurrentDate(new Date());

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();

    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

    const selectedDayEvents = selectedDate
        ? filteredEvents.filter(e => {
            const d = new Date(e.startTime);
            return d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth() && d.getDate() === selectedDate.getDate();
        })
        : [];

    const getUserName = (id: string) => allUsers.find(u => u.id === id)?.name || "Unknown";

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Calendar</h1>
                    <p className="text-sm text-muted-foreground">Schedule meetings and track deadlines</p>
                </div>
                <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4" /> New Event
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <Button variant={filterMyEvents ? "default" : "outline"} size="sm" onClick={() => setFilterMyEvents(!filterMyEvents)} className="gap-1.5">
                    <Filter className="h-3 w-3" /> My Events
                </Button>
                {(["meeting", "deadline", "milestone"] as const).map(t => (
                    <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm" onClick={() => setFilterType(filterType === t ? "" : t)} className="gap-1.5">
                        <div className={cn("h-2 w-2 rounded-full", EVENT_COLORS[t])} />
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                ))}
            </div>

            {/* Calendar Grid + Side Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
                <div className="bg-card rounded-xl border shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b">
                        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">{currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
                            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
                        </div>
                        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="p-2">
                            <div className="grid grid-cols-7 mb-1">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-px bg-border/50 rounded-lg overflow-hidden">
                                {calendarDays.map((day, idx) => {
                                    if (day === null) return <div key={`e-${idx}`} className="bg-card min-h-[80px]" />;
                                    const dayEvents = eventsForDay(day);
                                    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                                    const isSelected = selectedDate && day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
                                    return (
                                        <button key={day} onClick={() => setSelectedDate(new Date(year, month, day))}
                                            className={cn("bg-card min-h-[80px] p-1.5 text-left transition-colors hover:bg-accent/50 relative",
                                                isSelected && "ring-2 ring-primary ring-inset"
                                            )}
                                        >
                                            <span className={cn("text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full",
                                                isToday && "bg-primary text-primary-foreground"
                                            )}>{day}</span>
                                            <div className="space-y-0.5 mt-0.5">
                                                {dayEvents.slice(0, 2).map(ev => (
                                                    <div key={ev.id} className={cn("text-[9px] px-1 py-0.5 rounded truncate text-white", EVENT_COLORS[ev.type] || "bg-blue-500")}>
                                                        {ev.meetingUrl && "📹 "}{ev.title}
                                                    </div>
                                                ))}
                                                {dayEvents.length > 2 && <div className="text-[9px] text-muted-foreground px-1">+{dayEvents.length - 2} more</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Side Panel: Selected Day Events */}
                <div className="bg-card rounded-xl border shadow-sm p-4">
                    <h3 className="font-semibold text-sm mb-3">
                        {selectedDate
                            ? selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                            : "Select a day"}
                    </h3>

                    {!selectedDate && (
                        <p className="text-xs text-muted-foreground">Click a day on the calendar to view events.</p>
                    )}

                    {selectedDate && selectedDayEvents.length === 0 && (
                        <div className="text-center py-8">
                            <CalendarIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No events this day</p>
                            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreateDialog(true)}>
                                <Plus className="h-3 w-3 mr-1" /> Add Event
                            </Button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {selectedDayEvents.map(event => {
                            const audienceConf = AUDIENCE_CONFIG[event.audience || "private"] || AUDIENCE_CONFIG.private;
                            const AudienceIcon = audienceConf.icon;
                            const recurringLabel = RECURRING_LABELS[event.recurring || "none"];

                            return (
                                <div key={event.id} className="border rounded-lg p-3 space-y-2 relative group">
                                    <div className="flex items-start justify-between">
                                        <button
                                            onClick={() => setSelectedEvent(event)}
                                            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity flex-wrap"
                                        >
                                            <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", EVENT_COLORS[event.type] || "bg-blue-500")} />
                                            <span className="text-sm font-medium">{event.title}</span>
                                            {event.meetingUrl && (
                                                <Badge variant="secondary" className="text-[8px] py-0 gap-0.5">
                                                    <Video className="h-2 w-2" /> Video
                                                </Badge>
                                            )}
                                            {event.aiSummary && (
                                                <Badge variant="secondary" className="text-[8px] py-0 gap-0.5 bg-violet-500/10 text-violet-600">
                                                    <Sparkles className="h-2 w-2" /> AI Notes
                                                </Badge>
                                            )}
                                        </button>
                                        <Button
                                            variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                                            onClick={async () => {
                                                await deleteEvent(event.id);
                                                toast({ title: "Event deleted" });
                                                loadData();
                                            }}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    {/* Creator + Audience + Recurring info */}
                                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                        <span className="text-muted-foreground">
                                            Created by <span className="font-medium text-foreground">{event.creatorName || getUserName(event.createdBy)}</span>
                                        </span>
                                        <span className={cn("flex items-center gap-0.5", audienceConf.color)}>
                                            <AudienceIcon className="h-2.5 w-2.5" /> {audienceConf.label}
                                        </span>
                                        {recurringLabel && (
                                            <span className="flex items-center gap-0.5 text-purple-600">
                                                <Repeat className="h-2.5 w-2.5" /> {recurringLabel}
                                            </span>
                                        )}
                                    </div>

                                    {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        {event.location && !event.meetingUrl && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
                                    </div>
                                    {event.attendees.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <Users className="h-3 w-3 text-muted-foreground" />
                                            {event.attendees.map(aId => (
                                                <Badge key={aId} variant="secondary" className="text-[10px] py-0">{getUserName(aId)}</Badge>
                                            ))}
                                        </div>
                                    )}
                                    {/* Quick actions row */}
                                    <div className="flex gap-1.5">
                                        {event.meetingUrl && event.meetingStatus !== "completed" && (
                                            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                <Video className="h-2.5 w-2.5" /> Join
                                            </a>
                                        )}
                                        <button
                                            onClick={() => setSelectedEvent(event)}
                                            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <FileText className="h-2.5 w-2.5" /> Notes
                                        </button>
                                        <button
                                            onClick={() => setShareEvent(event)}
                                            className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline transition-colors"
                                        >
                                            <Share2 className="h-2.5 w-2.5" /> Share
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
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
                        // Refresh the selected event
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
