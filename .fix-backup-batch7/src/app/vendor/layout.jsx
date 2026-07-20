import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { LayoutDashboard } from "lucide-react";

export default async function VendorLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Access control is strictly enforced by the Bouncer Middleware.
  // Layout only ensures session presence.
  if (!user) redirect("/auth/login");

  return (
    <div className="flex flex-col min-h-screen bg-charcoal-900 text-ink">
      {/* VENDOR SPECIFIC NAVIGATION BAR COMES HERE */}
      <nav className="border-b border-white/10 p-4 sticky top-0 bg-charcoal-900/80 backdrop-blur-md z-50 flex justify-between items-center">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Vendor</span></div>
        <div className="flex gap-4 items-center text-sm font-bold">
          <a href="/vendor/dashboard" className="hover:text-emerald-400 transition-colors">Dashboard</a>
          <a href="/vendor/history" className="hover:text-emerald-400 transition-colors">History</a>
          <SignOutButton className="text-red-500 hover:text-red-400 transition-colors bg-transparent border-0 p-0 font-bold cursor-pointer">
            Sign Out
          </SignOutButton>
        </div>
      </nav>
      
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
