import { useState, useEffect } from 'react';
import { useStore, SystemType } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Label } from '@/components/it-flora/ui/Label';
import { Input } from '@/components/it-flora/ui/Input';
import { Select } from '@/components/it-flora/ui/Select';

interface EditSystemModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemId: string | null;
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

export function EditSystemModal({ isOpen, onClose, systemId }: EditSystemModalProps) {
    const getSystem = useStore((state) => state.getSystem);
    const updateSystem = useStore((state) => state.updateSystem);
    const deleteSystem = useStore((state) => state.deleteSystem);
    const projects = useStore((state) => state.projects);
    const activeProjectId = useStore((state) => state.activeProjectId);
    const toggleSystemInProject = useStore((state) => state.toggleSystemInProject);

    const [name, setName] = useState('');
    const [type, setType] = useState<SystemType>('Source System');
    const [description, setDescription] = useState('');
    const [isInProject, setIsInProject] = useState(false);

    useEffect(() => {
        if (isOpen && systemId) {
            const system = getSystem(systemId);
            if (system) {
                setName(system.name);
                setType(system.type);
                setDescription(system.description || '');

                if (activeProjectId) {
                    const project = projects.find(p => p.id === activeProjectId);
                    setIsInProject(project?.systemIds.includes(systemId) || false);
                }
            }
        }
    }, [isOpen, systemId, getSystem, activeProjectId, projects]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!systemId) return;

        updateSystem(systemId, {
            name,
            type,
            description,
        });

        if (activeProjectId) {
            const project = projects.find(p => p.id === activeProjectId);
            const currentlyIn = project?.systemIds.includes(systemId);
            if (isInProject !== currentlyIn) {
                toggleSystemInProject(activeProjectId, systemId);
            }
        }

        onClose();
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this system? All assets and integrations will be removed.')) {
            if (systemId) deleteSystem(systemId);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit System">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">System Name</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
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
                    />
                </div>

                {activeProjectId && (
                    <div className="flex items-center space-x-2 pt-2">
                        <input
                            type="checkbox"
                            id="projectToggle"
                            checked={isInProject}
                            onChange={(e) => setIsInProject(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label htmlFor="projectToggle">Include in active project</Label>
                    </div>
                )}

                <div className="flex justify-between pt-4 border-t border-slate-100">
                    <Button type="button" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleDelete}>
                        Delete System
                    </Button>
                    <div className="flex space-x-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">Save Changes</Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
