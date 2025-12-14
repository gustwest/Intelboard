"use client";

import { useState, useRef } from "react";
import { Request } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip, Upload, X, FileText } from "lucide-react";

interface AttachmentsListProps {
    request: Request;
    onUpdate: (updatedRequest: Request) => void;
    readOnly?: boolean;
}

export function AttachmentsList({ request, onUpdate, readOnly = false }: AttachmentsListProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            // Mock upload: just add filename to list
            const updatedAttachments = [...(request.attachments || []), file.name];
            onUpdate({ ...request, attachments: updatedAttachments });

            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleRemove = (index: number) => {
        const updatedAttachments = (request.attachments || []).filter((_, i) => i !== index);
        onUpdate({ ...request, attachments: updatedAttachments });
    };

    const attachments = request.attachments || [];

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Paperclip className="h-5 w-5" />
                    Attachments
                </CardTitle>
                {!readOnly && (
                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload
                        </Button>
                    </div>
                )}
            </CardHeader>
            <CardContent className="pt-4">
                {attachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No attachments added.</p>
                ) : (
                    <div className="space-y-2">
                        {attachments.map((fileName, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-2 rounded-md border bg-slate-50 dark:bg-slate-900"
                            >
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                    <span className="text-sm font-medium">{fileName}</span>
                                </div>
                                {!readOnly && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRemove(index)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
