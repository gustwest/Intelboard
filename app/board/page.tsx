"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useToast } from "@/components/ui/use-toast"; // Added import
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Info, Star } from "lucide-react";
import { initialRequests, Request, RequestStatus, specialists, mockUsers } from "@/lib/data";
import { useRequests } from "@/hooks/use-requests";
import { findMatches, ScoredSpecialist } from "@/lib/matching";
import { useRole } from "@/components/role-provider";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useLanguage } from "@/components/language-provider";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchingDialog } from "@/components/matching-dialog";
import { RequestDetailsPanel } from "@/components/request-details-panel";
import { PotentialGigCard } from "@/components/potential-gig-card";

const columns: RequestStatus[] = [
    "New",
    "Submitted for Review",
    "Scope Refinement Required",
    "Scope Approved",
    "Active Efforts",
    "Done"
];

export default function BoardPage() {
    const { requests, updateRequest, isLoaded } = useRequests();
    const [matches, setMatches] = useState<Record<string, ScoredSpecialist[]>>({});
    const { role, currentUser } = useRole();
    const [isMounted, setIsMounted] = useState(false);
    const { t } = useLanguage();
    const { toast } = useToast(); // Added hook

    // Admin Filters
    const [customerFilter, setCustomerFilter] = useState<string[]>([]);
    const [openCustomer, setOpenCustomer] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
    const [openCategory, setOpenCategory] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsMounted(true);
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const handleStatusChange = (id: string, newStatus: RequestStatus) => {
        const request = requests.find(r => r.id === id);
        if (request) {
            updateRequest({ ...request, status: newStatus });
        }
    };

    const [matchingRequest, setMatchingRequest] = useState<Request | null>(null);

    const handleFindMatch = (request: Request) => {
        setMatchingRequest(request);
    };

    const handleConfirmMatch = (specialistId: string) => {
        if (matchingRequest) {
            updateRequest({
                ...matchingRequest,
                assignedSpecialistId: specialistId,
                status: "Submitted for Review"
            });
            setMatchingRequest(null);
        }
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        // Validation for moving to Matched
        // Validation for moving to Submitted for Review
        if (destination.droppableId === "Submitted for Review") {
            const request = requests.find(r => r.id === draggableId);
            if (request && !request.assignedSpecialistId) {
                toast({
                    title: "Cannot move to Submitted for Review",
                    description: "You must assign a specialist before moving a request to this status.",
                    variant: "destructive"
                });
                return;
            }
        }

        // Update status based on column
        handleStatusChange(draggableId, destination.droppableId as RequestStatus);
    };

    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

    const handleRequestClick = (request: Request) => {
        setSelectedRequestId(request.id);
    };

    const handleUpdateActiveRequest = (updatedRequest: Request) => {
        updateRequest(updatedRequest);
    };

    // Filter requests based on role and current user
    const filteredRequests = requests.filter((req) => {
        if (!currentUser) return false;

        if (role === "Admin") {
            const matchesCustomer = customerFilter.length === 0 || (req.creatorId && customerFilter.includes(req.creatorId));
            const matchesCategory = categoryFilter.length === 0 || (req.category && categoryFilter.includes(req.category));
            return matchesCustomer && matchesCategory;
        }

        // Customers/Guests see their own requests
        if (role === "Customer" || role === "Guest") return req.creatorId === currentUser.id;

        // Specialists see Matched/Active gigs assigned to them
        if (role === "Specialist") {
            // "New" matches (Potential Gigs) OR Active/Completed gigs
            return (req.status === "Submitted for Review" && req.assignedSpecialistId === currentUser.id) ||
                (req.assignedSpecialistId === currentUser.id);
        }
        return false;
    });

    // Specialist View: Map "Submitted for Review" (Matched) to "New" column
    const getVisualColumn = (req: Request): RequestStatus => {
        if (role === "Specialist" && req.status === "Submitted for Review") {
            return "New";
        }
        // Customers/Guests see their feedback as "Under Review" (Submitted for Review)
        if ((role === "Customer" || role === "Guest") && req.status === "New" && req.tags?.includes("Feedback")) {
            return "Submitted for Review";
        }
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

    if (!isMounted) {
        return <div className="container py-6">Loading board...</div>;
    }

    const getStatusColor = (status: RequestStatus) => {
        switch (status) {
            case "New":
                return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
            case "Scope Refinement Required":
            case "Submitted for Review":
                return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
            case "Scope Approved":
            case "Active Efforts":
                return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
            case "Done":
                return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
            default:
                return "bg-slate-500/10 text-slate-500";
        }
    };

    const getColumnTitle = (status: string) => {
        switch (status) {
            case "New": return role === "Specialist" ? "New Opportunity" : t.board.new;
            case "Submitted for Review": return "Submitted for Review";
            case "Scope Refinement Required": return "Scope Refinement Required";
            case "Scope Approved": return "Scope Approved";
            case "Active Efforts": return "Active Efforts";
            case "Done": return "Done";
            default: return status;
        }
    };

    return (
        <div className="container py-6 relative">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">{t.board.title}</h1>
                {(role === "Customer" || role === "Admin" || role === "Guest") && (
                    <Link href="/requests/new">
                        <Button>{t.board.new}</Button>
                    </Link>
                )}
            </div>

            {role === "Admin" && (
                <div className="flex gap-4 mb-6">
                    <div className="w-[250px]">
                        <Popover open={openCustomer} onOpenChange={setOpenCustomer}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCustomer}
                                    className="w-full justify-between"
                                >
                                    {customerFilter.length > 0
                                        ? `${customerFilter.length} Selected`
                                        : "Filter by Customer..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search customer..." />
                                    <CommandList>
                                        <CommandEmpty>No customer found.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="all"
                                                onSelect={() => {
                                                    setCustomerFilter([]);
                                                    setOpenCustomer(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        customerFilter.length === 0 ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                All Customers
                                            </CommandItem>
                                            {mockUsers.filter(u => u.role === "Customer").map((customer) => (
                                                <CommandItem
                                                    key={customer.id}
                                                    value={customer.name}
                                                    onSelect={() => {
                                                        setCustomerFilter(prev =>
                                                            prev.includes(customer.id)
                                                                ? prev.filter(id => id !== customer.id)
                                                                : [...prev, customer.id]
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            customerFilter.includes(customer.id) ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {customer.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="w-[250px]">
                        <Popover open={openCategory} onOpenChange={setOpenCategory}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCategory}
                                    className="w-full justify-between"
                                >
                                    {categoryFilter.length > 0
                                        ? `${categoryFilter.length} Selected`
                                        : "Filter by Category..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search category..." />
                                    <CommandList>
                                        <CommandEmpty>No category found.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="all"
                                                onSelect={() => {
                                                    setCategoryFilter([]);
                                                    setOpenCategory(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        categoryFilter.length === 0 ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                All Categories
                                            </CommandItem>
                                            {["IT", "CRM", "Architecture", "Finance", "Other"].map((category) => (
                                                <CommandItem
                                                    key={category}
                                                    value={category}
                                                    onSelect={() => {
                                                        setCategoryFilter(prev =>
                                                            prev.includes(category)
                                                                ? prev.filter(c => c !== category)
                                                                : [...prev, category]
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            categoryFilter.includes(category) ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {category}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            )}

            {/* Specialist View: Potential Gigs Section Removed */}

            <div className="flex">
                <div className="flex-1 transition-all duration-300">
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                            {columns.map((status) => (
                                <div key={status} className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-sm truncate" title={getColumnTitle(status)}>{getColumnTitle(status)}</h2>
                                        <span className="text-xs text-muted-foreground">
                                            {filteredRequests.filter((r) => getVisualColumn(r) === status).length}
                                        </span>
                                    </div>
                                    <Droppable droppableId={status}>
                                        {(provided) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className="bg-muted/50 rounded-lg p-4 min-h-[500px] space-y-4"
                                            >
                                                {filteredRequests
                                                    .filter((req) => getVisualColumn(req) === status)
                                                    .map((request, index) => (
                                                        <Draggable
                                                            key={request.id}
                                                            draggableId={request.id}
                                                            index={index}
                                                        >
                                                            {(provided) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    {...provided.dragHandleProps}
                                                                    onClick={() => handleRequestClick(request)}
                                                                >
                                                                    <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedRequestId === request.id ? 'ring-2 ring-primary' : ''} ${request.actionNeeded && (role === "Customer" || role === "Guest" || role === "Admin") ? 'border-l-4 border-l-yellow-500' : ''}`}>
                                                                        <CardHeader className="p-4 pb-2">
                                                                            <div className="flex justify-between items-start">
                                                                                <CardTitle className="text-base font-medium leading-tight">
                                                                                    {request.title}
                                                                                </CardTitle>
                                                                                <Badge
                                                                                    variant="secondary"
                                                                                    className={getStatusColor(
                                                                                        request.status
                                                                                    )}
                                                                                >
                                                                                    {request.status}
                                                                                </Badge>
                                                                            </div>
                                                                        </CardHeader>
                                                                        <CardContent className="p-4 pt-2">
                                                                            {role === "Admin" && request.creatorId && (
                                                                                <div className="mb-2 text-xs text-blue-600 font-medium">
                                                                                    Requested by: {
                                                                                        (() => {
                                                                                            const lowerId = request.creatorId.toLowerCase();
                                                                                            const u = mockUsers.find(u => u.id.toLowerCase() === lowerId || u.email?.toLowerCase() === lowerId);
                                                                                            if (u) return u.company || u.name;

                                                                                            if (request.creatorId.includes('@')) {
                                                                                                const prefix = request.creatorId.split('@')[0];
                                                                                                if (prefix.toLowerCase().startsWith('c')) return "Customer " + prefix.slice(1);
                                                                                                return prefix.charAt(0).toUpperCase() + prefix.slice(1);
                                                                                            }
                                                                                            return request.creatorId.charAt(0).toUpperCase() + request.creatorId.slice(1);
                                                                                        })()
                                                                                    }
                                                                                </div>
                                                                            )}
                                                                            {request.actionNeeded && (role === "Customer" || role === "Guest" || role === "Admin") && (
                                                                                <div className="mb-2 text-xs font-semibold text-yellow-600 flex items-center bg-yellow-50 p-1.5 rounded">
                                                                                    <Info className="w-3 h-3 mr-1" />
                                                                                    Action Needed
                                                                                </div>
                                                                            )}
                                                                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                                                                {request.description}
                                                                            </p>
                                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                                <span>{request.industry}</span>
                                                                                <span>{request.budget}</span>
                                                                            </div>
                                                                        </CardContent>
                                                                        {role === "Admin" && (request.status === "New" || request.status === "Submitted for Review") && !request.assignedSpecialistId && (
                                                                            <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                                                                                <Button
                                                                                    size="sm"
                                                                                    className="w-full"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        handleFindMatch(request);
                                                                                    }}
                                                                                >
                                                                                    Find Match
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                        {/* Customer Submit Button */}
                                                                        {(role === "Customer" || role === "Guest") && request.status === "New" && request.creatorId === currentUser?.id && (
                                                                            <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                                                                                <Button
                                                                                    size="sm"
                                                                                    className="w-full"
                                                                                    variant="secondary"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        handleRequestClick(request);
                                                                                    }}
                                                                                >
                                                                                    Submit for Review
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </Card>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            ))}
                        </div>
                    </DragDropContext>
                </div>
            </div>

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

