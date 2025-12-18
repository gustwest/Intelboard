import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow, Node, NodeResizer } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { StickyNote, Maximize2, Minimize2, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDropzone } from 'react-dropzone';

interface NoteNodeData {
    label: string;
    content?: string;
    color?: string;
    isEditing?: boolean;
    isMinimized?: boolean;
    imageUrl?: string;
    [key: string]: unknown;
}

type NoteNodeProps = NodeProps<Node<NoteNodeData>>;

const colors = [
    '#ffffff', '#fef2f2', '#fff7ed', '#fefce8', '#f0fdf4', '#eef2ff', '#fdf2f8', '#f5f5f4',
    '#fca5a5', '#fbbf24', '#a3e635', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#a1a1aa',
];

const NoteNode = ({ id, data, selected }: NoteNodeProps) => {
    const { setNodes } = useReactFlow();
    const [inputValue, setInputValue] = useState(data.label || '');
    const [isResizing, setIsResizing] = useState(false);
    const [localSize, setLocalSize] = useState({
        width: data.width as number || 200,
        height: data.height as number || 140
    });
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const isEditing = !!data.isEditing;

    useEffect(() => {
        setInputValue(data.label || '');
    }, [data.label]);

    useEffect(() => {
        if (isEditing && textAreaRef.current) {
            const timer = setTimeout(() => {
                textAreaRef.current?.focus();
                textAreaRef.current?.select();
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                updateNodeData('imageUrl', e.target?.result);
            };
            reader.readAsDataURL(file);
        }
    }, [updateNodeData]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true, // We want to click to edit text, not just upload
        accept: { 'image/*': [] }
    });

    return (
        <>
            <NodeToolbar
                isVisible={selected}
                position={Position.Top}
                className="flex flex-col bg-white p-2 rounded-lg shadow-xl border border-slate-200 animate-in zoom-in-95 pointer-events-auto"
            >
                {/* COLORS SECTION */}
                <div className="text-[10px] font-bold text-slate-400 mb-1 px-1 text-left w-full">COLORS</div>
                <div className="flex flex-wrap gap-1 max-w-[160px]">
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
            </NodeToolbar>

            <div
                {...getRootProps()}
                className={cn(
                    "relative p-3 rounded-lg shadow-md border-2 transition-all flex flex-col",
                    selected ? "ring-2 ring-primary ring-offset-4" : "border-amber-200/50",
                    data.isMinimized ? "w-12 h-12 items-center justify-center p-0 rounded-full" : "min-w-[150px] min-h-[100px]",
                    isDragActive && "bg-amber-100 border-dashed border-amber-500"
                )}
                style={{
                    backgroundColor: data.color || '#fef3c7',
                    width: data.isMinimized ? undefined : (isResizing ? localSize.width : (data.width as number || 200)),
                    height: data.isMinimized ? undefined : (isResizing ? localSize.height : (data.height as number || 140))
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    updateNodeData('isMinimized', !data.isMinimized);
                }}
            >
                <input {...getInputProps()} />

                {!data.isMinimized && (
                    <NodeResizer
                        minWidth={150}
                        minHeight={100}
                        isVisible={selected}
                        lineClassName="border-amber-400/50"
                        handleClassName="w-10 h-10 bg-transparent border-none -right-5 -bottom-5" // Even bigger grab area
                        onResizeStart={() => setIsResizing(true)}
                        onResize={(_, { width, height }) => {
                            setLocalSize({ width, height });
                        }}
                        onResizeEnd={(_, { width, height }) => {
                            updateNodeData('width', width);
                            updateNodeData('height', height);
                            setIsResizing(false);
                        }}
                    />
                )}

                {/* Corner Grip Visual (slashes) */}
                {!data.isMinimized && (
                    <div className="absolute bottom-1 right-1 pointer-events-none opacity-60">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 13L13 2M7 13L13 7M11 13L13 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber-600" />
                        </svg>
                    </div>
                )}

                {data.isMinimized ? (
                    <div className="flex items-center justify-center w-full h-full group">
                        <StickyNote className="w-6 h-6 text-amber-600 group-hover:scale-110 transition-transform cursor-pointer" />
                        <button
                            onClick={(e) => { e.stopPropagation(); updateNodeData('isMinimized', false); }}
                            className="absolute -top-1 -right-1 p-0.5 bg-amber-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            title="Expand Note"
                        >
                            <Maximize2 className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-amber-300/30 shrink-0">
                            <div className="flex items-center gap-2">
                                <StickyNote className="w-4 h-4 text-amber-600" />
                                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Note</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {data.imageUrl && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); updateNodeData('imageUrl', null); }}
                                        className="p-1 hover:bg-red-50 rounded-full text-red-500 transition-colors"
                                        title="Remove Photo"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateNodeData('isMinimized', true);
                                        updateNodeData('isEditing', false);
                                    }}
                                    className="p-1 hover:bg-black/5 rounded-full text-amber-700 transition-colors"
                                    title="Minimize to Icon"
                                >
                                    <Minimize2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {data.imageUrl && (
                            <div className="mb-2 rounded overflow-hidden border border-amber-300/50 shadow-inner bg-black/5 max-h-[200px] flex items-center justify-center shrink-0">
                                <img src={data.imageUrl as string} alt="Note Attachment" className="max-w-full max-h-full object-contain" />
                            </div>
                        )}

                        {isEditing ? (
                            <textarea
                                ref={textAreaRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-transparent border-none resize-none outline-none text-sm font-medium text-slate-800 leading-normal placeholder:text-amber-600/50 flex-1 min-h-[40px]"
                                placeholder="Type your note here..."
                            />
                        ) : (
                            <div
                                className="text-sm font-medium text-slate-800 leading-normal whitespace-pre-wrap flex-1 cursor-text select-none overflow-y-auto"
                                onClick={() => updateNodeData('isEditing', true)}
                            >
                                {data.label || <span className="text-amber-600/50 italic">Empty Note (Drop photos here)...</span>}
                            </div>
                        )}
                    </>
                )}

                <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 bg-amber-400 border-2 border-white shadow-sm" />
                <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 bg-amber-400 border-2 border-white shadow-sm" />
            </div>
        </>
    );
};

export default memo(NoteNode);
