import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function VendorLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Enforce Vendor Role
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "vendor") {
    redirect("/auth/role-select");
  }

  return (
    <div className="flex flex-col min-h-screen bg-charcoal-900 text-white">
      {/* VENDOR SPECIFIC NAVIGATION BAR COMES HERE */}
      <nav className="border-b border-white/10 p-4 sticky top-0 bg-charcoal-900/80 backdrop-blur-md z-50 flex justify-between items-center">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Vendor</span></div>
        <div className="flex gap-4 text-sm font-bold">
          <a href="/vendor/dashboard" className="hover:text-emerald-400 transition-colors">Dashboard</a>
          <a href="/vendor/create-delivery" className="text-emerald-500 hover:text-emerald-400 transition-colors">Create Delivery</a>
          <a href="/vendor/history" className="hover:text-emerald-400 transition-colors">History</a>
        </div>
      </nav>
      
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
