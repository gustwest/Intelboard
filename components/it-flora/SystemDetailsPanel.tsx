
import { useState } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { X, Database, Table, Columns, FileText, Code, Edit2, Check, Edit, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

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
        <div className="fixed right-0 top-0 h-full w-96 bg-card shadow-2xl border-l border-border z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{system.name}</h2>
                    <Badge variant="outline" className="mt-1 text-xs font-semibold uppercase tracking-wider">
                        {system.type}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {system.description || <span className="italic text-muted-foreground/60">No description provided.</span>}
                    </p>
                    <Button
                        variant="link"
                        size="sm"
                        className="mt-1 h-auto p-0 text-xs text-primary hover:text-primary/80"
                        onClick={() => onEditSystem(system.id)}
                    >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit System Details
                    </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                    <X className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>

            {/* Content - Tree View */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                    {/* Assets Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Database className="h-3 w-3" />
                            Assets
                        </h3>
                        {system.assets.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4 italic text-sm border border-dashed border-border rounded-md">
                                No assets defined.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sortedSchemas.map((schema) => (
                                    <div key={schema} className="border border-border rounded-md overflow-hidden bg-card">
                                        <div className="bg-muted/30 px-3 py-2 border-b border-border flex items-center justify-between">
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
                                                        <X className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center space-x-2 group w-full">
                                                    <Database className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-semibold text-sm text-foreground">{schema}</span>
                                                    <span className="text-xs text-muted-foreground">({assetsBySchema[schema].length})</span>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                                        onClick={() => handleStartRename(schema)}
                                                        title="Rename Schema"
                                                    >
                                                        <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="divide-y divide-border">
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
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                Documents
                            </h3>
                            <label className="cursor-pointer text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1">
                                <input type="file" className="hidden" onChange={handleFileUpload} />
                                <Plus className="h-3 w-3" />
                                Add
                            </label>
                        </div>

                        {!system.documents || system.documents.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4 italic text-sm border border-dashed border-border rounded-md">
                                No documents attached.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {system.documents.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between p-2 bg-card border border-border rounded-md hover:border-primary/50 transition-colors group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                                                <FileText className="h-4 w-4 text-red-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate" title={doc.name}>{doc.name}</div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span>{doc.type.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
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
            </ScrollArea>
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
                className={cn(
                    "flex items-center space-x-2 p-1.5 rounded cursor-pointer text-muted-foreground hover:text-primary hover:bg-accent hover:text-accent-foreground",
                    !hasColumns && "pl-6"
                )}
                onClick={() => hasColumns && setIsOpen(!isOpen)}
            >
                {hasColumns && (
                    isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground/60" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                )}
                <Table className="h-3.5 w-3.5" />
                <span className="text-sm flex-1">{asset.name}</span>

                {isUnverified && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-amber-600 hover:text-green-600 hover:bg-green-50 text-[10px]"
                        onClick={(e) => {
                            e.stopPropagation();
                            verifyAsset(systemId, asset.id);
                        }}
                        title="Verify Asset"
                    >
                        <span className="font-bold mr-1">UNVERIFIED</span>
                        <Check className="h-3 w-3" />
                    </Button>
                )}

                <Badge variant="outline" className="text-[10px] h-4 font-normal text-muted-foreground px-1 py-0 border-border">
                    {asset.type}
                </Badge>
            </div>

            {isOpen && hasColumns && (
                <div className="pl-6 mt-1 space-y-0.5 border-l border-border ml-3">
                    {asset.columns.map((col: any, idx: number) => (
                        <div key={idx} className="flex items-center space-x-2 p-1 text-muted-foreground text-xs">
                            <Columns className="h-3 w-3 text-muted-foreground/60" />
                            <span className="font-medium">{col.name}</span>
                            <span className="text-muted-foreground/60 italic">{col.type}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

