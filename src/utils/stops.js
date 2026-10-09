import { roundUpTo50 } from "@/utils/pricing";

// Extra drop-offs on a single order (pilot).
// Stop 1 is priced exactly as before (send-package/step-2). Every additional
// drop-off adds a flat handling fee plus the distance from the previous stop.
export const MAX_EXTRA_STOPS = 4;
export const EXTRA_STOP_BASE = 150;

// Keep these in sync with send-package/step-2/page.jsx.
const PRICE_PER_KM = { bike: 120, car: 200 };
const SIZE_MULTIPLIERS = { small: 1.0, medium: 1.25, large: 1.6 };

// Straight-line distance is shorter than the road; this evens it out
// without needing a routing API call per extra stop.
const ROAD_FACTOR = 1.35;

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Fee for each extra stop, chained from stop 1: stop1 -> extra1 -> extra2 ...
export function extraStopFees(firstStop, extras, vehicle = "bike", size = "small", fuelMultiplier = 1) {
  const rate = (PRICE_PER_KM[vehicle] || PRICE_PER_KM.bike) * fuelMultiplier;
  const sizeMultiplier = SIZE_MULTIPLIERS[size] || 1.0;
  let prev = firstStop;
  return (extras || []).map((stop) => {
    const km = haversineKm(prev, stop) * ROAD_FACTOR;
    prev = stop;
    return roundUpTo50((EXTRA_STOP_BASE + km * rate) * sizeMultiplier);
  });
}
