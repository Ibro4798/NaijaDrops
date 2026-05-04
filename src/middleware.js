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

  // 3. LAYER 2: RIDER/DRIVER GATE
  if (pathname.startsWith("/driver") || pathname.startsWith("/rider")) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url));
    
    // Allow onboarding to bypass the mode check if authenticated
    if (pathname === "/driver/onboarding") return response;

    let activeMode = request.cookies.get("nd_active_mode")?.value;
    
    // SELF-HEALING: If cookie is missing or wrong, check DB
    if (activeMode !== "rider") {
       const { data: rider } = await supabase.from("riders").select("id").eq("user_id", user.id).single();
       if (rider) {
          // Heal the cookie and allow access
          response.cookies.set("nd_active_mode", "rider", { path: '/', maxAge: 31536000 });
          return response;
       }
       return NextResponse.redirect(new URL('/select-mode', request.url));
    }
  }

  // 4. LAYER 3: CUSTOMER GATE
  const isCustomerRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/send-package") || pathname.startsWith("/profile");
  if (isCustomerRoute) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url));

    let activeMode = request.cookies.get("nd_active_mode")?.value;
    
    // SELF-HEALING: Check if user is a vendor if cookie is missing
    if (activeMode !== "customer") {
      const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
      if (vendor) {
        response.cookies.set("nd_active_mode", "customer", { path: '/', maxAge: 31536000 });
        return response;
      }
      return NextResponse.redirect(new URL('/select-mode', request.url));
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
