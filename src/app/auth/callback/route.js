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

      // 1. Fetch current profile
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      let finalRole = profile?.role;

      // 2. If user exists but has no role, try to extract from metadata (assigned on login page)
      if (!finalRole) {
        finalRole = user.user_metadata?.role || 'vendor';
        
        // Auto-assign the role in the DB
        await supabase.from('users').update({ 
           role: finalRole,
           full_name: user.user_metadata?.full_name || user.email?.split('@')[0]
        }).eq('id', user.id);

        // 3. Initialize the specific profile table
        if (finalRole === 'vendor') {
           await supabase.from('vendors').upsert({ user_id: user.id, business_name: 'My Store' }, { onConflict: 'user_id' });
        } else if (finalRole === 'rider') {
           await supabase.from('riders').upsert({ user_id: user.id, approved: false }, { onConflict: 'user_id' });
        }
      }

      // 4. Redirect to the correct portal instantly
      if (finalRole === 'vendor') return NextResponse.redirect(`${origin}/dashboard`)
      if (finalRole === 'rider') return NextResponse.redirect(`${origin}/rider`)
      if (finalRole === 'admin') return NextResponse.redirect(`${origin}/admin`)

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth-code-error`)
}
