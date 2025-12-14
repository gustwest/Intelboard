"use client";

import * as React from "react";
import {
    LayoutGrid,
    Plus,
    Database,
    Cuboid,
    Server,
    Cpu,
    Play,
    ChevronDown,
    User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/role-provider";
import { Separator } from "@/components/ui/separator";

export function ITPlannerSidebar() {
    const { currentUser, role } = useRole();

    return (
        <div className="w-64 border-r bg-background flex flex-col h-[calc(100vh-3.5rem)]">
            <div className="p-4 space-y-4">
                <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Project View
                    </h2>
                    <Button variant="outline" className="w-full justify-between font-normal">
                        Select Project
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </div>

                <div className="space-y-2">
                    <Button className="w-full justify-start gap-2" variant="secondary">
                        <Plus className="h-4 w-4" />
                        New Project
                    </Button>
                </div>

                <Separator />

                <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-start gap-2">
                        <Database className="h-4 w-4" />
                        Data Catalogue
                    </Button>
                    <Button variant="ghost" className="w-full justify-start gap-2">
                        <Cuboid className="h-4 w-4" />
                        Architecture Advisor
                    </Button>
                </div>

                <Separator />

                <div className="space-y-1">
                    <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2">
                        Actions
                    </h3>
                    <Button variant="ghost" className="w-full justify-start gap-2">
                        <Server className="h-4 w-4" />
                        Add System
                    </Button>
                    <Button variant="ghost" className="w-full justify-start gap-2">
                        <Cpu className="h-4 w-4" />
                        AI Import
                    </Button>
                    <Button variant="ghost" className="w-full justify-start gap-2">
                        <Play className="h-4 w-4" />
                        Generate Demo Bank
                    </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                    <h3 className="px-2 text-xs font-semibold text-muted-foreground">
                        All Systems (0)
                    </h3>
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center border border-dashed rounded-md">
                        No systems
                    </div>
                </div>
            </div>

            <div className="mt-auto p-4 border-t bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {currentUser?.name?.[0] || "U"}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate">
                            {currentUser?.name || "Guest User"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                            {role}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
