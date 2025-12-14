import { useState, useMemo } from 'react';
import { useStore } from '@/store/it-flora/useStore';
import { Modal } from '@/components/it-flora/ui/Modal';
import { Input } from '@/components/it-flora/ui/Input';
import { Search, Database, Table, FileText, Code } from 'lucide-react';

interface DataCatalogueModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectAsset: (assetId: string, systemId: string) => void;
}

export function DataCatalogueModal({ isOpen, onClose, onSelectAsset }: DataCatalogueModalProps) {
    const systems = useStore((state) => state.systems);
    const [searchQuery, setSearchQuery] = useState('');

    const allAssets = useMemo(() => {
        return systems.flatMap(system =>
            system.assets.map(asset => ({
                ...asset,
                systemName: system.name,
                systemType: system.type
            }))
        );
    }, [systems]);

    const filteredAssets = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return allAssets.filter(asset =>
            asset.name.toLowerCase().includes(query) ||
            asset.systemName.toLowerCase().includes(query) ||
            (asset.schema && asset.schema.toLowerCase().includes(query))
        );
    }, [allAssets, searchQuery]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'Table': return <Table className="h-4 w-4 text-blue-500" />;
            case 'View': return <Table className="h-4 w-4 text-green-500" />; // Differentiate if needed
            case 'File': return <FileText className="h-4 w-4 text-orange-500" />;
            case 'API': return <Code className="h-4 w-4 text-purple-500" />;
            default: return <Database className="h-4 w-4 text-slate-400" />;
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Data Catalogue">
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search assets by name, system, or schema..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        autoFocus
                    />
                </div>

                <div className="max-h-[60vh] overflow-y-auto border border-slate-200 rounded-md">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0">
                            <tr>
                                <th className="px-4 py-2">Asset Name</th>
                                <th className="px-4 py-2">Type</th>
                                <th className="px-4 py-2">Schema</th>
                                <th className="px-4 py-2">System</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAssets.length > 0 ? (
                                filteredAssets.map((asset) => (
                                    <tr
                                        key={asset.id}
                                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                                        onClick={() => {
                                            onSelectAsset(asset.id, asset.systemId);
                                            onClose();
                                        }}
                                    >
                                        <td className="px-4 py-2 font-medium text-slate-700 flex items-center gap-2">
                                            {getIcon(asset.type)}
                                            {asset.name}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500">{asset.type}</td>
                                        <td className="px-4 py-2 text-slate-500">{asset.schema || '-'}</td>
                                        <td className="px-4 py-2 text-slate-600">{asset.systemName}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                                        No assets found matching "{searchQuery}"
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="text-xs text-slate-400 text-right">
                    Showing {filteredAssets.length} of {allAssets.length} assets
                </div>
            </div>
        </Modal>
    );
}
