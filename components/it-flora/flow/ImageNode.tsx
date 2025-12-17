import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer, Node } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface ImageNodeData {
    src: string;
    label?: string;
    [key: string]: unknown;
}

type ImageNodeProps = NodeProps<Node<ImageNodeData>>;

const ImageNode = ({ data, selected }: ImageNodeProps) => {
    return (
        <>
            <NodeResizer minWidth={50} minHeight={50} isVisible={selected} />
            <div
                className={cn(
                    "relative w-full h-full group",
                    selected ? "ring-2 ring-primary ring-offset-4 rounded-lg" : ""
                )}
                style={{
                    minWidth: '50px',
                    minHeight: '50px',
                    width: '100%',
                    height: '100%'
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={data.src}
                    alt={data.label || 'Flowchart Image'}
                    className="w-full h-full object-contain pointer-events-none select-none"
                />

                {/* Connection Handles - hidden by default unless selected or hovered? Or just standard visual */}
                <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <Handle type="source" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />

                <Handle type="target" position={Position.Right} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <Handle type="source" position={Position.Right} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />

                <Handle type="target" position={Position.Bottom} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />

                <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <Handle type="source" position={Position.Left} className="w-3 h-3 bg-slate-400 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </>
    );
};

export default memo(ImageNode);
