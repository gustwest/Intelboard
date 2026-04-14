import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isAuthPage = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/signup");
            const isPublicPage = nextUrl.pathname === "/terms" || nextUrl.pathname === "/privacy"; // Example

            if (isAuthPage) {
                if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
                return true;
            }

            // Protect all other routes
            if (!isLoggedIn && !isPublicPage) {
                return false; // Redirects to login
            }

            return true;
        },
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        },
    },
    providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
