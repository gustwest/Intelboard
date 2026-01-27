"use client";

import { useRole } from "./role-provider";
import { Button } from "./ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function UserMenu() {
    const { currentUser, role, logout } = useRole();
    const router = useRouter();

    const handleLogout = () => {
        logout();
        router.push("/");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="ml-auto">
                    <UserCircle className="mr-2 h-4 w-4" />
                    {currentUser ? currentUser.name : role}
                    <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{currentUser?.name || "Guest"}</p>
                        <p className="text-xs leading-none text-muted-foreground">{currentUser?.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/account" className="w-full cursor-pointer">
                        My Account
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()} className="text-red-600 focus:text-red-600">
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
