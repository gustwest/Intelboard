import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { parseContractText, ParsedResult } from '@/lib/it-flora/ai-parser';
import { Asset } from '@/store/it-flora/useStore';
import { Sparkles, Upload, FileText, ArrowRight, CheckCircle } from 'lucide-react';

interface AIImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AIImportModal({ isOpen, onClose }: AIImportModalProps) {
    const importSystems = useStore((state) => state.importSystems);
    const existingSystems = useStore((state) => state.systems);
    const addAsset = useStore((state) => state.addAsset);
    const updateSystem = useStore((state) => state.updateSystem);
    const addIntegration = useStore((state) => state.addIntegration);

    const [text, setText] = useState('');
    const [result, setResult] = useState<ParsedResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [conflicts, setConflicts] = useState<{ newSystem: any, existingSystem: any }[]>([]);
    const [resolution, setResolution] = useState<'merge' | 'overwrite'>('merge');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const currentUser = useStore((state) => state.currentUser);

    const handleFileDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            await processFile(file);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processFile(file);
        }
    };

    const processFile = async (file: File) => {
        setUploadedFile(file);
        setIsAnalyzing(true);
        try {
            let extractedText = '';
            if (file.type === 'application/pdf') {
                const { extractTextFromPDF } = await import('@/lib/it-flora/pdf-utils');
                extractedText = await extractTextFromPDF(file);
            } else {
                extractedText = await file.text();
            }
            setText(extractedText);
        } catch (error) {
            console.error('Error reading file:', error);
            alert('Failed to read file content.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAnalyze = () => {
        setIsAnalyzing(true);
        // Simulate AI delay for effect
        setTimeout(() => {
            const parsed = parseContractText(text);

            // Attach document to parsed systems if file exists
            if (uploadedFile && currentUser) {
                const doc = {
                    id: uuidv4(),
                    name: uploadedFile.name,
                    type: uploadedFile.type,
                    content: 'Metadata Only (File Content Not Persisted)', // In a real app we'd upload to S3
                    uploadedBy: currentUser.id,
                    uploadedAt: new Date().toISOString()
                };

                parsed.systems = parsed.systems.map(s => ({
                    ...s,
                    documents: [doc]
                }));
            }

            setResult(parsed);

            // Check for conflicts
            const foundConflicts = parsed.systems.filter(newSys =>
                existingSystems.some(existing => existing.name.toLowerCase() === newSys.name.toLowerCase())
            ).map(newSys => ({
                newSystem: newSys,
                existingSystem: existingSystems.find(existing => existing.name.toLowerCase() === newSys.name.toLowerCase())
            }));

            setConflicts(foundConflicts);
            setIsAnalyzing(false);
        }, 800);
    };

    const handleImport = () => {
        if (!result) return;

        // 1. Handle Non-Conflicting Systems
        const newSystems = result.systems.filter(s => !conflicts.some(c => c.newSystem.id === s.id));
        if (newSystems.length > 0) {
            importSystems(newSystems);
        }

        // 2. Handle Conflicts
        conflicts.forEach(({ newSystem, existingSystem }) => {
            if (resolution === 'overwrite') {
                // Update existing system with new details and REPLACE assets
                updateSystem(existingSystem.id, {
                    description: newSystem.description,
                    type: newSystem.type,
                    // We can't easily "replace" assets via updateSystem without clearing first, 
                    // but for now let's assume we just add the new ones and maybe user cleans up?
                    // Actually, let's just add them as new assets.
                    // Ideally we'd delete old assets, but that's risky.
                    // Let's stick to "Merge" behavior but maybe update system metadata.
                });
                // Add new assets
                newSystem.assets.forEach((asset: Asset) => {
                    addAsset(existingSystem.id, { ...asset, verificationStatus: 'Unverified' });
                });
            } else {
                // Merge: Add new assets to existing system
                newSystem.assets.forEach((asset: Asset) => {
                    // Check if asset already exists to avoid duplicates?
                    const assetExists = existingSystem.assets.some((a: Asset) => a.name.toLowerCase() === asset.name.toLowerCase());
                    if (!assetExists) {
                        addAsset(existingSystem.id, { ...asset, verificationStatus: 'Unverified' });
                    }
                });
            }
        });

        // 3. Handle Integrations
        if (result.integrations) {
            result.integrations.forEach(integration => {
                // Find source and target IDs (checking both existing and newly imported)
                // We need to look up by NAME because IDs might be new or existing
                const allSystems = [...existingSystems, ...newSystems]; // Note: this doesn't include updated existing systems but names match

                const sourceSys = allSystems.find(s => s.name.toLowerCase() === integration.sourceSystem.toLowerCase());
                const targetSys = allSystems.find(s => s.name.toLowerCase() === integration.targetSystem.toLowerCase());

                if (sourceSys && targetSys) {
                    // We need a source ASSET. If none specified, maybe pick the first one or create a dummy?
                    // For now, let's try to find a generic asset or create one if needed?
                    // Or just pick the first asset of the source system.
                    const sourceAsset = sourceSys.assets[0];

                    if (sourceAsset) {
                        addIntegration({
                            sourceAssetId: sourceAsset.id,
                            targetSystemId: targetSys.id,
                            technology: integration.type,
                            description: integration.description
                        });
                    }
                }
            });
        }

        onClose();
        setText('');
        setResult(null);
        setConflicts([]);
        setUploadedFile(null); // Clear uploaded file state
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="AI-Powered Import">
            <div className="space-y-4">
                {!result ? (
                    <>
                        <div
                            className="p-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-center cursor-pointer"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => document.getElementById('file-upload')?.click()}
                        >
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                accept=".pdf,.txt,.md"
                                onChange={handleFileSelect}
                            />
                            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                            <p className="text-sm font-medium text-slate-700">
                                {uploadedFile ? uploadedFile.name : "Drag & drop a PDF or text file here"}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                {uploadedFile ? "Click to change file" : "or click to browse"}
                            </p>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-slate-500">Or paste text</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Document Text</label>
                            <textarea
                                className="w-full h-48 p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                placeholder={`Example:
System: Payment Gateway
Schema: public
- Transactions (Table)
- Logs (File)`}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleAnalyze}
                                disabled={!text.trim() || isAnalyzing}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0"
                            >
                                {isAnalyzing ? 'Analyzing...' : 'Analyze Document'}
                                {!isAnalyzing && <Sparkles className="ml-2 h-4 w-4" />}
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Analysis Complete</h3>
                            <p className="text-slate-500">
                                Found <span className="font-bold text-slate-900">{result.systems.length} Systems</span> and <span className="font-bold text-slate-900">{result.totalAssets} Assets</span>
                            </p>
                            {result.integrations && result.integrations.length > 0 && (
                                <p className="text-slate-500 mt-1">
                                    Found <span className="font-bold text-slate-900">{result.integrations.length} Integrations</span>
                                </p>
                            )}
                        </div>

                        {conflicts.length > 0 && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                                <h4 className="text-sm font-semibold text-amber-800 mb-2">Conflicts Detected</h4>
                                <p className="text-xs text-amber-700 mb-3">
                                    The following systems already exist: {conflicts.map(c => c.newSystem.name).join(', ')}.
                                    How should we handle them?
                                </p>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="resolution"
                                            value="merge"
                                            checked={resolution === 'merge'}
                                            onChange={() => setResolution('merge')}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Merge (Add new assets)</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="resolution"
                                            value="overwrite"
                                            checked={resolution === 'overwrite'}
                                            onChange={() => setResolution('overwrite')}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Overwrite (Update details & add assets)</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="bg-slate-50 border border-slate-200 rounded-md max-h-64 overflow-y-auto p-4">
                            <div className="space-y-4">
                                {result.systems.map((sys, idx) => (
                                    <div key={idx} className="border-l-2 border-blue-500 pl-3">
                                        <div className="font-semibold text-slate-800">{sys.name}</div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {sys.assets.length} assets found
                                        </div>
                                        <div className="mt-2 text-xs text-slate-600 grid grid-cols-2 gap-1">
                                            {sys.assets.slice(0, 6).map((a, i) => (
                                                <div key={i} className="flex items-center gap-1">
                                                    <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                                    {a.name} <span className="opacity-50">({a.type})</span>
                                                </div>
                                            ))}
                                            {sys.assets.length > 6 && (
                                                <div className="text-slate-400 italic">...and {sys.assets.length - 6} more</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between pt-2">
                            <Button variant="ghost" onClick={() => setResult(null)}>
                                Back to Editor
                            </Button>
                            <Button onClick={handleImport} className="bg-green-600 hover:bg-green-700 text-white">
                                Import Systems
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
