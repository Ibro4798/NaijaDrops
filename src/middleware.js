import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * DETERMINISTIC MIDDLEWARE: The Bouncer
 * Only enforces access based on the database state (active_mode).
 */
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
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public/Auth routes don't need mode enforcement
  if (!user) {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/rider") || (pathname.startsWith("/driver") && !pathname.startsWith("/driver/onboarding")) || pathname.startsWith("/select-mode")) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return response;
  }

  // Admin isolation (Corporate Domain Enforcement)
  if (pathname.startsWith("/ops-terminal") || pathname.startsWith("/admin")) {
    const isSuperAdmin = user.email?.toLowerCase() === "ibrahim@naijadrops.tech";

    if (!user.email?.toLowerCase().endsWith("@naijadrops.tech")) {
      return new NextResponse(null, { status: 404 });
    }

    if (!isSuperAdmin) {
      // Use createClient (server) which uses service role key if configured,
      // avoiding RLS recursion on admin_users table.
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: admin } = await serviceSupabase.from("admin_users").select("is_active").eq("id", user.id).single();
      if (!admin || !admin.is_active) return new NextResponse(null, { status: 404 });
    }
    return response;
  }

  // Enforcement
  if (pathname.startsWith("/rider") && pathname !== "/driver/onboarding") {
     // Rider portal is only for approved riders, but we let the rider layout handle the detailed checks
     // Just ensuring they are authenticated (which we already did)
  }

  // Everyone is allowed in the dashboard
  if (pathname.startsWith("/select-mode")) {
     return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
