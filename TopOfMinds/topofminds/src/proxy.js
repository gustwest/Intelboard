import { NextResponse } from 'next/server';
import { decryptSession, SESSION_COOKIE } from '@/lib/auth/jwt';
import { isAdmin, ROLES } from '@/lib/auth/roles';

const PUBLIC_ROUTES = ['/login', '/signup'];
const ADMIN_ROUTES = ['/admin', '/assignments', '/consultants', '/contracts', '/clients', '/gantt', '/financials', '/notifications'];
// /admin/users and /admin/ai are covered by /admin prefix
const CONSULTANT_ROUTES = ['/my'];

function matches(pathname, routes) {
  return routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export default async function proxy(req) {
  const { pathname } = req.nextUrl;

  // Let Next.js internal paths, API, and static assets pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    /\.(png|jpg|jpeg|svg|ico|css|js|webp|woff2?)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  const isPublic = matches(pathname, PUBLIC_ROUTES);

  // Unauthenticated
  if (!session?.userId) {
    if (isPublic) return NextResponse.next();
    const loginUrl = new URL('/login', req.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users hitting public auth pages → bounce to appropriate home
  if (isPublic) {
    const dest = session.role === ROLES.CONSULTANT ? '/my' : '/';
    return NextResponse.redirect(new URL(dest, req.nextUrl));
  }

  // Role-based access
  const role = String(session.role || '');

  if (matches(pathname, ADMIN_ROUTES)) {
    if (!isAdmin(role)) {
      return NextResponse.redirect(new URL('/my', req.nextUrl));
    }
  }

  if (matches(pathname, CONSULTANT_ROUTES)) {
    // Admins may also view consultant pages; no block here.
  }

  // Root "/" dashboard is admin-only; consultants are redirected to /my
  if (pathname === '/' && !isAdmin(role)) {
    return NextResponse.redirect(new URL('/my', req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)).*)'],
};
