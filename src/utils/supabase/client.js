import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn("Supabase credentials missing. Returning mock client for build safety.");
    return {
      auth: { 
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) })
    };
  }

  return createBrowserClient(url, key)
}

