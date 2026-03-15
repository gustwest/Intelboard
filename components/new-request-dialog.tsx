"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Request, RequestStatus, RequestType, REQUEST_TYPE_CONFIG } from "@/lib/data";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { Plus, ArrowLeft, ChevronDown, ChevronUp, X, Tag, Calendar, DollarSign, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewRequestDialogProps {
    trigger?: React.ReactNode;
}

const SKILL_CATEGORIES = [
    "Development", "Design", "Project Management", "Leadership",
    "Data Science", "Cloud", "Methodologies", "Languages", "Tools", "General"
];

export function NewRequestDialog({ trigger }: NewRequestDialogProps) {
    const { addRequest } = useRequests();
    const { currentUser } = useRole();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<"type" | "details">("type");
    const [selectedType, setSelectedType] = useState<RequestType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showMore, setShowMore] = useState(false);

    // Core fields
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        industry: "",
        urgency: "Medium" as "Low" | "Medium" | "High" | "Critical",
    });

    // Extended fields (hidden by default)
    const [budget, setBudget] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
    const [newCriterion, setNewCriterion] = useState("");


    // Reset when dialog closes
    useEffect(() => {
        if (!open) {
            setStep("type");
            setSelectedType(null);
            setShowMore(false);
            setFormData({ title: "", description: "", industry: "", urgency: "Medium" });
            setBudget(""); setStartDate(""); setEndDate("");
            setAcceptanceCriteria([]); setNewCriterion("");
        }
    }, [open]);

    const handleSelectType = (type: RequestType) => {
        setSelectedType(type);
        setStep("details");
    };

    const handleAddCriterion = () => {
        if (newCriterion.trim()) {
            setAcceptanceCriteria([...acceptanceCriteria, newCriterion.trim()]);
            setNewCriterion("");
        }
    };



    const handleSubmit = async () => {
        if (!currentUser || !selectedType || !formData.title.trim()) return;
        setIsLoading(true);

        try {
            const newRequest: Request = {
                id: `r${Date.now()}`,
                title: formData.title,
                description: formData.description,
                status: "New" as RequestStatus,
                requestType: selectedType,
                industry: formData.industry || "Other",
                budget: budget || "",
                tags: [],
                createdAt: new Date().toISOString(),
                urgency: formData.urgency,
                creatorId: currentUser.id,
                acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [],
                acStatus: "Draft",
                attachments: [],
                attributes: {},
                startDate: startDate || undefined,
                endDate: endDate || undefined,
            };

            await addRequest(newRequest);
            setOpen(false);
        } catch (error) {
            console.error("Failed to create request:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const typeConfig = selectedType ? REQUEST_TYPE_CONFIG[selectedType] : null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button><Plus className="h-4 w-4 mr-2" /> New Request</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px] p-0 gap-0 overflow-hidden">
                {step === "type" ? (
                    <>
                        <DialogHeader className="p-6 pb-2">
                            <DialogTitle className="text-xl text-foreground">What do you need?</DialogTitle>
                            <p className="text-sm text-muted-foreground">Choose the type of request to get started</p>
                        </DialogHeader>
                        <div className="p-6 pt-4 grid grid-cols-2 gap-3">
                            {(Object.entries(REQUEST_TYPE_CONFIG) as [RequestType, typeof REQUEST_TYPE_CONFIG[RequestType]][]).map(([type, config]) => (
                                <button
                                    key={type}
                                    onClick={() => handleSelectType(type)}
                                    className={cn(
                                        "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                                        "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                                        config.border, config.bg,
                                        "hover:border-opacity-100"
                                    )}
                                >
                                    <span className="text-2xl">{config.icon}</span>
                                    <span className={cn("font-semibold text-sm", config.color)}>{config.label}</span>
                                    <span className="text-xs text-muted-foreground leading-tight">{config.description}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader className="p-6 pb-3 border-b">
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStep("type")}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{typeConfig?.icon}</span>
                                    <DialogTitle className="text-lg text-foreground">{typeConfig?.label}</DialogTitle>
                                    <Badge variant="outline" className={cn("text-xs", typeConfig?.color, typeConfig?.border)}>
                                        {selectedType}
                                    </Badge>
                                </div>
                            </div>
                        </DialogHeader>
                        <ScrollArea className="max-h-[65vh]">
                            <div className="p-6 space-y-4">
                                {/* === CORE FIELDS (always visible) === */}
                                <div className="space-y-2">
                                    <Label htmlFor="req-title" className="text-foreground">Title *</Label>
                                    <Input
                                        id="req-title"
                                        placeholder="e.g., Digital Transformation Strategy"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="req-desc" className="text-foreground">Description</Label>
                                    <Textarea
                                        id="req-desc"
                                        placeholder="Describe what you need..."
                                        className="min-h-[80px]"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="req-industry" className="text-foreground">Industry</Label>
                                        <Input
                                            id="req-industry"
                                            placeholder="e.g. Finance"
                                            value={formData.industry}
                                            onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-foreground">Urgency</Label>
                                        <Select
                                            value={formData.urgency}
                                            onValueChange={(val) => setFormData({ ...formData, urgency: val as any })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Low">Low</SelectItem>
                                                <SelectItem value="Medium">Medium</SelectItem>
                                                <SelectItem value="High">High</SelectItem>
                                                <SelectItem value="Critical">Critical</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>


                                {/* === MORE DETAILS TOGGLE === */}
                                <button
                                    type="button"
                                    onClick={() => setShowMore(!showMore)}
                                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors w-full py-2"
                                >
                                    {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    {showMore ? "Hide details" : "More details"}
                                    {!showMore && (budget || startDate || endDate || acceptanceCriteria.length > 0) && (
                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-medium">
                                            has data
                                        </span>
                                    )}
                                </button>

                                {showMore && (
                                    <div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        {/* Budget */}
                                        <div className="space-y-2">
                                            <Label className="text-foreground flex items-center gap-1.5">
                                                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                                Budget
                                            </Label>
                                            <Input
                                                placeholder="e.g. $50,000 or €10k-€20k"
                                                value={budget}
                                                onChange={(e) => setBudget(e.target.value)}
                                            />
                                        </div>

                                        {/* Timeline */}
                                        <div className="space-y-2">
                                            <Label className="text-foreground flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5 text-blue-500" />
                                                Timeline
                                            </Label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <span className="text-[11px] text-muted-foreground">Start date</span>
                                                    <Input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={(e) => setStartDate(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[11px] text-muted-foreground">End date</span>
                                                    <Input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={(e) => setEndDate(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>



                                        {/* Acceptance Criteria */}
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Acceptance Criteria</Label>
                                            {acceptanceCriteria.length > 0 && (
                                                <div className="space-y-1.5 mb-2">
                                                    {acceptanceCriteria.map((criterion, idx) => (
                                                        <div key={idx} className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2 text-sm group">
                                                            <span className="text-muted-foreground text-xs mt-0.5 shrink-0">{idx + 1}.</span>
                                                            <span className="flex-1 text-foreground/90">{criterion}</span>
                                                            <button
                                                                onClick={() => setAcceptanceCriteria(acceptanceCriteria.filter((_, i) => i !== idx))}
                                                                className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Add a criterion..."
                                                    value={newCriterion}
                                                    onChange={(e) => setNewCriterion(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCriterion())}
                                                    className="flex-1"
                                                />
                                                <Button size="sm" variant="secondary" onClick={handleAddCriterion} disabled={!newCriterion.trim()}>
                                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                        <div className="p-4 border-t bg-muted/30 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={isLoading || !formData.title.trim()}
                            >
                                {isLoading ? "Creating..." : "Create Request"}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
