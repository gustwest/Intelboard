import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Pages that don't require authentication
const PUBLIC_PATHS = [
    "/",          // Landing page
    "/signup",    // Registration
    "/api/auth",  // NextAuth API routes
    "/api/log",   // Client-side error logging
];

export default auth((req) => {
    const { pathname } = req.nextUrl;

    // Allow public paths
    if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"))) {
        return NextResponse.next();
    }

    // Allow static files and Next.js internals
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    // If not authenticated, redirect to landing page
    if (!req.auth) {
        const loginUrl = new URL("/", req.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        // Match all paths except static files and Next.js internals
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
