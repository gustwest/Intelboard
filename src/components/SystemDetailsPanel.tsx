import { useStore } from '@/store/useStore';
import { X, Database, Table, Columns, FileText, Code, Edit2, Check, Edit, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SystemDetailsPanelProps {
    systemId: string;
    onClose: () => void;
    onEditSystem: (systemId: string) => void;
}

export function SystemDetailsPanel({ systemId, onClose, onEditSystem }: SystemDetailsPanelProps) {
    const getSystem = useStore((state) => state.getSystem);
    const bulkUpdateAssets = useStore((state) => state.bulkUpdateAssets);
    const addDocument = useStore((state) => state.addDocument);
    const removeDocument = useStore((state) => state.removeDocument);
    const currentUser = useStore((state) => state.currentUser);

    const system = systemId ? getSystem(systemId) : null;

    // State for renaming schemas
    const [editingSchema, setEditingSchema] = useState<string | null>(null);
    const [newSchemaName, setNewSchemaName] = useState('');

    if (!system) return null;

    // Group assets by schema
    const assetsBySchema = system.assets.reduce((acc, asset) => {
        const schema = asset.schema || 'Uncategorized';
        if (!acc[schema]) acc[schema] = [];
        acc[schema].push(asset);
        return acc;
    }, {} as Record<string, typeof system.assets>);

    const sortedSchemas = Object.keys(assetsBySchema).sort();

    const handleStartRename = (schema: string) => {
        setEditingSchema(schema);
        setNewSchemaName(schema === 'Uncategorized' ? '' : schema);
    };

    const handleSaveRename = (oldSchema: string) => {
        if (newSchemaName.trim() && newSchemaName !== oldSchema) {
            const assetIds = assetsBySchema[oldSchema].map(a => a.id);
            bulkUpdateAssets(system.id, assetIds, { schema: newSchemaName.trim() });
        }
        setEditingSchema(null);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && currentUser) {
            addDocument(system.id, {
                name: file.name,
                type: file.type,
                content: 'Metadata Only',
                uploadedBy: currentUser.id
            });
        }
    };

    return (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{system.name}</h2>
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">
                        {system.type} System
                    </div>
                    <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                        {system.description || <span className="italic text-slate-400">No description provided.</span>}
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 text-xs px-2 -ml-2 text-blue-600 hover:text-blue-700"
                        onClick={() => onEditSystem(system.id)}
                    >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit System Details
                    </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-5 w-5 text-slate-400" />
                </Button>
            </div>

            {/* Content - Tree View */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Assets Section */}
                <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Database className="h-3 w-3" />
                        Assets
                    </h3>
                    {system.assets.length === 0 ? (
                        <div className="text-center text-slate-400 py-4 italic text-sm border border-dashed border-slate-200 rounded-md">
                            No assets defined.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sortedSchemas.map((schema) => (
                                <div key={schema} className="border border-slate-200 rounded-md overflow-hidden">
                                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                        {editingSchema === schema ? (
                                            <div className="flex items-center space-x-2 flex-1">
                                                <Input
                                                    value={newSchemaName}
                                                    onChange={(e) => setNewSchemaName(e.target.value)}
                                                    className="h-7 text-sm"
                                                    autoFocus
                                                    placeholder="Schema Name"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveRename(schema);
                                                        if (e.key === 'Escape') setEditingSchema(null);
                                                    }}
                                                />
                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveRename(schema)}>
                                                    <Check className="h-4 w-4 text-green-600" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingSchema(null)}>
                                                    <X className="h-4 w-4 text-red-600" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center space-x-2 group w-full">
                                                <Database className="h-4 w-4 text-slate-400" />
                                                <span className="font-semibold text-sm text-slate-700">{schema}</span>
                                                <span className="text-xs text-slate-400">({assetsBySchema[schema].length})</span>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                                    onClick={() => handleStartRename(schema)}
                                                    title="Rename Schema"
                                                >
                                                    <Edit2 className="h-3 w-3 text-slate-400 hover:text-blue-600" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {assetsBySchema[schema].map(asset => (
                                            <AssetNode key={asset.id} asset={asset} systemId={system.id} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Documents Section */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            Documents
                        </h3>
                        <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                            <input type="file" className="hidden" onChange={handleFileUpload} />
                            <Plus className="h-3 w-3" />
                            Add
                        </label>
                    </div>

                    {!system.documents || system.documents.length === 0 ? (
                        <div className="text-center text-slate-400 py-4 italic text-sm border border-dashed border-slate-200 rounded-md">
                            No documents attached.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {system.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-md hover:border-blue-300 transition-colors group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                                            <FileText className="h-4 w-4 text-red-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-700 truncate" title={doc.name}>{doc.name}</div>
                                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{doc.type.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600"
                                        onClick={() => removeDocument(system.id, doc.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function AssetNode({ asset, systemId }: { asset: any, systemId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const verifyAsset = useStore((state) => state.verifyAsset);
    // Subscribe to the specific asset's verification status to ensure re-render
    const currentAsset = useStore((state) =>
        state.systems.find(s => s.id === systemId)?.assets.find(a => a.id === asset.id)
    );

    const hasColumns = asset.columns && asset.columns.length > 0;
    const isUnverified = currentAsset?.verificationStatus === 'Unverified';

    return (
        <div>
            <div
                className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer text-slate-600 hover:text-blue-600 hover:bg-blue-50 ${!hasColumns ? 'pl-6' : ''}`}
                onClick={() => hasColumns && setIsOpen(!isOpen)}
            >
                {hasColumns && (
                    isOpen ? <ChevronDown className="h-3 w-3 text-slate-300" /> : <ChevronRight className="h-3 w-3 text-slate-300" />
                )}
                <Table className="h-3.5 w-3.5" />
                <span className="text-sm flex-1">{asset.name}</span>

                {isUnverified && (
                    <Button
                        size="xs"
                        variant="ghost"
                        className="h-5 px-1.5 text-amber-600 hover:text-green-600 hover:bg-green-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            verifyAsset(systemId, asset.id);
                        }}
                        title="Verify Asset"
                    >
                        <span className="text-[10px] font-bold mr-1">UNVERIFIED</span>
                        <Check className="h-3 w-3" />
                    </Button>
                )}

                <span className="text-[10px] text-slate-400 border border-slate-200 px-1 rounded">{asset.type}</span>
            </div>

            {isOpen && hasColumns && (
                <div className="pl-6 mt-1 space-y-0.5 border-l border-slate-100 ml-3">
                    {asset.columns.map((col: any, idx: number) => (
                        <div key={idx} className="flex items-center space-x-2 p-1 text-slate-500 text-xs">
                            <Columns className="h-3 w-3 text-slate-300" />
                            <span className="font-medium">{col.name}</span>
                            <span className="text-slate-400 italic">{col.type}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
