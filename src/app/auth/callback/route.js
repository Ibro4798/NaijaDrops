import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? null

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.delete({ name, ...options }) },
        },
      }
    )

    const { error, data: { user } } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user) {
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // 1. Sync identity (Trigger handles this mostly, but we ensure it here)
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
      
      if (profile?.role === 'admin') {
        return NextResponse.redirect(`${origin}/ops-terminal/dashboard`);
      }

      // Always send to select-mode to ensure they pick their role
      return NextResponse.redirect(`${origin}/select-mode`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth-code-error`)
}
