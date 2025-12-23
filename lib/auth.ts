import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import CredentialsProvider from "next-auth/providers/credentials";

// export const { handlers, auth, signIn, signOut } = NextAuth({
//     adapter: DrizzleAdapter(db),
export const { handlers, auth, signIn, signOut } = NextAuth({
    session: { strategy: "jwt" },
    debug: true,
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
                name: { label: "Name", type: "text" },
            },
            async authorize(credentials) {
                console.log("Authorize attempt for:", credentials?.email);

                if (credentials?.password === "password") {
                    console.log("Authorize success for:", credentials?.email);
                    // Map some known emails to roles for better demo experience
                    let role = "Guest";
                    if (credentials.email === "admin@intelboard.com") role = "Admin";
                    else if (credentials.email?.toString().includes("specialist")) role = "Specialist";
                    else if (credentials.email?.toString().includes("client")) role = "Customer";

                    const baseName = (credentials.email as string).split('@')[0];
                    const displayName = baseName.replace(/[^a-zA-Z0-9]/g, ' ').trim();
                    const capitalizedName = displayName ? (displayName.charAt(0).toUpperCase() + displayName.slice(1)) : "";

                    return {
                        id: credentials.email as string,
                        name: (credentials.name as string) || capitalizedName || baseName,
                        email: credentials.email as string,
                        role
                    };
                }

                console.log("Authorize failed for:", credentials?.email);
                return null;
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }: any) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
            }
            return token;
        },
        async session({ session, token }: any) {
            if (session.user) {
                session.user.id = token.id as string;
                (session.user as any).role = token.role;
            }
            return session;
        },
    },
});
