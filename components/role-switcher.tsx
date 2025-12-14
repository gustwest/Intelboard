"use client";

import { useRole, UserRole } from "./role-provider";
import { Button } from "./ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, UserCircle } from "lucide-react";

export function RoleSwitcher() {
    const { role, setRole } = useRole();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="ml-auto">
                    <UserCircle className="mr-2 h-4 w-4" />
                    {role} View
                    <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRole("Customer")}>
                    Customer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRole("Admin")}>
                    Admin (IntelBoard)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRole("Specialist")}>
                    Specialist
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
