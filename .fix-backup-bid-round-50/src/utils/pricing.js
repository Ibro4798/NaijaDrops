import { PRICING_RATES } from "@/utils/constants";

/**
 * Fuel-price-aware pricing.
 *
 * PRICING_RATES.perKm values were calibrated at a baseline fuel price. As
 * the real pump price drifts from that baseline, perKm scales
 * proportionally - a rider's actual per-kilometer cost is dominated by
 * fuel, so this keeps quoted prices honest without needing a manual rate
 * edit every time fuel moves. The flat base fee is deliberately NOT
 * scaled: it mostly represents rider time/handling for the callout itself,
 * not distance, so it shouldn't swing with the pump price the way perKm
 * does.
 *
 * clamp(min_multiplier, max_multiplier) exists so a bad auto-check (a
 * mis-parsed number, a stale/erroneous web result) can never send prices
 * to zero or 10x overnight - worst case, pricing just doesn't move until
 * an admin looks at it.
 */
export function getFuelMultiplier(settings) {
  if (!settings || !settings.fuel_price_per_litre || !settings.fuel_price_baseline) {
    return 1;
  }
  const raw = settings.fuel_price_per_litre / settings.fuel_price_baseline;
  const min = settings.min_multiplier ?? 0.7;
  const max = settings.max_multiplier ?? 1.6;
  return Math.min(Math.max(raw, min), max);
}

/**
 * Returns a rates object shaped exactly like PRICING_RATES, but with each
 * vehicle type's perKm scaled by the current fuel multiplier. Falls back
 * to the static PRICING_RATES untouched (multiplier 1) if settings are
 * missing/failed to load - pricing should never break because a settings
 * fetch failed, it should just quietly use the calibrated defaults.
 */
export function getEffectiveRates(settings) {
  const multiplier = getFuelMultiplier(settings);
  const effective = { SIZE_MULTIPLIERS: PRICING_RATES.SIZE_MULTIPLIERS };
  for (const key of Object.keys(PRICING_RATES)) {
    if (key === "SIZE_MULTIPLIERS") continue;
    const rate = PRICING_RATES[key];
    effective[key] = { base: rate.base, perKm: Math.round(rate.perKm * multiplier) };
  }
  return effective;
}

/**
 * Fetches the singleton pricing_settings row. Any failure (missing table,
 * network issue, RLS surprise) resolves to null rather than throwing -
 * every caller treats null the same as "use the static defaults."
 */
export async function fetchPricingSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from("pricing_settings")
      .select("fuel_price_per_litre, fuel_price_baseline, min_multiplier, max_multiplier")
      .eq("id", 1)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
