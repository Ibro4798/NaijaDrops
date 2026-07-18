import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { validateAdmin } from "@/utils/admin";
import OpsTerminalShell from "./OpsTerminalShell";

export default async function OpsTerminalLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Enforce Admin Role using the new central utility
  try {
    await validateAdmin();
  } catch (err) {
    redirect("/"); // Kick unauthorized users out
  }

  return <OpsTerminalShell userEmail={user?.email}>{children}</OpsTerminalShell>;
}