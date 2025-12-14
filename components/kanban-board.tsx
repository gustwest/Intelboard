"use client";

import React from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Request, RequestStatus } from "@/lib/data";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, User, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoredSpecialist } from "@/lib/matching";

interface KanbanBoardProps {
    requests: Request[];
    columns: RequestStatus[];
    onDragEnd: (result: DropResult) => void;
    onFindMatch: (request: Request) => void;
    matches: Record<string, ScoredSpecialist[]>;
    readOnly?: boolean;
}

export function KanbanBoard({
    requests,
    columns,
    onDragEnd,
    onFindMatch,
    matches,
    readOnly = false,
}: KanbanBoardProps) {
    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4 h-full">
                {columns.map((column) => (
                    <div
                        key={column}
                        className="flex-shrink-0 w-80 bg-slate-50 dark:bg-slate-900 rounded-lg p-4 flex flex-col gap-4"
                    >
                        <h2 className="font-semibold text-lg flex items-center justify-between">
                            {column}
                            <Badge variant="secondary" className="ml-2">
                                {requests.filter((r) => r.status === column).length}
                            </Badge>
                        </h2>

                        <Droppable droppableId={column} isDropDisabled={readOnly}>
                            {(provided) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-[100px]"
                                >
                                    {requests
                                        .filter((req) => req.status === column)
                                        .map((req, index) => (
                                            <Draggable
                                                key={req.id}
                                                draggableId={req.id}
                                                index={index}
                                                isDragDisabled={readOnly}
                                            >
                                                {(provided, snapshot) => (
                                                    <Card
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className={cn(
                                                            "bg-white dark:bg-slate-950",
                                                            snapshot.isDragging && "opacity-50 ring-2 ring-primary"
                                                        )}
                                                    >
                                                        <CardHeader className="p-4 pb-2">
                                                            <div className="flex justify-between items-start">
                                                                <CardTitle className="text-base font-medium leading-tight hover:underline cursor-pointer">
                                                                    <a href={`/requests/${req.id}`}>{req.title}</a>
                                                                </CardTitle>
                                                            </div>
                                                            <CardDescription className="text-xs mt-1 line-clamp-2">
                                                                {req.description}
                                                            </CardDescription>
                                                        </CardHeader>
                                                        <CardContent className="p-4 pt-2">
                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                                                                    {req.industry}
                                                                </Badge>
                                                                {req.tags.slice(0, 2).map((tag) => (
                                                                    <Badge
                                                                        key={tag}
                                                                        variant="secondary"
                                                                        className="text-[10px] px-1 py-0 h-5"
                                                                    >
                                                                        {tag}
                                                                    </Badge>
                                                                ))}
                                                            </div>

                                                            {matches[req.id] && matches[req.id].length > 0 && (
                                                                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs">
                                                                    <p className="font-semibold text-green-700 dark:text-green-400 mb-1">
                                                                        Top Match:
                                                                    </p>
                                                                    <div className="flex items-center gap-2">
                                                                        <User className="h-3 w-3" />
                                                                        <span>{matches[req.id][0].name}</span>
                                                                        <span className="ml-auto font-mono">
                                                                            {matches[req.id][0].score}pts
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </CardContent>
                                                        <CardFooter className="p-4 pt-0 flex justify-between">
                                                            {(column === "New" || column === "Analyzing") && !readOnly ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="default"
                                                                    className="w-full text-xs h-8"
                                                                    onClick={() => onFindMatch(req)}
                                                                >
                                                                    <Search className="h-3 w-3 mr-1" /> Find Match
                                                                </Button>
                                                            ) : null}
                                                        </CardFooter>
                                                    </Card>
                                                )}
                                            </Draggable>
                                        ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>
        </DragDropContext>
    );
}
