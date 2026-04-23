/**
 * NextAuth v5 config — Google OAuth with email whitelist
 * Only approved emails can sign in.
 */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { ALLOWED_EMAILS } from './team';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return email in ALLOWED_EMAILS;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.toLowerCase();
        token.role = ALLOWED_EMAILS[email] || 'VIEWER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token.role as string) || 'VIEWER';
      }
      return session;
    },
  },
});
