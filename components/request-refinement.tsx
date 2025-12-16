"use client";

import { useState, useEffect } from "react";
import { Request } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MessageSquare, Target, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RequestRefinementProps {
    request: Request;
    onUpdate: (updatedRequest: Request) => void;
}

export function RequestRefinement({ request, onUpdate }: RequestRefinementProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [clarifications, setClarifications] = useState<{ question: string; options: string[] }[]>([]);
    const [outcomes, setOutcomes] = useState<string[]>([]);
    const [answers, setAnswers] = useState<Record<number, string>>({});

    // Check if request is recently created (e.g., within last 5 minutes)
    const isNew = new Date().getTime() - new Date(request.createdAt).getTime() < 5 * 60 * 1000;

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        // Simulate AI analysis delay
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setClarifications([
            {
                question: "What is the expected timeline for this initiative?",
                options: ["Urgent (< 1 month)", "1-3 Months", "3-6 Months", "Flexible"]
            },
            {
                question: "Who are the primary stakeholders for sign-off?",
                options: ["CTO/CIO", "Project Manager", "Procurement", "Board"]
            }
        ]);

        setOutcomes([
            "A documented roadmap for implementation",
            "Cost-benefit analysis report",
            "Vendor selection matrix"
        ]);

        setIsAnalyzing(false);
        setShowResults(true);
    };

    useEffect(() => {
        if (isNew && !showResults && !isAnalyzing) {
            const timer = setTimeout(() => {
                handleAnalyze();
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isNew, showResults, isAnalyzing]);

    const handleAnswerChange = (index: number, value: string) => {
        setAnswers(prev => ({ ...prev, [index]: value }));
    };

    const handleSubmitAnswer = (index: number, question: string) => {
        const answer = answers[index];
        if (!answer) return;

        const updatedDescription = `${request.description}\n\n[Clarification]: ${question}\n[Answer]: ${answer}`;
        onUpdate({ ...request, description: updatedDescription });

        // Remove the question from the list
        setClarifications(prev => prev.filter((_, i) => i !== index));
        const newAnswers = { ...answers };
        delete newAnswers[index];
        setAnswers(newAnswers);
    };

    const handleAddOutcome = (outcome: string) => {
        const updatedAC = [...(request.acceptanceCriteria || []), outcome];
        onUpdate({ ...request, acceptanceCriteria: updatedAC });
        setOutcomes(prev => prev.filter(o => o !== outcome));
    };

    if (request.status !== "New") return null;

    return (
        <div className="space-y-6">
            {isNew && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 p-4 rounded-lg flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0">
                        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-green-800 dark:text-green-300">Request Submitted Successfully!</h3>
                        <p className="text-sm text-green-700 dark:text-green-400">
                            Thank you for the submitted request. To get a better match and expectations, we&apos;d suggest you compliment with some additional information.
                        </p>
                    </div>
                </div>
            )}

            <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-900/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <Sparkles className="h-5 w-5" />
                        AI Refinement
                    </CardTitle>
                    <CardDescription>
                        Get AI suggestions to clarify your request and define clear outcomes.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isAnalyzing ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Sparkles className="h-5 w-5 mr-2 animate-pulse" />
                            Analyzing request...
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <AnimatePresence>
                                {clarifications.length > 0 && (
                                    <motion.div
                                        key="clarifications"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="space-y-4"
                                    >
                                        <h4 className="font-semibold flex items-center gap-2 text-sm">
                                            <MessageSquare className="h-4 w-4 text-blue-500" />
                                            Clarifying Questions
                                        </h4>
                                        <div className="grid gap-4">
                                            {clarifications.map((item, i) => (
                                                <div key={i} className="p-4 bg-background rounded-md border space-y-3">
                                                    <p className="font-medium text-sm">{item.question}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.options.map((opt) => (
                                                            <Badge
                                                                key={opt}
                                                                variant="secondary"
                                                                className="cursor-pointer hover:bg-secondary/80"
                                                                onClick={() => handleAnswerChange(i, opt)}
                                                            >
                                                                {opt}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                            placeholder="Type your answer..."
                                                            value={answers[i] || ""}
                                                            onChange={(e) => handleAnswerChange(i, e.target.value)}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleSubmitAnswer(i, item.question)}
                                                            disabled={!answers[i]}
                                                        >
                                                            Save
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {outcomes.length > 0 && (
                                    <motion.div
                                        key="outcomes"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="space-y-3"
                                    >
                                        <h4 className="font-semibold flex items-center gap-2 text-sm">
                                            <Target className="h-4 w-4 text-green-500" />
                                            Suggested Outcomes
                                        </h4>
                                        <div className="grid gap-2">
                                            {outcomes.map((o, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-background rounded-md border text-sm">
                                                    <span>{o}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleAddOutcome(o)}
                                                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                    >
                                                        <Plus className="h-4 w-4 mr-1" /> Add as Criteria
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {(clarifications.length === 0 && outcomes.length === 0) && (
                                <div className="text-center text-muted-foreground text-sm py-4">
                                    <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                    All suggestions applied!
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
