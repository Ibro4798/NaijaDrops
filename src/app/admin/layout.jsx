import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function AdminLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Enforce Admin Role
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/"); // Kick non-admins out entirely
  }

  return (
    <div className="flex h-screen bg-charcoal-950 text-white overflow-hidden selection:bg-rose-500">
      {/* Admin Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-charcoal-900/50 flex flex-col">
        <div className="p-6 border-b border-white/5">
          <div className="font-outfit font-black text-2xl italic tracking-tighter">NaijaDrops <span className="text-rose-500">OPS</span></div>
        </div>
        <nav className="flex-1 p-4 space-y-2 text-sm font-bold text-charcoal-400">
          <a href="/admin/dashboard" className="block p-3 rounded-xl hover:bg-white/5 hover:text-white transition-all">Overview</a>
          <a href="/admin/dispatch" className="block p-3 rounded-xl hover:bg-white/5 hover:text-white transition-all">Dispatch Control</a>
          <a href="/admin/riders" className="block p-3 rounded-xl hover:bg-white/5 hover:text-white transition-all">Rider Verification</a>
          <a href="/admin/vendors" className="block p-3 rounded-xl hover:bg-white/5 hover:text-white transition-all">Vendors</a>
          <a href="/admin/payouts" className="block p-3 rounded-xl hover:bg-white/5 hover:text-white transition-all">Payouts</a>
        </nav>
      </aside>
      
      {/* Admin Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
