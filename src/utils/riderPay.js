"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Rider-facing money maths.
 *
 * orders.agreed_price (and bids.amount / bids.vendor_amount / price_offer
 * messages) are always the GROSS figure - what the vendor or customer pays.
 * The platform commission is taken out of that at payout time, using the
 * single source of truth in the database: public.rider_payout_rate()
 * (0.85 = rider keeps 85%, NaijaDrops keeps 15%).
 *
 * Riders must only ever SEE and TYPE the NET figure (what lands in their
 * wallet). Vendors and customers only ever see the GROSS figure. These
 * helpers do the conversion in both directions so every screen agrees.
 */

export const DEFAULT_RIDER_RATE = 0.85;

/** What the rider actually earns on a gross price. Floors, matching the earnings screen. */
export function riderNet(gross, rate = DEFAULT_RIDER_RATE) {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return Math.floor(g * rate);
}

/**
 * The gross price the vendor must be shown so the rider nets AT LEAST
 * `net` after commission. Rounded up to the next ₦10 so the vendor sees a
 * tidy figure and the rider never ends up below what they asked for.
 */
export function grossFromNet(net, rate = DEFAULT_RIDER_RATE) {
  const n = Number(net);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / rate / 10) * 10;
}

/** Rounds a typed amount up to the nearest ₦10 (the one price grid used everywhere). */
export function roundUpTo10(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

/** Commission percentage for display copy, e.g. 15. */
export function commissionPercent(rate = DEFAULT_RIDER_RATE) {
  return Math.round((1 - rate) * 100);
}

let cachedRate = null;
let inflight = null;

async function loadRate() {
  if (cachedRate !== null) return cachedRate;
  if (!inflight) {
    inflight = (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("rider_payout_rate");
        const n = Number(data);
        cachedRate = !error && Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_RIDER_RATE;
      } catch {
        cachedRate = DEFAULT_RIDER_RATE;
      }
      return cachedRate;
    })();
  }
  return inflight;
}

/** React hook: the live rider payout rate, falling back to 0.85 until/unless it loads. */
export function useRiderPayoutRate() {
  const [rate, setRate] = useState(cachedRate ?? DEFAULT_RIDER_RATE);
  useEffect(() => {
    let alive = true;
    loadRate().then((r) => { if (alive) setRate(r); });
    return () => { alive = false; };
  }, []);
  return rate;
}
