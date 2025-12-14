import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { Search } from 'lucide-react';

interface ManageProjectSystemsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ManageProjectSystemsModal({ isOpen, onClose }: ManageProjectSystemsModalProps) {
    const systems = useStore((state) => state.systems);
    const projects = useStore((state) => state.projects);
    const activeProjectId = useStore((state) => state.activeProjectId);
    const updateProject = useStore((state) => state.updateProject);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSystemIds, setSelectedSystemIds] = useState<Set<string>>(new Set());

    const activeProject = projects.find(p => p.id === activeProjectId);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen && activeProject) {
            setSelectedSystemIds(new Set(activeProject.systemIds));
            setSearchQuery('');
        }
    }, [isOpen, activeProject]);

    const filteredSystems = useMemo(() => {
        return systems.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.type.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [systems, searchQuery]);

    const handleToggleSystem = (systemId: string) => {
        const newSelected = new Set(selectedSystemIds);
        if (newSelected.has(systemId)) {
            newSelected.delete(systemId);
        } else {
            newSelected.add(systemId);
        }
        setSelectedSystemIds(newSelected);
    };

    const handleSelectAll = () => {
        const newSelected = new Set(selectedSystemIds);
        filteredSystems.forEach(s => newSelected.add(s.id));
        setSelectedSystemIds(newSelected);
    };

    const handleDeselectAll = () => {
        const newSelected = new Set(selectedSystemIds);
        filteredSystems.forEach(s => newSelected.delete(s.id));
        setSelectedSystemIds(newSelected);
    };

    const handleSave = () => {
        if (activeProjectId) {
            updateProject(activeProjectId, {
                systemIds: Array.from(selectedSystemIds)
            });
        }
        onClose();
    };

    if (!activeProject) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Manage Systems: ${activeProject.name}`}>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search systems..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <div className="flex justify-end space-x-2 text-xs">
                    <button onClick={handleSelectAll} className="text-blue-600 hover:underline">Select All</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={handleDeselectAll} className="text-blue-600 hover:underline">Deselect All</button>
                </div>

                <div className="border border-slate-200 rounded-md max-h-60 overflow-y-auto">
                    {filteredSystems.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500 italic">
                            No systems found.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredSystems.map(system => (
                                <label
                                    key={system.id}
                                    className="flex items-center space-x-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedSystemIds.has(system.id)}
                                        onChange={() => handleToggleSystem(system.id)}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-slate-900">{system.name}</div>
                                        <div className="text-xs text-slate-500">{system.type}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </div>
            </div>
        </Modal>
    );
}
