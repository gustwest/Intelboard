import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer, useReactFlow, Node, NodeToolbar } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
    Box,
    Circle,
    Diamond,
    Database,
    Cloud,
    User,
    Star,
    ArrowRight,
    Triangle,
    Hexagon,
    Square,
    StickyNote
} from 'lucide-react';

export type ShapeNodeType =
    | 'rectangle' | 'circle' | 'diamond'
    | 'database' | 'document' | 'cloud'
    | 'triangle' | 'hexagon' | 'parallelogram'
    | 'star' | 'arrow-right' | 'actor';

interface ShapeNodeData {
    label: string;
    shape?: ShapeNodeType;
    color?: string;
    isEditing?: boolean;
    [key: string]: unknown;
}

type ShapeNodeProps = NodeProps<Node<ShapeNodeData>>;

const colors = [
    '#ffffff', '#fef2f2', '#fff7ed', '#fefce8', '#f0fdf4', '#eef2ff', '#fdf2f8', '#f5f5f4',
    '#fca5a5', '#fbbf24', '#a3e635', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#a1a1aa',
];

const sidebarItems = [
    { type: 'rectangle', label: 'Rectangle', icon: Box },
    { type: 'circle', label: 'Circle', icon: Circle },
    { type: 'diamond', label: 'Diamond', icon: Diamond },
    { type: 'database', label: 'Database', icon: Database },
    { type: 'document', label: 'Document', icon: StickyNote },
    { type: 'cloud', label: 'Cloud', icon: Cloud },
    { type: 'triangle', label: 'Triangle', icon: Triangle },
    { type: 'hexagon', label: 'Hexagon', icon: Hexagon },
    { type: 'parallelogram', label: 'Parallelogram', icon: Square },
    { type: 'star', label: 'Star', icon: Star },
    { type: 'arrow-right', label: 'Arrow Right', icon: ArrowRight },
    { type: 'actor', label: 'Actor', icon: User },
];

const ShapeNode = ({ id, data, selected }: ShapeNodeProps) => {
    const { setNodes } = useReactFlow();
    const shape = (data.shape as ShapeNodeType) || 'rectangle';
    const color = (data.color as string) || '#ffffff';
    const label = (data.label as string) || '';
    const isEditing = !!data.isEditing;

    const [inputValue, setInputValue] = useState(label);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setInputValue(label);
    }, [label]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isEditing]);

    const updateNodeData = useCallback((key: string, value: any) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: { ...node.data, [key]: value },
                    };
                }
                return node;
            })
        );
    }, [id, setNodes]);

    const handleSave = useCallback(() => {
        updateNodeData('label', inputValue);
        updateNodeData('isEditing', false);
    }, [inputValue, updateNodeData]);

    const handleQuickShapeChange = useCallback((newShape: string) => {
        updateNodeData('shape', newShape);
    }, [updateNodeData]);

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

        switch (shape) {
            case 'circle':
                return (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0" preserveAspectRatio="none">
                            <ellipse cx="50" cy="50" rx="45" ry="45" style={commonStyle} />
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
                            <path d="M5,15 A45,15 0 0,0 95,15 A45,15 0 0,0 5,15 M5,15 L5,85 A45,15 0 0,0 95,85 L95,15 M5,85" style={commonStyle} />
                            <ellipse cx="50" cy="15" rx="45" ry="15" style={{ ...commonStyle, fill: 'none' }} />
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
            <NodeToolbar
                isVisible={selected}
                position={Position.Top}
                className="flex flex-col bg-white p-2 rounded-lg shadow-xl border border-slate-200 animate-in zoom-in-95 pointer-events-auto"
            >
                {/* COLORS SECTION */}
                <div className="text-[10px] font-bold text-slate-400 mb-1 px-1 text-left w-full">COLORS</div>
                <div className="flex flex-wrap gap-1 mb-2 max-w-[160px]">
                    {colors.map((c) => (
                        <button
                            key={c}
                            className="w-5 h-5 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateNodeData('color', c);
                            }}
                        />
                    ))}
                </div>

                <div className="w-full h-px bg-slate-100 my-1" />

                {/* SHAPES SECTION */}
                <div className="text-[10px] font-bold text-slate-400 mb-1 px-1 text-left w-full">CHANGE SHAPE</div>
                <div className="grid grid-cols-6 gap-1">
                    {sidebarItems.map((item) => (
                        <button
                            key={item.type}
                            className={cn(
                                "p-1 rounded hover:bg-slate-100 flex items-center justify-center transition-colors border",
                                shape === item.type ? "border-primary bg-primary/5" : "border-transparent"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleQuickShapeChange(item.type);
                            }}
                            title={item.label}
                        >
                            <item.icon className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                    ))}
                </div>
            </NodeToolbar>

            <NodeResizer minWidth={50} minHeight={50} isVisible={selected} />
            <div
                className={cn(
                    "group relative flex flex-col items-center justify-center transition-all",
                    selected ? "z-20" : "z-10"
                )}
                style={{ width: '100%', height: '100%' }}
            >
                {renderShapeContent()}

                <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white !top-[-8px]" id="t" />
                <Handle type="source" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white !top-[-8px]" id="t-out" />
                <Handle type="target" position={Position.Right} className="w-3 h-3 bg-slate-400 border-2 border-white !right-[-8px]" id="r" />
                <Handle type="source" position={Position.Right} className="w-3 h-3 bg-slate-400 border-2 border-white !right-[-8px]" id="r-out" />
                <Handle type="target" position={Position.Bottom} className="w-3 h-3 bg-slate-400 border-2 border-white !bottom-[-8px]" id="b" />
                <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400 border-2 border-white !bottom-[-8px]" id="b-out" />
                <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-400 border-2 border-white !left-[-8px]" id="l" />
                <Handle type="source" position={Position.Left} className="w-3 h-3 bg-slate-400 border-2 border-white !left-[-8px]" id="l-out" />
            </div>
        </>
    );
};

export default memo(ShapeNode);

