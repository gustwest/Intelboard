/**
 * NextAuth configuration — Google OAuth with email whitelist
 * Only approved emails can sign in.
 */
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// ── Approved emails ──────────────────────────────────────────────
const ALLOWED_EMAILS: Record<string, 'SUPERADMIN' | 'ADMIN'> = {
  'guswes@gmail.com': 'SUPERADMIN',
  'josefin@theinsiders.se': 'ADMIN',
  'benjamin@theinsiders.se': 'ADMIN',
  'erik@theinsiders.se': 'ADMIN',
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return email in ALLOWED_EMAILS;
    },
    async session({ session }) {
      if (session.user?.email) {
        const email = session.user.email.toLowerCase();
        (session as any).user.role = ALLOWED_EMAILS[email] || 'VIEWER';
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.toLowerCase();
        token.role = ALLOWED_EMAILS[email] || 'VIEWER';
      }
      return token;
    },
  },
};
