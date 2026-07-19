/**
 * Warm the map bundle before the user actually needs it.
 *
 * MapModal and the send-package map are already correctly code-split via
 * next/dynamic (good - they don't bloat every page's bundle), but that also
 * means the FIRST time a user opens a map, the browser has to fetch and
 * parse that whole chunk cold, on top of the map's own tile/style requests.
 * That cold-start is most of what "the map is slow to load" actually is.
 *
 * Calling this from a page that's a likely stepping stone toward a map
 * (e.g. the vendor dashboard, right before someone taps "Send Package")
 * kicks off the same dynamic import ahead of time, so by the time the map
 * actually needs to render, the chunk is already downloaded and cached.
 *
 * Safe to call multiple times / from multiple pages - the browser dedupes
 * identical chunk requests automatically.
 */
export function warmMapBundle() {
  if (typeof window === "undefined") return;
  // Fire-and-forget; failures here should never affect the page that called this.
  import("react-map-gl").catch(() => {});
  import("mapbox-gl").catch(() => {});
  import("@/components/MapModal").catch(() => {});
}