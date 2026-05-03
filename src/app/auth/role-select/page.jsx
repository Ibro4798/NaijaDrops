"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Headless Role Selection
 * This page no longer shows UI. It instantly resolves the user's role 
 * from their session or metadata and sends them to their portal.
 */
export default function RoleSelectRedirect() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function resolveAndRedirect() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // 1. Check if they already have a role in the DB
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
         if (profile.role === 'rider') router.replace("/rider");
         else if (profile.role === 'admin') router.replace("/admin");
         else router.replace("/dashboard");
         return;
      }

      // 2. If no role in DB, check the choice they made on the landing page (sessionStorage)
      const intendedRole = sessionStorage.getItem("nd_intended_role") || 'vendor';

      // 3. Update the DB so they don't loop back here
      await supabase.from("users").update({ 
        role: intendedRole,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0]
      }).eq("id", user.id);

      // 4. Initialize specific profile
      if (intendedRole === "vendor") {
        await supabase.from("vendors").upsert({ user_id: user.id, business_name: 'My Business' }, { onConflict: 'user_id' });
        router.replace("/dashboard");
      } else {
        await supabase.from("riders").upsert({ user_id: user.id, approved: false }, { onConflict: 'user_id' });
        router.replace("/rider");
      }
    }

    resolveAndRedirect();
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
      <Loader2 className="text-emerald-500 animate-spin" size={40} />
      <p className="text-charcoal-500 font-black text-xs uppercase tracking-widest">Entering Network...</p>
    </div>
  );
}
