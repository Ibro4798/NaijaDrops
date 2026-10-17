"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

async function saveSetting(db, adminId, key, value) {
  const { error } = await db.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: adminId },
    { onConflict: "key" }
  );
  if (error) throw error;
}

function fail(err) {
  console.error("payments action error:", err);
  return { success: false, error: err?.message || "Something went wrong." };
}

// Minutes before an unpaid scheduled order is cancelled automatically (0 = never).
export async function setExpiryMinutes(minutes) {
  try {
    const { admin } = await validateAdmin();
    const m = Math.floor(Number(minutes));
    if (!Number.isFinite(m) || m < 0 || m > 1440) return { success: false, error: "Use 0 to 1440 minutes." };
    const db = createAdminClient();
    await saveSetting(db, admin.id, "unpaid_expiry_minutes", { minutes: m });
    await logAdminAction(admin.id, "SET_UNPAID_EXPIRY", "setting", admin.id, { minutes: m });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

export async function expireUnpaidNow() {
  try {
    const { admin } = await validateAdmin();
    const db = createAdminClient();
    const { data, error } = await db.rpc("expire_unpaid_orders");
    if (error) throw error;
    await logAdminAction(admin.id, "EXPIRE_UNPAID_ORDERS", "setting", admin.id, { cancelled: data });
    revalidatePath("/ops-terminal/payments");
    return { success: true, cancelled: Number(data) || 0 };
  } catch (err) { return fail(err); }
}
