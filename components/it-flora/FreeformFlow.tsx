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
    Maximize, Minimize, Undo, Redo, X, StickyNote
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
}

const nodeTypes: NodeTypes = {
    shape: ShapeNode,
    image: ImageNode
};

const edgeTypes: EdgeTypes = {
    labelled: LabelledEdge,
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// History limit
const MAX_HISTORY = 50;

function Flow({ projectId }: FreeformFlowProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { projects, updateProject } = useStore();
    const project = projects.find((p) => p.id === projectId);
    const { toast } = useToast();
    const { screenToFlowPosition } = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
    const [copiedNode, setCopiedNode] = useState<Node | null>(null);

    // Feature States
    const [isMaximized, setIsMaximized] = useState(false);
    const [isNotesOpen, setIsNotesOpen] = useState(false);
    const [recentShapes, setRecentShapes] = useState<string[]>(['rectangle', 'diamond', 'circle', 'cloud']);
    const [quickAddMenu, setQuickAddMenu] = useState<{ nodeId: string, x: number, y: number } | null>(null);

    // Connection tracking
    const connectingNodeId = useRef<string | null>(null);
    const connectingHandleId = useRef<string | null>(null);

    // Reconnection tracking
    const edgeReconnectSuccessful = useRef(true);

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

    // Load saved flow data when project changes
    useEffect(() => {
        if (project?.flowData) {
            setNodes(project.flowData.nodes.length > 0 ? project.flowData.nodes : initialNodes);
            setEdges(project.flowData.edges.length > 0 ? project.flowData.edges : initialEdges);
            // Reset history on project load
            setHistory([]);
            setHistoryIndex(-1);
        } else {
            setNodes(initialNodes);
            setEdges(initialEdges);
            setHistory([]);
            setHistoryIndex(-1);
        }
    }, [project, setNodes, setEdges]);

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

            // Copy
            if (isCtrlOrCmd && event.key === 'c') {
                if (selectedNode) {
                    setCopiedNode(selectedNode);
                }
            }

            // Paste
            if (isCtrlOrCmd && event.key === 'v') {
                // Check for image in clipboard explicitly if not handling text paste
                // We do this via the clipboard API/event because 'v' key doesn't carry data
                // Ideally paste should be a 'paste' listener, but let's try to handle standard object paste here
                // and image paste via a separate listener or try to access navigator.clipboard

                if (copiedNode) {
                    recordHistory();
                    const position = {
                        x: copiedNode.position.x + 50,
                        y: copiedNode.position.y + 50,
                    };

                    const newNode: Node = {
                        ...copiedNode,
                        id: Math.random().toString(),
                        position,
                        selected: true,
                        data: { ...copiedNode.data, isEditing: false } // ensure paste doesn't trigger edit
                    };

                    setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat([newNode as any]));
                    setSelectedNode(newNode);
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
                // If editing text, don't delete node!
                // We can check if document.activeElement is an input/textarea.
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea') return;

                if (selectedNode || selectedEdge) {
                    recordHistory();
                    if (selectedNode) {
                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                        setSelectedNode(null);
                        setQuickAddMenu(null);
                    }
                    if (selectedEdge) {
                        setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
                        setSelectedEdge(null);
                    }
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
    }, [selectedNode, selectedEdge, copiedNode, setNodes, setEdges, undo, redo, recordHistory, screenToFlowPosition]);


    const onConnect: OnConnect = useCallback(
        (params) => {
            recordHistory();
            setEdges((eds) => addEdge({ ...params, type: 'labelled', markerEnd: { type: MarkerType.ArrowClosed } }, eds));
        },
        [setEdges],
    );

    const onConnectStart: OnConnectStart = useCallback((_, { nodeId, handleId }) => {
        connectingNodeId.current = nodeId;
        connectingHandleId.current = handleId;
    }, []);

    const onConnectEnd: OnConnectEnd = useCallback(
        (event) => {
            if (!connectingNodeId.current) return;

            const target = event.target as HTMLElement;
            // Check if dropped on pane (empty space)
            const isPane = target.classList.contains('react-flow__pane');

            if (isPane) {
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

                // Show Quick Add Menu above the new node
                setQuickAddMenu({
                    nodeId: newNodeId,
                    x: position.x - 75,
                    y: position.y - 100 // Position above
                });

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
                type: 'shape',
                position,
                data: {
                    label: `New ${shape}`,
                    shape,
                    color: '#ffffff',
                    isEditing: false // Drag drop doesn't trigger edit by default unless requested? Let's keep it consistent.
                },
                style: { width: 150, height: 80 }
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes, recordHistory, addToRecents],
    );

    const onDragStart = (event: React.DragEvent, nodeType: string, shapeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.setData('application/shape', shapeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleSave = () => {
        if (!project) return;
        updateProject(project.id, {
            flowData: { nodes, edges }
        });
        toast({
            title: "Flowchart saved",
            description: "Your flowchart has been saved to the project.",
        });
    };

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setSelectedEdge(null);
        // If clicking a different node, close menu? User said "click anywhere... and options go away".
        // If clicking the SAME node, maybe toggle? Let's just close if it's not the quick menu target.
        if (quickAddMenu && quickAddMenu.nodeId !== node.id) {
            setQuickAddMenu(null);
        }
    }, [quickAddMenu]);

    const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        setSelectedEdge(edge);
        setSelectedNode(null);
        setQuickAddMenu(null);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedEdge(null);
        setQuickAddMenu(null);
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

    const updateSelectedEdge = (key: string, value: any) => {
        if (!selectedEdge) return;
        recordHistory(); // Snap on type change

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

    const handleQuickShapeChange = (shape: string) => {
        if (!quickAddMenu) return;

        recordHistory();
        addToRecents(shape);

        setNodes((nds) =>
            nds.map(node => {
                if (node.id === quickAddMenu.nodeId) {
                    return {
                        ...node,
                        data: { ...node.data, shape, label: node.data.label || `New ${shape}` }
                        // Keep editing state if it was there? 
                        // Probably safer to let it persist from component state or re-trigger if needed.
                        // Ideally we don't mess with isEditing here, let ShapeNode handle it.
                    };
                }
                return node;
            })
        );
        // Keep menu open as per request "choose... if you want to... click anywhere... options go away",
        // implying meaningful choice doesn't auto-dismiss? 
        // Or "click on another connection point... without having to click again".
        // Actually standard UX is usually to confirm and close. But the user phrasing "if not you can just click anywhere" suggests it stays.
        // I will keep it open to allow rapid switching until satisfied.
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
    ];

    const containerClasses = isMaximized
        ? "fixed inset-0 z-50 bg-white flex h-screen w-screen"
        : "flex h-[600px] w-full border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 overflow-hidden relative";

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
                >
                    <Controls />
                    <Background color="#94a3b8" gap={20} size={1} />

                    <Panel position="top-right" className="flex gap-2 items-start">
                        {/* Toolbar */}
                        <div className="bg-white p-2 rounded-lg shadow-md border border-slate-200 flex items-center gap-1 mr-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
                                <Undo className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
                                <Redo className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-6 bg-slate-200 mx-1" />
                            <Button variant="ghost" size="sm" className={cn("h-8 gap-2", isNotesOpen && "bg-slate-100")} onClick={() => setIsNotesOpen(!isNotesOpen)}>
                                <StickyNote className="h-4 w-4" /> Note
                            </Button>
                            <div className="w-px h-6 bg-slate-200 mx-1" />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMaximize} title={isMaximized ? "Minimize" : "Maximize"}>
                                {isMaximized ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </Button>
                        </div>

                        <div className="bg-white p-2 rounded-lg shadow-md border border-slate-200">
                            <Button size="sm" onClick={handleSave} className="gap-2 h-8">
                                <Save className="h-4 w-4" /> Save
                            </Button>
                        </div>
                    </Panel>

                    {/* Node Editing Panel */}
                    {selectedNode && (
                        <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 w-64 space-y-4 animate-in fade-in slide-in-from-left-2 z-50">
                            <div>
                                <h4 className="font-semibold text-sm mb-2">{selectedNode.type === 'image' ? 'Edit Image' : 'Edit Node'}</h4>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Label</Label>
                                        <Input
                                            value={selectedNode.data.label as string || ''}
                                            onChange={(e) => updateSelectedNode('label', e.target.value)}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                    {selectedNode.type !== 'image' && (
                                        <div className="space-y-1">
                                            <Label className="text-xs">Color</Label>
                                            <div className="flex flex-wrap gap-2">
                                                {colors.map((c) => (
                                                    <button
                                                        key={c}
                                                        className={`w-6 h-6 rounded-full border border-slate-200 transition-transform hover:scale-110 ${selectedNode.data.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                                        style={{ backgroundColor: c }}
                                                        onClick={() => updateSelectedNode('color', c)}
                                                        title={c}
                                                    />
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

                    {/* Quick Add Menu */}
                    {quickAddMenu && (
                        <div
                            className="absolute z-50 bg-white p-2 rounded-lg shadow-xl border border-slate-200 animate-in zoom-in-95"
                            style={{
                                left: quickAddMenu.x,
                                top: quickAddMenu.y,
                                transform: 'translate(-50%, -100%)', // Center above
                            }}
                        >
                            {/* RECENTS SECTION */}
                            <div className="text-[10px] font-bold text-slate-400 mb-1 px-1">RECENTS</div>
                            <div className="flex gap-1 mb-2">
                                {recentShapes.map((shape) => {
                                    const item = sidebarItems.find(i => i.type === shape);
                                    if (!item) return null;
                                    return (
                                        <button
                                            key={shape}
                                            className="p-1.5 rounded hover:bg-slate-100 flex items-center justify-center transition-colors border border-slate-100"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickShapeChange(shape);
                                            }}
                                            title={item.label}
                                        >
                                            <item.icon className="h-4 w-4 text-slate-600" />
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="w-full h-px bg-slate-100 my-1" />

                            {/* ALL SHAPES */}
                            <div className="text-[10px] font-bold text-slate-400 mb-1 px-1">ALL</div>
                            <div className="grid grid-cols-4 gap-1">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.type}
                                        className="p-1.5 rounded hover:bg-slate-100 flex items-center justify-center transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleQuickShapeChange(item.type);
                                        }}
                                        title={item.label}
                                    >
                                        <item.icon className="h-4 w-4 text-slate-600" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </ReactFlow>

                {/* Floating Project Notes Overlay */}
                {isNotesOpen && (
                    <div className="absolute bottom-4 right-4 w-80 z-50 animate-in slide-in-from-bottom-5">
                        <div className="relative">
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
