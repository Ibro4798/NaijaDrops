// Pilot delivery windows. Nigeria (Africa/Lagos) is UTC+1 all year with no
// daylight saving, so a fixed offset is exact here.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// Vendors must book at least this long before the window starts.
export const CUTOFF_MINUTES_BEFORE = 60;

export const DELIVERY_WINDOWS = [
  { id: "12:30", hour: 12, minute: 30, label: "12:30 PM" },
  { id: "15:30", hour: 15, minute: 30, label: "3:30 PM" },
];

function dayLabel(dayOffset, startMs) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return new Date(startMs).toLocaleDateString("en-NG", { weekday: "long", timeZone: "Africa/Lagos" });
}

// Windows whose cutoff has not passed yet, soonest first.
export function upcomingWindows(now = new Date(), count = 4) {
  const nowMs = now.getTime();
  const lagos = new Date(nowMs + LAGOS_OFFSET_MS);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const d = lagos.getUTCDate();
  const out = [];

  for (let dayOffset = 0; dayOffset < 3 && out.length < count; dayOffset++) {
    for (const w of DELIVERY_WINDOWS) {
      // Lagos wall-clock time -> real UTC instant.
      const startMs = Date.UTC(y, m, d + dayOffset, w.hour, w.minute) - LAGOS_OFFSET_MS;
      const cutoffMs = startMs - CUTOFF_MINUTES_BEFORE * 60 * 1000;
      if (cutoffMs <= nowMs) continue;
      if (out.length >= count) break;
      out.push({
        iso: new Date(startMs).toISOString(),
        cutoffIso: new Date(cutoffMs).toISOString(),
        label: dayLabel(dayOffset, startMs) + " " + w.label,
      });
    }
  }
  return out;
}

export function formatWindowTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
