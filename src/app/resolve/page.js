import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

/**
 * THE RESOLVER: The Single Entry Point after Auth
 * Logic: 
 * 1. Check if user has a rider profile
 * 2. If no rider -> Set mode to 'customer' -> Go to /dashboard
 * 3. If has rider -> Go to /select-mode
 */
export default async function ResolvePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Check riders table for existing profile
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!rider) {
    // CASE 1: No Rider Profile
    await supabase.from("users").update({ 
      active_mode: "customer",
      has_rider_profile: false 
    }).eq("id", user.id);

    redirect("/dashboard");
  } else {
    // CASE 2: Has Rider Profile
    await supabase.from("users").update({ 
      has_rider_profile: true 
    }).eq("id", user.id);

    redirect("/select-mode");
  }
}
