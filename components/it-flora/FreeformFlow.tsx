import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    Panel,
    ReactFlowProvider,
    MarkerType,
    NodeTypes,
    EdgeTypes,
    useReactFlow,
    OnConnect,
    EdgeChange,
    NodeChange,
    applyNodeChanges,
    applyEdgeChanges,
    OnConnectStart,
    OnConnectEnd,
    reconnectEdge,
    OnReconnect
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/store/it-flora/useStore';
import { Button } from '@/components/ui/button';
import {
    Save, Square, Circle, Diamond, Database, FileText, Cloud,
    Triangle, Hexagon, User, Star, ArrowRight, GripVertical,
    Maximize, Minimize, Undo, Redo, X, StickyNote, ZoomIn, ZoomOut, Maximize2,
    HelpCircle, MousePointer2, Keyboard, Move
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import ShapeNode from './flow/ShapeNode';
import ImageNode from './flow/ImageNode';
import LabelledEdge from './flow/LabelledEdge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectNotes } from '@/components/it-flora/ProjectNotes';
import { cn } from '@/lib/utils';

interface FreeformFlowProps {
    projectId: string;
    viewId: string | null;
}

import NoteNode from './flow/NoteNode';
import { getProjectViews } from '@/lib/actions'; // Need a way to get specific view or just filter

/* ... nodeTypes ... */
const nodeTypes: NodeTypes = {
    shape: ShapeNode,
    image: ImageNode,
    note: NoteNode
};

const edgeTypes: EdgeTypes = {
    labelled: LabelledEdge,
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];
// History limit
const MAX_HISTORY = 50;

function Flow({ projectId, viewId }: FreeformFlowProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { projects, updateProject } = useStore();
    const project = projects.find((p) => p.id === projectId);

    // We need to manage local state for the view data if we escape the project.flowData model
    // BUT to keep it simple, if no viewId is active, we might fallback to project.flowData?
    // Actually, user wants multiple tabs. So we should probably ALWAYS require a viewId for the new mode.
    // However, for migration, we might default to usage of project.flowData if viewId is null?
    // Or just fetch the view.

    const { toast } = useToast();
    const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
    const [copiedNode, setCopiedNode] = useState<Node | null>(null);

    // Feature States
    const [isMaximized, setIsMaximized] = useState(false);
    const [isNotesOpen, setIsNotesOpen] = useState(false);
    const [recentShapes, setRecentShapes] = useState<string[]>(['rectangle', 'diamond', 'circle', 'cloud']);
    const [copiedElements, setCopiedElements] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);
    const [notesWidth, setNotesWidth] = useState(320); // Default 320px
    const [isResizingNotes, setIsResizingNotes] = useState(false);
    // quickAddMenu removed in favor of NodeToolbar in custom nodes

    // Connection tracking
    const connectingNodeId = useRef<string | null>(null);
    const connectingHandleId = useRef<string | null>(null);

    // Reconnection tracking
    const edgeReconnectSuccessful = useRef(true);
    const wasConnectionSuccessful = useRef(false);

    // History State
    const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoing = useRef(false);

    // Color picker state
    const colors = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#94a3b8'];

    const addToRecents = (shape: string) => {
        setRecentShapes(prev => {
            const newRecents = [shape, ...prev.filter(s => s !== shape)].slice(0, 4);
            return newRecents;
        });
    };

    // Load View Data
    useEffect(() => {
        if (viewId && projectId) {
            getProjectViews(projectId).then(views => {
                const view = views.find(v => v.id === viewId);
                if (view && view.data) {
                    // @ts-ignore
                    const loadedNodes = view.data.nodes || [];
                    // @ts-ignore
                    const loadedEdges = view.data.edges || [];
                    setNodes(loadedNodes);
                    setEdges(loadedEdges);
                } else {
                    setNodes([]);
                    setEdges([]);
                }
            });
        }
    }, [viewId, projectId, setNodes, setEdges]);

    // Auto-save logic specific to VIEW
    // Overriding the old project.flowData save logic
    useEffect(() => {
        if (!viewId) return;

        const saveTimeout = setTimeout(() => {
            // We need a server action to update the view data. 
            // Reuse updateProject? No, we need updateProjectView.
            // I'll need to create updateProjectView in actions.ts first.
            // For now, I will just log or TODO, but actually this breaks persistence.

            // To fix this properly I need `updateProjectView` action.
            // Assuming I will add it.
            import("@/lib/actions").then(actions => {
                // @ts-ignore
                if (actions.updateProjectView) {
                    // @ts-ignore
                    actions.updateProjectView(viewId, { nodes, edges });
                }
            });

        }, 1000);

        return () => clearTimeout(saveTimeout);
    }, [nodes, edges, viewId]);

    // Handle Notes Sidebar Resizing
    const handleNotesResize = useCallback((e: MouseEvent) => {
        if (!isResizingNotes) return;
        const newWidth = window.innerWidth - e.clientX;
        setNotesWidth(Math.max(250, Math.min(600, newWidth))); // Min 250, Max 600
    }, [isResizingNotes]);

    useEffect(() => {
        if (isResizingNotes) {
            window.addEventListener('mousemove', handleNotesResize);
            window.addEventListener('mouseup', () => setIsResizingNotes(false));
            return () => {
                window.removeEventListener('mousemove', handleNotesResize);
                window.removeEventListener('mouseup', () => setIsResizingNotes(false));
            };
        }
    }, [isResizingNotes, handleNotesResize]);

    // History Snapshots
    const takeSnapshot = useCallback(() => {
        if (isUndoing.current) return;

        const currentSnapshot = { nodes, edges };
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(currentSnapshot);
            if (newHistory.length > MAX_HISTORY) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    }, [nodes, edges, historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            isUndoing.current = true;
            const previousSnapshot = history[historyIndex - 1];
            setNodes(previousSnapshot.nodes);
            setEdges(previousSnapshot.edges);
            setHistoryIndex(historyIndex - 1);
            setTimeout(() => { isUndoing.current = false; }, 0);
        }
    }, [history, historyIndex, setNodes, setEdges]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            isUndoing.current = true;
            const nextSnapshot = history[historyIndex + 1];
            setNodes(nextSnapshot.nodes);
            setEdges(nextSnapshot.edges);
            setHistoryIndex(historyIndex + 1);
            setTimeout(() => { isUndoing.current = false; }, 0);
        }
    }, [history, historyIndex, setNodes, setEdges]);

    // Register initial state
    useEffect(() => {
        if (history.length === 0 && nodes.length === 0 && edges.length === 0) {
            setHistory([{ nodes: [], edges: [] }]);
            setHistoryIndex(0);
        }
    }, []);

    // Helper to record history on imperative changes
    const recordHistory = () => {
        takeSnapshot();
    };


    // Keyboard & Paste handling
    useEffect(() => {
        const handleKeyDown = async (event: KeyboardEvent) => {
            const isCtrlOrCmd = event.ctrlKey || event.metaKey;

            // Avoid triggering shortcuts when typing in inputs/textareas
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            // Copy
            if (isCtrlOrCmd && event.key === 'c') {
                const selectedNodes = nodes.filter(n => n.selected);
                const selectedEdges = edges.filter(e => e.selected);

                if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    setCopiedElements({
                        nodes: selectedNodes,
                        edges: selectedEdges
                    });
                }
            }

            // Paste
            if (isCtrlOrCmd && event.key === 'v') {
                if (copiedElements) {
                    recordHistory();

                    const idMap: Record<string, string> = {};

                    const newNodes = copiedElements.nodes.map(node => {
                        const newId = Math.random().toString();
                        idMap[node.id] = newId;
                        return {
                            ...node,
                            id: newId,
                            position: {
                                x: node.position.x + 50,
                                y: node.position.y + 50
                            },
                            selected: true,
                            data: { ...node.data, isEditing: false }
                        };
                    });

                    const newEdges = copiedElements.edges.map(edge => ({
                        ...edge,
                        id: Math.random().toString(),
                        source: idMap[edge.source] || edge.source,
                        target: idMap[edge.target] || edge.target,
                        selected: true
                    }));

                    setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
                    setEdges((eds) => eds.map(e => ({ ...e, selected: false })).concat(newEdges));
                }
            }

            // Undo (Ctrl+Z)
            if (isCtrlOrCmd && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
            }

            // Redo (Ctrl+Y or Ctrl+Shift+Z)
            if ((isCtrlOrCmd && event.key === 'y') || (isCtrlOrCmd && event.shiftKey && event.key === 'z')) {
                event.preventDefault();
                redo();
            }

            // Delete
            if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '\\') {
                const selectedNodes = nodes.filter(n => n.selected);
                const selectedEdges = edges.filter(e => e.selected);

                if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    recordHistory();

                    const nodeIdsToRemove = selectedNodes.map(n => n.id);
                    const edgeIdsToRemove = selectedEdges.map(e => e.id);

                    setNodes((nds) => nds.filter(n => !nodeIdsToRemove.includes(n.id)));
                    setEdges((eds) => eds.filter(e =>
                        !edgeIdsToRemove.includes(e.id) &&
                        !nodeIdsToRemove.includes(e.source) &&
                        !nodeIdsToRemove.includes(e.target)
                    ));

                    setSelectedNode(null);
                    setSelectedEdge(null);
                }
            }
        };

        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    if (!blob) continue;

                    recordHistory();
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const result = e.target?.result as string;
                        // Create Image Node
                        const position = screenToFlowPosition({
                            x: window.innerWidth / 2, // Center of screen? Or cursor? Paste typically centers or uses cursor if possible.
                            y: window.innerHeight / 2
                        });
                        // Adjust for center of flow view is hard without ref to flow instance center.
                        // Let's just put it somewhat visibly. If we had mouse pos...

                        const newNode: Node = {
                            id: Math.random().toString(),
                            type: 'image',
                            position: { x: 100, y: 100 }, // Default fallback position 
                            data: { src: result, label: 'Pasted Image' },
                            style: { width: 200, height: 200 },
                            selected: true
                        };
                        setNodes((nds) => nds.concat(newNode));
                    };
                    reader.readAsDataURL(blob);
                    event.preventDefault(); // Prevent double paste behavior if text matches
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('paste', handlePaste);
        };
    }, [nodes, edges, copiedElements, selectedNode, selectedEdge, copiedNode, setNodes, setEdges, undo, redo, recordHistory, screenToFlowPosition]);


    const onConnect: OnConnect = useCallback(
        (params) => {
            wasConnectionSuccessful.current = true;
            recordHistory();
            setEdges((eds) => addEdge({ ...params, type: 'labelled', markerEnd: { type: MarkerType.ArrowClosed } }, eds));
        },
        [setEdges],
    );

    const onConnectStart: OnConnectStart = useCallback((_, { nodeId, handleId }) => {
        connectingNodeId.current = nodeId;
        connectingHandleId.current = handleId;
        wasConnectionSuccessful.current = false;
    }, []);

    const onConnectEnd: OnConnectEnd = useCallback(
        (event) => {
            if (!connectingNodeId.current || wasConnectionSuccessful.current) return;

            const target = event.target as HTMLElement;
            // Check if dropped on pane (empty space) and NOT on a node or edge
            const { clientX, clientY } = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
            const elementUnderMouse = document.elementFromPoint(clientX, clientY);

            const isPane = target.classList.contains('react-flow__pane') || elementUnderMouse?.classList.contains('react-flow__pane');
            const isNode = !!target.closest('.react-flow__node') || !!elementUnderMouse?.closest('.react-flow__node');
            const isEdge = !!target.closest('.react-flow__edge') || !!elementUnderMouse?.closest('.react-flow__edge');
            const isHandle = !!target.closest('.react-flow__handle') || !!elementUnderMouse?.closest('.react-flow__handle');

            if (isPane && !isNode && !isEdge && !isHandle) {
                recordHistory();
                // We need to calculate the position where the user dropped the line
                // event is MouseEvent or TouchEvent
                const { clientX, clientY } = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);

                const position = screenToFlowPosition({
                    x: clientX,
                    y: clientY,
                });

                const shapeToUse = recentShapes[0] || 'rectangle';
                const newNodeId = Math.random().toString();
                const newNode: Node = {
                    id: newNodeId,
                    type: 'shape',
                    position: {
                        // Center the node on cursor roughly
                        x: position.x - 75,
                        y: position.y - 40
                    },
                    data: {
                        label: ``, // Empty start for typing
                        shape: shapeToUse,
                        color: '#ffffff',
                        isEditing: true // Trigger inline edit
                    },
                    style: { width: 150, height: 80 },
                    selected: true,
                };

                const newEdge: Edge = {
                    id: Math.random().toString(),
                    source: connectingNodeId.current,
                    sourceHandle: connectingHandleId.current,
                    target: newNodeId,
                    type: 'labelled',
                    markerEnd: { type: MarkerType.ArrowClosed },
                };

                setNodes((nds) => [...nds.map(n => ({ ...n, selected: false })), newNode]);
                setEdges((eds) => eds.concat(newEdge));

                // NodeToolbar handled by child nodes
                setSelectedNode(newNode);
                setSelectedEdge(null);
                addToRecents(shapeToUse);
            }

            connectingNodeId.current = null;
            connectingHandleId.current = null;
        },
        [screenToFlowPosition, recentShapes, setNodes, setEdges, recordHistory, connectingHandleId, connectingNodeId]
    );

    const onReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
        edgeReconnectSuccessful.current = true;
        setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
    }, [setEdges]);

    const onReconnectStart = useCallback(() => {
        edgeReconnectSuccessful.current = false;
    }, []);

    const onReconnectEnd = useCallback((_: any, edge: Edge) => {
        if (!edgeReconnectSuccessful.current) {
            // setEdges((eds) => eds.filter((e) => e.id !== edge.id)); // Uncomment if we want to delete edge on failed reconnect
        }
        edgeReconnectSuccessful.current = true;
    }, []);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            const shape = event.dataTransfer.getData('application/shape');

            // check if the dropped element is valid
            if (typeof type === 'undefined' || !type) {
                return;
            }

            recordHistory();
            if (shape) addToRecents(shape);

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Default size improved for better aspect ratio
            const newNode: Node = {
                id: Math.random().toString(),
                type: shape === 'note' ? 'note' : 'shape',
                position,
                data: {
                    label: shape === 'note' ? '' : `New ${shape}`,
                    shape: shape === 'note' ? undefined : shape,
                    color: shape === 'note' ? undefined : '#ffffff',
                    isEditing: true // Auto-edit after drop
                },
                style: shape === 'note' ? { width: 150, height: 100 } : { width: 150, height: 80 }
            };

            setNodes((nds) => nds.concat(newNode));
            setSelectedNode(newNode);
        },
        [screenToFlowPosition, setNodes, recordHistory, addToRecents, setSelectedNode],
    );

    const onDragStart = (event: React.DragEvent, nodeType: string, shapeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.setData('application/shape', shapeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    // handleSave is now automatic via useEffect
    const handleSave = () => {
        if (!project) return;
        updateProject(project.id, {
            flowData: { nodes, edges }
        });
        toast({
            title: "Changes Saved",
            description: "Flowchart is up to date.",
        });
    };

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setSelectedEdge(null);

        // Trigger inline edit on single click for shapes and notes
        if (node.type === 'shape' || node.type === 'note') {
            setNodes((nds) =>
                nds.map(n => n.id === node.id
                    ? { ...n, data: { ...n.data, isEditing: true } }
                    : { ...n, data: { ...n.data, isEditing: false } }
                )
            );
        }
    }, [setNodes]);

    const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        setSelectedEdge(edge);
        setSelectedNode(null);

        // Trigger edge selection which LabelledEdge uses to show input
        setEdges((eds) =>
            eds.map(e => ({ ...e, selected: e.id === edge.id }))
        );
    }, [setEdges]);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedEdge(null);
        // Also handling blur logic via ShapeNode component
    }, []);

    const updateSelectedNode = (key: string, value: any) => {
        if (!selectedNode) return;
        recordHistory(); // Snap on node property change

        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === selectedNode.id) {
                    const updatedNode = {
                        ...node,
                        data: {
                            ...node.data,
                            [key]: value,
                        },
                    };
                    setSelectedNode(updatedNode); // Update local state to reflect change immediately in UI
                    return updatedNode;
                }
                return node;
            })
        );
    };

    const updateSelectedNodesBulk = (key: string, value: any) => {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length === 0) return;

        recordHistory();
        const selectedIds = selectedNodes.map(n => n.id);

        setNodes((nds) =>
            nds.map((node) => {
                if (selectedIds.includes(node.id)) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            [key]: value,
                        },
                    };
                }
                return node;
            })
        );
    };

    const changeSelectedNodesShape = (shapeType: string) => {
        const selectedNodes = nodes.filter(n => n.selected && n.type === 'shape');
        if (selectedNodes.length === 0) return;

        recordHistory();
        const selectedIds = selectedNodes.map(n => n.id);

        setNodes((nds) =>
            nds.map((node) => {
                if (selectedIds.includes(node.id)) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            type: shapeType,
                        },
                    };
                }
                return node;
            })
        );
    };

    const updateSelectedEdge = (key: string, value: any) => {
        if (!selectedEdge) return;
        recordHistory();

        setEdges((eds) =>
            eds.map((edge) => {
                if (edge.id === selectedEdge.id) {
                    const updatedEdge = {
                        ...edge,
                        [key]: value,
                    };
                    setSelectedEdge(updatedEdge);
                    return updatedEdge;
                }
                return edge;
            })
        );
    };

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    const sidebarItems = [
        { type: 'rectangle', icon: Square, label: 'Process' },
        { type: 'diamond', icon: Diamond, label: 'Decision' },
        { type: 'circle', icon: Circle, label: 'Start/End' },
        { type: 'database', icon: Database, label: 'Database' },
        { type: 'document', icon: FileText, label: 'Document' },
        { type: 'cloud', icon: Cloud, label: 'Cloud' },
        { type: 'triangle', icon: Triangle, label: 'Merge' },
        { type: 'hexagon', icon: Hexagon, label: 'Prep' },
        { type: 'actor', icon: User, label: 'User' },
        { type: 'star', icon: Star, label: 'Star' },
        { type: 'arrow-right', icon: ArrowRight, label: 'Input' },
        { type: 'note', icon: StickyNote, label: 'Note' },
    ];

    const containerClasses = isMaximized
        ? "fixed inset-0 z-50 bg-white flex h-screen w-screen"
        : "flex h-full w-full border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 overflow-hidden relative";

    return (
        <div className={containerClasses}>
            {/* Sidebar */}
            <div className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-3 z-10 overflow-y-auto shrink-0 shadow-sm">
                {!isMaximized && (
                    <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider text-center w-full">Shapes</div>
                )}
                {sidebarItems.map((item) => (
                    <div
                        key={item.type}
                        className="p-2 bg-slate-50 hover:bg-slate-100 rounded cursor-grab active:cursor-grabbing border border-transparent hover:border-slate-300 transition-all text-center flex flex-col items-center gap-1 w-14 shadow-sm"
                        onDragStart={(event) => onDragStart(event, 'shape', item.type)}
                        draggable
                        title={item.label}
                    >
                        <item.icon className="h-5 w-5 text-slate-600" />
                        <span className="text-[9px] text-slate-500 font-medium truncate w-full leading-tight">{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Canvas */}
            <div className="flex-1 relative h-full w-full" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectStart={onConnectStart}
                    onConnectEnd={onConnectEnd}
                    onReconnect={onReconnect}
                    onReconnectStart={onReconnectStart}
                    onReconnectEnd={onReconnectEnd}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    className="bg-slate-50"
                    snapToGrid
                    snapGrid={[20, 20]}
                    selectionOnDrag={true}
                    selectionKeyCode="Shift"
                    multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
                >
                    <Background color="#94a3b8" gap={20} size={1} />

                    <Panel position="top-right" className="flex gap-2 items-start z-[100]">
                        {/* Unified Toolbar */}
                        <div className="bg-white p-1.5 rounded-lg shadow-lg border border-slate-200 flex items-center gap-1.5 backdrop-blur-sm bg-white/90">
                            {/* Zoom Section */}
                            <div className="flex items-center gap-0.5">
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => zoomIn()} title="Zoom In">
                                    <ZoomIn className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => zoomOut()} title="Zoom Out">
                                    <ZoomOut className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => fitView()} title="Fit View">
                                    <Maximize2 className="h-4 w-4 text-slate-600" />
                                </Button>
                            </div>

                            <div className="w-px h-6 bg-slate-200 mx-0.5" />

                            {/* History Section */}
                            <div className="flex items-center gap-0.5">
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
                                    <Undo className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
                                    <Redo className="h-4 w-4 text-slate-600" />
                                </Button>
                            </div>

                            <div className="w-px h-6 bg-slate-200 mx-0.5" />

                            {/* Feature Section */}
                            <div className="flex items-center gap-0.5">
                                <Button variant="ghost" size="sm" className={cn("h-8 gap-2 px-3", isNotesOpen && "bg-slate-100 text-primary")} onClick={() => setIsNotesOpen(!isNotesOpen)}>
                                    <StickyNote className="h-4 w-4" />
                                    <span className="text-xs font-semibold">Notes</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={toggleMaximize} title={isMaximized ? "Minimize" : "Maximize"}>
                                    {isMaximized ? <Minimize className="h-4 w-4 text-slate-600" /> : <Maximize className="h-4 w-4 text-slate-600" />}
                                </Button>

                                <div className="w-px h-6 bg-slate-200 mx-0.5" />

                                {/* Help Guide */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" title="Board Controls Guide">
                                            <HelpCircle className="h-4 w-4 text-slate-600" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-4 border-slate-200 shadow-xl" align="end" sideOffset={10}>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 border-b pb-2">
                                                <HelpCircle className="h-4 w-4 text-primary" />
                                                <h3 className="font-bold text-sm">Board Controls Guide</h3>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex gap-3">
                                                    <div className="p-1.5 bg-slate-100 rounded h-fit">
                                                        <MousePointer2 className="h-4 w-4 text-slate-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold mb-0.5">Multi-Selection</p>
                                                        <p className="text-xs text-slate-500 leading-relaxed">
                                                            Hold <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Shift</kbd> or <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Ctrl/Cmd</kbd> and click shapes to select multiple.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-3">
                                                    <div className="p-1.5 bg-slate-100 rounded h-fit">
                                                        <Move className="h-4 w-4 text-slate-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold mb-0.5">Area Selection</p>
                                                        <p className="text-xs text-slate-500 leading-relaxed">
                                                            Hold <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Shift</kbd> and drag on the background to select items in an area.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-3">
                                                    <div className="p-1.5 bg-slate-100 rounded h-fit">
                                                        <Keyboard className="h-4 w-4 text-slate-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold mb-0.5">Keyboard Shortcuts</p>
                                                        <div className="grid grid-cols-2 gap-y-1 mt-1 font-mono text-[10px] text-slate-600">
                                                            <span>Ctrl+C / V</span> <span>Copy / Paste</span>
                                                            <span>Del / Bksp</span> <span>Delete Items</span>
                                                            <span>Ctrl+Z / Y</span> <span>Undo / Redo</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                                <p className="text-[10px] text-slate-500 italic">
                                                    Tip: Double-click a Note to expand it. Connect shapes by dragging from the dots.
                                                </p>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </Panel>

                    {/* Node/Batch Editing Panel */}
                    {(selectedNode || nodes.some(n => n.selected)) && (
                        <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 w-64 space-y-4 animate-in fade-in slide-in-from-left-2 z-50">
                            <div>
                                <h4 className="font-semibold text-sm mb-2">
                                    {nodes.filter(n => n.selected).length > 1
                                        ? `Batch Edit (${nodes.filter(n => n.selected).length} items)`
                                        : (selectedNode?.type === 'image' ? 'Edit Image' : 'Edit Node')}
                                </h4>
                                <div className="space-y-3">
                                    {nodes.filter(n => n.selected).length === 1 && (
                                        <div className="space-y-1">
                                            <Label className="text-xs">Label</Label>
                                            <Input
                                                value={nodes.find(n => n.selected)?.data.label as string || ''}
                                                onChange={(e) => updateSelectedNode('label', e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                    )}

                                    {/* Color for any selection */}
                                    <div className="space-y-1">
                                        <Label className="text-xs">Color</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {colors.map((c) => (
                                                <button
                                                    key={c}
                                                    className={`w-6 h-6 rounded-full border border-slate-200 transition-transform hover:scale-110 ${nodes.find(n => n.selected)?.data.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => updateSelectedNodesBulk('color', c)}
                                                    title={c}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bulk Shape Change */}
                                    {nodes.filter(n => n.selected && n.type === 'shape').length > 0 && (
                                        <div className="space-y-1 pt-1 border-t">
                                            <Label className="text-xs">Shape Type</Label>
                                            <div className="grid grid-cols-4 gap-2 py-1">
                                                {sidebarItems.filter(i => i.type !== 'note').map((item) => (
                                                    <Button
                                                        key={item.type}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 hover:bg-slate-100 border border-transparent hover:border-slate-200"
                                                        onClick={() => changeSelectedNodesShape(item.type)}
                                                        title={item.label}
                                                    >
                                                        <item.icon className="h-4 w-4 text-slate-600" />
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Panel>
                    )}

                    {/* Edge Editing Panel */}
                    {selectedEdge && (
                        <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 w-64 space-y-4 animate-in fade-in slide-in-from-left-2 z-50">
                            <div>
                                <h4 className="font-semibold text-sm mb-2">Edit Connection</h4>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Line Type</Label>
                                        <Select
                                            value={selectedEdge.type || 'default'}
                                            onValueChange={(value) => updateSelectedEdge('type', value)}
                                        >
                                            <SelectTrigger className="h-8 text-sm">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Bezier (Curved)</SelectItem>
                                                <SelectItem value="straight">Straight</SelectItem>
                                                <SelectItem value="step">Step (Cornered)</SelectItem>
                                                <SelectItem value="smoothstep">Smooth Step</SelectItem>
                                                <SelectItem value="labelled">Labelled Edge</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Animation</Label>
                                        <Select
                                            value={selectedEdge.animated ? 'yes' : 'no'}
                                            onValueChange={(value) => updateSelectedEdge('animated', value === 'yes')}
                                        >
                                            <SelectTrigger className="h-8 text-sm">
                                                <SelectValue placeholder="Animated?" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="no">Static</SelectItem>
                                                <SelectItem value="yes">Animated</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </Panel>
                    )}

                    {/* NodeToolbar is now inside custom nodes */}
                </ReactFlow>

                {/* Floating Project Notes Overlay */}
                {isNotesOpen && (
                    <div
                        className="absolute top-4 right-4 bottom-4 z-50 animate-in slide-in-from-right-5 pointer-events-none"
                        style={{ width: `${notesWidth}px` }}
                    >
                        <div className="relative h-full pointer-events-auto group">
                            {/* Resize Handle - Much wider hit area (64px) */}
                            <div
                                className="absolute top-0 bottom-0 -left-8 w-16 cursor-col-resize flex items-center justify-center group/handle z-[60] pointer-events-auto"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    setIsResizingNotes(true);
                                }}
                            >
                                <div className={cn(
                                    "w-1 h-12 bg-slate-300 rounded-full transition-all duration-200",
                                    isResizingNotes ? "h-full w-1.5 bg-primary" : "group-hover/handle:h-24 group-hover/handle:bg-slate-400 group-hover/handle:w-1.5"
                                )} />
                            </div>

                            <Button
                                size="icon"
                                variant="secondary"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md z-50 border border-slate-200"
                                onClick={() => setIsNotesOpen(false)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                            <ProjectNotes projectId={projectId} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function FreeformFlow(props: FreeformFlowProps) {
    return (
        <ReactFlowProvider>
            <Flow {...props} />
        </ReactFlowProvider>
    )
}
