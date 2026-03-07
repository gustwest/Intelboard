import { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Plus, Database, FileText, Server, LayoutTemplate, Edit2, Upload } from 'lucide-react';
import { System, Asset } from '@/store/it-flora/useStore';
import { useStore } from '@/store/it-flora/useStore';
import { Button } from '@/components/it-flora/ui/Button';
import { cn } from '@/lib/it-flora/utils';

// Map system types to icons
const SYSTEM_ICONS: Record<string, React.ElementType> = {
    'Source System': Database,
    'Data Warehouse': Server,
    'Data Lake': Database, // or a cloud icon
    'Data Vault': Server,
    'Data Mart': LayoutTemplate,
    'PBI Report': FileText,
    'Other': Database,
};

type SystemNodeData = System & {
    onAddAsset: (systemId: string) => void;
    onAssetClick?: (systemId: string, assetId: string) => void;
    onEditAsset?: (systemId: string, assetId: string) => void;
    onEditSystem?: (systemId: string) => void;
};

const SystemNode = memo(({ data, selected }: NodeProps<any>) => {
    // We cast data to our System type + callbacks
    const systemData = data as SystemNodeData;
    const Icon = SYSTEM_ICONS[systemData.type] || Database;
    const [isDragOver, setIsDragOver] = useState(false);
    const addAsset = useStore((state) => state.addAsset); // Get action from store

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            files.forEach(file => {
                addAsset(systemData.id, {
                    name: file.name,
                    type: 'File',
                    description: `Uploaded file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
                    status: 'Existing', // Default to existing for uploads
                });
            });
        }
    }, [addAsset, systemData.id]);

    return (
        <div
            className={cn(
                'min-w-[250px] rounded-lg border bg-card shadow-sm transition-shadow relative overflow-hidden',
                selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                'hover:shadow-md',
                isDragOver ? 'ring-2 ring-green-500 border-green-500' : ''
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragOver && (
                <div className="absolute inset-0 bg-green-50/90 z-10 flex flex-col items-center justify-center text-green-600">
                    <Upload className="h-8 w-8 mb-2" />
                    <span className="text-sm font-medium">Drop files to add assets</span>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3 rounded-t-lg">
                <div className="flex items-center space-x-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-card border border-border text-muted-foreground shadow-sm">
                        <Icon className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-card-foreground">{systemData.name}</h3>
                        <p className="text-xs text-muted-foreground">{systemData.type}</p>
                    </div>
                </div>
                <div className="flex space-x-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Edit System"
                        onClick={() => systemData.onEditSystem?.(systemData.id)}
                    >
                        <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Add Asset"
                        onClick={() => systemData.onAddAsset(systemData.id)}
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Assets List */}
            <div className="p-2 space-y-1">
                {systemData.assets.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground italic">
                        No assets defined
                        <br />
                        <span className="text-[10px] opacity-70">Drag files here</span>
                    </div>
                )}
                {systemData.assets.map((asset: Asset) => (
                    <div
                        key={asset.id}
                        className={cn(
                            "group relative flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer border border-transparent",
                            asset.status === 'Planned' ? 'border-dashed border-border bg-muted/30' : ''
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            systemData.onAssetClick?.(systemData.id, asset.id);
                        }}
                    >
                        <div className="flex items-center space-x-2 overflow-hidden">
                            <span className={cn(
                                "truncate font-medium",
                                asset.status === 'Planned' ? "text-muted-foreground italic" : "text-card-foreground"
                            )}>
                                {asset.name}
                            </span>
                            {asset.status === 'Planned' && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium uppercase tracking-wider">
                                    Plan
                                </span>
                            )}
                        </div>

                        <div className="flex items-center space-x-1">
                            <span className="text-[10px] text-muted-foreground uppercase mr-1">{asset.type}</span>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    systemData.onEditAsset?.(systemData.id, asset.id);
                                }}
                            >
                                <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </Button>
                        </div>

                        {/* Source Handle for the Asset */}
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={asset.id}
                            className="!h-2 !w-2 !bg-muted-foreground group-hover:!bg-primary transition-colors"
                            style={{ right: -5 }}
                        />
                    </div>
                ))}
            </div>

            {/* Target Handle for the System (to receive connections) */}
            <Handle
                type="target"
                position={Position.Left}
                id={systemData.id} // The system ID itself is the target handle ID
                className="!h-3 !w-1 !rounded-sm !bg-muted-foreground"
                style={{ left: -1, height: '40%', top: '50%', transform: 'translateY(-50%)' }}
            />
        </div>
    );
});

SystemNode.displayName = 'SystemNode';

export { SystemNode };
