import { useState, useEffect } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { Label } from '@/components/it-flora/ui/Label';
import { Select } from '@/components/it-flora/ui/Select';

interface AssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemId: string | null;
    assetId?: string | null; // Optional for editing
}

const ASSET_TYPES = ['Table', 'View', 'File', 'Report', 'API', 'Other'];
const ASSET_STATUSES = ['Existing', 'Planned'];

export function AssetModal({ isOpen, onClose, systemId, assetId }: AssetModalProps) {
    const addAsset = useStore((state) => state.addAsset);
    const updateAsset = useStore((state) => state.updateAsset);
    const getAsset = useStore((state) => state.getAsset);

    const [name, setName] = useState('');
    const [type, setType] = useState('Table');
    const [schema, setSchema] = useState('');
    const [status, setStatus] = useState<'Existing' | 'Planned'>('Existing');
    const [description, setDescription] = useState('');
    const [columns, setColumns] = useState<{ name: string; type: string }[]>([]);

    // Load data if editing
    useEffect(() => {
        if (isOpen && systemId) {
            if (assetId) {
                const asset = getAsset(assetId);
                if (asset) {
                    setName(asset.name);
                    setType(asset.type);
                    setSchema(asset.schema || '');
                    setDescription(asset.description || '');
                    setStatus(asset.status || 'Existing');
                    setColumns(asset.columns || []);
                }
            } else {
                // Reset for create mode
                setName('');
                setType('Table');
                setSchema('');
                setDescription('');
                setStatus('Existing');
                setColumns([]);
            }
        }
    }, [isOpen, systemId, assetId, getAsset]);

    const handleAddColumn = () => {
        setColumns([...columns, { name: '', type: 'VARCHAR' }]);
    };

    const handleColumnChange = (index: number, field: 'name' | 'type', value: string) => {
        const newColumns = [...columns];
        newColumns[index] = { ...newColumns[index], [field]: value };
        setColumns(newColumns);
    };

    const handleRemoveColumn = (index: number) => {
        setColumns(columns.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!systemId) return;

        const assetData = {
            name,
            type,
            schema: schema.trim() || undefined,
            description,
            status,
            columns: columns.filter(c => c.name.trim() !== ''), // Filter empty columns
        };

        if (assetId) {
            updateAsset(systemId, assetId, assetData);
        } else {
            addAsset(systemId, assetData);
        }
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assetId ? "Edit Asset" : "Add New Asset"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Asset Name</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Customers, Orders_View"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="type">Asset Type</Label>
                        <Select
                            id="type"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            {ASSET_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="schema">Schema (Optional)</Label>
                        <Input
                            id="schema"
                            value={schema}
                            onChange={(e) => setSchema(e.target.value)}
                            placeholder="e.g. public"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                        id="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as 'Existing' | 'Planned')}
                    >
                        {ASSET_STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description"
                    />
                </div>

                {/* Columns Section */}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                        <Label>Columns / Fields</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={handleAddColumn}>
                            + Add Column
                        </Button>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {columns.map((col, index) => (
                            <div key={index} className="flex gap-2">
                                <Input
                                    placeholder="Column Name"
                                    value={col.name}
                                    onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                                    className="h-8 text-xs"
                                />
                                <Input
                                    placeholder="Type"
                                    value={col.type}
                                    onChange={(e) => handleColumnChange(index, 'type', e.target.value)}
                                    className="h-8 w-24 text-xs"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-400 hover:text-red-600"
                                    onClick={() => handleRemoveColumn(index)}
                                >
                                    &times;
                                </Button>
                            </div>
                        ))}
                        {columns.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center py-2">No columns defined.</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">{assetId ? "Save Changes" : "Add Asset"}</Button>
                </div>
            </form>
        </Modal>
    );
}
