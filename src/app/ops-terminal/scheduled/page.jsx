import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { formatWindowTime } from "@/utils/windows";
import ReleasePanel from "./ReleasePanel";

export const dynamic = "force-dynamic";

export default async function ScheduledOrdersPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: orders } = await db
    .from("orders")
    .select("id, scheduled_at, pickup_name, dropoff_name, item_size, item_description, package_photo_url, agreed_price, stop_count, vendors(business_name)")
    .not("scheduled_at", "is", null)
    .eq("payment_status", "paid")
    .in("status", ["pending", "looking_for_driver"])
    .order("scheduled_at", { ascending: true });

  const ids = (orders || []).map((o) => o.id);
  const releasedCount = {};
  if (ids.length > 0) {
    const { data: broadcasts } = await db.from("order_broadcasts").select("order_id").in("order_id", ids);
    (broadcasts || []).forEach((b) => { releasedCount[b.order_id] = (releasedCount[b.order_id] || 0) + 1; });
  }

  const byWindow = new Map();
  (orders || []).forEach((o) => {
    const key = o.scheduled_at;
    if (!byWindow.has(key)) byWindow.set(key, { key, label: formatWindowTime(key), orders: [] });
    byWindow.get(key).orders.push({
      ...o,
      vendor_name: o.vendors?.business_name || null,
      released_to: releasedCount[o.id] || 0,
    });
  });

  const { data: riders } = await db
    .from("riders")
    .select("id, full_name, phone, operational_status")
    .eq("status", "approved")
    .order("full_name", { ascending: true });

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Scheduled orders</h1>
        <p className="text-charcoal-500 text-sm mt-1">Paid orders waiting for a window. Release them to one rider; they accept through the normal feed.</p>
      </div>
      <ReleasePanel groups={Array.from(byWindow.values())} riders={riders || []} />
    </div>
  );
}
