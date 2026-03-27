import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// OAuth callbacks handle their own validation — no session required
const PUBLIC_API_ROUTES = [
  "/api/banks/callback",
  "/api/banks/tink/callback",
  "/api/banks/truelayer/callback",
];

function logRequest({
  method, pathname, status, uid, ip, t0,
}: {
  method: string; pathname: string; status?: number; uid: string | null; ip: string; t0: number;
}): void {
  const ms = Date.now() - t0;
  const entry = JSON.stringify({ type: "request", method, path: pathname, status: status ?? 200, uid, ip, ms });
  if (ms > 1000) {
    console.warn(JSON.stringify({ type: "SLOW_REQUEST", path: pathname, ms, uid, ip }));
  }
  console.log(entry);
}

export async function middleware(request: NextRequest) {
  const t0 = Date.now();
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // If Supabase env vars aren't configured yet (e.g. fresh Vercel deploy),
  // pass through so the app can still load rather than crashing.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any redirects
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApiRoute = pathname.startsWith("/api/");
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((r) =>
    pathname.startsWith(r)
  );
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isPublicPage = pathname === "/";

  // Unauthenticated API request → 401 JSON (not a page redirect)
  if (!user && isApiRoute && !isPublicApiRoute) {
    logRequest({ method: request.method, pathname, status: 401, uid: null, ip, t0 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Unauthenticated user trying to access a protected page → /login
  if (!user && !isAuthPage && !isPublicPage && !isApiRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user trying to access login/signup → app
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  logRequest({ method: request.method, pathname, uid: user?.id ?? null, ip, t0 });
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT Next.js internals and static assets.
     * API routes are now included — unauthenticated requests get a 401.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icon-|ricordo-logo).*)",
  ],
};
