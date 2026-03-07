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
    Clock, MapPin, Users, Trash2, Loader2, Filter
} from "lucide-react";

type CalendarEvent = {
    id: string;
    title: string;
    description?: string | null;
    startTime: Date | string;
    endTime: Date | string;
    requestId?: string | null;
    createdBy: string;
    attendees: string[];
    location?: string | null;
    type: string;
};

type ViewUser = { id: string; name: string; email?: string | null; role?: string | null };

const EVENT_COLORS: Record<string, string> = {
    meeting: "bg-blue-500",
    deadline: "bg-red-500",
    milestone: "bg-emerald-500",
};

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
                    <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
                    <p className="text-sm text-muted-foreground">Schedule meetings and track deadlines</p>
                </div>
                <Button onClick={() => { setSelectedDate(new Date()); setShowCreateDialog(true); }} className="gap-2">
                    <Plus className="h-4 w-4" /> New Event
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <Button variant={filterMyEvents ? "default" : "outline"} size="sm" onClick={() => setFilterMyEvents(!filterMyEvents)}>
                    <Filter className="h-3 w-3 mr-1.5" /> My Events
                </Button>
                {["meeting", "deadline", "milestone"].map(t => (
                    <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm"
                        onClick={() => setFilterType(filterType === t ? "" : t)}
                    >
                        <div className={cn("h-2 w-2 rounded-full mr-1.5", EVENT_COLORS[t])} />
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                {/* Calendar Grid */}
                <div className="bg-card rounded-xl border shadow-sm">
                    {/* Month Nav */}
                    <div className="flex items-center justify-between p-4 border-b">
                        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
                            <Button variant="outline" size="sm" onClick={goToday} className="text-xs">Today</Button>
                        </div>
                        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 border-b">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                        ))}
                    </div>

                    {/* Days */}
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, idx) => {
                                if (day === null) return <div key={`empty-${idx}`} className="h-24 border-r border-b bg-muted/20" />;

                                const dayEvents = eventsForDay(day);
                                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                                const isSelected = selectedDate && day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();

                                return (
                                    <button
                                        key={`day-${day}`}
                                        onClick={() => setSelectedDate(new Date(year, month, day))}
                                        className={cn(
                                            "h-24 border-r border-b p-1.5 text-left transition-colors hover:bg-accent/50 relative",
                                            isSelected && "bg-accent/30 ring-2 ring-primary ring-inset",
                                        )}
                                    >
                                        <span className={cn(
                                            "text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full",
                                            isToday && "bg-primary text-primary-foreground",
                                        )}>
                                            {day}
                                        </span>
                                        <div className="mt-0.5 space-y-0.5">
                                            {dayEvents.slice(0, 3).map(e => (
                                                <div key={e.id} className={cn("text-[9px] text-white px-1 py-0.5 rounded truncate leading-tight", EVENT_COLORS[e.type] || "bg-blue-500")}>
                                                    {e.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 3 && (
                                                <div className="text-[9px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
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
                        {selectedDayEvents.map(event => (
                            <div key={event.id} className="border rounded-lg p-3 space-y-2 relative group">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", EVENT_COLORS[event.type] || "bg-blue-500")} />
                                        <span className="text-sm font-medium">{event.title}</span>
                                    </div>
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
                                {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    {event.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
                                </div>
                                {event.attendees.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        {event.attendees.map(aId => (
                                            <Badge key={aId} variant="secondary" className="text-[10px] py-0">{getUserName(aId)}</Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
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
                title, description, startTime, endTime, location, type, attendees: selectedAttendees,
            });
            toast({ title: "Event Created" });
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
            <DialogContent className="sm:max-w-[480px]">
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
                        <Label className="text-xs">Location</Label>
                        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Teams / Room 301" />
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
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Create Event
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
