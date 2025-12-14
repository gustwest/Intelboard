import { useState } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';
import { User, Plus, Check, UserCircle } from 'lucide-react';

interface UserManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UserManagementModal({ isOpen, onClose }: UserManagementModalProps) {
    const users = useStore((state) => state.users);
    const currentUser = useStore((state) => state.currentUser);
    const addUser = useStore((state) => state.addUser);
    const switchUser = useStore((state) => state.switchUser);

    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('');

    const handleAddUser = () => {
        if (newName.trim() && newRole.trim()) {
            addUser({
                name: newName.trim(),
                role: newRole.trim(),
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newName.trim()}`
            });
            setNewName('');
            setNewRole('');
            setIsAdding(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="User Management">
            <div className="space-y-6">
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Users</h3>
                    <div className="grid grid-cols-1 gap-2">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${currentUser?.id === user.id
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500'
                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                    }`}
                                onClick={() => switchUser(user.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        className="w-10 h-10 rounded-full bg-slate-100"
                                    />
                                    <div>
                                        <div className="font-semibold text-slate-900">{user.name}</div>
                                        <div className="text-xs text-slate-500">{user.role}</div>
                                    </div>
                                </div>
                                {currentUser?.id === user.id && (
                                    <div className="flex items-center gap-1 text-blue-600 text-xs font-medium bg-blue-100 px-2 py-1 rounded-full">
                                        <Check className="w-3 h-3" />
                                        Active
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {isAdding ? (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-900">Add New User</h3>
                        <div className="space-y-2">
                            <Input
                                placeholder="Full Name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                            <Input
                                placeholder="Role / Title"
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleAddUser} disabled={!newName || !newRole}>Create User</Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        className="w-full border-dashed border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add New User
                    </Button>
                )}
            </div>
        </Modal>
    );
}
