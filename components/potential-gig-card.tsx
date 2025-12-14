"use client";

import { Request } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Briefcase, MapPin, DollarSign, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface PotentialGigCardProps {
    request: Request;
    onAccept: (request: Request) => void;
    onAskDetails: (request: Request, note: string) => void;
}

export function PotentialGigCard({ request, onAccept, onAskDetails }: PotentialGigCardProps) {
    const [isAsking, setIsAsking] = useState(false);
    const [note, setNote] = useState("");

    const handleAsk = () => {
        onAskDetails(request, note);
        setIsAsking(false);
        setNote("");
    };

    return (
        <Card className="w-full transition-all hover:shadow-lg border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <Badge variant="outline" className="mb-2 bg-blue-50 text-blue-700 border-blue-200">
                            Potential Gig
                        </Badge>
                        <CardTitle className="text-xl mb-1">{request.title}</CardTitle>
                        <CardDescription>{request.industry} • Posted {new Date(request.createdAt).toLocaleDateString()}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="text-sm text-foreground/80 mb-4 line-clamp-3">
                    {request.description}
                </p>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-4">
                    {request.budget && (
                        <div className="flex items-center">
                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                            {request.budget}
                        </div>
                    )}
                    <div className="flex items-center">
                        <Briefcase className="w-3.5 h-3.5 mr-1" />
                        Remote / Hybrid
                    </div>
                    <div className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        Start ASAP
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {request.tags?.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                        </Badge>
                    ))}
                </div>
            </CardContent>

            <CardFooter className="pt-0 flex-col items-stretch gap-3">
                {isAsking ? (
                    <div className="w-full space-y-3 animate-in fade-in slide-in-from-top-2">
                        <Textarea
                            placeholder="What would you like to know?"
                            className="min-h-[80px]"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setIsAsking(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleAsk} disabled={!note.trim()}>
                                Send Question
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-3 w-full">
                        <Button className="flex-1" onClick={() => onAccept(request)}>
                            Accept Gig
                        </Button>
                        <Button variant="outline" className="flex-1" onClick={() => setIsAsking(true)}>
                            Ask for Details
                        </Button>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}
