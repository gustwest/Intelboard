'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { extractProfileFromFile } from "@/lib/ai-actions";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface SmartImportProps {
    onImport: (data: any) => void;
}

export function SmartImport({ onImport }: SmartImportProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const { toast } = useToast();

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({
                title: "File too large",
                description: "Please upload a file smaller than 5MB.",
                variant: "destructive"
            });
            return;
        }

        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const result = await extractProfileFromFile(formData);

            if (result.success && result.data) {
                toast({
                    title: "Analysis Complete",
                    description: "Your profile has been populated with data from your CV.",
                });
                onImport(result.data);
            } else {
                toast({
                    title: "Analysis Failed",
                    description: result.error || "Could not extract information from this file.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error("Import error:", error);
            toast({
                title: "Error",
                description: "An unexpected error occurred during import.",
                variant: "destructive"
            });
        } finally {
            setIsAnalyzing(false);
        }
    }, [onImport, toast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
        },
        maxFiles: 1,
        disabled: isAnalyzing
    });

    return (
        <Card className="border-dashed border-2 bg-slate-50/50">
            <CardContent className="p-0">
                <div
                    {...getRootProps()}
                    className={cn(
                        "flex flex-col items-center justify-center p-8 cursor-pointer transition-colors min-h-[200px]",
                        isDragActive ? "bg-blue-50/50 border-blue-400" : "hover:bg-slate-100/50",
                        isAnalyzing && "cursor-not-allowed opacity-70"
                    )}
                >
                    <input {...getInputProps()} />

                    {isAnalyzing ? (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                            <div className="space-y-1">
                                <p className="font-medium text-slate-900">Analyzing your document...</p>
                                <p className="text-sm text-slate-500">Extracting skills, experience, and education.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="p-4 bg-white rounded-full shadow-sm">
                                <Upload className="h-6 w-6 text-slate-600" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-medium text-slate-900">
                                    {isDragActive ? "Drop the file here" : "Drag & drop your CV or Personal Letter"}
                                </p>
                                <p className="text-sm text-slate-500">
                                    Supports PDF and DOCX key extraction via AI
                                </p>
                            </div>
                            <Button variant="outline" size="sm" className="mt-2">
                                Browse Files
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
