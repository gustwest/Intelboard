import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Loader2, Mail, Text, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface SmartImportProps {
    onImport: (data: {
        title: string;
        description: string;
        urgency: "Low" | "Medium" | "High" | "Critical";
        attributes: Record<string, string>;
    }) => void;
}

export function SmartImport({ onImport }: SmartImportProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [mode, setMode] = useState<"drop" | "text">("drop");

    const processContent = async (content: string, filename?: string) => {
        setIsProcessing(true);

        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mock AI extraction logic
        const lowerContent = content.toLowerCase();
        let title = filename ? filename.split(".")[0] : "New Request";
        let urgency: "Low" | "Medium" | "High" | "Critical" = "Medium";
        const attributes: Record<string, string> = {};

        // Extract Title from text if possible
        if (!filename) {
            const lines = content.split('\n');
            if (lines.length > 0 && lines[0].length < 100) {
                title = lines[0].trim();
            }
        }

        // Extract Urgency
        if (lowerContent.includes("urgent") || lowerContent.includes("crash") || lowerContent.includes("critical") || lowerContent.includes("immediately")) {
            urgency = "Critical";
        } else if (lowerContent.includes("asap") || lowerContent.includes("high priority") || lowerContent.includes("important")) {
            urgency = "High";
        }

        // Mock Attribute Extraction
        if (lowerContent.includes("budget")) {
            const budgetMatch = content.match(/budget[:\s]+([$€£]?\d+[\d,.]*k?)/i);
            if (budgetMatch) attributes["Budget"] = budgetMatch[1];
        }

        if (lowerContent.includes("timeline") || lowerContent.includes("deadline")) {
            const timelineMatch = content.match(/(?:timeline|deadline)[:\s]+([^.\n]+)/i);
            if (timelineMatch) attributes["Timeline"] = timelineMatch[1].trim();
        }

        if (lowerContent.includes("tech stack") || lowerContent.includes("technologies")) {
            const techMatch = content.match(/(?:tech stack|technologies)[:\s]+([^.\n]+)/i);
            if (techMatch) attributes["Tech Stack"] = techMatch[1].trim();
        }

        if (lowerContent.includes("compliance")) {
            attributes["Compliance"] = "Required";
        }

        // Auto-extract "As a... I want... So that..." for user story if present
        let description = content;
        if (!lowerContent.includes("as a") && !lowerContent.includes("i want")) {
            description = `Based on the input, here is a suggested User Story:\n\n**As a** [User Role]\n**I want** to ${title.toLowerCase()}\n**So that** I can [Benefit]\n\nOriginal Input:\n${content}`;
        }

        onImport({ title, description, urgency, attributes });
        setIsProcessing(false);
        setTextInput("");
        setMode("drop");
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        // In a real app, we'd read the file content here
        // For mock, we just use filename
        processContent(`Imported content from ${acceptedFiles[0].name}`, acceptedFiles[0].name);
    }, []);

    const handleTextSubmit = () => {
        if (!textInput.trim()) return;
        processContent(textInput);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/plain': ['.txt', '.md'],
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'message/rfc822': ['.eml', '.msg']
        },
        maxFiles: 1
    });

    if (isProcessing) {
        return (
            <Card className="border-dashed h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4 text-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <div className="space-y-1">
                        <p className="font-medium flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                            AI is analyzing content...
                        </p>
                        <p className="text-xs text-muted-foreground">Extracting requirements, categories, and user stories</p>
                    </div>
                </div>
            </Card>
        )
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex border-b">
                <button
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors hover:bg-slate-50",
                        mode === "drop" ? "bg-slate-50 border-b-2 border-primary text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => setMode("drop")}
                >
                    <div className="flex items-center justify-center gap-2">
                        <Upload className="h-4 w-4" />
                        File Upload
                    </div>
                </button>
                <button
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors hover:bg-slate-50",
                        mode === "text" ? "bg-slate-50 border-b-2 border-primary text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => setMode("text")}
                >
                    <div className="flex items-center justify-center gap-2">
                        <Text className="h-4 w-4" />
                        Free Text / Paste
                    </div>
                </button>
            </div>

            <CardContent className="p-6">
                {mode === "drop" ? (
                    <div
                        {...getRootProps()}
                        className={cn(
                            "border-2 border-dashed rounded-lg h-[150px] flex flex-col items-center justify-center cursor-pointer transition-colors",
                            isDragActive ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="p-3 rounded-full bg-primary/10 mb-3">
                            <Upload className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium">Drag & drop files here</p>
                        <p className="text-xs text-muted-foreground mt-1">Emails (.eml), Docs (.pdf, .docx), Text</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="smart-text" className="sr-only">Paste content</Label>
                            <Textarea
                                id="smart-text"
                                placeholder="Paste email thread, project brief, or rough notes here..."
                                className="min-h-[120px]"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={handleTextSubmit}
                            disabled={!textInput.trim()}
                            className="w-full gap-2"
                        >
                            <Sparkles className="h-4 w-4" />
                            Smart Extract
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
