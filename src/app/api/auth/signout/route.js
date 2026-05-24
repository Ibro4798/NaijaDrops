import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name, options) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );

  // Sign out via Supabase
  await supabase.auth.signOut();

  // Aggressively clear ALL Supabase cookies to prevent ghost sessions.
  // Supabase SSR stores tokens in cookies prefixed with 'sb-'.
  const allCookies = cookieStore.getAll();
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-')) {
      try {
        cookieStore.set({
          name: cookie.name,
          value: '',
          maxAge: 0,
          path: '/',
        });
      } catch {}
    }
  }

  // Redirect to the portal chooser â€” NOT directly to login
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return NextResponse.redirect(new URL('/welcome', baseUrl), {
    status: 302,
  });
}
