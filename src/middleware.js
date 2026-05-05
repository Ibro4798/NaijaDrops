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
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/rider") || pathname.startsWith("/driver") || pathname.startsWith("/select-mode")) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return response;
  }

  // Admin isolation (stays deterministic)
  if (pathname.startsWith("/ops-terminal")) {
    const { data: admin } = await supabase.from("admin_users").select("is_active").eq("id", user.id).single();
    if (!admin || !admin.is_active) return new NextResponse(null, { status: 404 });
    return response;
  }

  // Get Mode from DB (The Source of Truth)
  const { data: profile } = await supabase.from("users").select("active_mode").eq("id", user.id).single();
  
  // Use hint as backup to prevent race conditions during mode-switch
  const modeHint = request.cookies.get("nd_mode_hint")?.value;
  const activeMode = modeHint || profile?.active_mode || 'customer';

  // Enforcement
  if (pathname.startsWith("/rider") || pathname.startsWith("/driver")) {
    // EXEMPTION: Allow anyone to reach onboarding to register
    if (pathname === "/driver/onboarding") return response;

    if (activeMode !== "rider") {
      return NextResponse.redirect(new URL('/select-mode', request.url));
    }
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/send-package")) {
    if (activeMode !== "customer") {
      return NextResponse.redirect(new URL('/select-mode', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
