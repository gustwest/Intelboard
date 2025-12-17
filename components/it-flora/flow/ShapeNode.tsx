import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer, useReactFlow, Node } from '@xyflow/react';
import { cn } from '@/lib/utils';

export type ShapeNodeType =
    | 'rectangle' | 'circle' | 'diamond'
    | 'database' | 'document' | 'cloud'
    | 'triangle' | 'hexagon' | 'parallelogram'
    | 'star' | 'arrow-right' | 'actor';

interface ShapeNodeData {
    label: string;
    shape?: ShapeNodeType;
    color?: string; // Hex or tailwind class
    width?: number;
    height?: number;
    isEditing?: boolean;
    [key: string]: unknown;
}

type ShapeNodeProps = NodeProps<Node<ShapeNodeData>>;

const ShapeNode = ({ id, data, selected }: ShapeNodeProps) => {
    const { setNodes } = useReactFlow();
    const shape = (data.shape as ShapeNodeType) || 'rectangle';
    const color = (data.color as string) || '#ffffff';
    const label = (data.label as string) || '';
    const isEditing = !!data.isEditing;

    const [inputValue, setInputValue] = useState(label);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Sync local state if label changes externally
    useEffect(() => {
        setInputValue(label);
    }, [label]);

    // Focus when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            // Small timeout to Ensure rendering is done
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isEditing]);

    const handleSave = useCallback(() => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: { ...node.data, label: inputValue, isEditing: false }
                    };
                }
                return node;
            })
        );
    }, [id, inputValue, setNodes]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const renderLabel = (className: string = "") => {
        const baseClass = "relative z-10 font-medium text-sm text-slate-900 text-center pointer-events-none select-none break-words";

        if (isEditing) {
            return (
                <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="relative z-20 w-[90%] h-full bg-transparent border-none resize-none outline-none text-center font-medium text-sm text-slate-900 overflow-hidden flex items-center justify-center p-0 m-0 leading-tight focus:ring-0"
                    style={{ minHeight: '24px' }}
                />
            );
        }

        return <span className={cn(baseClass, className)}>{label}</span>;
    };

    const renderShapeContent = () => {
        const commonStyle = { fill: color, stroke: '#94a3b8', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' as const };
        // vector-effect='non-scaling-stroke' ensures borders don't get too thick/thin when resizing
        // Using 5-95 range to prevent clipping of the stroke

        switch (shape) {
            case 'circle':
                // Using SVG for circle ensures it effectively becomes an ellipse if resized non-uniformly
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <ellipse cx="50" cy="50" rx="45" ry="45" style={commonStyle} />
                        </svg>
                        {renderLabel("px-2")}
                    </div>
                );
            case 'rectangle':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <rect x="5" y="5" width="90" height="90" rx="5" ry="5" style={commonStyle} />
                        </svg>
                        {renderLabel("px-2")}
                    </div>
                );
            case 'diamond':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <polygon points="50,5 95,50 50,95 5,50" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[70%]")}
                    </div>
                );
            case 'database':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <path d="M5,15 A45,15 0 0,0 95,15 A45,15 0 0,0 5,15 M5,15 L5,85 A45,15 0 0,0 95,85 L95,15 M5,85" style={commonStyle} fill={color} />
                            <ellipse cx="50" cy="15" rx="45" ry="15" style={{ ...commonStyle, fill: 'none', stroke: '#94a3b8' }} />
                        </svg>
                        {renderLabel("mt-4 max-w-[80%]")}
                    </div>
                );
            case 'document':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <path d="M5,5 L95,5 L95,80 Q75,95 50,80 Q25,65 5,80 Z" style={commonStyle} />
                        </svg>
                        {renderLabel("mb-4 max-w-[80%]")}
                    </div>
                );
            case 'cloud':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <path d="M25,60 A20,20 0 0,1 25,20 A20,20 0 0,1 55,20 A20,20 0 0,1 85,30 A20,20 0 0,1 85,70 A20,20 0 0,1 65,90 L35,90 A20,20 0 0,1 25,60 Z" transform="translate(0, 5) scale(0.9)" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[70%]")}
                    </div>
                );
            case 'triangle':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <polygon points="50,5 95,95 5,95" style={commonStyle} />
                        </svg>
                        {renderLabel("mt-4 max-w-[60%]")}
                    </div>
                );
            case 'hexagon':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <polygon points="25,5 75,5 95,50 75,95 25,95 5,50" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[80%]")}
                    </div>
                );
            case 'parallelogram':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <polygon points="25,5 95,5 75,95 5,95" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[80%]")}
                    </div>
                );
            case 'star':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            {/* Scaled/Translated star points to fit 5-95 */}
                            <polygon points="50,5 63,35 95,35 70,55 80,90 50,70 20,90 30,55 5,35 37,35" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[50%]")}
                    </div>
                );
            case 'arrow-right':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <polygon points="5,30 70,30 70,5 95,50 70,95 70,70 5,70" style={commonStyle} />
                        </svg>
                        {renderLabel("max-w-[70%] ml-[-10px]")}
                    </div>
                );
            case 'actor':
                return (
                    <div className="w-full h-full flex items-center justify-center flex-col">
                        <div className="relative w-full h-full flex items-center justify-center">
                            <svg viewBox="0 0 100 100" className="w-full h-[80%] absolute top-0" preserveAspectRatio="xMidYMid meet">
                                <circle cx="50" cy="20" r="12" style={commonStyle} />
                                <line x1="50" y1="32" x2="50" y2="70" style={commonStyle} />
                                <line x1="20" y1="45" x2="80" y2="45" style={commonStyle} />
                                <line x1="50" y1="70" x2="20" y2="95" style={commonStyle} />
                                <line x1="50" y1="70" x2="80" y2="95" style={commonStyle} />
                            </svg>
                        </div>
                        {renderLabel("w-full")}
                    </div>
                );
            default:
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <rect x="5" y="5" width="90" height="90" rx="5" ry="5" style={commonStyle} />
                        </svg>
                        {renderLabel("px-2")}
                    </div>
                );
        }
    };

    return (
        <>
            <NodeResizer minWidth={50} minHeight={50} isVisible={selected} />
            <div
                className={cn(
                    "relative w-full h-full transition-all",
                    selected ? "ring-2 ring-primary ring-offset-4 rounded-lg" : ""
                )}
                style={{
                    minWidth: '100px',
                    minHeight: '60px',
                    width: '100%',
                    height: '100%'
                }}
            >
                {renderShapeContent()}

                {/* Connection Handles - positioned slightly outside to clear strokes */}
                <Handle
                    type="target"
                    position={Position.Top}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !top-[-8px]"
                    id="t"
                />
                <Handle
                    type="source"
                    position={Position.Top}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !top-[-8px]"
                    id="t-out"
                />

                <Handle
                    type="target"
                    position={Position.Right}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !right-[-8px]"
                    id="r"
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !right-[-8px]"
                    id="r-out"
                />

                <Handle
                    type="target"
                    position={Position.Bottom}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !bottom-[-8px]"
                    id="b"
                />
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !bottom-[-8px]"
                    id="b-out"
                />

                <Handle
                    type="target"
                    position={Position.Left}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !left-[-8px]"
                    id="l"
                />
                <Handle
                    type="source"
                    position={Position.Left}
                    className="w-3 h-3 bg-slate-400 border-2 border-white !left-[-8px]"
                    id="l-out"
                />
            </div>
        </>
    );
};

export default memo(ShapeNode);
