import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function RiderLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Enforce Rider Role
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "rider") {
    redirect("/auth/role-select");
  }

  // Double Check if Approved / Pending onboard
  // (We could fetch the drivers table here if we want to force them to the /application page)
  const { data: rider } = await supabase
    .from("riders")
    .select("approved")
    .eq("user_id", user.id)
    .single();

  const isApproved = rider?.approved === true;

  return (
    <div className="flex flex-col min-h-screen bg-charcoal-950 text-white selection:bg-emerald-500">
      <nav className="border-b border-white/5 p-4 sticky top-0 bg-charcoal-950/80 backdrop-blur-md z-50 flex justify-between items-center">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Rider</span></div>
        <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-charcoal-400">
            {isApproved ? (
              <>
                 <a href="/rider/home" className="hover:text-emerald-400">Feed</a>
                 <a href="/rider/active-job" className="hover:text-emerald-400 text-emerald-500">Active</a>
                 <a href="/rider/earnings" className="hover:text-emerald-400">Earnings</a>
              </>
            ) : (
                 <span className="text-amber-500">PENDING APPROVAL</span>
            )}
        </div>
      </nav>
      
      <main className="flex-1 p-4 sm:p-6 w-full max-w-lg mx-auto">
        {/* Pass down whether they are approved so child pages can block them if needed */}
        {children}
      </main>
    </div>
  );
}
