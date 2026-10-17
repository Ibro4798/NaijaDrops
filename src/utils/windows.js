// Delivery windows are created by ops (Ops Terminal > Scheduled) and live in the
// schedule_windows table. This file only holds the helpers for dates and display.
// Nigeria (Africa/Lagos) is UTC+1 all year with no daylight saving, so a fixed
// offset is exact here.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const TZ = "Africa/Lagos";

// "2026-10-20" + "12:30" (Lagos wall-clock) -> UTC ISO string, or null if invalid.
export function lagosToUtcIso(dateStr, timeStr) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  const t = /^(\d{2}):(\d{2})$/.exec(timeStr || "");
  if (!d || !t) return null;
  const ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - LAGOS_OFFSET_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Today's date in Lagos as YYYY-MM-DD.
export function lagosToday(now = new Date()) {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatWindowTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Tue 12:30 PM - 1:30 PM"
export function formatWindowRange(startIso, durationMinutes) {
  if (!startIso) return "";
  const start = new Date(startIso);
  const end = new Date(start.getTime() + (Number(durationMinutes) || 0) * 60 * 1000);
  const time = (d) => d.toLocaleTimeString("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const day = start.toLocaleDateString("en-NG", { timeZone: TZ, weekday: "short" });
  return `${day} ${time(start)} - ${time(end)}`;
}
