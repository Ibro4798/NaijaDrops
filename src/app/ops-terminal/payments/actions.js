"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Global default: 'required' = vendors pay BEFORE riders are notified;
// 'optional' = today's flow (riders are notified straight away, pay after a rider accepts).
export async function setPaymentMode(mode) {
  try {
    const { admin } = await validateAdmin();
    if (mode !== "required" && mode !== "optional") return { success: false, error: "Invalid mode." };
    const db = createAdminClient();
    await saveSetting(db, admin.id, "payment_policy", { mode });
    await logAdminAction(admin.id, "SET_PAYMENT_MODE", "setting", admin.id, { mode });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Per-vendor override: 'default' follows the global setting.
export async function setVendorPolicy(vendorId, policy) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(vendorId || "")) return { success: false, error: "Invalid vendor." };
    if (!["default", "required", "optional"].includes(policy)) return { success: false, error: "Invalid policy." };
    const db = createAdminClient();
    const { error } = await db.from("vendors")
      .update({ payment_policy: policy === "default" ? null : policy })
      .eq("id", vendorId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_VENDOR_PAYMENT_POLICY", "vendor", vendorId, { policy });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Scheduled delivery windows on/off for one vendor.
export async function setVendorScheduled(vendorId, enabled) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(vendorId || "")) return { success: false, error: "Invalid vendor." };
    const db = createAdminClient();
    const { error } = await db.from("vendors")
      .update({ scheduled_enabled: enabled === true })
      .eq("id", vendorId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_VENDOR_SCHEDULED", "vendor", vendorId, { enabled: enabled === true });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Minutes before an unpaid pay-first order is cancelled automatically (0 = never).
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
