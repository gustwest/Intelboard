"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { updateMeetingNotes, completeMeeting, processMeetingNotes } from "@/lib/actions";
import { cn } from "@/lib/utils";
import {
    X, Video, FileText, Sparkles, CheckSquare, Clock,
    ExternalLink, Loader2, ChevronDown, ChevronRight, Save, ListChecks,
} from "lucide-react";

interface MeetingEvent {
    id: string;
    title: string;
    startTime: Date | string;
    endTime: Date | string;
    meetingUrl?: string | null;
    meetingId?: string | null;
    meetingStatus?: string | null;
    hasRecording?: boolean;
    transcript?: string | null;
    aiSummary?: string | null;
    aiActionItems?: { text: string; assignee?: string; dueDate?: string; done?: boolean }[];
    agenda?: string | null;
    meetingNotes?: string | null;
    attendees: string[];
}

interface MeetingNotesPanelProps {
    event: MeetingEvent;
    onClose: () => void;
    onUpdate: () => void;
    getUserName: (id: string) => string;
}

export function MeetingNotesPanel({ event, onClose, onUpdate, getUserName }: MeetingNotesPanelProps) {
    const { toast } = useToast();
    const [agenda, setAgenda] = useState(event.agenda || "");
    const [notes, setNotes] = useState(event.meetingNotes || "");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCompleting, setIsCompleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setAgenda(event.agenda || "");
        setNotes(event.meetingNotes || "");
        setDirty(false);
    }, [event]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        const result = await updateMeetingNotes(event.id, { agenda, meetingNotes: notes });
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Saved" });
            setDirty(false);
            onUpdate();
        }
        setIsSaving(false);
    }, [event.id, agenda, notes, toast, onUpdate]);

    const handleComplete = async () => {
        setIsCompleting(true);
        // Save any unsaved notes first
        if (dirty) await updateMeetingNotes(event.id, { agenda, meetingNotes: notes });
        const result = await completeMeeting(event.id);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Meeting Completed", description: "Transcript and recording status updated." });
            onUpdate();
        }
        setIsCompleting(false);
    };

    const handleProcessAI = async () => {
        setIsProcessing(true);
        // Save notes first if dirty
        if (dirty) await updateMeetingNotes(event.id, { agenda, meetingNotes: notes });
        const result = await processMeetingNotes(event.id);
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "AI Summary Generated", description: "Summary and action items have been created." });
            onUpdate();
        }
        setIsProcessing(false);
    };

    const isMeeting = !!event.meetingUrl || !!event.meetingId;
    const isCompleted = event.meetingStatus === "completed";

    const statusColor = {
        scheduled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
        in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
    }[event.meetingStatus || "scheduled"] || "bg-muted text-muted-foreground";

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-background border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-card">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Video className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-foreground truncate">{event.title}</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                                {new Date(event.startTime).toLocaleDateString()} · {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", statusColor)}>
                                {event.meetingStatus || "scheduled"}
                            </Badge>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-5">
                    {/* Join Meeting Button */}
                    {isMeeting && event.meetingUrl && !isCompleted && (
                        <a
                            href={event.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
                        >
                            <Video className="h-4 w-4" />
                            Join Video Meeting
                            <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                        </a>
                    )}

                    {/* Attendees */}
                    {event.attendees.length > 0 && (
                        <Section title="Attendees" icon={<ListChecks className="h-3.5 w-3.5" />}>
                            <div className="flex flex-wrap gap-1.5">
                                {event.attendees.map(id => (
                                    <Badge key={id} variant="secondary" className="text-[10px] py-0.5">
                                        {getUserName(id)}
                                    </Badge>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Agenda */}
                    <Section title="Agenda" icon={<FileText className="h-3.5 w-3.5" />}>
                        <textarea
                            value={agenda}
                            onChange={e => { setAgenda(e.target.value); setDirty(true); }}
                            placeholder="Add agenda items for this meeting..."
                            className="w-full text-xs bg-muted/30 border rounded-lg p-3 min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
                            readOnly={isCompleted}
                        />
                    </Section>

                    {/* Meeting Notes */}
                    <Section title="Meeting Notes" icon={<FileText className="h-3.5 w-3.5" />}>
                        <textarea
                            value={notes}
                            onChange={e => { setNotes(e.target.value); setDirty(true); }}
                            placeholder="Take notes during or after the meeting..."
                            className="w-full text-xs bg-muted/30 border rounded-lg p-3 min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
                        />
                    </Section>

                    {/* Save Button */}
                    {dirty && (
                        <Button onClick={handleSave} disabled={isSaving} size="sm" variant="outline" className="w-full gap-1.5">
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save Notes
                        </Button>
                    )}

                    {/* Complete Meeting + Generate Summary Buttons */}
                    {isMeeting && (
                        <div className="flex gap-2">
                            {!isCompleted && (
                                <Button onClick={handleComplete} disabled={isCompleting} size="sm" variant="outline" className="flex-1 gap-1.5">
                                    {isCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
                                    End Meeting
                                </Button>
                            )}
                            <Button
                                onClick={handleProcessAI}
                                disabled={isProcessing || (!event.transcript && !notes && !agenda)}
                                size="sm"
                                className="flex-1 gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                            >
                                {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                Generate AI Summary
                            </Button>
                        </div>
                    )}

                    {/* AI Summary */}
                    {event.aiSummary && (
                        <Section title="AI Summary" icon={<Sparkles className="h-3.5 w-3.5 text-violet-500" />} highlight>
                            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                {event.aiSummary}
                            </p>
                        </Section>
                    )}

                    {/* AI Action Items */}
                    {event.aiActionItems && event.aiActionItems.length > 0 && (
                        <Section title="Action Items" icon={<CheckSquare className="h-3.5 w-3.5 text-emerald-500" />} highlight>
                            <div className="space-y-2">
                                {event.aiActionItems.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg bg-background border">
                                        <div className={cn(
                                            "mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center",
                                            item.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/30"
                                        )}>
                                            {item.done && <span className="text-[8px]">✓</span>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-xs", item.done && "line-through text-muted-foreground")}>{item.text}</p>
                                            <div className="flex gap-2 mt-0.5">
                                                {item.assignee && (
                                                    <span className="text-[10px] text-muted-foreground">👤 {item.assignee}</span>
                                                )}
                                                {item.dueDate && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                        <Clock className="h-2.5 w-2.5" /> {item.dueDate}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Transcript (collapsible) */}
                    {event.transcript && (
                        <div>
                            <button
                                onClick={() => setShowTranscript(!showTranscript)}
                                className="flex items-center gap-2 text-xs font-semibold text-foreground/70 hover:text-foreground transition-colors w-full"
                            >
                                {showTranscript ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                Transcript
                                {event.hasRecording && <Badge variant="secondary" className="text-[8px] py-0">Recording available</Badge>}
                            </button>
                            {showTranscript && (
                                <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/30 border rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                                    {event.transcript}
                                </pre>
                            )}
                        </div>
                    )}

                    {/* Meeting URL Info */}
                    {isMeeting && event.meetingUrl && (
                        <div className="text-[10px] text-muted-foreground/60 text-center pt-2 border-t">
                            Meeting link: {event.meetingUrl}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function Section({ title, icon, children, highlight }: {
    title: string; icon: React.ReactNode; children: React.ReactNode; highlight?: boolean;
}) {
    return (
        <div className={cn(
            "space-y-2",
            highlight && "bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-violet-500/10 rounded-xl p-3"
        )}>
            <div className="flex items-center gap-1.5">
                {icon}
                <Label className="text-xs font-semibold text-foreground/70">{title}</Label>
            </div>
            {children}
        </div>
    );
}
