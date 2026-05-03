import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import LiveOrdersFeed from "./LiveOrdersFeed";

export const dynamic = "force-dynamic";

export default async function OpsOrdersPage() {
  // LAYER 2: Server-Side RBAC Enforcement
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // Initial Data Fetch (Snapshot before real-time takes over)
  const { data: initialOrders } = await supabase
    .from("orders")
    .select(`
      *,
      riders (
         user_id,
         users (full_name),
         vehicle_type,
         plate_number
      ),
      users (full_name, phone)
    `)
    .in("status", ["pending", "matched", "authorized", "picked_up", "in_transit"])
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live Telemetry Feed Active
           </div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Traffic Control / Orders</h1>
        </div>
      </div>

      {/* Real-time Client Component */}
      <LiveOrdersFeed initialOrders={initialOrders || []} adminId={admin.id} />
    </div>
  );
}
