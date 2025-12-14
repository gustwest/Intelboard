"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Request, specialists } from "@/lib/data";
import { findMatches, ScoredSpecialist } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Star, Info } from "lucide-react";

interface MatchingDialogProps {
    request: Request | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (specialistId: string) => void;
}

export function MatchingDialog({ request, open, onOpenChange, onConfirm }: MatchingDialogProps) {
    const [matches, setMatches] = useState<ScoredSpecialist[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Run matching when dialog opens
    useEffect(() => {
        if (open && request) {
            const found = findMatches(request, specialists);
            setMatches(found);
            setSelectedId(null); // Reset selection
        }
    }, [open, request]);

    const handleConfirm = () => {
        if (selectedId) {
            onConfirm(selectedId);
            onOpenChange(false);
        }
    };

    if (!request) return null;

    const topPicks = matches.slice(0, 3);
    const otherMatches = matches.slice(3, 20);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Find Specialist for "{request.title}"</DialogTitle>
                    <DialogDescription>
                        AI-powered matching based on 50+ vetted specialists.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2">
                    {matches.length === 0 && (
                        <>
                            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-b mb-6">
                                <div className="rounded-full bg-muted p-4 mb-4">
                                    <Info className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">No Matches Found</h3>
                                <p className="max-w-xs mx-auto">
                                    We couldn't find any specialists matching your criteria. Try adjusting your request details or tags.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Other Available Candidates</h3>
                                <div className="space-y-2">
                                    {specialists
                                        .slice(0, 20)
                                        .sort((a, b) => b.rating - a.rating)
                                        .map((specialist) => (
                                            <div
                                                key={specialist.id}
                                                className={`flex items-center p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === specialist.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-100"
                                                    }`}
                                                onClick={() => setSelectedId(specialist.id)}
                                            >
                                                <Avatar className="h-9 w-9 mr-3">
                                                    <AvatarFallback className="text-xs">{specialist.name.substring(0, 2)}</AvatarFallback>
                                                </Avatar>

                                                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                                                    <div className="col-span-4">
                                                        <h4 className="text-sm font-medium truncate">{specialist.name}</h4>
                                                        <p className="text-xs text-muted-foreground truncate">{specialist.role}</p>
                                                    </div>

                                                    <div className="col-span-6 flex flex-wrap gap-1">
                                                        {specialist.skills.slice(0, 3).map((skill, i) => (
                                                            <Badge key={i} variant="outline" className="text-[10px] px-1 h-5 font-normal text-muted-foreground truncate max-w-[120px]">
                                                                {skill}
                                                            </Badge>
                                                        ))}
                                                    </div>

                                                    <div className="col-span-2 text-right">
                                                        <div className="flex items-center justify-end space-x-1">
                                                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                                            <span className="text-sm font-medium text-slate-600">
                                                                {specialist.rating}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {selectedId === specialist.id && (
                                                    <Check className="h-4 w-4 text-primary ml-4" />
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </>
                    )}

                    {matches.length > 0 && (
                        <div className="space-y-6">
                            {/* Top 3 Picks */}
                            <div>
                                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center">
                                    <Star className="w-4 h-4 mr-2 text-yellow-500 fill-yellow-500" />
                                    Top 3 Picks
                                </h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    {topPicks.map((match) => (
                                        <div
                                            key={match.id}
                                            className={`relative flex flex-col rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-lg ${selectedId === match.id ? "border-primary bg-primary/5" : "border-slate-100 hover:border-slate-200"
                                                }`}
                                            onClick={() => setSelectedId(match.id)}
                                        >
                                            {selectedId === match.id && (
                                                <div className="absolute top-2 right-2 text-primary">
                                                    <Check className="h-5 w-5" />
                                                </div>
                                            )}

                                            <div className="flex items-center space-x-3 mb-3">
                                                <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                                                    <AvatarImage src={`/avatars/${match.id}.png`} />
                                                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                                        {match.name.substring(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h4 className="font-bold text-sm line-clamp-1" title={match.name}>{match.name}</h4>
                                                    <Badge variant="secondary" className="text-xs h-5">
                                                        {match.score}% Match
                                                    </Badge>
                                                </div>
                                            </div>

                                            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 h-8">
                                                {match.role}
                                            </p>

                                            <div className="flex flex-wrap gap-1 mt-auto">
                                                {match.skills.slice(0, 3).map(skill => (
                                                    <span key={skill} className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-[10px] text-slate-600 font-medium">
                                                        {skill}
                                                    </span>
                                                ))}
                                                {match.skills.length > 3 && (
                                                    <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-[10px] text-slate-600">
                                                        +{match.skills.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Other Matches List */}
                            {otherMatches.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Other Candidates</h3>
                                    <div className="space-y-2">
                                        {otherMatches.map((match) => (
                                            <div
                                                key={match.id}
                                                className={`flex items-center p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === match.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-100"
                                                    }`}
                                                onClick={() => setSelectedId(match.id)}
                                            >
                                                <Avatar className="h-9 w-9 mr-3">
                                                    <AvatarFallback className="text-xs">{match.name.substring(0, 2)}</AvatarFallback>
                                                </Avatar>

                                                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                                                    <div className="col-span-4">
                                                        <h4 className="text-sm font-medium truncate">{match.name}</h4>
                                                        <p className="text-xs text-muted-foreground truncate">{match.role}</p>
                                                    </div>

                                                    <div className="col-span-6 flex flex-wrap gap-1">
                                                        {match.matchReasons.slice(0, 2).map((reason, i) => (
                                                            <Badge key={i} variant="outline" className="text-[10px] px-1 h-5 font-normal text-muted-foreground truncate max-w-[120px]">
                                                                {reason.replace("match:", "")}
                                                            </Badge>
                                                        ))}
                                                    </div>

                                                    <div className="col-span-2 text-right">
                                                        <span className={`text-sm font-bold ${match.score > 80 ? 'text-green-600' : match.score > 50 ? 'text-blue-600' : 'text-slate-500'}`}>
                                                            {match.score}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {selectedId === match.id && (
                                                    <Check className="h-4 w-4 text-primary ml-4" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedId}>
                        Confirm Match
                    </Button>
                </DialogFooter>
            </DialogContent >
        </Dialog >
    );
}
