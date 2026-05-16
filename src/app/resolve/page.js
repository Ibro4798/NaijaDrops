import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole, getRoleRedirectPath } from "@/utils/auth";

export default async function ResolvePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Use the central auth utility to determine role
  const { role } = await getUserRole(supabase);

  if (role) {
    redirect(getRoleRedirectPath(role));
  } else {
    // If no role is found (e.g., they didn't specify one during signup or metadata was missed), default to vendor
    await supabase.from("users").update({ role: 'vendor' }).eq("id", user.id);
    redirect("/dashboard");
  }
}
