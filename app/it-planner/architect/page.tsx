'use client';

import { useState } from 'react';
import { RequirementsForm } from '@/components/it-flora/architect/RequirementsForm';
import { AIConversation } from '@/components/it-flora/architect/AIConversation';
import { ArchitecturePreview } from '@/components/it-flora/architect/ArchitecturePreview';
import { BestPracticesSidebar } from '@/components/it-flora/architect/BestPracticesSidebar';
import { Button } from '@/components/it-flora/ui/Button';
import {
    ArchitectureRequirements,
    Message,
    GeneratedArchitecture,
    analyzeRequirements,
    generateArchitecture,
    askFollowUpQuestion
} from '@/lib/it-flora/ai-architect';
import { useStore } from '@/store/it-flora/useStore';
import { ArrowLeft, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

type Step = 'requirements' | 'conversation' | 'architecture';

export default function ArchitectPage() {
    const [step, setStep] = useState<Step>('requirements');
    const [requirements, setRequirements] = useState<ArchitectureRequirements | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [architecture, setArchitecture] = useState<GeneratedArchitecture | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
    const [questionsAsked, setQuestionsAsked] = useState(0);
    const [showSidebar, setShowSidebar] = useState(true);

    const importSystems = useStore((state) => state.importSystems);

    const handleRequirementsSubmit = async (reqs: ArchitectureRequirements) => {
        setRequirements(reqs);
        setIsLoading(true);
        setStep('conversation');

        try {
            const result = await analyzeRequirements(reqs);

            // Add AI's initial analysis
            const analysisMessage: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: result.initialAnalysis,
                timestamp: new Date().toISOString()
            };

            setMessages([analysisMessage]);

            // Ask first question
            if (result.questions.length > 0) {
                const questionMessage: Message = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: result.questions[0],
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, questionMessage]);
                setCurrentQuestion(result.questions[0]);
                setQuestionsAsked(1);
            }
        } catch (error) {
            console.error('Error analyzing requirements:', error);
            const errorMessage: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Failed to analyze requirements'}`,
                timestamp: new Date().toISOString()
            };
            setMessages([errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async (messageContent: string) => {
        const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            content: messageContent,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setCurrentQuestion(null);

        try {
            // After 2-3 questions, generate the architecture
            if (questionsAsked >= 2) {
                const arch = await generateArchitecture(requirements!, [...messages, userMessage]);
                setArchitecture(arch);
                setStep('architecture');
            } else {
                // Ask another clarifying question
                const nextQuestion = await askFollowUpQuestion(
                    requirements!.projectDescription,
                    [...messages, userMessage]
                );

                const questionMessage: Message = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: nextQuestion,
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, questionMessage]);
                setCurrentQuestion(nextQuestion);
                setQuestionsAsked(prev => prev + 1);
            }
        } catch (error) {
            console.error('Error in conversation:', error);
            const errorMessage: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImportArchitecture = () => {
        if (!architecture) return;

        importSystems(architecture.systems);
        alert('Architecture imported successfully! Check the main canvas.');
    };

    const handleRegenerateWithChanges = async () => {
        if (!requirements) return;

        setIsLoading(true);
        try {
            const arch = await generateArchitecture(requirements, messages);
            setArchitecture(arch);
        } catch (error) {
            console.error('Error regenerating:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Canvas
                            </Button>
                        </Link>
                        <div className="h-6 w-px bg-slate-200" />
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Architecture Advisor</h1>
                            <p className="text-xs text-slate-500">
                                {step === 'requirements' && 'Describe your requirements'}
                                {step === 'conversation' && 'Refining your architecture'}
                                {step === 'architecture' && 'Your recommended architecture'}
                            </p>
                        </div>
                    </div>

                    {/* Step Indicators */}
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${step === 'requirements' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                            <div className="w-2 h-2 rounded-full bg-current" />
                            <span className="text-xs font-medium">Requirements</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${step === 'conversation' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                            <div className="w-2 h-2 rounded-full bg-current" />
                            <span className="text-xs font-medium">AI Analysis</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${step === 'architecture' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                            <div className="w-2 h-2 rounded-full bg-current" />
                            <span className="text-xs font-medium">Architecture</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {step === 'requirements' && (
                    <RequirementsForm
                        onSubmit={handleRequirementsSubmit}
                        isLoading={isLoading}
                    />
                )}

                {step === 'conversation' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
                        <div className="lg:col-span-2">
                            <AIConversation
                                messages={messages}
                                onSendMessage={handleSendMessage}
                                isLoading={isLoading}
                                currentQuestion={currentQuestion || undefined}
                            />
                        </div>
                        <div className="hidden lg:block">
                            <div className="bg-white rounded-lg border border-slate-200 p-6 h-full">
                                <h3 className="font-semibold text-slate-900 mb-4">Your Requirements</h3>
                                <div className="space-y-3 text-sm">
                                    <div>
                                        <div className="font-medium text-slate-700">Industry</div>
                                        <div className="text-slate-600">{requirements?.industry}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-700">Project</div>
                                        <div className="text-slate-600 line-clamp-3">{requirements?.projectDescription}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-700">Functional Requirements</div>
                                        <div className="text-slate-600">{requirements?.functionalRequirements.length} items</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'architecture' && architecture && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className={`${showSidebar ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
                            <div className="bg-white rounded-lg border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-slate-900">Your Architecture</h2>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm" onClick={handleRegenerateWithChanges}
                                            disabled={isLoading}
                                        >
                                            Refine
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleImportArchitecture}
                                            className="bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Import to Canvas
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => setShowSidebar(!showSidebar)}
                                            className="lg:hidden"
                                        >
                                            {showSidebar ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <ArchitecturePreview architecture={architecture} />
                            </div>
                        </div>

                        {showSidebar && (
                            <div className="lg:col-span-1">
                                <div className="sticky top-8 h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-slate-200">
                                    <BestPracticesSidebar practices={architecture.bestPractices} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
