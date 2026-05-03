import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // LAYER 0 & 1: Route Obfuscation & Middleware Gate
  if (pathname.startsWith("/ops-terminal")) {
    // Skip protection for the login page if you want one, 
    // but in a Zero-Trust model, we assume the user logs in via the normal portal 
    // and is then promoted.
    
    let response = NextResponse.next({ request });
    
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

    // 1. SESSION CHECK
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Obfuscation: Return 404 so hackers don't even know this route exists
      return new NextResponse(null, { status: 404 });
    }

    // 2. ADMIN LOOKUP & STATUS CHECK
    const { data: admin } = await supabase
      .from("admin_users")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (!admin || !admin.is_active) {
      return new NextResponse(null, { status: 404 });
    }

    // 3. ROLE ISOLATION (SUPER_ADMIN ONLY for admin management)
    if (pathname.startsWith("/ops-terminal/admins") && admin.role !== "super_admin") {
      return new NextResponse(null, { status: 404 });
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/ops-terminal/:path*"],
};
