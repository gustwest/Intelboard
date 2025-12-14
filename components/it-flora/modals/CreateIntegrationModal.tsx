import { useState, useEffect } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Label } from '@/components/it-flora/ui/Label';
import { Input } from '@/components/it-flora/ui/Input';
import { Select } from '@/components/it-flora/ui/Select';

interface CreateIntegrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceAssetId: string | null;
    targetSystemId: string | null;
}

export function CreateIntegrationModal({ isOpen, onClose, sourceAssetId, targetSystemId }: CreateIntegrationModalProps) {
    const getAsset = useStore((state) => state.getAsset);
    const getSystem = useStore((state) => state.getSystem);
    const addIntegration = useStore((state) => state.addIntegration);
    const addAsset = useStore((state) => state.addAsset);

    const [propagateAsset, setPropagateAsset] = useState(false);
    const [description, setDescription] = useState('');
    const [targetAssetName, setTargetAssetName] = useState('');
    const [technology, setTechnology] = useState('');
    const [mode, setMode] = useState('');

    const sourceAsset = sourceAssetId ? getAsset(sourceAssetId) : null;
    const sourceSystem = sourceAsset ? getSystem(sourceAsset.systemId) : null;
    const targetSystem = targetSystemId ? getSystem(targetSystemId) : null;

    // Constants
    const INTEGRATION_TECHS = ['Kafka', 'OGG', 'Informatica', 'API', 'File Transfer', 'DB Link', 'Other'];
    const INTEGRATION_MODES = ['Streaming', 'Batch', 'CDC', 'Request/Reply', 'Other'];

    useEffect(() => {
        if (isOpen && sourceAsset) {
            setTargetAssetName(sourceAsset.name);
            setPropagateAsset(false);
            setDescription('');
            setTechnology('');
            setMode('');
        }
    }, [isOpen, sourceAsset]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!sourceAssetId || !targetSystemId) return;

        // 1. Create Integration
        addIntegration({
            sourceAssetId: sourceAssetId,
            targetSystemId: targetSystemId,
            description: description.trim() || undefined,
            technology: technology || undefined,
            mode: mode || undefined,
        });

        // 2. Propagate Asset (Optional)
        if (propagateAsset && targetAssetName.trim()) {
            const sourceAsset = getAsset(sourceAssetId);
            if (sourceAsset) {
                addAsset(targetSystemId, {
                    name: targetAssetName,
                    type: sourceAsset.type, // Keep same type
                    status: 'Planned', // Default to planned for new copies
                    columns: sourceAsset.columns // Copy columns
                });
            }
        }

        onClose();
    };

    if (!sourceSystem || !targetSystem || !sourceAsset) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Integration">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Connection Summary */}
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-slate-700">{sourceSystem.name}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-semibold text-slate-700">{targetSystem.name}</span>
                    </div>
                    <div className="flex items-center text-xs text-slate-500">
                        <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded mr-2">
                            {sourceAsset.type}
                        </span>
                        {sourceAsset.name}
                    </div>
                </div>

                {/* Integration Details */}
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Technology</Label>
                            <Select value={technology} onChange={(e) => setTechnology(e.target.value)}>
                                <option value="">Select...</option>
                                {INTEGRATION_TECHS.map(t => <option key={t} value={t}>{t}</option>)}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Mode</Label>
                            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                                <option value="">Select...</option>
                                {INTEGRATION_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Daily batch transfer"
                        />
                    </div>
                </div>

                {/* Asset Propagation */}
                <div className="space-y-2">
                    <Label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={propagateAsset}
                            onChange={(e) => setPropagateAsset(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Propagate Asset to Target System?</span>
                    </Label>
                    <p className="text-xs text-slate-500">
                        If checked, a new asset (copy) will be created in {targetSystem.name}.
                    </p>
                </div>

                {propagateAsset && (
                    <div className="space-y-2 pl-6 border-l-2 border-slate-100">
                        <Label htmlFor="targetName">Target Asset Name</Label>
                        <Input
                            id="targetName"
                            value={targetAssetName}
                            onChange={(e) => setTargetAssetName(e.target.value)}
                            placeholder="Name of the new asset"
                        />
                    </div>
                )}


                <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">Create Integration</Button>
                </div>
            </form>
        </Modal>
    );
}
