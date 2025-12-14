import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    OnConnect,
    NodeTypes,
    OnNodeDrag,
    ReactFlowProvider,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/store/it-flora/useStore';
import { SystemNode } from './SystemNode';
import { CreateIntegrationModal } from '../modals/CreateIntegrationModal';

import IntegrationEdge from './IntegrationEdge';

const nodeTypes: NodeTypes = {
    system: SystemNode as any,
};

const edgeTypes = {
    integration: IntegrationEdge,
};

interface FlowCanvasProps {
    onAddAsset: (systemId: string) => void;
    onEditAsset: (systemId: string, assetId: string) => void;
    onEdgeClick: (edgeId: string) => void;
    onEditSystem: (systemId: string) => void;
    onSystemClick: (systemId: string) => void;
    selectedAssetIdForLineage?: string | null;
}

function FlowCanvasContent({ onAddAsset, onEditAsset, onEdgeClick, onEditSystem, onSystemClick, selectedAssetIdForLineage }: FlowCanvasProps) {
    const systems = useStore((state) => state.systems);
    const integrations = useStore((state) => state.integrations);
    const updateSystemPosition = useStore((state) => state.updateSystemPosition);

    // Project Filtering
    const activeProjectId = useStore((state) => state.activeProjectId);
    const projects = useStore((state) => state.projects);

    const visibleSystemIds = useMemo(() => {
        if (!activeProjectId) return new Set(systems.map(s => s.id));
        const project = projects.find(p => p.id === activeProjectId);
        return new Set(project?.systemIds || []);
    }, [systems, activeProjectId, projects]);

    // State for Create Integration Modal (New)
    const [isCreateIntegrationModalOpen, setIsCreateIntegrationModalOpen] = useState(false);
    const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

    // Lineage State
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
    const [highlightedSystemId, setHighlightedSystemId] = useState<string | null>(null);

    // Transform store data to React Flow nodes
    const nodes: Node[] = useMemo(() => {
        return systems
            .filter(sys => visibleSystemIds.has(sys.id))
            .map((sys) => ({
                id: sys.id,
                type: 'system',
                position: sys.position,
                data: {
                    ...sys,
                    onAddAsset,
                    onEditSystem, // Pass the callback
                    onAssetClick: (assetId: string) => handleAssetClick(assetId, sys.id),
                    onEditAsset: (assetId: string) => onEditAsset(sys.id, assetId),
                    isHighlighted: highlightedIds.size > 0 ? highlightedIds.has(sys.id) : true,
                    isSystemHighlighted: highlightedSystemId === sys.id,
                },
            }));
    }, [systems, visibleSystemIds, highlightedIds, highlightedSystemId, onEditAsset, onAddAsset, onEditSystem]);

    // Transform store data to React Flow edges
    const edges: Edge[] = useMemo(() => {
        return integrations
            .filter(int => {
                // Only show edge if both source and target systems are visible
                const sourceSystem = systems.find(s => s.assets.some(a => a.id === int.sourceAssetId));
                return sourceSystem && visibleSystemIds.has(sourceSystem.id) && visibleSystemIds.has(int.targetSystemId);
            })
            .map((int) => {
                const isHighlighted = highlightedIds.size > 0 ? highlightedIds.has(int.id) : true;
                return {
                    id: int.id,
                    type: 'integration', // Use custom edge
                    source: systems.find(s => s.assets.some(a => a.id === int.sourceAssetId))?.id || '',
                    target: int.targetSystemId,
                    sourceHandle: int.sourceAssetId,
                    targetHandle: int.targetSystemId,
                    animated: isHighlighted,
                    style: {
                        stroke: isHighlighted ? '#2563eb' : '#e2e8f0',
                        strokeWidth: isHighlighted ? 2 : 1,
                        opacity: isHighlighted ? 1 : 0.3,
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: isHighlighted ? '#2563eb' : '#e2e8f0',
                    },
                    data: {
                        ...int,
                        onEdgeClick: onEdgeClick // Pass the click handler to the edge
                    },
                };
            });
    }, [integrations, systems, visibleSystemIds, highlightedIds, onEdgeClick]);

    const onNodeDragStop: OnNodeDrag = useCallback(
        (_, node) => {
            updateSystemPosition(node.id, node.position);
        },
        [updateSystemPosition]
    );

    const onConnect: OnConnect = useCallback(
        (params) => {
            setPendingConnection(params);
            setIsCreateIntegrationModalOpen(true);
        },
        []
    );

    const handleCreateIntegrationClose = () => {
        setIsCreateIntegrationModalOpen(false);
        setPendingConnection(null);
    };

    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.stopPropagation();
        onEdgeClick(edge.id);
    }, [onEdgeClick]);

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        const systemId = node.id;

        // Open Details Panel
        onSystemClick(systemId);

        // Lineage Highlighting
        const newHighlightedIds = new Set<string>();

        newHighlightedIds.add(systemId);

        // Outgoing
        const outgoing = integrations.filter(i => {
            const sourceSystem = systems.find(s => s.assets.some(a => a.id === i.sourceAssetId));
            return sourceSystem?.id === systemId;
        });

        // Incoming
        const incoming = integrations.filter(i => i.targetSystemId === systemId);

        outgoing.forEach(i => {
            newHighlightedIds.add(i.id);
            newHighlightedIds.add(i.targetSystemId);
        });

        incoming.forEach(i => {
            newHighlightedIds.add(i.id);
            const sourceSystem = systems.find(s => s.assets.some(a => a.id === i.sourceAssetId));
            if (sourceSystem) newHighlightedIds.add(sourceSystem.id);
        });

        setHighlightedIds(newHighlightedIds);
        setHighlightedSystemId(systemId);
    }, [integrations, systems, onSystemClick]);

    // Expose lineage highlighting for external calls (e.g. from Data Catalogue)
    useEffect(() => {
        if (selectedAssetIdForLineage) {
            const assetId = selectedAssetIdForLineage;
            const newHighlightedIds = new Set<string>();

            // 1. Find the system containing this asset
            const sourceSystem = systems.find(s => s.assets.some(a => a.id === assetId));
            if (sourceSystem) {
                newHighlightedIds.add(sourceSystem.id);
                setHighlightedSystemId(sourceSystem.id); // Focus on this system
                onSystemClick(sourceSystem.id); // Open details panel
            }

            // 2. Find direct downstream integrations (consuming this asset)
            const downstreamIntegrations = integrations.filter(i => i.sourceAssetId === assetId);

            // 3. Recursive downstream traversal
            const traverseDownstream = (currentIntegrations: typeof integrations) => {
                currentIntegrations.forEach(int => {
                    if (!newHighlightedIds.has(int.id)) {
                        newHighlightedIds.add(int.id);
                        newHighlightedIds.add(int.targetSystemId);

                        // Find integrations originating from the target system (system-level lineage for now,
                        // as we don't track column-level lineage through the system yet)
                        // For a stricter "asset" lineage, we'd need to know which asset in the target system
                        // this integration maps to, and then follow THAT asset.
                        // Since our model is simple (Source Asset -> Target System), we'll highlight
                        // ALL outgoing integrations from the target system to show potential impact.

                        const nextOutgoing = integrations.filter(nextInt => {
                            const nextSourceSystem = systems.find(s => s.assets.some(a => a.id === nextInt.sourceAssetId));
                            return nextSourceSystem?.id === int.targetSystemId;
                        });

                        if (nextOutgoing.length > 0) {
                            traverseDownstream(nextOutgoing);
                        }
                    }
                });
            };

            traverseDownstream(downstreamIntegrations);
            setHighlightedIds(newHighlightedIds);
        }
    }, [selectedAssetIdForLineage, systems, integrations, onSystemClick]);

    const handleAssetClick = (startAssetId: string, startSystemId: string) => {
        const newHighlightedIds = new Set<string>();
        const queue: string[] = [startAssetId];

        newHighlightedIds.add(startSystemId);

        while (queue.length > 0) {
            const currentAssetId = queue.shift()!;

            const downstreamIntegrations = integrations.filter(i => i.sourceAssetId === currentAssetId);

            downstreamIntegrations.forEach(integration => {
                newHighlightedIds.add(integration.id);
                newHighlightedIds.add(integration.targetSystemId);
            });
        }

        setHighlightedIds(newHighlightedIds);
        setHighlightedSystemId(null);
    };

    const onPaneClick = useCallback(() => {
        setHighlightedIds(new Set());
        setHighlightedSystemId(null);
    }, []);

    return (
        <div className="h-full w-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodeDragStop={onNodeDragStop}
                onConnect={onConnect}
                onEdgeClick={handleEdgeClick}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
            >
                <Background />
                <Controls />
                <MiniMap />
            </ReactFlow>

            <CreateIntegrationModal
                isOpen={isCreateIntegrationModalOpen}
                onClose={handleCreateIntegrationClose}
                sourceAssetId={pendingConnection?.sourceHandle || null}
                targetSystemId={pendingConnection?.target || null}
            />
        </div>
    );
}

export default function FlowCanvas(props: FlowCanvasProps) {
    return (
        <ReactFlowProvider>
            <FlowCanvasContent {...props} />
        </ReactFlowProvider>
    );
}
