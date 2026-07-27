import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { decodeWhatsAppUrl, isAllowedHost, extractCoordinates } from "@/utils/MapResolver";

/**
 * DETERMINISTIC LINK EXPANDER
 * Follows redirects server-side to extract raw coordinates.
 *
 * FIX: links like "share your current location" embed a literal lat,lng in
 * the URL, so extractCoordinates() catches those fine. But links generated
 * from sharing a named PLACE (a market, a business listing - anything with
 * a real Google Business Profile) use a completely different URL shape:
 * .../maps/place/Brigade+Market.../data=!4m2!3m1!1s0x...:0x...!... - an
 * opaque Google place ID (CID), with NO lat/lng anywhere in the URL or in
 * the static HTML Google serves before JS runs. No regex can extract
 * coordinates that were never in the response at all - that's the actual
 * reason "it works for current-location shares but not other links."
 *
 * The fix: Google DOES put a readable place name + address in that same
 * URL path ("Brigade Market, Audu Utai Rd, Gwagwarwa, Kano..."). When
 * coordinate extraction comes up empty, pull that text out and forward-
 * geocode it through Mapbox instead. Since Google's place names usually
 * include a real road/area name, Mapbox can often resolve a usable pin even
 * though it has no idea "Brigade Market" is a business - it's just geocoding
 * the address text, not looking up the POI.
 */

function extractPlaceNameFromGoogleUrl(url = "") {
  try {
    const match = url.match(/\/maps\/place\/([^/]+)/i);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
    // Drop Google's internal query params if any slipped in
    return decoded.split("?")[0].trim() || null;
  } catch {
    return null;
  }
}

async function geocodeViaMapbox(placeText) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || !placeText) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeText)}.json?access_token=${token}&country=ng&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    return {
      lat: feature.center[1],
      lng: feature.center[0],
      resolvedVia: "address-text",
      matchedName: feature.place_name,
    };
  } catch (err) {
    console.error("Mapbox fallback geocode failed:", err);
    return null;
  }
}

export async function POST(request) {
  try {
    const { url: rawUrl } = await request.json();
    if (!rawUrl) return NextResponse.json({ error: "MISSING_URL" }, { status: 400 });

    const cleanUrl = decodeWhatsAppUrl(rawUrl);
    
    if (!isAllowedHost(cleanUrl)) {
      return NextResponse.json({ error: "UNSUPPORTED_DOMAIN" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Cache Check
    const { data: cached } = await supabase
      .from("resolved_links")
      .select("lat, lng")
      .eq("original_url", cleanUrl)
      .single();

    if (cached) {
      return NextResponse.json({ lat: cached.lat, lng: cached.lng, cached: true });
    }

    // 2. Link Expansion
    let coords = extractCoordinates(cleanUrl);
    let finalUrl = cleanUrl;
    let responseText = null;
    
    if (!coords) {
      try {
        // Fetch automatically follows up to 20 redirects by default
        const res = await fetch(cleanUrl, {
          method: "GET",
          headers: {
             'User-Agent': 'curl/7.68.0', // Simpler user-agent often avoids consent screens
             'Accept': '*/*'
          }
        });

        finalUrl = res.url;
        coords = extractCoordinates(finalUrl);

        if (!coords) {
           responseText = await res.text();
           coords = extractCoordinates(responseText);
           
           // If still no coords, look for a meta refresh
           if (!coords) {
             const metaRefreshMatch = responseText.match(/URL=['"]?(https:\/\/[^'"]+)['"]?/i);
             if (metaRefreshMatch && metaRefreshMatch[1]) {
               const metaUrl = metaRefreshMatch[1].replace(/&amp;/g, '&');
               coords = extractCoordinates(metaUrl);
               
               if (!coords) {
                 // Try one more fetch on the meta URL
                 const metaRes = await fetch(metaUrl, { headers: { 'User-Agent': 'curl/7.68.0' } });
                 finalUrl = metaRes.url;
                 coords = extractCoordinates(finalUrl) || extractCoordinates(await metaRes.text());
               } else {
                 finalUrl = metaUrl;
               }
             }
           }
        }
      } catch (err) {
        console.error("Fetch expansion error:", err);
      }
    }

    // 3. FIX: graceful fallback for CID-based place links (no lat/lng
    // anywhere in the redirect chain) - extract the place/address text
    // Google put in the URL path and forward-geocode that via Mapbox.
    let resolvedVia = "coordinates";
    if (!coords) {
      const placeText = extractPlaceNameFromGoogleUrl(finalUrl) || extractPlaceNameFromGoogleUrl(cleanUrl);
      if (placeText) {
        const geocoded = await geocodeViaMapbox(placeText);
        if (geocoded) {
          coords = { lat: geocoded.lat, lng: geocoded.lng };
          resolvedVia = "address-text";
        }
      }
    }

    if (!coords) {
      // FIX: more specific, actionable error instead of a flat "couldn't
      // resolve" - this is genuinely the most common failure shape (a
      // business/place link rather than a location pin), so tell the user
      // exactly what to do about it instead of leaving them guessing.
      return NextResponse.json({
        error: "NO_COORDINATES_FOUND",
        message: "This looks like a place or business link rather than a location pin, and we couldn't match it to an address. Open it in Google Maps, tap the blue dot or the pin, then choose \"Share location\" - or just search for the street/landmark by name instead."
      }, { status: 404 });
    }

    // 4. Cache Success (only cache direct-coordinate resolutions - address-
    // text fallback matches are approximate and shouldn't be treated as a
    // permanent, reusable answer for this exact URL)
    if (resolvedVia === "coordinates") {
      await supabase.from("resolved_links").insert({
        original_url: cleanUrl,
        lat: coords.lat,
        lng: coords.lng
      });
    }

    return NextResponse.json({ ...coords, resolvedVia });
  } catch (err) {
    console.error("Resolver Error:", err);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Something went wrong resolving that link. Try again, or search manually." }, { status: 500 });
  }
}