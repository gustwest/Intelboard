import { GeneratedArchitecture } from '@/lib/it-flora/ai-architect';
import { Database, Server, Cloud, Layers, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface ArchitecturePreviewProps {
    architecture: GeneratedArchitecture;
}

export function ArchitecturePreview({ architecture }: ArchitecturePreviewProps) {
    const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

    const getLayerIcon = (layerName: string) => {
        const name = layerName.toLowerCase();
        if (name.includes('frontend') || name.includes('ui')) return Cloud;
        if (name.includes('api') || name.includes('gateway')) return Server;
        if (name.includes('data') || name.includes('database')) return Database;
        return Layers;
    };

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Architecture Summary</h3>
                        <p className="text-sm text-slate-700">{architecture.summary}</p>
                    </div>
                </div>
            </div>

            {/* Layers */}
            <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Architecture Layers</h3>
                <div className="space-y-3">
                    {architecture.layers.map((layer, index) => {
                        const Icon = getLayerIcon(layer.name);
                        const isSelected = selectedLayer === layer.name;

                        return (
                            <div key={index}>
                                <button
                                    onClick={() => setSelectedLayer(isSelected ? null : layer.name)}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${isSelected
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-200 bg-white hover:border-blue-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-600' : 'bg-slate-100'
                                            }`}>
                                            <Icon className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-semibold text-slate-900">{layer.name}</div>
                                            <div className="text-sm text-slate-600 mt-1">{layer.description}</div>
                                            <div className="text-xs text-slate-500 mt-2">
                                                {layer.systems.length} system{layer.systems.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                </button>

                                {isSelected && (
                                    <div className="mt-2 ml-12 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="text-sm font-medium text-slate-700 mb-2">Systems in this layer:</div>
                                        <div className="space-y-1">
                                            {layer.systems.map((sysName, idx) => {
                                                const system = architecture.systems.find(s => s.name === sysName);
                                                return (
                                                    <div key={idx} className="flex items-start gap-2">
                                                        <ArrowRight className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-800">{sysName}</div>
                                                            {system?.description && (
                                                                <div className="text-xs text-slate-600 mt-0.5">{system.description}</div>
                                                            )}
                                                            {system && system.assets.length > 0 && (
                                                                <div className="text-xs text-slate-500 mt-1">
                                                                    {system.assets.length} asset{system.assets.length !== 1 ? 's' : ''}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Systems Overview */}
            <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Systems ({architecture.systems.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {architecture.systems.map((system, index) => (
                        <div
                            key={index}
                            className="p-4 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="font-semibold text-slate-900">{system.name}</div>
                                <div className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                                    {system.type}
                                </div>
                            </div>
                            {system.description && (
                                <p className="text-sm text-slate-600 mb-3">{system.description}</p>
                            )}
                            {system.assets.length > 0 && (
                                <div className="text-xs text-slate-500">
                                    {system.assets.length} asset{system.assets.length !== 1 ? 's' : ''}: {' '}
                                    {system.assets.slice(0, 3).map(a => a.name).join(', ')}
                                    {system.assets.length > 3 && ` +${system.assets.length - 3} more`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Integrations */}
            {architecture.integrations.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                        Integrations ({architecture.integrations.length})
                    </h3>
                    <div className="space-y-2">
                        {architecture.integrations.map((integration, index) => (
                            <div
                                key={index}
                                className="p-3 bg-white rounded-lg border border-slate-200 flex items-center gap-3"
                            >
                                <div className="text-sm font-medium text-slate-800">
                                    {integration.sourceSystemName}
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-400" />
                                <div className="text-sm font-medium text-slate-800">
                                    {integration.targetSystemName}
                                </div>
                                {integration.technology && (
                                    <div className="ml-auto text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
                                        {integration.technology}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tech Stack */}
            {architecture.techStack.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Technology Stack</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {architecture.techStack.map((stack, index) => (
                            <div
                                key={index}
                                className="p-4 bg-white rounded-lg border border-slate-200"
                            >
                                <div className="font-medium text-slate-800 mb-2">{stack.category}</div>
                                <div className="flex flex-wrap gap-2">
                                    {stack.technologies.map((tech, idx) => (
                                        <span
                                            key={idx}
                                            className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700"
                                        >
                                            {tech}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
