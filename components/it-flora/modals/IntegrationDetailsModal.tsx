import { useState, useEffect } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { Label } from '@/components/it-flora/ui/Label';
import { Select } from '@/components/it-flora/ui/Select';

interface IntegrationDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    integrationId: string | null;
}

const INTEGRATION_TECHS = ['Kafka', 'OGG', 'Informatica', 'API', 'File Transfer', 'DB Link', 'Other'];
const INTEGRATION_MODES = ['Streaming', 'Batch', 'CDC', 'Request/Reply', 'Other'];

export function IntegrationDetailsModal({ isOpen, onClose, integrationId }: IntegrationDetailsModalProps) {
    const integrations = useStore((state) => state.integrations);
    const systems = useStore((state) => state.systems);
    const removeIntegration = useStore((state) => state.removeIntegration);
    const updateIntegration = useStore((state) => state.updateIntegration);

    const integration = integrations.find((i) => i.id === integrationId);

    const [isEditing, setIsEditing] = useState(false);
    const [description, setDescription] = useState('');
    const [technology, setTechnology] = useState('');
    const [mode, setMode] = useState('');

    useEffect(() => {
        if (isOpen && integration) {
            setDescription(integration.description || '');
            setTechnology(integration.technology || '');
            setMode(integration.mode || '');
            setIsEditing(false);
        }
    }, [isOpen, integration]);

    if (!integration) return null;

    const sourceSystem = systems.find((s) => s.assets.some((a) => a.id === integration.sourceAssetId));
    const targetSystem = systems.find((s) => s.id === integration.targetSystemId);
    const sourceAsset = sourceSystem?.assets.find((a) => a.id === integration.sourceAssetId);

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this integration?')) {
            removeIntegration(integration.id);
            onClose();
        }
    };

    const handleSave = () => {
        updateIntegration(integration.id, {
            description,
            technology,
            mode
        });
        setIsEditing(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Integration Details">
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <Label className="text-slate-500">Source System</Label>
                        <div className="font-medium">{sourceSystem?.name}</div>
                    </div>
                    <div>
                        <Label className="text-slate-500">Target System</Label>
                        <div className="font-medium">{targetSystem?.name}</div>
                    </div>
                    <div className="col-span-2">
                        <Label className="text-slate-500">Source Asset</Label>
                        <div className="font-medium flex items-center">
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded mr-2">
                                {sourceAsset?.type}
                            </span>
                            {sourceAsset?.name}
                        </div>
                    </div>
                </div>

                {isEditing ? (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
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
                            <Label>Description</Label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the data flow..."
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSave}>Save Changes</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-500">Technology</Label>
                                <div className="font-medium">{integration.technology || '-'}</div>
                            </div>
                            <div>
                                <Label className="text-slate-500">Mode</Label>
                                <div className="font-medium">{integration.mode || '-'}</div>
                            </div>
                        </div>
                        <div>
                            <Label className="text-slate-500">Description</Label>
                            <p className="text-sm text-slate-700 mt-1">
                                {integration.description || <span className="italic text-slate-400">No description provided.</span>}
                            </p>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2">
                            <Button variant="outline" onClick={() => setIsEditing(true)}>Edit</Button>
                            <Button variant="destructive" onClick={handleDelete}>Delete Integration</Button>
                            <Button variant="outline" onClick={onClose}>Close</Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
