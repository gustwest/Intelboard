"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, ArrowUpDown, Filter, X, Calendar, User2, Briefcase, Clock, ChevronDown, Info, Star, GripVertical, Layers } from "lucide-react";
import { assignSpecialist, getAllUsers } from "@/lib/actions";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useToast } from "@/components/ui/use-toast";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { Request, RequestStatus, REQUEST_TYPE_CONFIG, RequestType } from "@/lib/data";
import { useRequests } from "@/hooks/use-requests";
import { findMatches, ScoredSpecialist } from "@/lib/matching";
import { useRole } from "@/components/role-provider";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useLanguage } from "@/components/language-provider";
import { NewRequestDialog } from "@/components/new-request-dialog";
import { Badge } from "@/components/ui/badge";
import { MatchingDialog } from "@/components/matching-dialog";
import { RequestDetailsPanel } from "@/components/request-details-panel";
import { PotentialGigCard } from "@/components/potential-gig-card";
import { Separator } from "@/components/ui/separator";

const columns: RequestStatus[] = [
    "New",
    "Submitted for Review",
    "Scope Refinement Required",
    "Scope Approved",
    "Active Efforts",
    "Done"
];

const URGENCY_COLORS: Record<string, string> = {
    Critical: "text-red-500 bg-red-500/10 border-red-500/20",
    High: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    Medium: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    Low: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
};

