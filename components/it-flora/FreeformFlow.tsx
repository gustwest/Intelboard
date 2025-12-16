import { useCallback, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/store/it-flora/useStore';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FreeformFlowProps {
    projectId: string;
}

const initialNodes: Node[] = [
    { id: '1', position: { x: 100, y: 100 }, data: { label: 'Start' }, type: 'input' },
    { id: '2', position: { x: 100, y: 200 }, data: { label: 'Process' }, type: 'default' },
];
const initialEdges: Edge[] = [];

function Flow({ projectId }: FreeformFlowProps) {
    const { projects, updateProject } = useStore();
    const project = projects.find((p) => p.id === projectId);
    const { toast } = useToast();

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Load saved flow data when project changes
    useEffect(() => {
        if (project?.flowData) {
            setNodes(project.flowData.nodes);
            setEdges(project.flowData.edges);
        } else {
            // Reset to initial if no data
            setNodes(initialNodes);
            setEdges(initialEdges);
        }
    }, [project, setNodes, setEdges]);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

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

    const addNode = (type: string, label: string) => {
        const id = Math.random().toString();
        const newNode: Node = {
            id,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: { label },
            type,
        };
        setNodes((nds) => nds.concat(newNode));
    };

    return (
        <div className="h-[600px] w-full border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
            >
                <Controls />
                <Background />
                <Panel position="top-right" className="bg-white p-2 rounded shadow flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => addNode('default', 'Process')}>Add Process</Button>
                    <Button size="sm" variant="outline" onClick={() => addNode('output', 'End')}>Add End</Button>
                    <Button size="sm" onClick={handleSave} className="gap-2">
                        <Save className="h-4 w-4" /> Save
                    </Button>
                </Panel>
            </ReactFlow>
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
