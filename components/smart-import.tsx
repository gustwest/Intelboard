"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartImportProps {
    onImport: (data: { title: string; description: string; urgency: "Low" | "Medium" | "High" | "Critical" }) => void;
}

export function SmartImport({ onImport }: SmartImportProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setIsProcessing(true);
        const file = acceptedFiles[0];

        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mock AI extraction logic based on filename or content simulation
        const title = file.name.split(".")[0]; // Remove extension
        let description = "Auto-generated description from imported file content...";
        let urgency: "Low" | "Medium" | "High" | "Critical" = "Medium";

        // Simple keyword matching simulation
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes("urgent") || lowerName.includes("crash") || lowerName.includes("critical")) {
            urgency = "Critical";
        } else if (lowerName.includes("asap") || lowerName.includes("important")) {
            urgency = "High";
        }

        if (lowerName.includes("email") || lowerName.includes("thread")) {
            description = "Imported from email thread:\n\nSubject: " + title + "\n\nFrom: Stakeholder <stakeholder@company.com>\n\nHi team, we need to address this immediately...";
        }

        onImport({ title, description, urgency });
        setIsProcessing(false);
    }, [onImport]);

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

    return (
        <Card className={cn(
            "border-dashed transition-colors cursor-pointer",
            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
        )}>
            <CardContent
                {...getRootProps()}
                className="flex flex-col items-center justify-center py-10 text-center space-y-4"
            >
                <input {...getInputProps()} />

                {isProcessing ? (
                    <>
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <div className="space-y-1">
                            <p className="font-medium">Analyzing content...</p>
                            <p className="text-xs text-muted-foreground">Extracting requirements and urgency</p>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-4 rounded-full bg-primary/10">
                            <Upload className="h-8 w-8 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium">Smart Import</p>
                            <p className="text-sm text-muted-foreground max-w-xs">
                                Drag & drop email threads (.eml, .msg) or documents here to auto-fill the request.
                            </p>
                        </div>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center"><Mail className="h-3 w-3 mr-1" /> Emails</span>
                            <span className="flex items-center"><FileText className="h-3 w-3 mr-1" /> Docs</span>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
