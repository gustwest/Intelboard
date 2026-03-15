"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { LoginDialog } from "@/components/login-dialog";
import { useRole } from "@/components/role-provider";
import { useLanguage } from "@/components/language-provider";
import { NewRequestDialog } from "@/components/new-request-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
    const pathname = usePathname();
    const { currentUser } = useRole();
    const { t } = useLanguage();

    const navItems = [
        { href: "/dashboard", label: t.common.dashboard, match: (p: string) => p === "/dashboard" },
        { href: "/intel-hub", label: "Explore", match: (p: string) => p === "/intel-hub" || p.startsWith("/intel-hub/") || p === "/intelboards" || p.startsWith("/intelboards/") },
        { href: "/calendar", label: "Events", match: (p: string) => p === "/calendar" || p.startsWith("/events/") },
        { href: "/talent", label: "Members", match: (p: string) => p === "/talent" },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center px-4 md:px-6">
                <div className="mr-4 hidden md:flex">
                    <Link href={currentUser ? "/dashboard" : "/"} className="mr-6 flex items-center space-x-2">
                        <Image
                            src="/autoliv_new_logo.png"
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
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "transition-colors hover:text-foreground/80",
                                    item.match(pathname || "") ? "text-foreground" : "text-foreground/60"
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
                <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                    <div className="w-full flex-1 md:w-auto md:flex-none" />
                    <nav className="flex items-center gap-2">
                        <ThemeToggle />

                        {currentUser && (
                            <NotificationBell />
                        )}

                        {!currentUser ? (
                            <LoginDialog />
                        ) : (
                            <>
                                <UserMenu />
                                <NewRequestDialog />
                            </>
                        )}
                    </nav>
                </div>
            </div>
        </header>
    );
}
