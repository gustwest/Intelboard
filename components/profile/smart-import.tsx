'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { extractProfileFromFile, extractProfileFromText } from "@/lib/ai-actions";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface SmartImportProps {
    onImport: (data: any) => void;
}

export function SmartImport({ onImport }: SmartImportProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState("file");
    const [pastedText, setPastedText] = useState("");
    const { toast } = useToast();

    const handleAnalysisResult = (result: any) => {
        if (result.success && result.data) {
            toast({
                title: "Analysis Complete",
                description: "Your profile has been populated with extracted data.",
            });
            onImport(result.data);
        } else {
            toast({
                title: "Analysis Failed",
                description: result.error || "Could not extract information.",
                variant: "destructive"
            });
        }
    };

    const handleTextSubmit = async () => {
        if (!pastedText || pastedText.length < 50) {
            toast({
                title: "Text too short",
                description: "Please paste more content for analysis.",
                variant: "destructive"
            });
            return;
        }

        setIsAnalyzing(true);
        try {
            const result = await extractProfileFromText(pastedText);
            handleAnalysisResult(result);
        } catch (error) {
            console.error("Text import error:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive"
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

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
            handleAnalysisResult(result);
        } catch (error) {
            console.error("File import error:", error);
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
        <Card className="bg-slate-50/50">
            <CardContent className="p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="file">Upload File</TabsTrigger>
                        <TabsTrigger value="text">Paste Text</TabsTrigger>
                    </TabsList>

                    <TabsContent value="file" className="mt-0">
                        <div
                            {...getRootProps()}
                            className={cn(
                                "flex flex-col items-center justify-center p-8 cursor-pointer transition-colors min-h-[200px] border-2 border-dashed rounded-lg bg-white",
                                isDragActive ? "bg-blue-50/50 border-blue-400" : "hover:bg-slate-50 border-slate-200",
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
                                    <div className="p-4 bg-slate-100 rounded-full shadow-sm">
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
                    </TabsContent>

                    <TabsContent value="text" className="mt-0 space-y-4">
                        <div className="space-y-2">
                            <Textarea
                                placeholder="Paste your LinkedIn 'About', 'Experience' or full CV text here..."
                                className="min-h-[200px] bg-white"
                                value={pastedText}
                                onChange={(e) => setPastedText(e.target.value)}
                                disabled={isAnalyzing}
                            />
                            <p className="text-xs text-muted-foreground text-right">
                                The AI will extract relevant details from unstructured text.
                            </p>
                        </div>
                        <Button
                            className="w-full"
                            onClick={handleTextSubmit}
                            disabled={isAnalyzing || !pastedText}
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Analyzing Text...
                                </>
                            ) : (
                                <>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Analyze & Import text
                                </>
                            )}
                        </Button>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
