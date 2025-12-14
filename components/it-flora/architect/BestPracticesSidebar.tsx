import { BestPractice } from '@/lib/it-flora/ai-architect';
import { Shield, Zap, Lock, TrendingUp, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

interface BestPracticesSidebarProps {
    practices: BestPractice[];
}

export function BestPracticesSidebar({ practices }: BestPracticesSidebarProps) {
    const getCategoryIcon = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('security')) return Shield;
        if (cat.includes('performance')) return Zap;
        if (cat.includes('scalability')) return TrendingUp;
        return CheckCircle;
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high':
                return 'border-red-200 bg-red-50';
            case 'medium':
                return 'border-amber-200 bg-amber-50';
            case 'low':
                return 'border-blue-200 bg-blue-50';
            default:
                return 'border-slate-200 bg-slate-50';
        }
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'high':
                return 'bg-red-100 text-red-700';
            case 'medium':
                return 'bg-amber-100 text-amber-700';
            case 'low':
                return 'bg-blue-100 text-blue-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    const sortedPractices = [...practices].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return (
        <div className="h-full bg-white border-l border-slate-200 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 z-10">
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600" />
                    <h2 className="font-semibold text-slate-900">Best Practices</h2>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                    Recommendations based on your architecture
                </p>
            </div>

            <div className="p-4 space-y-4">
                {sortedPractices.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">
                            Generate an architecture to see best practices
                        </p>
                    </div>
                ) : (
                    sortedPractices.map((practice) => {
                        const Icon = getCategoryIcon(practice.category);

                        return (
                            <div
                                key={practice.id}
                                className={`rounded-lg border-2 p-4 ${getPriorityColor(practice.priority)}`}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${practice.priority === 'high' ? 'bg-red-600' :
                                                practice.priority === 'medium' ? 'bg-amber-600' :
                                                    'bg-blue-600'
                                            }`}>
                                            <Icon className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                                                {practice.category}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`text-xs px-2 py-1 rounded font-medium ${getPriorityBadge(practice.priority)}`}>
                                        {practice.priority}
                                    </div>
                                </div>

                                {/* Title */}
                                <h3 className="font-semibold text-slate-900 mb-2">
                                    {practice.title}
                                </h3>

                                {/* Description */}
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    {practice.description}
                                </p>

                                {/* References */}
                                {practice.references && practice.references.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <div className="text-xs font-medium text-slate-600 mb-2">Learn more:</div>
                                        <div className="space-y-1">
                                            {practice.references.map((ref, idx) => (
                                                <a
                                                    key={idx}
                                                    href={ref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    {new URL(ref).hostname}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Summary */}
            {sortedPractices.length > 0 && (
                <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="text-xs text-slate-600">
                        <div className="font-medium mb-2">Summary:</div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span>High Priority:</span>
                                <span className="font-semibold text-red-600">
                                    {sortedPractices.filter(p => p.priority === 'high').length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Medium Priority:</span>
                                <span className="font-semibold text-amber-600">
                                    {sortedPractices.filter(p => p.priority === 'medium').length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Low Priority:</span>
                                <span className="font-semibold text-blue-600">
                                    {sortedPractices.filter(p => p.priority === 'low').length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