const COLUMN_COLORS: Record<string, { accent: string; bg: string; badge: string; dot: string }> = {
    "New": { accent: "from-blue-500 to-cyan-400", bg: "bg-blue-500/5 border-blue-500/10", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
    "Submitted for Review": { accent: "from-amber-500 to-yellow-400", bg: "bg-amber-500/5 border-amber-500/10", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    "Scope Refinement Required": { accent: "from-orange-500 to-red-400", bg: "bg-orange-500/5 border-orange-500/10", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
    "Scope Approved": { accent: "from-emerald-500 to-green-400", bg: "bg-emerald-500/5 border-emerald-500/10", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    "Active Efforts": { accent: "from-violet-500 to-purple-400", bg: "bg-violet-500/5 border-violet-500/10", badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
    "Done": { accent: "from-slate-400 to-gray-400", bg: "bg-slate-500/5 border-slate-500/10", badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
};

const SWIMLANE_OPTIONS = [
    { id: "none", label: "No Swimlanes" },
    { id: "requestType", label: "Type" },
    { id: "urgency", label: "Urgency" },
    { id: "assignedSpecialistId", label: "Assignee" },
    { id: "creatorId", label: "Requestor" },
] as const;

type SwimlaneSetting = typeof SWIMLANE_OPTIONS[number]["id"];

export default function BoardPage() {
    return (
        <Suspense fallback={<div className="container py-6">Loading board...</div>}>
            <BoardContent />
        </Suspense>
    );
}

function FilterPill({ label, active, count, onClear, onClick }: { label: string; active: boolean; count?: number; onClear?: () => void; onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                active
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border"
            )}
        >
            {label}
            {count !== undefined && count > 0 && (
                <span className="h-4 min-w-4 flex items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white px-1">{count}</span>
            )}
            {active && onClear && (
                <X className="h-3 w-3 ml-0.5 hover:text-red-500" onClick={(e) => { e.stopPropagation(); onClear(); }} />
            )}
        </button>
    );
}

function BoardContent() {
    const searchParams = useSearchParams();
    const requestIdParam = searchParams.get("requestId");
    const { requests, updateRequest, isLoaded } = useRequests();
    const [matches, setMatches] = useState<Record<string, ScoredSpecialist[]>>({});
    const { role, currentUser } = useRole();
    const [isMounted, setIsMounted] = useState(false);
    const { t } = useLanguage();
    const { toast } = useToast();
    const [viewMode, setViewMode] = useState<"board" | "backlog">("board");
    const [sortField, setSortField] = useState<string>("createdAt");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [userNames, setUserNames] = useState<Record<string, string>>({});

    // Universal Filters
    const [typeFilter, setTypeFilter] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
    const [requestorFilter, setRequestorFilter] = useState<string[]>([]);
    const [openType, setOpenType] = useState(false);
    const [openStatus, setOpenStatus] = useState(false);
    const [openAssignee, setOpenAssignee] = useState(false);
    const [openRequestor, setOpenRequestor] = useState(false);
    const [swimlaneBy, setSwimlaneBy] = useState<SwimlaneSetting>("none");
    const [openSwimlane, setOpenSwimlane] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    // Load user names for display
    useEffect(() => {
        getAllUsers().then(users => {
            const map: Record<string, string> = {};
            users.forEach(u => { map[u.id] = u.name; });
            setUserNames(map);
        });
    }, []);

    const handleStatusChange = (id: string, newStatus: RequestStatus) => {
        const request = requests.find(r => r.id === id);
        if (request) updateRequest({ ...request, status: newStatus });
    };

    const [matchingRequest, setMatchingRequest] = useState<Request | null>(null);
    const handleFindMatch = (request: Request) => setMatchingRequest(request);

    const handleConfirmMatch = async (specialistId: string) => {
        if (matchingRequest) {
            const result = await assignSpecialist(matchingRequest.id, specialistId);
            if (result.error) {
                toast({ title: "Failed to assign specialist", description: result.error, variant: "destructive" });
            } else {
                toast({ title: "Specialist Assigned", description: "The specialist has been notified of this opportunity." });
                const existingIds = matchingRequest.assignedSpecialistIds || [];
                const updatedIds = [...existingIds, specialistId];
                updateRequest({
                    ...matchingRequest,
                    assignedSpecialistId: updatedIds[0],
                    assignedSpecialistIds: updatedIds,
                    status: matchingRequest.status === "New" || matchingRequest.status === "Submitted for Review" ? "Active Efforts" : matchingRequest.status,
                });
            }
            setMatchingRequest(null);
        }
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        // Extract actual status from composite droppableId (format: "status::laneKey" or just "status")
        const destStatus = destination.droppableId.split("::")[0] as RequestStatus;

        if (destStatus === "Submitted for Review") {
            const request = requests.find(r => r.id === draggableId);
            if (request && !request.assignedSpecialistId) {
                toast({ title: "Cannot move to Submitted for Review", description: "You must assign a specialist first.", variant: "destructive" });
                return;
            }
        }
        handleStatusChange(draggableId, destStatus);
    };

    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const handleRequestClick = (request: Request) => setSelectedRequestId(request.id);
    const handleUpdateActiveRequest = (updatedRequest: Request) => updateRequest(updatedRequest);

    // Base role filter
    const roleFilteredRequests = requests.filter((req) => {
        if (!currentUser) return false;
        if (role === "Admin") return true;
        if (role === "Customer" || role === "Guest") return req.creatorId === currentUser.id;
        if (role === "Specialist") {
            return req.assignedSpecialistId === currentUser.id ||
                (req.assignedSpecialistIds || []).includes(currentUser.id);
        }
        return false;
    });

    // Apply universal filters
    const filteredRequests = roleFilteredRequests.filter((req) => {
        if (typeFilter.length > 0 && (!req.requestType || !typeFilter.includes(req.requestType))) return false;
        if (statusFilter.length > 0 && !statusFilter.includes(req.status)) return false;
        if (assigneeFilter.length > 0) {
            const reqAssignees = req.assignedSpecialistIds || (req.assignedSpecialistId ? [req.assignedSpecialistId] : []);
            if (!assigneeFilter.some(id => reqAssignees.includes(id))) return false;
        }
        if (requestorFilter.length > 0 && (!req.creatorId || !requestorFilter.includes(req.creatorId))) return false;
        return true;
    });

    // Specialist View: Map "Submitted for Review" (Matched) to "New" column
    const getVisualColumn = (req: Request): RequestStatus => {
        if (role === "Specialist" && req.status === "Submitted for Review") return "New";
        if ((role === "Customer" || role === "Guest") && req.status === "New" && req.tags?.includes("Feedback")) return "Submitted for Review";
        return req.status;
    };

    const selectedRequest = requests.find(r => r.id === selectedRequestId);

    const handleSpecialistAction = (request: Request, action: "Accept" | "Ask", note?: string) => {
        const updatedRequest = { ...request };
        if (action === "Accept") {
            updatedRequest.actionNeeded = true;
            updatedRequest.specialistNote = "Specialist has accepted the gig layout.";
            updatedRequest.status = "Scope Approved";
        } else if (action === "Ask" && note) {
            updatedRequest.actionNeeded = true;
            updatedRequest.specialistNote = note;
            updatedRequest.status = "Scope Refinement Required";
        }
        updateRequest(updatedRequest);
    };

    useEffect(() => {
        if (requestIdParam && isLoaded) setSelectedRequestId(requestIdParam);
    }, [requestIdParam, isLoaded]);

    if (!isMounted) return <div className="container py-6">Loading board...</div>;

    // Derive unique values for filter options
    const uniqueTypes = [...new Set(roleFilteredRequests.map(r => r.requestType).filter(Boolean))] as string[];
    const uniqueStatuses = [...new Set(roleFilteredRequests.map(r => r.status).filter(Boolean))] as string[];
    const uniqueAssignees = [...new Set(roleFilteredRequests.flatMap(r => r.assignedSpecialistIds || (r.assignedSpecialistId ? [r.assignedSpecialistId] : [])).filter(Boolean))] as string[];
    const uniqueRequestors = [...new Set(roleFilteredRequests.map(r => r.creatorId).filter(Boolean))] as string[];

    const getColumnTitle = (status: string) => {
        switch (status) {
            case "New": return role === "Specialist" ? "New Opportunity" : t.board.new;
            case "Submitted for Review": return "In Review";
            case "Scope Refinement Required": return "Refinement";
            case "Scope Approved": return "Approved";
            case "Active Efforts": return "Active";
            case "Done": return "Done";
            default: return status;
        }
    };

    const handleSort = (field: string) => {
        if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDir("asc"); }
    };

    const sortedBacklogRequests = [...filteredRequests].sort((a, b) => {
        let aVal: any, bVal: any;
        switch (sortField) {
            case "title": aVal = a.title; bVal = b.title; break;
            case "status": aVal = a.status; bVal = b.status; break;
            case "requestType": aVal = a.requestType || ""; bVal = b.requestType || ""; break;
            case "industry": aVal = a.industry; bVal = b.industry; break;
            case "urgency": aVal = a.urgency || ""; bVal = b.urgency || ""; break;
            case "createdAt": aVal = (a as any).createdAt || ""; bVal = (b as any).createdAt || ""; break;
            default: aVal = (a as any).createdAt || ""; bVal = (b as any).createdAt || ""; break;
        }
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const activeFilterCount = typeFilter.length + statusFilter.length + assigneeFilter.length + requestorFilter.length;

    const formatUserId = (id: string) => {
        if (userNames[id]) return userNames[id];
        if (id.includes("@")) return id.split("@")[0];
        return id.length > 12 ? id.substring(0, 8) + "…" : id;
    };

    return (
        <div className="container py-6 relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.board.title}</h1>
                    <div className="flex items-center bg-muted/60 rounded-lg p-0.5 border border-border/50">
                        <Button
                            variant={viewMode === "board" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("board")}
                            className={cn("gap-1.5 h-7 text-xs", viewMode === "board" && "shadow-sm")}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Board
                        </Button>
                        <Button
                            variant={viewMode === "backlog" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("backlog")}
                            className={cn("gap-1.5 h-7 text-xs", viewMode === "backlog" && "shadow-sm")}
                        >
                            <List className="h-3.5 w-3.5" />
                            Backlog
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {(role === "Customer" || role === "Admin" || role === "Guest") && (
                        <NewRequestDialog />
                    )}
                </div>
            </div>

            {/* Universal Filter Bar */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
                <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                    <Filter className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Filters</span>
                </div>

                {/* Type Filter */}
                <Popover open={openType} onOpenChange={setOpenType}>
                    <PopoverTrigger asChild>
                        <div><FilterPill label="Type" active={typeFilter.length > 0} count={typeFilter.length} onClear={() => setTypeFilter([])} onClick={() => setOpenType(!openType)} /></div>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0 z-[600]" align="start">
                        <Command>
                            <CommandInput placeholder="Search type..." className="h-8 text-xs" />
                            <CommandList>
                                <CommandEmpty>No types found.</CommandEmpty>
                                <CommandGroup>
                                    {(["Insights", "Short-term", "Consultant", "Hire"] as RequestType[]).map(type => (
                                        <CommandItem key={type} value={type} onSelect={() => setTypeFilter(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])}>
                                            <Check className={cn("mr-2 h-3.5 w-3.5", typeFilter.includes(type) ? "opacity-100" : "opacity-0")} />
                                            <span className="mr-2">{REQUEST_TYPE_CONFIG[type].icon}</span>
                                            {REQUEST_TYPE_CONFIG[type].label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Status Filter */}
                <Popover open={openStatus} onOpenChange={setOpenStatus}>
                    <PopoverTrigger asChild>
                        <div><FilterPill label="Status" active={statusFilter.length > 0} count={statusFilter.length} onClear={() => setStatusFilter([])} onClick={() => setOpenStatus(!openStatus)} /></div>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0 z-[600]" align="start">
                        <Command>
                            <CommandInput placeholder="Search status..." className="h-8 text-xs" />
                            <CommandList>
                                <CommandEmpty>No status found.</CommandEmpty>
                                <CommandGroup>
                                    {columns.map(status => (
                                        <CommandItem key={status} value={status} onSelect={() => setStatusFilter(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}>
                                            <Check className={cn("mr-2 h-3.5 w-3.5", statusFilter.includes(status) ? "opacity-100" : "opacity-0")} />
                                            <div className={cn("h-2 w-2 rounded-full mr-2", COLUMN_COLORS[status]?.dot)} />
                                            {getColumnTitle(status)}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Assignee Filter */}
                <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
                    <PopoverTrigger asChild>
                        <div><FilterPill label="Assignee" active={assigneeFilter.length > 0} count={assigneeFilter.length} onClear={() => setAssigneeFilter([])} onClick={() => setOpenAssignee(!openAssignee)} /></div>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0 z-[600]" align="start">
                        <Command>
                            <CommandInput placeholder="Search assignee..." className="h-8 text-xs" />
                            <CommandList>
                                <CommandEmpty>No assignees found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem value="unassigned" onSelect={() => setAssigneeFilter(prev => prev.includes("__none__") ? prev.filter(a => a !== "__none__") : [...prev, "__none__"])}>
                                        <Check className={cn("mr-2 h-3.5 w-3.5", assigneeFilter.includes("__none__") ? "opacity-100" : "opacity-0")} />
                                        Unassigned
                                    </CommandItem>
                                    {uniqueAssignees.map(id => (
                                        <CommandItem key={id} value={id} onSelect={() => setAssigneeFilter(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])}>
                                            <Check className={cn("mr-2 h-3.5 w-3.5", assigneeFilter.includes(id) ? "opacity-100" : "opacity-0")} />
                                            {formatUserId(id)}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Requestor Filter */}
                <Popover open={openRequestor} onOpenChange={setOpenRequestor}>
                    <PopoverTrigger asChild>
                        <div><FilterPill label="Requestor" active={requestorFilter.length > 0} count={requestorFilter.length} onClear={() => setRequestorFilter([])} onClick={() => setOpenRequestor(!openRequestor)} /></div>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0 z-[600]" align="start">
                        <Command>
                            <CommandInput placeholder="Search requestor..." className="h-8 text-xs" />
                            <CommandList>
                                <CommandEmpty>No requestors found.</CommandEmpty>
                                <CommandGroup>
                                    {uniqueRequestors.map(id => (
                                        <CommandItem key={id} value={id} onSelect={() => setRequestorFilter(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])}>
                                            <Check className={cn("mr-2 h-3.5 w-3.5", requestorFilter.includes(id) ? "opacity-100" : "opacity-0")} />
                                            {formatUserId(id)}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {activeFilterCount > 0 && (
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                        onClick={() => { setTypeFilter([]); setStatusFilter([]); setAssigneeFilter([]); setRequestorFilter([]); }}
                    >
                        Clear all
                    </button>
                )}

                {viewMode === "board" && (
                    <>
                        <div className="h-4 w-px bg-border mx-1" />
                        <Popover open={openSwimlane} onOpenChange={setOpenSwimlane}>
                            <PopoverTrigger asChild>
                                <button className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                                    swimlaneBy !== "none"
                                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 shadow-sm"
                                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border"
                                )}>
                                    <Layers className="h-3 w-3" />
                                    {swimlaneBy !== "none" ? `Lanes: ${SWIMLANE_OPTIONS.find(o => o.id === swimlaneBy)?.label}` : "Swimlanes"}
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-1 z-[600]" align="start">
                                {SWIMLANE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.id}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left",
                                            swimlaneBy === opt.id ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium" : "hover:bg-muted text-foreground"
                                        )}
                                        onClick={() => { setSwimlaneBy(opt.id); setOpenSwimlane(false); }}
                                    >
                                        {swimlaneBy === opt.id && <Check className="h-3 w-3 shrink-0" />}
                                        {opt.label}
                                    </button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    </>
                )}

                <div className="ml-auto text-xs text-muted-foreground">
                    {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""}
                </div>
            </div>

            {/* ========== BOARD VIEW ========== */}
            {viewMode === "board" ? (
                <div className="flex">
                    <div className="flex-1 transition-all duration-300">
                        <DragDropContext onDragEnd={onDragEnd}>
                            {(() => {
                                // Compute swimlane groups
                                const getSwimlaneKey = (req: Request): string => {
                                    if (swimlaneBy === "none") return "__all__";
                                    const val = (req as any)[swimlaneBy];
                                    return val || "Unspecified";
                                };
                                const getSwimlaneLabel = (key: string): string => {
                                    if (key === "__all__") return "";
                                    if (key === "Unspecified") return "Unspecified";
                                    if (swimlaneBy === "requestType" && REQUEST_TYPE_CONFIG[key as RequestType]) {
                                        return `${REQUEST_TYPE_CONFIG[key as RequestType].icon} ${REQUEST_TYPE_CONFIG[key as RequestType].label}`;
                                    }
                                    if (swimlaneBy === "assignedSpecialistId" || swimlaneBy === "creatorId") return formatUserId(key);
                                    return key;
                                };

                                const swimlaneKeys = swimlaneBy === "none"
                                    ? ["__all__"]
                                    : [...new Set(filteredRequests.map(r => getSwimlaneKey(r)))];

                                // Sort swimlane keys sensibly (Unspecified last)
                                swimlaneKeys.sort((a, b) => {
                                    if (a === "Unspecified") return 1;
                                    if (b === "Unspecified") return -1;
                                    return a.localeCompare(b);
                                });

                                return (
                                    <div className="space-y-6">
                                        {/* Column headers (always shown once at top) */}
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                            {columns.map((status) => {
                                                const colColor = COLUMN_COLORS[status];
                                                const totalInCol = filteredRequests.filter(r => getVisualColumn(r) === status).length;
                                                return (
                                                    <div key={status} className="flex items-center gap-2 px-1">
                                                        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", colColor.dot)} />
                                                        <h2 className="font-semibold text-xs uppercase tracking-wider text-foreground/80 truncate" title={status}>
                                                            {getColumnTitle(status)}
                                                        </h2>
                                                        <span className={cn("text-[10px] font-bold h-5 min-w-5 flex items-center justify-center rounded-full", colColor.badge)}>
                                                            {totalInCol}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Swimlane rows */}
                                        {swimlaneKeys.map((laneKey) => {
                                            const laneRequests = filteredRequests.filter(r => getSwimlaneKey(r) === laneKey);

                                            return (
                                                <div key={laneKey}>
                                                    {/* Swimlane header (only shown if swimlanes are active) */}
                                                    {swimlaneBy !== "none" && (
                                                        <div className="flex items-center gap-3 mb-2 px-1">
                                                            <div className="h-px flex-1 bg-border" />
                                                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border border-border/50">
                                                                <Layers className="h-3 w-3 text-violet-500" />
                                                                <span className="text-xs font-semibold text-foreground/80">{getSwimlaneLabel(laneKey)}</span>
                                                                <span className="text-[10px] text-muted-foreground">({laneRequests.length})</span>
                                                            </div>
                                                            <div className="h-px flex-1 bg-border" />
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-stretch">
                                                        {columns.map((status) => {
                                                            const colColor = COLUMN_COLORS[status];
                                                            const colRequests = laneRequests.filter(r => getVisualColumn(r) === status);
                                                            const droppableId = swimlaneBy === "none" ? status : `${status}::${laneKey}`;

                                                            return (
                                                                <div key={status} className="flex flex-col min-h-0">
                                                                    <Droppable droppableId={droppableId}>
                                                                        {(provided, snapshot) => (
                                                                            <div
                                                                                {...provided.droppableProps}
                                                                                ref={provided.innerRef}
                                                                                className={cn(
                                                                                    "rounded-xl p-2 flex-1 space-y-2 transition-colors duration-200 border",
                                                                                    swimlaneBy === "none" ? "min-h-[200px]" : "min-h-[80px]",
                                                                                    snapshot.isDraggingOver
                                                                                        ? "bg-indigo-500/5 border-indigo-500/20 ring-1 ring-indigo-500/10"
                                                                                        : "bg-muted/30 border-transparent"
                                                                                )}
                                                                            >
                                                                                {colRequests.map((request, index) => (
                                                                                    <Draggable key={request.id} draggableId={request.id} index={index}>
                                                                                        {(provided, snapshot) => (
                                                                                            <div
                                                                                                ref={provided.innerRef}
                                                                                                {...provided.draggableProps}
                                                                                                {...provided.dragHandleProps}
                                                                                                onClick={() => handleRequestClick(request)}
                                                                                                className={cn(
                                                                                                    "group relative bg-background rounded-xl border shadow-sm transition-all duration-200 cursor-pointer overflow-hidden",
                                                                                                    snapshot.isDragging
                                                                                                        ? "shadow-xl ring-2 ring-indigo-500/30 rotate-1 scale-[1.02]"
                                                                                                        : "hover:shadow-md hover:-translate-y-0.5",
                                                                                                    selectedRequestId === request.id && "ring-2 ring-primary shadow-md"
                                                                                                )}
                                                                                            >
                                                                                                {/* Gradient accent bar */}
                                                                                                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b", colColor.accent)} />

                                                                                                {/* Card Content */}
                                                                                                <div className="pl-3.5 pr-3 py-3">
                                                                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                                                                        <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
                                                                                                            {request.title}
                                                                                                        </h3>
                                                                                                    </div>

                                                                                                    {request.requestType && REQUEST_TYPE_CONFIG[request.requestType] && (
                                                                                                        <Badge variant="outline" className={cn(
                                                                                                            "text-[10px] px-1.5 py-0 mb-2 font-medium",
                                                                                                            REQUEST_TYPE_CONFIG[request.requestType].color,
                                                                                                            REQUEST_TYPE_CONFIG[request.requestType].border,
                                                                                                            REQUEST_TYPE_CONFIG[request.requestType].bg
                                                                                                        )}>
                                                                                                            {REQUEST_TYPE_CONFIG[request.requestType].icon} {REQUEST_TYPE_CONFIG[request.requestType].label}
                                                                                                        </Badge>
                                                                                                    )}

                                                                                                    {request.actionNeeded && (role === "Customer" || role === "Guest" || role === "Admin") && (
                                                                                                        <div className="mb-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center bg-amber-500/10 px-2 py-1 rounded-md">
                                                                                                            <Info className="w-3 h-3 mr-1 shrink-0" />
                                                                                                            Action Needed
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {role === "Admin" && request.creatorId && (
                                                                                                        <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                                                                            <User2 className="h-3 w-3" />
                                                                                                            <span>{formatUserId(request.creatorId)}</span>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                                                                                                        {request.description}
                                                                                                    </p>

                                                                                                    <div className="flex items-center justify-between">
                                                                                                        <div className="flex items-center gap-1.5">
                                                                                                            {request.urgency && (
                                                                                                                <span className={cn(
                                                                                                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-md border",
                                                                                                                    URGENCY_COLORS[request.urgency] || "text-muted-foreground"
                                                                                                                )}>
                                                                                                                    {request.urgency}
                                                                                                                </span>
                                                                                                            )}
                                                                                                            {request.industry && (
                                                                                                                <span className="text-[10px] text-muted-foreground">{request.industry}</span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        {request.budget && (
                                                                                                            <span className="text-[10px] font-medium text-foreground/70">{request.budget}</span>
                                                                                                        )}
                                                                                                    </div>

                                                                                                    {role === "Admin" && (request.status === "New" || request.status === "Submitted for Review") && !request.assignedSpecialistId && (
                                                                                                        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                                                                                                            <Button
                                                                                                                size="sm"
                                                                                                                className="w-full h-7 text-xs bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-0 shadow-sm"
                                                                                                                onClick={(e) => { e.preventDefault(); handleFindMatch(request); }}
                                                                                                            >
                                                                                                                Find Match
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {(role === "Customer" || role === "Guest") && request.status === "New" && request.creatorId === currentUser?.id && (
                                                                                                        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                                                                                                            <Button
                                                                                                                size="sm"
                                                                                                                variant="secondary"
                                                                                                                className="w-full h-7 text-xs"
                                                                                                                onClick={(e) => { e.preventDefault(); handleRequestClick(request); }}
                                                                                                            >
                                                                                                                Submit for Review
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </Draggable>
                                                                                ))}
                                                                                {provided.placeholder}
                                                                            </div>
                                                                        )}
                                                                    </Droppable>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </DragDropContext>
                    </div>
                </div>
            ) : (
                /* ========== BACKLOG LIST VIEW ========== */
                <div className="bg-background border rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-muted/30">
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("title")}>
                                    <span className="flex items-center gap-1.5">Title {sortField === "title" && <ArrowUpDown className="h-3 w-3" />}</span>
                                </th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("requestType")}>
                                    <span className="flex items-center gap-1.5">Type {sortField === "requestType" && <ArrowUpDown className="h-3 w-3" />}</span>
                                </th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("status")}>
                                    <span className="flex items-center gap-1.5">Status {sortField === "status" && <ArrowUpDown className="h-3 w-3" />}</span>
                                </th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignee</th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("urgency")}>
                                    <span className="flex items-center gap-1.5">Urgency {sortField === "urgency" && <ArrowUpDown className="h-3 w-3" />}</span>
                                </th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Budget</th>
                                <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("createdAt")}>
                                    <span className="flex items-center gap-1.5">Created {sortField === "createdAt" && <ArrowUpDown className="h-3 w-3" />}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedBacklogRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center p-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Briefcase className="h-8 w-8 opacity-20" />
                                            <p className="text-sm">No requests match your filters</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                sortedBacklogRequests.map((request) => {
                                    const statusColor = COLUMN_COLORS[request.status];
                                    return (
                                        <tr
                                            key={request.id}
                                            onClick={() => handleRequestClick(request)}
                                            className={cn(
                                                "border-b cursor-pointer transition-all duration-150 group",
                                                selectedRequestId === request.id
                                                    ? "bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/10"
                                                    : "hover:bg-muted/40",
                                                request.actionNeeded && (role === "Customer" || role === "Guest" || role === "Admin") && "border-l-3 border-l-amber-500"
                                            )}
                                        >
                                            <td className="p-3">
                                                <div className="font-medium text-sm text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{request.title}</div>
                                                <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{request.description}</div>
                                                {role === "Admin" && request.creatorId && (
                                                    <div className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                                                        <User2 className="h-2.5 w-2.5" /> {formatUserId(request.creatorId)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {request.requestType && REQUEST_TYPE_CONFIG[request.requestType] ? (
                                                    <Badge variant="outline" className={cn("text-[10px] font-medium", REQUEST_TYPE_CONFIG[request.requestType].color, REQUEST_TYPE_CONFIG[request.requestType].border, REQUEST_TYPE_CONFIG[request.requestType].bg)}>
                                                        {REQUEST_TYPE_CONFIG[request.requestType].icon} {REQUEST_TYPE_CONFIG[request.requestType].label}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn("h-2 w-2 rounded-full shrink-0", statusColor?.dot)} />
                                                    <span className="text-xs font-medium text-foreground/80">{getColumnTitle(request.status)}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                {request.assignedSpecialistId ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                                            {formatUserId(request.assignedSpecialistId)[0]?.toUpperCase()}
                                                        </div>
                                                        <span className="text-xs text-foreground/70">{formatUserId(request.assignedSpecialistId)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/50">—</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {request.urgency ? (
                                                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md border", URGENCY_COLORS[request.urgency])}>
                                                        {request.urgency}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/50">—</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-xs text-foreground/70">{request.budget || "—"}</td>
                                            <td className="p-3 text-xs text-muted-foreground">
                                                {(request as any).createdAt ? new Date((request as any).createdAt).toLocaleDateString() : "—"}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    <div className="px-4 py-2.5 bg-muted/20 border-t text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>{sortedBacklogRequests.length} request{sortedBacklogRequests.length !== 1 ? "s" : ""}</span>
                        {activeFilterCount > 0 && <span className="text-indigo-500">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</span>}
                    </div>
                </div>
            )}

            {selectedRequest && (
                <RequestDetailsPanel
                    request={selectedRequest}
                    onClose={() => setSelectedRequestId(null)}
                    onUpdate={handleUpdateActiveRequest}
                    isOwner={role === "Admin" || selectedRequest.creatorId === currentUser?.id}
                />
            )}

            <MatchingDialog
                request={matchingRequest}
                open={!!matchingRequest}
                onOpenChange={(open) => !open && setMatchingRequest(null)}
                onConfirm={handleConfirmMatch}
            />
        </div>
    );
}
