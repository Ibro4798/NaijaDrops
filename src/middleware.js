import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── Unauthenticated users ──────────────────────────────────────────────────
  if (!user) {
    const protectedPaths = [
      "/dashboard",
      "/rider",
      "/vendor",
      "/ops-terminal",
      "/profile",
    ];
    if (protectedPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    return response;
  }

  // ── Ops Terminal — validate against admin_users table (no hardcoded email) ──
  if (pathname.startsWith("/ops-terminal")) {
    const { createClient } = await import("@supabase/supabase-js");
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: admin } = await serviceSupabase
      .from("admin_users")
      .select("is_active, is_super_admin")
      .eq("id", user.id)
      .single();

    // Not an admin — return 404 so the route is invisible, not just blocked
    if (!admin || !admin.is_active) {
      return new NextResponse(null, { status: 404 });
    }

    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
