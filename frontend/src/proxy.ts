import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Route protection proxy (Next.js 16 — replaces middleware.ts)
//
// Edge-only cookie check. Does NOT validate JWT — that's backend's job.
// This is purely navigation UX protection (D-001, RF-5).
// ---------------------------------------------------------------------------

// Fase 1 (D-078): /transferencias es ruta protegida (panel de transferencias).
const protectedRoutes = [
  "/dashboard",
  "/profile",
  "/vehicles",
  "/atenciones",
  "/transferencias",
];
const authRoutes = ["/login", "/register"];

function isProtectedRoute(pathname: string): boolean {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

function isAuthRoute(pathname: string): boolean {
  return authRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccessToken = request.cookies.has("access_token");

  // Protected routes: no cookie → redirect to /login?next=<path>
  if (isProtectedRoute(pathname) && !hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth routes (/login, /register): has cookie → redirect to /dashboard
  if (isAuthRoute(pathname) && hasAccessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
