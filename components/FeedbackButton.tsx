"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Camera, X, Check, Undo, Type, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import * as htmlToImage from "html-to-image";
import { useRole } from "@/components/role-provider";
import { useRequests } from "@/hooks/use-requests";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function FeedbackButton() {
    const { currentUser } = useRole();
    const { addRequest } = useRequests();
    const { toast } = useToast();
    const [isExpanded, setIsExpanded] = useState(false);
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [isCapturing, setIsCapturing] = useState(false);
    const [tool, setTool] = useState<"pencil" | "text">("pencil");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [history, setHistory] = useState<ImageData[]>([]);

    const handleToggle = async () => {
        if (!isExpanded) {
            setIsCapturing(true);
            // Capture before expanding to avoid capturing the expanded form
            try {
                const dataUrl = await htmlToImage.toJpeg(document.body, {
                    pixelRatio: 2,
                    quality: 0.9,
                    filter: (node) => {
                        return (node as HTMLElement).id !== "feedback-floating-container";
                    },
                    backgroundColor: "#ffffff",
                });
                setScreenshot(dataUrl);
                setIsExpanded(true);
            } catch (error) {
                console.error("Screenshot failed", error);
                toast({
                    title: "Screenshot failed",
                    description: "We couldn't capture the screen. You can still send text feedback.",
                    variant: "destructive",
                });
                setIsExpanded(true);
            } finally {
                setIsCapturing(false);
            }
        } else {
            setIsExpanded(false);
        }
    };

    useEffect(() => {
        if (isExpanded && canvasRef.current && screenshot) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                const img = new Image();
                img.onload = () => {
                    const maxWidth = 1360; // 2x of original 680 for sharpness
                    const scale = Math.min(1, maxWidth / img.width);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
                };
                img.src = screenshot;
            }
        }
    }, [isExpanded, screenshot]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (tool !== "pencil") return;
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
            setHistory(prev => [...prev, ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || tool !== "pencil") return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = ("touches" in e ? e.touches[0].clientX : e.clientX);
        const clientY = ("touches" in e ? e.touches[0].clientY : e.clientY);

        // Scale coordinates to canvas internal resolution
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);

        const scale = canvas.width / 680;
        ctx.lineWidth = 3 * scale;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#ef4444";

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const handleTextClick = (e: React.MouseEvent) => {
        if (tool !== "text") return;
        const text = prompt("Enter tag/text:");
        if (!text) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const scale = canvas.width / 680;
        ctx.font = `bold ${Math.round(14 * scale)}px Inter, sans-serif`;
        ctx.fillStyle = "#ef4444";
        ctx.fillText(text, x, y);

        setHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    };

    const undo = () => {
        if (history.length <= 1) return;
        const newHistory = history.slice(0, -1);
        setHistory(newHistory);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
            ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
        }
    };

    const handleSubmit = async () => {
        if (!message.trim()) {
            toast({ title: "Message required", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const finalImage = canvasRef.current?.toDataURL("image/jpeg", 0.9) || screenshot;

            const newFeedbackRequest = {
                id: `fb-${uuidv4().slice(0, 8)}`,
                title: `Feedback: ${message.slice(0, 40)}${message.length > 40 ? "..." : ""}`,
                description: `URL: ${window.location.href}\n\nUser Message: ${message}`,
                status: "New",
                industry: "Other",
                creatorId: currentUser?.id || null,
                tags: ["Feedback"],
                urgency: "Medium",
                category: "Other",
                attachments: finalImage ? [finalImage] : [],
                createdAt: new Date().toISOString(),
            };

            await addRequest(newFeedbackRequest as any);

            toast({
                title: "Feedback sent",
                description: "Thank you for helping us improve Intelboard!",
            });
            setIsExpanded(false);
            setMessage("");
            setScreenshot(null);
        } catch (error) {
            console.error(error);
            toast({ title: "Error sending feedback", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            id="feedback-floating-container"
            className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3"
        >
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="w-[720px] bg-white rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.3)] border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="bg-primary p-4 text-primary-foreground flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Help us improve
                            </h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsExpanded(false)}
                                className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4 overflow-y-auto">
                            <div className="space-y-2">
                                <Label htmlFor="fb-message" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    What's on your mind?
                                </Label>
                                <Textarea
                                    id="fb-message"
                                    placeholder="Tell us what we can improve..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="min-h-[150px] resize-none border-slate-200 focus-visible:ring-primary shadow-sm text-base p-4"
                                />
                            </div>

                            {screenshot && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            Screenshot
                                        </Label>
                                        <div className="flex gap-1">
                                            <Button
                                                size="icon"
                                                variant={tool === "pencil" ? "default" : "outline"}
                                                onClick={() => setTool("pencil")}
                                                className="h-7 w-7"
                                                title="Draw"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant={tool === "text" ? "default" : "outline"}
                                                onClick={() => setTool("text")}
                                                className="h-7 w-7"
                                                title="Add text"
                                            >
                                                <Type className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                onClick={undo}
                                                disabled={history.length <= 1}
                                                className="h-7 w-7"
                                                title="Undo"
                                            >
                                                <Undo className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="relative border rounded-xl overflow-hidden bg-slate-100 flex justify-center group shadow-inner">
                                        <canvas
                                            ref={canvasRef}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            onClick={handleTextClick}
                                            className={cn(
                                                "max-w-full h-auto",
                                                tool === 'pencil' ? 'cursor-crosshair' : 'cursor-text'
                                            )}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium">
                                        Context: {window.location.pathname}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex-1 gap-2 shadow-lg"
                            >
                                {isSubmitting ? "Sending..." : "Submit Feedback"}
                                {!isSubmitting && <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle Button */}
            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                <Button
                    onClick={handleToggle}
                    disabled={isCapturing}
                    className={cn(
                        "h-14 w-14 rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.2)] z-[10000] relative overflow-hidden transition-all duration-300",
                        isExpanded ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-primary text-primary-foreground"
                    )}
                >
                    {isCapturing ? (
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : isExpanded ? (
                        <ChevronDown className="h-6 w-6" />
                    ) : (
                        <MessageSquare className="h-6 w-6" />
                    )}
                </Button>
            </motion.div>
        </div>
    );
}
