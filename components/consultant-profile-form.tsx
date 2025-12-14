"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Linkedin, Upload, CheckCircle } from "lucide-react";
import { useDropzone } from "react-dropzone";

export interface ProfileData {
    experience: string;
    skills: string;
    background: string;
    linkedInUrl: string;
    files: File[];
}

interface ConsultantProfileFormProps {
    onComplete: (data: ProfileData) => void;
}

export function ConsultantProfileForm({ onComplete }: ConsultantProfileFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [linkedInUrl, setLinkedInUrl] = useState("");
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

    const [formData, setFormData] = useState({
        experience: "",
        skills: "",
        background: "",
    });

    const onDrop = (acceptedFiles: File[]) => {
        setUploadedFiles(prev => [...prev, ...acceptedFiles]);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

    const handleLinkedInAnalysis = () => {
        if (!linkedInUrl) return;
        setIsAnalyzing(true);

        // Simulate AI Analysis
        setTimeout(() => {
            setFormData({
                experience: "Senior Consultant with 10+ years in Fintech. Led multiple digital transformation projects.",
                skills: "React, Node.js, Cloud Architecture, Agile Leadership",
                background: "M.Sc. in Computer Science. Previously worked at major banks and tech startups.",
            });
            setIsAnalyzing(false);
        }, 2000);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate saving
        setTimeout(() => {
            onComplete({ ...formData, linkedInUrl, files: uploadedFiles });
            setIsLoading(false);
        }, 1000);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>LinkedIn Profile</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Linkedin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="https://linkedin.com/in/..."
                                className="pl-9"
                                value={linkedInUrl}
                                onChange={(e) => setLinkedInUrl(e.target.value)}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleLinkedInAnalysis}
                            disabled={isAnalyzing || !linkedInUrl}
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                "Auto-Fill with AI"
                            )}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Paste your LinkedIn URL to automatically fill your experience and skills.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>CV & Personal Letter</Label>
                    <div
                        {...getRootProps()}
                        className={`
                            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                            ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                        `}
                    >
                        <input {...getInputProps()} />
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                            {isDragActive ? "Drop files here..." : "Drag & drop CV and Personal Letter here, or click to select"}
                        </p>
                    </div>
                    {uploadedFiles.length > 0 && (
                        <div className="space-y-1">
                            {uploadedFiles.map((file, i) => (
                                <div key={i} className="flex items-center text-sm text-green-600">
                                    <CheckCircle className="mr-2 h-3 w-3" />
                                    {file.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Experience & Background</Label>
                    <Textarea
                        placeholder="Describe your relevant experience..."
                        className="min-h-[100px]"
                        value={formData.experience}
                        onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Key Skills</Label>
                    <Input
                        placeholder="e.g. Project Management, Java, Strategy"
                        value={formData.skills}
                        onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    />
                </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating Profile..." : "Complete Profile"}
            </Button>
        </form>
    );
}
