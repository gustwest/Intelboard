"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RatingStars } from "@/components/rating-stars";
import { rateCategorySkill, addCategoryExperience } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Award, MessageSquare } from "lucide-react";

interface ExperiencePromptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The category slug to save the experience against */
    categorySlug: string;
    /** Display name of the context (event title or category name) */
    contextName: string;
    /** "event" or "category" */
    contextType: "event" | "category";
}

export function ExperiencePromptDialog({
    open, onOpenChange, categorySlug, contextName, contextType,
}: ExperiencePromptDialogProps) {
    const { toast } = useToast();
    const [skillLevel, setSkillLevel] = useState(0);
    const [experience, setExperience] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (skillLevel === 0 && !experience.trim()) {
            onOpenChange(false);
            return;
        }

        setIsSubmitting(true);
        try {
            if (skillLevel > 0) {
                await rateCategorySkill(categorySlug, skillLevel);
            }
            if (experience.trim()) {
                await addCategoryExperience(categorySlug, `Experience in ${contextName}`, experience.trim());
            }
            toast({
                title: "Experience Shared",
                description: "Your expertise has been added to your profile.",
            });
            onOpenChange(false);
            setSkillLevel(0);
            setExperience("");
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to save. Try again later.", variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-amber-500" />
                        Share Your Expertise
                    </DialogTitle>
                    <DialogDescription>
                        You just joined <span className="font-medium text-foreground">{contextName}</span>. How well do you know this subject? Your input helps the community and builds your profile.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 pt-2">
                    {/* Skill Level */}
                    <div>
                        <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                            <Award className="h-3.5 w-3.5 text-amber-500" /> How well do you know this subject?
                        </Label>
                        <div className="flex items-center gap-3">
                            <RatingStars value={skillLevel} onChange={setSkillLevel} size="lg" />
                            <span className="text-xs text-muted-foreground">
                                {skillLevel === 0 && "Select your level"}
                                {skillLevel === 1 && "Beginner"}
                                {skillLevel === 2 && "Basic"}
                                {skillLevel === 3 && "Intermediate"}
                                {skillLevel === 4 && "Advanced"}
                                {skillLevel === 5 && "Expert"}
                            </span>
                        </div>
                    </div>

                    {/* Experience Text */}
                    <div>
                        <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                            <MessageSquare className="h-3.5 w-3.5 text-blue-500" /> Share your experience (optional)
                        </Label>
                        <textarea
                            value={experience}
                            onChange={e => setExperience(e.target.value)}
                            placeholder={`E.g. "Led a migration project using this tech at Company X..." or "Evaluated multiple tools in this space for our team..."`}
                            className="w-full text-sm bg-muted/30 border rounded-lg p-3 min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 gap-2">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                            Save to Profile
                        </Button>
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                            Skip
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
