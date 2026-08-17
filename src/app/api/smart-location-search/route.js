import { NextResponse } from "next/server";

/**
 * Key-free smart location search fallback.
 *
 * When the direct Mapbox search returns nothing for a query (e.g. colloquial
 * names like "Brigade" for Brigade Market), this endpoint tries again with
 * two extra strategies — both completely free and requiring no API key:
 *
 * 1. Photon (photon.komoot.io) — OSM-based geocoder with Elasticsearch backend,
 *    proximity-biased toward Kano center. Better POI recall than Nominatim
 *    because it ranks by relevance + distance rather than just text matching.
 *
 * 2. Nominatim (nominatim.openstreetmap.org) — called with "Kano Nigeria"
 *    appended to the raw query, which often resolves shorthand/colloquial
 *    names the uncontextualized query missed.
 *
 * Both sources run in parallel and are bounding-box filtered to the Kano
 * metro area so out-of-range results never surface.
 *
 * No ANTHROPIC_API_KEY or any other paid API key is required.
 */

const KANO_CENTER_LAT = 12.0022;
const KANO_CENTER_LNG = 8.5920;
const KANO_LAT_MIN = 11.9000;
const KANO_LAT_MAX = 12.1000;
const KANO_LNG_MIN = 8.4000;
const KANO_LNG_MAX = 8.6500;

function isInsideKano(lat, lng) {
  return (
    lat >= KANO_LAT_MIN && lat <= KANO_LAT_MAX &&
    lng >= KANO_LNG_MIN && lng <= KANO_LNG_MAX
  );
}

async function photonSearch(query) {
  try {
    // Append "Kano Nigeria" for better context, bias toward Kano center,
    // and restrict bbox to Kano state so no out-of-area results slip in.
    const q = encodeURIComponent(query + " Kano Nigeria");
    const url =
      `https://photon.komoot.io/api/?q=${q}` +
      `&lat=${KANO_CENTER_LAT}&lon=${KANO_CENTER_LNG}` +
      `&limit=5&lang=en` +
      `&bbox=${KANO_LNG_MIN},${KANO_LAT_MIN},${KANO_LNG_MAX},${KANO_LAT_MAX}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "NaijaDrops/1.0" },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data?.features?.length) return [];

    return data.features
      .filter((f) => {
        const [lng, lat] = f.geometry?.coordinates || [];
        return isInsideKano(lat, lng);
      })
      .map((f) => {
        const props = f.properties || {};
        const [lng, lat] = f.geometry.coordinates;

        // Build a readable description from Photon's property bag
        const parts = [
          props.name,
          props.street && props.housenumber
            ? `${props.housenumber} ${props.street}`
            : props.street,
          props.district || props.suburb || props.locality,
          props.city || props.county,
          props.country,
        ].filter(Boolean);

        return {
          name: props.name || parts[0] || null,
          description: parts.join(", "),
          lat,
          lng,
          id: `photon-${props.osm_type}-${props.osm_id}`,
          source: "web-search",
          isOSM: true,
          isPhoton: true,
        };
      })
      .filter((r) => r.name);
  } catch (e) {
    console.error("Photon smart search error:", e);
    return [];
  }
}

async function nominatimSearch(query) {
  try {
    const q = encodeURIComponent(query + ", Kano, Nigeria");
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&q=${q}&countrycodes=ng&limit=5&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "NaijaDrops/1.0",
      },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((item) =>
        isInsideKano(parseFloat(item.lat), parseFloat(item.lon))
      )
      .map((item) => ({
        name: item.display_name.split(",")[0],
        description: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        id: `osm-${item.osm_type}-${item.osm_id}`,
        source: "web-search",
        isOSM: true,
      }));
  } catch (e) {
    console.error("Nominatim smart search error:", e);
    return [];
  }
}

export async function POST(req) {
  try {
    const { query } = await req.json();
    const trimmed = (query || "").trim();

    if (trimmed.length < 3) {
      return NextResponse.json({
        success: false,
        reason: "query_too_short",
        results: [],
      });
    }

    // Both sources run in parallel — no API key required for either
    const [photonResults, nominatimResults] = await Promise.all([
      photonSearch(trimmed),
      nominatimSearch(trimmed),
    ]);

    // Merge and deduplicate by ~100m proximity grid
    const seen = new Set();
    const results = [];
    for (const candidate of [...photonResults, ...nominatimResults]) {
      const key = `${candidate.lat.toFixed(4)},${candidate.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(candidate);
      if (results.length >= 5) break;
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Smart location search error:", err);
    return NextResponse.json({
      success: false,
      reason: "exception",
      results: [],
    });
  }
}
