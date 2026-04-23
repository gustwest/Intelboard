/**
 * Middleware — NextAuth v5 edge-compatible auth guard
 * Protects all routes except /login and API routes
 */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Minimal auth config for middleware (edge compatible)
const { auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isLoginPage = nextUrl.pathname.startsWith('/login');
      const isApiRoute = nextUrl.pathname.startsWith('/api');

      if (isApiRoute) return true;
      if (isLoginPage) return true;
      if (!isLoggedIn) return false; // will redirect to signIn page

      return true;
    },
  },
});

export default auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
