import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import LiveOrdersFeed from "./LiveOrdersFeed";
import CancelledOrdersPanel from "./CancelledOrdersPanel";

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
         users (name),
         current_lat,
         current_lng,
         vehicle_type,
         plate_number
      )
    `)
    .in("status", ["pending", "looking_for_driver", "matched", "picked_up", "in_transit"])
    .order("created_at", { ascending: false });

  // Approved riders ops can hand a job to (online or not).
  const { data: assignableRiders } = await supabase
    .from("riders")
    .select("id, operational_status, users(name)")
    .eq("status", "approved")
    .eq("approved", true);

  // Cancelled orders drop out of the live feed entirely (by design - it's a
  // live dispatch board), so cancellation_reason had nowhere to surface.
  // This pulls the last 15 cancellations specifically to show it.
  const { data: cancelledOrders } = await supabase
    .from("orders")
    .select("id, pickup_name, dropoff_name, cancellation_reason, updated_at")
    .eq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(15);

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
      <LiveOrdersFeed initialOrders={initialOrders || []} riders={assignableRiders || []} />

      <div className="mt-12 bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-500">Recently Cancelled</h2>
           <div className="px-4 py-1.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest">
              Last {cancelledOrders?.length || 0}
           </div>
        </div>
        <CancelledOrdersPanel orders={cancelledOrders || []} />
      </div>
    </div>
  );
}
