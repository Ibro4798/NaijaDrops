import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        get(name) {
          return cookieStore.get(name)?.value
        },
        set(name, value, options) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name, options) {
          cookieStore.delete({ name, ...options })
        },
      }
    )
    const { error, data: { user } } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && user) {
      // Check if profile exists and has a role
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role) {
        // If already has a role, go to root (layout will handle redirection to portal)
        return NextResponse.redirect(`${origin}/`)
      }

      // Default to role selection for new users
      return NextResponse.redirect(`${origin}/auth/role-select`)
    }
  }

  // return the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/auth/login?error=auth-code-error`)
}
