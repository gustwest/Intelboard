"use client";

import { useRole } from "./role-provider";
import { useLanguage } from "@/components/language-provider";
import { Button } from "./ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, UserCircle, User, ClipboardList, Globe, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function UserMenu() {
    const { currentUser, role, logout } = useRole();
    const { language, setLanguage } = useLanguage();
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
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{currentUser?.name || "Guest"}</p>
                        <p className="text-xs leading-none text-muted-foreground">{currentUser?.email}</p>
                        {currentUser?.company && (
                            <p className="text-xs leading-none text-muted-foreground">{currentUser.company}</p>
                        )}
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile" className="w-full cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        My Profile
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/account" className="w-full cursor-pointer">
                        <UserCircle className="mr-2 h-4 w-4" />
                        My Account
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/board" className="w-full cursor-pointer">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Open Requests
                    </Link>
                </DropdownMenuItem>
                {(role === 'Admin' || currentUser?.role === 'Admin' || currentUser?.companyId) && (
                    <DropdownMenuItem asChild>
                        <Link href="/team" className="w-full cursor-pointer">
                            <Users className="mr-2 h-4 w-4" />
                            Team Management
                        </Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Globe className="mr-2 h-4 w-4" />
                        Language
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setLanguage("en")}>
                            English {language === "en" && "✓"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLanguage("sv")}>
                            Svenska {language === "sv" && "✓"}
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
