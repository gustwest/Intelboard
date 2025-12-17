"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Request, RequestStatus } from "@/lib/data";
import { SmartImport } from "@/components/smart-import";
import { useRequests } from "@/hooks/use-requests";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { Plus, X } from "lucide-react";

export default function NewRequestPage() {
    const router = useRouter();
    const { addRequest } = useRequests();
    const { currentUser } = useRole();
    const { t } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        budget: "",
        urgency: "Medium" as "Low" | "Medium" | "High" | "Critical",
        tags: "",
    });

    const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>([
        { key: "Industry", value: "" },
        { key: "Tech Stack", value: "" }
    ]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        if (!currentUser) {
            alert("You must be logged in to create a request.");
            setIsLoading(false);
            return;
        }

        const attributesRecord: Record<string, string> = {};
        attributes.forEach(attr => {
            if (attr.key.trim() && attr.value.trim()) {
                attributesRecord[attr.key.trim()] = attr.value.trim();
            }
        });

        // Simulate API call
        setTimeout(() => {
            const newRequest: Request = {
                id: `r${Date.now()}`,
                title: formData.title,
                description: formData.description,
                status: "New" as RequestStatus,
                industry: attributesRecord["Industry"] || "Other", // Fallback for backward compatibility
                budget: formData.budget,
                tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean),
                createdAt: new Date().toISOString(),
                urgency: formData.urgency,
                creatorId: currentUser.id,
                acceptanceCriteria: [],
                acStatus: "Draft",
                attachments: [],
                attributes: attributesRecord,
            };

            addRequest(newRequest);
            router.push(`/requests/${newRequest.id}`);
        }, 1000);
    };

    const handleSmartImport = (data: {
        title: string;
        description: string;
        urgency: "Low" | "Medium" | "High" | "Critical";
        attributes: Record<string, string>;
    }) => {
        setFormData(prev => ({
            ...prev,
            title: data.title,
            description: data.description,
            urgency: data.urgency
        }));

        // Merge attributes
        const newAttributes = [...attributes];
        Object.entries(data.attributes).forEach(([key, value]) => {
            const existingIndex = newAttributes.findIndex(a => a.key.toLowerCase() === key.toLowerCase());
            if (existingIndex >= 0) {
                newAttributes[existingIndex].value = value;
            } else {
                newAttributes.push({ key, value });
            }
        });
        setAttributes(newAttributes);
    };

    const addAttribute = () => {
        setAttributes([...attributes, { key: "", value: "" }]);
    };

    const removeAttribute = (index: number) => {
        setAttributes(attributes.filter((_, i) => i !== index));
    };

    const updateAttribute = (index: number, field: 'key' | 'value', text: string) => {
        const newAttributes = [...attributes];
        newAttributes[index][field] = text;
        setAttributes(newAttributes);
    };

    return (
        <div className="container mx-auto py-10">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">{t.request.createTitle}</h1>
                    <p className="text-muted-foreground">
                        {t.request.createDesc}
                    </p>
                </div>

                <SmartImport onImport={handleSmartImport} />

                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>{t.request.details}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">{t.request.titleLabel}</Label>
                                <Input
                                    id="title"
                                    placeholder="e.g., Digital Transformation Strategy"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t.request.descLabel} (Agile User Story format recommended)</Label>
                                <Textarea
                                    id="description"
                                    placeholder="As a [Role], I want [Feature], So that [Benefit]..."
                                    className="min-h-[150px] font-mono text-sm leading-relaxed"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="budget">{t.request.budgetLabel}</Label>
                                    <Input
                                        id="budget"
                                        placeholder="e.g., $50k - $100k"
                                        value={formData.budget}
                                        onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="urgency">{t.request.urgencyLabel}</Label>
                                    <Select
                                        value={formData.urgency}
                                        onValueChange={(value: "Low" | "Medium" | "High" | "Critical") => setFormData({ ...formData, urgency: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select urgency" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Low">Low</SelectItem>
                                            <SelectItem value="Medium">Medium</SelectItem>
                                            <SelectItem value="High">High</SelectItem>
                                            <SelectItem value="Critical">Critical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>Additional Attributes</Label>
                                    <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
                                        <Plus className="h-3 w-3 mr-1" /> Add Attribute
                                    </Button>
                                </div>

                                {attributes.map((attr, index) => (
                                    <div key={index} className="flex gap-2 items-start">
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Category (e.g. Compliance)"
                                                value={attr.key}
                                                onChange={(e) => updateAttribute(index, 'key', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Value"
                                                value={attr.value}
                                                onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => removeAttribute(index)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="tags">Tags (comma separated)</Label>
                                <Input
                                    id="tags"
                                    placeholder="e.g., IoT, Cloud, Agile"
                                    value={formData.tags}
                                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button type="submit" size="lg" disabled={isLoading}>
                                    {isLoading ? "Submitting..." : t.request.submitButton}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
