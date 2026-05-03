import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * MASTER MIDDLEWARE: Session Refresh + Admin Gate
 */
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // Initialize Supabase Client for Middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // 1. REFRESH SESSION (Crucial for all authenticated pages)
  const { data: { user } } = await supabase.auth.getUser();

  // 2. LAYER 1: ADMIN SECURITY GATE
  if (pathname.startsWith("/ops-terminal")) {
    // If not authenticated, the route "does not exist"
    if (!user) {
      return new NextResponse(null, { status: 404 });
    }

    // Check Admin Identity
    const { data: admin } = await supabase
      .from("admin_users")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    // If not an active admin, the route "does not exist"
    if (!admin || !admin.is_active) {
      return new NextResponse(null, { status: 404 });
    }

    // Super Admin Isolation
    if (pathname.startsWith("/ops-terminal/admins") && admin.role !== "super_admin") {
      return new NextResponse(null, { status: 404 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets (svg, png, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
