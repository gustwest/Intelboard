import React, { FC, useState, useRef, useEffect, useCallback } from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
    useReactFlow,
    Edge
} from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const LabelledEdge: FC<EdgeProps> = ({
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
    selected,
    label,
}) => {
    const { setEdges } = useReactFlow();
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const [isEditing, setIsEditing] = useState(false);
    const [labelText, setLabelText] = useState((label as string) || '');
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync internal state if prop changes
    useEffect(() => {
        setLabelText((label as string) || '');
    }, [label]);

    // Focus when editing starts
    useEffect(() => {
        if (isEditing && inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50)
        }
    }, [isEditing]);

    const onEdgeClick = (evt: React.MouseEvent) => {
        evt.stopPropagation();
        setIsEditing(true);
    };

    const handleSave = useCallback(() => {
        setIsEditing(false);
        setEdges((edges) =>
            edges.map((edge) => {
                if (edge.id === id) {
                    return { ...edge, label: labelText };
                }
                return edge;
            })
        );
    }, [id, labelText, setEdges]);

    const onKeyDown = (evt: React.KeyboardEvent) => {
        if (evt.key === 'Enter') {
            evt.preventDefault();
            handleSave();
        }
    };

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        fontSize: 12,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    {isEditing || selected ? (
                        <Input
                            ref={inputRef}
                            value={labelText}
                            onChange={(e) => setLabelText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={onKeyDown}
                            className="h-6 w-32 px-1 text-xs bg-white border border-slate-300 shadow-sm text-center"
                            placeholder="Label..."
                        />
                    ) : (
                        <div
                            onClick={onEdgeClick}
                            className={cn(
                                "px-2 py-1 rounded bg-slate-50 border border-slate-200 shadow-sm text-xs font-medium text-slate-700 hover:border-slate-400 cursor-pointer transition-colors z-50",
                                !labelText && "text-slate-400 bg-slate-100 hover:bg-white"
                            )}
                        >
                            {labelText || "+"}
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export default LabelledEdge;
