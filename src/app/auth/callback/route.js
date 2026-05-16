import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    try {
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
        return NextResponse.redirect(`${origin}/resolve`);
      }
    } catch (err) {
      console.error('Callback error:', err)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth-code-error`)
}

