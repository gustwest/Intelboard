"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { LoginDialog } from "@/components/login-dialog";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { Globe } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader() {
    const pathname = usePathname();
    const { currentUser, role } = useRole();
    const { language, setLanguage, t } = useLanguage();

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center px-4 md:px-6">
                <div className="mr-4 hidden md:flex">
                    <Link href="/" className="mr-6 flex items-center space-x-2">
                        <Image
                            src="/intelboard_logo.png"
                            alt="Intelboard"
                            width={40}
                            height={40}
                            className="rounded-sm"
                        />
                        <span className="hidden font-bold sm:inline-block sr-only">
                            {t.landing.title}
                        </span>
                    </Link>
                    <nav className="flex items-center space-x-6 text-sm font-medium">
                        <Link
                            href="/board"
                            className={cn(
                                "transition-colors hover:text-foreground/80",
                                pathname === "/board" ? "text-foreground" : "text-foreground/60"
                            )}
                        >
                            {t.common.dashboard}
                        </Link>
                        <Link
                            href="/it-planner"
                            className={cn(
                                "transition-colors hover:text-foreground/80",
                                pathname === "/it-planner" ? "text-foreground" : "text-foreground/60"
                            )}
                        >
                            IT Planner tool
                        </Link>
                    </nav>
                </div>
                <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                    <div className="w-full flex-1 md:w-auto md:flex-none">
                        {/* Search could go here */}
                    </div>
                    <nav className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Globe className="h-4 w-4" />
                                    <span className="sr-only">Toggle language</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setLanguage("en")}>
                                    English {language === "en" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLanguage("sv")}>
                                    Svenska {language === "sv" && "✓"}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {currentUser && (
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mr-2 hidden sm:flex">
                                {t.common.viewingAs}:
                                <span className="font-semibold text-primary">{currentUser.name}</span>
                                {currentUser.company && <span className="text-xs bg-muted px-2 py-0.5 rounded">{currentUser.company}</span>}
                            </div>
                        )}

                        {!currentUser ? (
                            <LoginDialog />
                        ) : (
                            <>
                                <UserMenu />
                                <Link
                                    href="/requests/new"
                                    className={buttonVariants({ variant: "default", size: "sm" })}
                                >
                                    {t.common.newRequest}
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </div>
        </header>
    );
}
