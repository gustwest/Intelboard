import { useState, useEffect } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Label } from '@/components/it-flora/ui/Label';
import { Input } from '@/components/it-flora/ui/Input';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId?: string | null;
    initialName?: string;
    initialDescription?: string;
    onSave?: (newProjectId: string) => void;
}

export function ProjectModal({ isOpen, onClose, projectId, initialName, initialDescription, onSave }: ProjectModalProps) {
    const projects = useStore((state) => state.projects);
    const addProject = useStore((state) => state.addProject);
    const updateProject = useStore((state) => state.updateProject);
    const deleteProject = useStore((state) => state.deleteProject);
    const users = useStore((state) => state.users);
    const currentUser = useStore((state) => state.currentUser);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sharedWith, setSharedWith] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen && projectId) {
            const project = projects.find(p => p.id === projectId);
            if (project) {
                setName(project.name);
                setDescription(project.description || '');
                setSharedWith(project.sharedWith || []);
            }
        } else {
            setName(initialName || '');
            setDescription(initialDescription || '');
            setSharedWith([]);
        }
    }, [isOpen, projectId, projects, initialName, initialDescription]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (projectId) {
            updateProject(projectId, { name, description, sharedWith });
            onClose();
        } else {
            const newId = addProject({ name, description, systemIds: [] });
            if (onSave) {
                onSave(newId);
            }
            onClose();
        }
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this project?')) {
            if (projectId) deleteProject(projectId);
            onClose();
        }
    };

    const project = projectId ? projects.find(p => p.id === projectId) : null;
    const canManageSharing = !projectId || (currentUser && (currentUser.role === 'Administrator' || project?.ownerId === currentUser.id));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={projectId ? "Edit Project" : "New Project"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="e.g., Q1 Migration"
                    />
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

                {/* Sharing Section */}
                {canManageSharing && projectId && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <Label>Share with Users</Label>
                        <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
                            {users.filter(u => u.id !== currentUser?.id).map(user => (
                                <label key={user.id} className="flex items-center space-x-2 p-1 hover:bg-slate-50 rounded cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={sharedWith.includes(user.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSharedWith([...sharedWith, user.id]);
                                            } else {
                                                setSharedWith(sharedWith.filter(id => id !== user.id));
                                            }
                                        }}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700">{user.name}</span>
                                    <span className="text-xs text-slate-400">({user.role})</span>
                                </label>
                            ))}
                            {users.length <= 1 && (
                                <div className="text-xs text-slate-400 italic text-center py-2">No other users to share with.</div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-between pt-4 border-t border-slate-100">
                    {projectId && (
                        <Button type="button" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleDelete}>
                            Delete Project
                        </Button>
                    )}
                    {!projectId && <div></div>} {/* Spacer */}

                    <div className="flex space-x-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">{projectId ? "Save Changes" : "Create Project"}</Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
