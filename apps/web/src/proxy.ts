import { NextResponse, type NextRequest } from 'next/server';

const DASHBOARD = ['/regional', '/hub', '/overview', '/members', '/cards', '/events', '/cities', '/admins', '/settings', '/rewards', '/leaderboard', '/recaps', '/exports'];

/**
 * Cheap gate for dashboard routes: no session cookie means straight to /login. The session
 * itself (expiry, revocation, role) is verified in the (admin) layout against the database.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isDashboard = DASHBOARD.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isDashboard && !req.cookies.has('pats_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/regional/:path*', '/hub/:path*', '/overview/:path*', '/members/:path*', '/cards/:path*', '/events/:path*', '/cities/:path*', '/admins/:path*', '/settings/:path*', '/rewards/:path*', '/leaderboard/:path*', '/recaps/:path*', '/exports/:path*'],
};
