import React from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
    useReactFlow,
} from '@xyflow/react';
import { Settings, Database, Globe, FileText, Server } from 'lucide-react';

// Logo mapping helper
const getTechnologyLogo = (technology?: string) => {
    const tech = technology?.toLowerCase() || '';

    if (tech.includes('kafka')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Apache_Kafka_logo.svg', alt: 'Kafka' };
    }
    if (tech.includes('informatica')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Informatica_Logo.svg', alt: 'Informatica' };
    }
    if (tech.includes('oracle') || tech.includes('ogg')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg', alt: 'Oracle' };
    }
    if (tech.includes('snowflake')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Snowflake_Logo.svg', alt: 'Snowflake' };
    }
    if (tech.includes('aws') || tech.includes('s3')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg', alt: 'AWS' };
    }
    if (tech.includes('azure')) {
        return { type: 'image', src: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Microsoft_Azure.svg', alt: 'Azure' };
    }

    // Fallback icons
    if (tech.includes('api') || tech.includes('rest') || tech.includes('http')) {
        return { type: 'icon', component: Globe, color: '#3b82f6' };
    }
    if (tech.includes('sql') || tech.includes('db') || tech.includes('database')) {
        return { type: 'icon', component: Database, color: '#f59e0b' };
    }
    if (tech.includes('file') || tech.includes('ftp') || tech.includes('sftp')) {
        return { type: 'icon', component: FileText, color: '#10b981' };
    }

    return { type: 'icon', component: Settings, color: '#64748b' };
};

export default function IntegrationEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
}: EdgeProps) {
    const { setEdges } = useReactFlow();
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetPosition,
        targetX,
        targetY,
    });

    const technology = (data?.technology as string) || '';
    const logo = getTechnologyLogo(technology);

    // Handle edge click to open details
    // We'll rely on the parent's onEdgeClick handler which is passed via the React Flow onEdgeClick prop
    // But we want the logo specifically to be clickable

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    <button
                        className="flex items-center justify-center w-8 h-8 bg-white rounded-full shadow-md border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all overflow-hidden"
                        onClick={(event) => {
                            event.stopPropagation();
                            // Trigger the global onEdgeClick by simulating a click on the edge
                            // Or better, we can dispatch a custom event or use a context if available.
                            // However, since FlowCanvas passes onEdgeClick to ReactFlow, clicking this button
                            // inside the edge might not automatically trigger it if we stop propagation.
                            // But we WANT to stop propagation to avoid selecting the edge line itself if that's not desired.
                            // Actually, let's just let the click bubble up or trigger the store action directly if possible?
                            // The FlowCanvas passes `onEdgeClick` to ReactFlow. 
                            // We can access the `onEdgeClick` handler if we passed it in `data`, but we didn't.
                            // Let's update FlowCanvas to pass the handler in `data` or just rely on bubbling.
                            // If we don't stop propagation, it should bubble to the edge click handler.
                            // But `pointerEvents: 'all'` on the label renderer might interfere.
                            // Let's try to find the edge element and click it? No, that's hacky.

                            // Best approach: Pass a callback in `data`.
                            if (data?.onEdgeClick && typeof data.onEdgeClick === 'function') {
                                (data.onEdgeClick as (id: string) => void)(id);
                            }
                        }}
                        title={technology || 'Integration'}
                    >
                        {logo.type === 'image' ? (
                            <img
                                src={logo.src}
                                alt={logo.alt}
                                className="w-5 h-5 object-contain"
                            />
                        ) : (
                            logo.component && <logo.component className="w-4 h-4" style={{ color: logo.color }} />
                        )}
                    </button>
                </div>
            </EdgeLabelRenderer>
        </>
    );
}
