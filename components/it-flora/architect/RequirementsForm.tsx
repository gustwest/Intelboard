import { useState } from 'react';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { Label } from '@/components/it-flora/ui/Label';
import { Plus, X, Sparkles } from 'lucide-react';
import { ArchitectureRequirements } from '@/lib/it-flora/ai-architect';

interface RequirementsFormProps {
    onSubmit: (requirements: ArchitectureRequirements) => void;
    isLoading?: boolean;
}

export function RequirementsForm({ onSubmit, isLoading }: RequirementsFormProps) {
    const [businessContext, setBusinessContext] = useState('');
    const [industry, setIndustry] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [functionalReqs, setFunctionalReqs] = useState<string[]>(['']);
    const [nonFunctionalReqs, setNonFunctionalReqs] = useState<string[]>(['']);
    const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>(['']);
    const [technicalPreferences, setTechnicalPreferences] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const requirements: ArchitectureRequirements = {
            businessContext,
            industry,
            projectDescription,
            functionalRequirements: functionalReqs.filter(r => r.trim()),
            nonFunctionalRequirements: nonFunctionalReqs.filter(r => r.trim()),
            acceptanceCriteria: acceptanceCriteria.filter(c => c.trim()),
            technicalPreferences: technicalPreferences || undefined
        };

        onSubmit(requirements);
    };

    const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
        setter(prev => [...prev, '']);
    };

    const removeItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number) => {
        setter(prev => prev.filter((_, i) => i !== index));
    };

    const updateItem = (
        setter: React.Dispatch<React.SetStateAction<string[]>>,
        index: number,
        value: string
    ) => {
        setter(prev => prev.map((item, i) => (i === index ? value : item)));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 mb-4">
                    <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Architecture Advisor</h1>
                <p className="text-slate-600">
                    Describe your project and get AI-powered architecture recommendations
                </p>
            </div>

            {/* Business Context */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                        1
                    </span>
                    Business Context
                </h2>

                <div>
                    <Label htmlFor="businessContext">Company/Team Context</Label>
                    <textarea
                        id="businessContext"
                        value={businessContext}
                        onChange={(e) => setBusinessContext(e.target.value)}
                        placeholder="e.g., Mid-size e-commerce company with 50 employees, currently processing 10k orders/month"
                        className="w-full h-24 p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                </div>

                <div>
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                        id="industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="e.g., E-commerce, FinTech, Healthcare, SaaS"
                        required
                    />
                </div>
            </div>

            {/* Project Description */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                        2
                    </span>
                    Project Description
                </h2>

                <div>
                    <Label htmlFor="projectDescription">What are you building and why?</Label>
                    <textarea
                        id="projectDescription"
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="e.g., Building a customer loyalty platform to increase repeat purchases and customer engagement. Need integration with existing e-commerce platform and CRM."
                        className="w-full h-32 p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                </div>
            </div>

            {/* Functional Requirements */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                            3
                        </span>
                        Functional Requirements
                    </h2>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => addItem(setFunctionalReqs)}
                        className="text-blue-600 hover:text-blue-700"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                    </Button>
                </div>

                <div className="space-y-2">
                    {functionalReqs.map((req, index) => (
                        <div key={index} className="flex gap-2">
                            <Input
                                value={req}
                                onChange={(e) => updateItem(setFunctionalReqs, index, e.target.value)}
                                placeholder={`Requirement ${index + 1} (e.g., User registration and authentication)`}
                            />
                            {functionalReqs.length > 1 && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeItem(setFunctionalReqs, index)}
                                    className="text-slate-400 hover:text-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Non-Functional Requirements */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                            4
                        </span>
                        Non-Functional Requirements
                    </h2>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => addItem(setNonFunctionalReqs)}
                        className="text-blue-600 hover:text-blue-700"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                    </Button>
                </div>

                <p className="text-sm text-slate-500">
                    Performance, security, scalability, compliance, etc.
                </p>

                <div className="space-y-2">
                    {nonFunctionalReqs.map((req, index) => (
                        <div key={index} className="flex gap-2">
                            <Input
                                value={req}
                                onChange={(e) => updateItem(setNonFunctionalReqs, index, e.target.value)}
                                placeholder={`Requirement ${index + 1} (e.g., Support 100k concurrent users)`}
                            />
                            {nonFunctionalReqs.length > 1 && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeItem(setNonFunctionalReqs, index)}
                                    className="text-slate-400 hover:text-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Acceptance Criteria */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                            5
                        </span>
                        Acceptance Criteria
                    </h2>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => addItem(setAcceptanceCriteria)}
                        className="text-blue-600 hover:text-blue-700"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                    </Button>
                </div>

                <p className="text-sm text-slate-500">
                    How will you measure success?
                </p>

                <div className="space-y-2">
                    {acceptanceCriteria.map((criteria, index) => (
                        <div key={index} className="flex gap-2">
                            <Input
                                value={criteria}
                                onChange={(e) => updateItem(setAcceptanceCriteria, index, e.target.value)}
                                placeholder={`Criteria ${index + 1} (e.g., 99.9% uptime, < 200ms response time)`}
                            />
                            {acceptanceCriteria.length > 1 && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeItem(setAcceptanceCriteria, index)}
                                    className="text-slate-400 hover:text-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Technical Preferences */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                        6
                    </span>
                    Technical Preferences (Optional)
                </h2>

                <div>
                    <Label htmlFor="technicalPreferences">
                        Preferred technologies, cloud provider, constraints
                    </Label>
                    <textarea
                        id="technicalPreferences"
                        value={technicalPreferences}
                        onChange={(e) => setTechnicalPreferences(e.target.value)}
                        placeholder="e.g., Must use AWS, team has experience with Node.js and PostgreSQL, prefer serverless where possible"
                        className="w-full h-24 p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Submit */}
            <div className="flex justify-center pt-4">
                <Button
                    type="submit"
                    size="lg"
                    disabled={isLoading}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 px-8"
                >
                    {isLoading ? (
                        <>Analyzing Requirements...</>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-5 w-5" />
                            Generate Architecture
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
