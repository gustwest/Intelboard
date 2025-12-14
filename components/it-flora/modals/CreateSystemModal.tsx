import { useState } from 'react';
import { useStore, SystemType } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { Label } from '@/components/it-flora/ui/Label';
import { Select } from '@/components/it-flora/ui/Select';

interface CreateSystemModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SYSTEM_TYPES: SystemType[] = [
    'Source System',
    'Data Warehouse',
    'Data Lake',
    'Data Vault',
    'Data Mart',
    'PBI Report',
    'Other',
];

export function CreateSystemModal({ isOpen, onClose }: CreateSystemModalProps) {
    const addSystem = useStore((state) => state.addSystem);
    const [name, setName] = useState('');
    const [type, setType] = useState<SystemType>('Source System');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addSystem({
            name,
            type,
            description,
            position: { x: Math.random() * 500, y: Math.random() * 300 }, // Random initial position
        });
        onClose();
        setName('');
        setDescription('');
        setType('Source System');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New System">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">System Name</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Core Banking, Sales DB"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="type">System Type</Label>
                    <Select
                        id="type"
                        value={type}
                        onChange={(e) => setType(e.target.value as SystemType)}
                    >
                        {SYSTEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
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

                <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">Create System</Button>
                </div>
            </form>
        </Modal>
    );
}
