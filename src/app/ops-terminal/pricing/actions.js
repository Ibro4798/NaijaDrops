"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Manual admin override of the current fuel price per litre. This is the
 * only way the price changes - no external API, no scheduled job, nothing
 * running in the background. An admin types a number, this updates it.
 */
export async function updateFuelPrice(newPrice) {
  try {
    const { user, admin } = await validateAdmin();
    const supabase = await createClient();

    const price = Number(newPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return { success: false, error: "Enter a valid price per litre." };
    }
    // Sanity bound - catches an obvious fat-finger (e.g. typing 9500
    // instead of 950) without being so tight it blocks a genuine large
    // move in the actual pump price.
    if (price < 100 || price > 5000) {
      return { success: false, error: "That price looks out of range (expected roughly ₦100–₦5000/litre). Double-check and try again." };
    }

    const { error } = await supabase
      .from("pricing_settings")
      .update({
        fuel_price_per_litre: price,
        last_manual_update_at: new Date().toISOString(),
        last_manual_update_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw error;

    await supabase.from("fuel_price_history").insert({
      price,
      source: "manual",
      created_by: user.id,
    });

    await logAdminAction(admin.id, "FUEL_PRICE_MANUAL_UPDATE", "pricing_settings", "1", { price });

    revalidatePath("/ops-terminal/pricing");
    return { success: true };
  } catch (err) {
    console.error("Fuel price update error:", err);
    return { success: false, error: err.message || "Something went wrong updating the price." };
  }
}

/**
 * Lets an admin adjust the safety clamps and/or recalibrate the baseline
 * (the reference price PRICING_RATES.perKm was calibrated against) without
 * needing a code deploy.
 */
export async function updatePricingBounds({ fuel_price_baseline, min_multiplier, max_multiplier }) {
  try {
    const { user, admin } = await validateAdmin();
    const supabase = await createClient();

    const baseline = Number(fuel_price_baseline);
    const min = Number(min_multiplier);
    const max = Number(max_multiplier);

    if (!Number.isFinite(baseline) || baseline <= 0) {
      return { success: false, error: "Baseline price must be a positive number." };
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) {
      return { success: false, error: "Min multiplier must be less than max multiplier, and both must be positive." };
    }

    const { error } = await supabase
      .from("pricing_settings")
      .update({
        fuel_price_baseline: baseline,
        min_multiplier: min,
        max_multiplier: max,
        last_manual_update_at: new Date().toISOString(),
        last_manual_update_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw error;

    await logAdminAction(admin.id, "FUEL_PRICING_BOUNDS_UPDATE", "pricing_settings", "1", { baseline, min, max });

    revalidatePath("/ops-terminal/pricing");
    return { success: true };
  } catch (err) {
    console.error("Pricing bounds update error:", err);
    return { success: false, error: err.message || "Something went wrong updating the settings." };
  }
}
