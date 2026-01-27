import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import CredentialsProvider from "next-auth/providers/credentials";
import { users } from "./schema";
import { eq } from "drizzle-orm";

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
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const email = credentials.email as string;

                // 1. Fetch user from DB
                const [user] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, email))
                    .limit(1);

                if (!user) {
                    console.log("Authorize failed: User not found for:", email);
                    return null;
                }

                // 2. Verify Password (if user has one)
                if (!user.password) {
                    console.log("Authorize failed: User has no password set (maybe OAuth user):", email);
                    return null;
                }

                // const isValid = await bcrypt.compare(credentials.password as string, user.password);
                // Note: since we're adding bcrypt now, we need to import it. 
                // Using dynamic import or require to ensure it works if top-level import fails? 
                // Better to add top-level import. I will do that in a separate replacement chunk if needed, 
                // but replace_file_content replaces a block. I will include imports in this block if they were part of it, 
                // but the imports are at the top. I need to assume I can replace the whole file or do multi_replace.
                // Let's stick to replacing the config part and I'll add imports separately or assume I can't.
                // Actually, I should use multi_replace for this to handle imports + config.
                // But I am locked in replace_file_content now.
                // I will add the logic here and then add imports in next step or use 'require'.

                const bcrypt = require("bcryptjs");
                const isValid = await bcrypt.compare(credentials.password as string, user.password);

                if (!isValid) {
                    console.log("Authorize failed: Invalid password for:", email);
                    return null;
                }

                // 3. Check Approval Status
                if (user.approvalStatus !== 'APPROVED') {
                    // We can either throw an error or return null. 
                    // Returning null fails generic. 
                    // Ideally we want to signal "Pending Approval".
                    // For now, let's log it.
                    console.log(`Authorize failed: User ${email} is ${user.approvalStatus}`);
                    // Trigger specific error if NextAuth allows, otherwise fails login.
                    throw new Error(`Account is ${user.approvalStatus}`);
                }

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    companyId: user.companyId,
                    // valid: true // Custom property?
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }: any) {
            // Initial sign in
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.companyId = user.companyId;
            }
            return token;
        },
        async session({ session, token }: any) {
            if (session.user) {
                session.user.id = token.id as string;
                (session.user as any).role = token.role;
                (session.user as any).companyId = token.companyId;
            }
            return session;
        },
    },
});
