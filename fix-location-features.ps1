# fix-location-features.ps1
# Run from repo root: C:\Users\T450s\Documents\logistics welcome soon page
#
# Fixes four separate location issues:
#
# 1. ACCURACY: geolocation.js was resolving on the very FIRST GPS ping
#    whenever accuracy was under 50m, and only waiting 2.5s total. A
#    phone's first GPS fix is often a low-quality "quick fix" that improves
#    sharply on the 2nd/3rd ping - resolving that early was locking in bad
#    readings. Restored a 2-ping stabilization requirement for "good but not
#    excellent" readings, extended the wait to 4.5s, and raised the
#    accept-GPS-over-IP-fallback threshold from 200m to 500m (500m GPS beats
#    5000m-accuracy IP location by 10x for last-mile delivery). This is used
#    by every "use my location" button (vendor + customer) AND by the
#    rider's online/location-heartbeat, so it fixes both at once.
#
# 2. STALE ERRORS: "Couldn't find your location" banners now clear the
#    instant you try another method (typing a search, picking a suggestion,
#    dragging the pin, switching between GPS and paste-a-link).
#
# 3. UNRESOLVABLE LINKS: links like maps.app.goo.gl/JFCc1MK8LkMVJD9DA (a
#    named place/business, e.g. "Brigade Market") use a Google place-ID
#    format with NO lat/lng anywhere in the URL or page - fundamentally
#    different from "share my current location" links, which do embed raw
#    coordinates. That's the real reason one worked and the other didn't.
#    Fix: extract the readable address text Google puts in the URL path and
#    forward-geocode that via Mapbox as a fallback; when that also fails,
#    show a specific, actionable message instead of a flat error.
#
# 4. SEARCH DEPTH: Mapbox's Geocoding API no longer returns POI data at all
#    (removed in v5/v6, per Mapbox's own docs) - not a Kano-specific gap.
#    Their newer Search Box product covers POIs but is documented as
#    US/Canada/Europe only, so it would silently return nothing for Kano -
#    not usable here. Workaround: merge in free OpenStreetMap/Nominatim
#    results alongside Mapbox for the search bar. Coverage will vary by how
#    well Kano is mapped on OSM, but it is the only option that can plausibly
#    know about a specific market by name at zero extra cost.
#
# Touches: src/utils/geolocation.js, src/utils/mapbox.js,
#          src/app/api/resolve-link/route.js, src/components/MapModal.jsx,
#          src/app/send-package/step-1/page.jsx,
#          src/app/vendor/create-delivery/page.jsx

$ErrorActionPreference = "Stop"

$files = @(
    "src\utils\geolocation.js",
    "src\utils\mapbox.js",
    "src\app\api\resolve-link\route.js",
    "src\components\MapModal.jsx",
    "src\app\send-package\step-1\page.jsx",
    "src\app\vendor\create-delivery\page.jsx"
)
foreach ($f in $files) {
    if (-not (Test-Path $f)) {
        Write-Host "ERROR: Cannot find $f — run this script from the repo root." -ForegroundColor Red
        exit 1
    }
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
foreach ($f in $files) {
    Copy-Item $f "$f.bak_$stamp"
}
Write-Host "Backed up all 6 files with .bak_$stamp suffix" -ForegroundColor DarkGray

function Normalize($s) {
    return $s -replace "`r`n", "`n" -replace "`r", "`n"
}

function Write-Full($path, $content, $label) {
    [System.IO.File]::WriteAllText((Resolve-Path $path), (Normalize $content), (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "Rewrote $path ($label)" -ForegroundColor Green
}

function Patch-File($path, $old, $new, $label) {
    $raw = [System.IO.File]::ReadAllText((Resolve-Path $path))
    $content = Normalize $raw
    $oldN = Normalize $old
    $newN = Normalize $new

    $count = ([regex]::Matches($content, [regex]::Escape($oldN))).Count
    if ($count -eq 0) {
        Write-Host "ERROR: Expected block not found in $path ($label). File may have changed. No changes made to this file." -ForegroundColor Red
        exit 1
    }
    if ($count -gt 1) {
        Write-Host "ERROR: Expected block found $count times in $path ($label). Aborting to avoid ambiguous edit." -ForegroundColor Red
        exit 1
    }
    $updated = $content.Replace($oldN, $newN)
    [System.IO.File]::WriteAllText((Resolve-Path $path), $updated, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "Patched $path ($label)" -ForegroundColor Green
}

# --- Full-file rewrites ---
$geolocationJs = @'
/**
 * Reliable Geolocation Utility
 * Tiered fetching: GPS -> Wifi/Cell -> IP-API Fallback
 */

const DEMO_LOCATION = {
    lat: 12.0022,
    lng: 8.5167,
    accuracy: 10,
    source: 'demo'
};

export async function getReliableLocation(onProgress) {
    return new Promise(async (resolve) => {
        const hasMapbox = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        
        let locationFound = false;
        let bestReading = null;
        let pingsReceived = 0;

        const updateStatus = (msg) => {
            if (onProgress) onProgress(msg);
        };

        // Real IP-based Geolocation Fallback
        const getIPLocation = async () => {
            try {
                updateStatus("🌍 Resolving city via IP...");
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                if (data.latitude && data.longitude) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude,
                        city: data.city,
                        accuracy: 5000,
                        source: 'ip-api'
                    };
                }
            } catch (e) {
                console.error("IP Geolocate failed:", e);
            }
            return null;
        };

        if ("geolocation" in navigator) {
            updateStatus("🛰️ Synchronizing GPS...");

            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    pingsReceived++;
                    if (!bestReading || pos.coords.accuracy < bestReading.accuracy) {
                        bestReading = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            source: 'gps'
                        };
                        updateStatus(`🎯 Precision Lock: ±${Math.round(pos.coords.accuracy)}m`);
                    }

                    // FIX 2 (reverting part of FIX 1 above, which went too far):
                    // FIX 1 made this resolve on the very FIRST ping whenever
                    // accuracy < 50m. That's the actual bug behind "my last
                    // update made it inaccurate" - a phone's first GPS fix from
                    // a cold start is very often a low-quality "quick fix" that
                    // still reports a deceptively OK accuracy number, then
                    // improves sharply on the 2nd/3rd ping as the chip locks
                    // onto more satellites. Resolving on ping #1 was locking in
                    // that early, less-accurate reading instead of letting it
                    // refine.
                    //
                    // Two-tier fix:
                    //  - An excellent single reading (<25m) is trustworthy on
                    //    its own - GPS chips rarely report that tight by fluke.
                    //  - A merely "good" reading (25-60m, the common case on
                    //    Kano's budget Android phones indoors/under cloud
                    //    cover) now requires a 2nd ping before we trust it,
                    //    restoring the original stabilization safety net but
                    //    with a realistic threshold instead of the old 20m
                    //    (which real phones here rarely hit at all).
                    const isExcellent = pos.coords.accuracy < 25;
                    const isGoodAndStable = pos.coords.accuracy < 60 && pingsReceived >= 2;

                    if (isExcellent || isGoodAndStable) {
                        cleanup();
                        resolve(bestReading);
                    }
                },
                (err) => {
                    console.warn("GPS Watch failed:", err.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );

            const cleanup = () => {
                locationFound = true;
                navigator.geolocation.clearWatch(watchId);
            };

            // FIX 2: extended back from 2500ms to 4500ms. FIX 1's 2500ms window
            // was too short for weak-signal conditions (indoors, cloud cover)
            // to ever produce a 2nd stabilizing ping at all, so most requests
            // in those conditions never got a chance to reach the tier-2 check
            // above - they just timed out early on whatever the first
            // (possibly bad) reading was. 4500ms is a middle ground: still
            // meaningfully faster than the original 5000ms, but leaves enough
            // room for a real 2nd ping to arrive.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                // FIX 2: raised from 200m to 500m. A 200-500m GPS reading is
                // still an order of magnitude better than the ~5000m-accuracy
                // IP fallback below - for last-mile delivery pin placement,
                // "somewhere on the right street" beats "somewhere in the
                // right city." Falling back to IP here was actively making
                // location worse in the exact cases (weak GPS signal) it was
                // meant to rescue.
                if (bestReading && bestReading.accuracy < 500) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else if (bestReading) {
                        resolve(bestReading); // Use the poor GPS reading if IP fails too
                    } else {
                        // Ultimate fallback: Null or let user know
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 4500); 

        } else {
            const ipLoc = await getIPLocation();
            resolve(ipLoc);
        }
    });
}
/**
 * @deprecated No longer used anywhere in the app as of this fix. This was a
 * bare one-shot navigator.geolocation.getCurrentPosition() call with a flat
 * 10s timeout and zero fallback - on weak/indoor GPS signal it just failed
 * outright, which is what made "use my location" buttons feel unreliable.
 * Every location button in the app now calls getReliableLocation() above
 * instead. Left in place only in case anything outside this codebase still
 * imports it directly - safe to delete once confirmed unused.
 * Industry Standard Geolocation (One-shot)
 * Used for "Use Current Location" buttons
 */
export async function getCurrentPositionStandard() {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error("Location services not supported."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: 'standard-gps'
                });
            },
            (err) => {
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}
'@
Write-Full "src\utils\geolocation.js" $geolocationJs "GPS accuracy tuning"

$mapboxJs = @'
// Mapbox Utilities for Kano Precision Search
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Kano Bounding Box [minLng, minLat, maxLng, maxLat]
const KANO_BBOX = "8.4000,11.9000,8.6500,12.1000";

/**
 * FIX: Mapbox's Geocoding API (used below) no longer returns POI data at
 * all - Mapbox removed it from v5/v6 and now points developers at a
 * separate "Search Box" product for POI search. That's the actual reason
 * named places like markets ("Brigade", "Kantin Kwari") never showed up
 * here - it's not a Kano-specific coverage gap, Mapbox Geocoding simply
 * doesn't carry that data type anymore for ANY location.
 *
 * Search Box API would be the natural fix, but its documented coverage is
 * currently limited to the US, Canada, and Europe - it does not cover
 * Nigeria, so switching to it would silently return nothing for Kano
 * searches. Not usable here.
 *
 * Practical workaround: query OpenStreetMap's Nominatim search alongside
 * Mapbox's geocoder and merge the results. Nominatim does carry POI/business
 * tags (coverage depends on how well local contributors have mapped Kano,
 * which varies, but it's the only free option that can plausibly know about
 * a specific market by name). Results are merged and de-duplicated, with
 * Mapbox results first since they're generally more reliable for addresses
 * and roads.
 *
 * Note for later: the public Nominatim endpoint has a strict usage policy
 * (max ~1 request/second, no heavy automated use) - fine at pilot volume,
 * but if this app has real production traffic later, swap NOMINATIM_URL for
 * a paid OSM-based provider (e.g. LocationIQ, Geoapify) or a self-hosted
 * Nominatim instance to stay within terms.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function getNominatimSuggestions(query) {
    try {
        const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(query + ", Kano, Nigeria")}&countrycodes=ng&limit=5&addressdetails=1`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];

        return data.map(item => ({
            name: item.display_name.split(',')[0],
            description: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            id: `osm-${item.osm_type}-${item.osm_id}`,
            isMapbox: false,
            isOSM: true
        }));
    } catch (error) {
        console.error("Nominatim suggestion error:", error);
        return [];
    }
}

// Rough duplicate check: same-ish name within ~150m of an existing result
function isDuplicate(candidate, existing) {
    return existing.some(item => {
        const nameMatch = item.name?.toLowerCase().trim() === candidate.name?.toLowerCase().trim();
        if (!nameMatch) return false;
        const dLat = Math.abs(item.lat - candidate.lat);
        const dLng = Math.abs(item.lng - candidate.lng);
        return dLat < 0.0015 && dLng < 0.0015; // ~150m
    });
}

/**
 * Get address + POI suggestions, merging Mapbox Geocoding (addresses,
 * roads, neighborhoods) with OpenStreetMap/Nominatim (fills in named
 * places/markets that Mapbox no longer returns). See note above.
 */
export const getMapboxSuggestions = async (query, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!query || query.length < 2) return [];

    const mapboxPromise = (async () => {
        if (!activeToken) return [];
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${activeToken}&bbox=${KANO_BBOX}&country=ng&limit=6&autocomplete=true`;
            const response = await fetch(url);
            const data = await response.json();
            if (!response.ok) {
                console.error("Mapbox API Error:", data);
                return [];
            }
            if (data && data.features) {
                return data.features.map(feature => ({
                    name: feature.text,
                    description: feature.place_name,
                    lat: feature.center[1], // Mapbox uses [lng, lat]
                    lng: feature.center[0],
                    id: feature.id,
                    isMapbox: true
                }));
            }
            return [];
        } catch (error) {
            console.error("Mapbox suggestion error:", error);
            return [];
        }
    })();

    const nominatimPromise = getNominatimSuggestions(query);

    const [mapboxResults, osmResults] = await Promise.all([mapboxPromise, nominatimPromise]);

    const merged = [...mapboxResults];
    for (const candidate of osmResults) {
        if (!isDuplicate(candidate, merged)) {
            merged.push(candidate);
        }
    }

    return merged.slice(0, 8);
};

/**
 * Reverse Geocode: Get street address from coordinates
 * Mapbox expects [lng, lat]
 *
 * FIX: was a hardcoded 3-second timeout, which on Kano's patchy mobile
 * networks regularly aborted mid-request and silently fell back to raw
 * coordinates - the "sometimes shows coordinates instead of the location
 * name" symptom. Bumped to 6 seconds, which is generous enough to survive a
 * slow network round-trip without making the single-attempt worst case any
 * slower than a user would tolerate. Deliberately NOT doing a slow multi-
 * attempt retry here - that would fix the coordinate-fallback problem at the
 * cost of making the "it's slow" complaint worse.
 */
export const reverseGeocodeMapbox = async (lat, lng, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${activeToken}&types=address,poi,neighborhood,locality&limit=1`;

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("Mapbox Reverse Geocode API Error");
            return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        const data = await response.json();
        if (data && data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn("Mapbox reverse geocoding timed out (>6s), using coordinates fallback");
        } else {
            console.error("Mapbox reverse geocode error:", error);
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

/**
 * Fetch a driving route from Mapbox Directions API
 */
export const getMapboxRoute = async (start, end, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !start || !end) return null;

    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${activeToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            return {
                geometry: data.routes[0].geometry,
                distance: data.routes[0].distance,
                duration: data.routes[0].duration
            };
        }
        return null;
    } catch (error) {
        console.error("Mapbox Directions API error:", error);
        return null;
    }
};

/**
 * Fetch a distance matrix using Mapbox Matrix API
 * Useful for AI Batching (Maestro) to find real driving distances between multiple points.
 */
export const getMapboxMatrix = async (coordinates, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !coordinates || coordinates.length < 2) return null;

    try {
        const coordString = coordinates.map(c => `${c.lng},${c.lat}`).join(';');
        const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordString}?annotations=distance,duration&access_token=${activeToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok') {
            return {
                distances: data.distances, // 2D array of distances in meters
                durations: data.durations  // 2D array of durations in seconds
            };
        }
        return null;
    } catch (error) {
        console.error("Mapbox Matrix API error:", error);
        return null;
    }
};
'@
Write-Full "src\utils\mapbox.js" $mapboxJs "Nominatim POI merge"

$resolveLinkRoute = @'
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
'@
Write-Full "src\app\api\resolve-link\route.js" $resolveLinkRoute "graceful place-link fallback"

$mapModalJsx = @'
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { X, MapPin, Search, Navigation, CheckCircle2, Loader2, Globe } from 'lucide-react';
import { getReliableLocation } from '@/utils/geolocation';
import { getMapboxSuggestions, reverseGeocodeMapbox } from '@/utils/mapbox';

// workerClass override removed to fix blank map in Next.js 14+

const center = {
  lat: 12.0022,
  lng: 8.5920 // Kano, Nigeria
};

export default function MapModal({ isOpen, onClose, onConfirm, initialLocation, title = "Select Location" }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [viewState, setViewState] = useState({
    longitude: initialLocation?.coords?.lng || center.lng,
    latitude: initialLocation?.coords?.lat || center.lat,
    zoom: 12.5
  });
  
  const [address, setAddress] = useState(initialLocation?.name || '');
  const [isResolving, setIsResolving] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Track center coordinates for returning
  const [markerPosition, setMarkerPosition] = useState({ lat: viewState.latitude, lng: viewState.longitude });
  const [mapLoaded, setMapLoaded] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  // Ref for the Map component to handle panTo
  const mapRef = useRef();

  // Fix Mapbox gray screen from Modal animation resize bug
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 350); // wait for 300ms modal animation
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const reverseGeocode = async (lat, lng) => {
    setIsResolving(true);
    try {
      if (mapboxToken) {
        const addr = await reverseGeocodeMapbox(lat, lng, mapboxToken);
        setAddress(addr);
      } else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setAddress(data?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch (error) {
       console.error("Geocoding failed", error);
       setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } finally {
      setIsResolving(false);
    }
  };

  // FIX: getMapboxSuggestions() now merges Mapbox + OpenStreetMap results
  // internally (see src/utils/mapbox.js) and handles a missing token on its
  // own, so the separate raw-Nominatim fallback branch that used to live
  // here is no longer needed - one code path for both cases.
  const handleSearch = async (query) => {
    setSearchQuery(query);
    // FIX: clear a stale "couldn't find your location" error as soon as the
    // user starts typing - trying another method should never leave the old
    // error sitting on screen.
    setLocationError(null);

    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const sugs = await getMapboxSuggestions(query, mapboxToken);
        setSuggestions(sugs);
        setShowSuggestions(true);
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 400);
  };

  const selectSuggestion = async (sug) => {
    setLocationError(null); // FIX: clear stale error when a location is picked via search
    setMarkerPosition({ lat: sug.lat, lng: sug.lng });
    setViewState({ ...viewState, longitude: sug.lng, latitude: sug.lat, zoom: 14.5 });
    setAddress(sug.name || sug.description);
    
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const useMyLocation = async () => {
    setIsResolving(true);
    setLocationError(null);
    try {
      const loc = await getReliableLocation();
      if (loc) {
        setMarkerPosition({ lat: loc.lat, lng: loc.lng });
        setViewState({ ...viewState, longitude: loc.lng, latitude: loc.lat, zoom: 14.5 });
        reverseGeocode(loc.lat, loc.lng);
      } else {
        // FIX: previously did nothing at all here - the button would just
        // stop spinning with zero indication of what happened. This is what
        // "the button fails" meant in practice: GPS and the IP fallback can
        // both genuinely fail (denied permission, dead network, IP lookup
        // rate-limited), and there was no way to tell the difference between
        // "still working" and "gave up."
        setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
      }
    } catch (error) {
       console.error("Geolocation error:", error);
       setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleMove = useCallback((evt) => {
      setViewState(evt.viewState);
  }, []);

  const handleMoveEnd = useCallback(async (evt) => {
      setLocationError(null); // FIX: clear stale error once the user drags the pin themselves
      const lat = evt.viewState.latitude;
      const lng = evt.viewState.longitude;
      setMarkerPosition({ lat, lng });
      reverseGeocode(lat, lng);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center sm:p-4 bg-[#18181b]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-emerald-50 text-emerald-600`}>
               <Navigation size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#18181b] tracking-tight">{title}</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                {mapboxToken ? 'Powered by Mapbox' : 'Powered by OpenStreetMap (Demo)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-gray-50 border-b border-gray-100 relative z-[110] shrink-0">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-charcoal-400">
              <Search size={18} className="group-focus-within:text-emerald-600 transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search landmark or street in Kano..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-[#18181b] shadow-sm transition-all"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-60 overflow-y-auto z-[250]">
                {suggestions.map((sug, idx) => (
                  <button key={idx} onClick={() => selectSuggestion(sug)} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-start gap-3 border-b border-gray-50 last:border-0 transition-colors">
                    <MapPin size={16} className="text-emerald-500 mt-1 shrink-0" />
                    <div>
                      <p className="font-bold text-[#18181b] text-sm line-clamp-1 truncate">{sug.name || sug.description}</p>
                      {sug.name && sug.name !== sug.description && (
                         <p className="text-xs text-charcoal-400 line-clamp-1">{sug.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map Area */}
        <div className="relative flex-1 bg-gray-200 min-h-[500px]">
          {mapboxToken ? (
            <div className="w-full h-full relative">
              {!mapLoaded && (
                <div className="absolute inset-0 bg-gray-50 z-[150] flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-4 border border-gray-100">
                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800 animate-pulse">Synchronizing Satellite...</div>
                </div>
              )}
              <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                {...viewState}
                onMove={handleMove}
                onMoveEnd={handleMoveEnd}
                onLoad={() => setMapLoaded(true)}
                style={{width: '100%', height: '100%'}}
                // Lighter style than streets-v12 - fewer layers to fetch and
                // render, meaningfully faster first paint on patchy mobile
                // connections while still showing roads/labels clearly
                // enough to drop a delivery pin accurately.
                mapStyle="mapbox://styles/mapbox/light-v11"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-charcoal-400 p-8 text-center bg-gray-50">
               <Globe size={48} className="mb-4 text-gray-300" />
               <p className="font-bold text-lg text-charcoal-600">Map rendering is disabled</p>
               <p className="text-sm">Please provide a valid `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`.</p>
            </div>
          )}

          {/* Fixed Center Pin Overlay */}
          {mapboxToken && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none" style={{ marginTop: '-42px' }}>
                  <div className="bg-[#18181b] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg mb-2 flex items-center gap-2">
                       {isResolving ? <><Loader2 size={12} className="animate-spin" /> Locating</> : 'Set Pin'}
                  </div>
                  <div className="relative">
                      <MapPin size={42} className="text-emerald-600 fill-white drop-shadow-xl" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-2.5 h-2.5 bg-emerald-600 rounded-full animate-pulse"></div>
                  </div>
                  {/* Pin shadow */}
                  <div className="w-4 h-1 bg-black/20 rounded-full mt-0 blur-[1px]"></div>
              </div>
          )}

          <button onClick={useMyLocation} disabled={isResolving} className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-emerald-600 hover:scale-105 active:scale-95 transition-all group z-10 border border-gray-100 disabled:opacity-60">
            <Navigation size={22} className="group-hover:rotate-12 transition-transform" />
          </button>

          {locationError && (
            <div className="absolute top-[calc(50%+50px)] right-4 z-10 max-w-[220px] bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl">
              {locationError}
            </div>
          )}

          {/* Overlaid Confirm Footer */}
          <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
              <div className="bg-gradient-to-t from-black/20 to-transparent h-12 w-full absolute bottom-full"></div>
              <div className="bg-white p-6 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pointer-events-auto">
                  
                  <div className="mb-6 flex items-start gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div className="w-10 h-10 bg-emerald-700 text-white rounded-xl flex items-center justify-center shrink-0"><MapPin size={20} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Selected Location</div>
                      <div className="text-[#18181b] font-bold text-base leading-tight truncate">{isResolving ? 'Resolving...' : address || 'Select a point'}</div>
                    </div>
                  </div>

                   <button 
                       disabled={!address || isResolving} 
                       onClick={() => onConfirm({ name: address, coords: markerPosition })} 
                       className={`w-full py-5 rounded-[2rem] font-black flex items-center justify-center gap-3 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-xl active:scale-95 ${!address || isResolving ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-[#18181b] border-2 border-emerald-500/30 hover:bg-black text-white hover:shadow-emerald-500/10'}`}
                   >
                         {!address || isResolving ? <Loader2 size={28} className="animate-spin" /> : <><CheckCircle2 size={28} className="text-emerald-500" /> Confirm Point</>}
                   </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'@
Write-Full "src\components\MapModal.jsx" $mapModalJsx "error-clearing + simplified search"

# --- send-package/step-1/page.jsx (targeted patches) ---
$spPath = "src\app\send-package\step-1\page.jsx"

$spOldSearch = @'
  async function handleSearch(val, type) {
    if (type === "pickup") { setPickupInput(val); setPickup(null); }
    else { setDropoffInput(val); setDropoff(null); }
    clearTimeout(searchTimeout.current);
'@
$spNewSearch = @'
  async function handleSearch(val, type) {
    // FIX: clear stale location errors as soon as the user tries another
    // method (typing a search) - an old "couldn't find your location"
    // banner shouldn't linger once they've moved on.
    setGpsError(null);
    setLinkError(null);
    if (type === "pickup") { setPickupInput(val); setPickup(null); }
    else { setDropoffInput(val); setDropoff(null); }
    clearTimeout(searchTimeout.current);
'@
Patch-File $spPath $spOldSearch $spNewSearch "handleSearch error-clear"

$spOldSelect = @'
  function selectLocation(loc, type) {
    const point = { name: loc.description || loc.name, lat: loc.lat, lng: loc.lng };
'@
$spNewSelect = @'
  function selectLocation(loc, type) {
    setGpsError(null); // FIX: clear stale location errors once a location is actually picked
    setLinkError(null);
    const point = { name: loc.description || loc.name, lat: loc.lat, lng: loc.lng };
'@
Patch-File $spPath $spOldSelect $spNewSelect "selectLocation error-clear"

$spOldUseMyLoc = @'
  async function handleUseMyLocation() {
    setGpsLoading(true);
    setGpsError(null);
    try {
'@
$spNewUseMyLoc = @'
  async function handleUseMyLocation() {
    setGpsLoading(true);
    setGpsError(null);
    setLinkError(null); // FIX: clear stale link-paste error when switching to GPS
    try {
'@
Patch-File $spPath $spOldUseMyLoc $spNewUseMyLoc "handleUseMyLocation cross-clear"

$spOldLinkPaste = @'
    setGpsLoading(true);
    setLinkError(null);
    try {
      const resp = await fetch("/api/resolve-link", {
        method: "POST",
        body: JSON.stringify({ url: extractedUrl }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();

      if (data.lat && data.lng) {
        const name = await reverseGeocodeMapbox(data.lat, data.lng, mapboxToken);
        const point = { name, lat: data.lat, lng: data.lng };
        selectLocation(point, linkTarget);
        setShowLinkModal(false);
        setLinkInput("");
      } else {
        setLinkError(data.error || "Unable to resolve this map link. Please try a different link or search manually.");
      }
    } catch (err) {
      setLinkError("Connection failed. Please check your network and try again.");
    } finally {
      setGpsLoading(false);
    }
  }
'@
$spNewLinkPaste = @'
    setGpsLoading(true);
    setLinkError(null);
    setGpsError(null); // FIX: clear stale GPS error when switching to link-paste
    try {
      const resp = await fetch("/api/resolve-link", {
        method: "POST",
        body: JSON.stringify({ url: extractedUrl }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();

      if (data.lat && data.lng) {
        const name = await reverseGeocodeMapbox(data.lat, data.lng, mapboxToken);
        const point = { name, lat: data.lat, lng: data.lng };
        selectLocation(point, linkTarget);
        setShowLinkModal(false);
        setLinkInput("");
      } else {
        // FIX: prefer the more specific `message` field (e.g. "this looks
        // like a place/business link, not a pin") over the old generic
        // `error` code, when the resolver route provides one.
        setLinkError(data.message || data.error || "Unable to resolve this map link. Please try a different link or search manually.");
      }
    } catch (err) {
      setLinkError("Connection failed. Please check your network and try again.");
    } finally {
      setGpsLoading(false);
    }
  }
'@
Patch-File $spPath $spOldLinkPaste $spNewLinkPaste "handleLinkPaste cross-clear + better error"

$spOldPickupBtn = @'
<button onClick={() => { setLinkTarget("pickup"); setShowLinkModal(true); }}
'@
$spNewPickupBtn = @'
<button onClick={() => { setLinkTarget("pickup"); setLinkError(null); setGpsError(null); setShowLinkModal(true); }}
'@
Patch-File $spPath $spOldPickupBtn $spNewPickupBtn "pickup link-modal open clears errors"

$spOldDropoffBtn = @'
<button onClick={() => { setLinkTarget("dropoff"); setShowLinkModal(true); }}
'@
$spNewDropoffBtn = @'
<button onClick={() => { setLinkTarget("dropoff"); setLinkError(null); setGpsError(null); setShowLinkModal(true); }}
'@
Patch-File $spPath $spOldDropoffBtn $spNewDropoffBtn "dropoff link-modal open clears errors"

# --- vendor/create-delivery/page.jsx (targeted patches) ---
$vcPath = "src\app\vendor\create-delivery\page.jsx"

$vcOldState = @'
  const [gpsStatus, setGpsStatus] = useState({ slot: null, loading: false });
'@
$vcNewState = @'
  const [gpsStatus, setGpsStatus] = useState({ slot: null, loading: false });
  const [gpsError, setGpsError] = useState(null); // FIX: surface + clear "use my location" failures
'@
Patch-File $vcPath $vcOldState $vcNewState "add gpsError state"

$vcOldSearchChange = @'
  const handleSearchChange = (val, slot) => {
    setSearchInputs(prev => ({ ...prev, [slot]: val }));
'@
$vcNewSearchChange = @'
  const handleSearchChange = (val, slot) => {
    setGpsError(null); // FIX: clear stale location error once user tries searching instead
    setSearchInputs(prev => ({ ...prev, [slot]: val }));
'@
Patch-File $vcPath $vcOldSearchChange $vcNewSearchChange "handleSearchChange error-clear"

$vcOldSelectSug = @'
  const handleSelectSuggestion = (loc, slot) => {
    setMapTarget({ coords: { lat: loc.lat, lng: loc.lng }, name: loc.name });
'@
$vcNewSelectSug = @'
  const handleSelectSuggestion = (loc, slot) => {
    setGpsError(null); // FIX: clear stale location error once a location is picked
    setMapTarget({ coords: { lat: loc.lat, lng: loc.lng }, name: loc.name });
'@
Patch-File $vcPath $vcOldSelectSug $vcNewSelectSug "handleSelectSuggestion error-clear"

$vcOldUseCurLoc = @'
  const useCurrentLocation = async (slot) => {
    setGpsStatus({ slot, loading: true });
    try {
        const location = await getReliableLocation();
        if (location) {
            setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
            setActiveModal(slot);
        }
    } catch (err) {
        console.error('Location lookup failed:', err);
    } finally {
        setGpsStatus({ slot: null, loading: false });
    }
  };
'@
$vcNewUseCurLoc = @'
  const useCurrentLocation = async (slot) => {
    setGpsStatus({ slot, loading: true });
    setGpsError(null);
    try {
        const location = await getReliableLocation();
        if (location) {
            setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
            setActiveModal(slot);
        } else {
            // FIX: previously failed completely silently - the spinner just
            // stopped with no indication anything went wrong.
            setGpsError("Couldn't find your location. Try searching instead, or try again.");
        }
    } catch (err) {
        console.error('Location lookup failed:', err);
        setGpsError("Couldn't find your location. Try searching instead, or try again.");
    } finally {
        setGpsStatus({ slot: null, loading: false });
    }
  };
'@
Patch-File $vcPath $vcOldUseCurLoc $vcNewUseCurLoc "useCurrentLocation now surfaces failures"

$vcOldJsx = @'
                  <button onClick={() => useCurrentLocation('pickup')} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-2 text-ink font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                    {gpsStatus.slot === 'pickup' ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} className="text-emerald-500" />} Pin Current Location
                  </button>
                </div>
              )}
            </div>

            {/* Dropoff */}
'@
$vcNewJsx = @'
                  <button onClick={() => useCurrentLocation('pickup')} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-2 text-ink font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                    {gpsStatus.slot === 'pickup' ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} className="text-emerald-500" />} Pin Current Location
                  </button>
                  {gpsError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold">
                      {gpsError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dropoff */}
'@
Patch-File $vcPath $vcOldJsx $vcNewJsx "add error banner in step 1"

Write-Host ""
Write-Host "All done. Review the diff, then:" -ForegroundColor Cyan
Write-Host "  git add src/utils/geolocation.js src/utils/mapbox.js src/app/api/resolve-link/route.js src/components/MapModal.jsx src/app/send-package/step-1/page.jsx src/app/vendor/create-delivery/page.jsx"
Write-Host "  git commit -m 'Fix GPS accuracy tuning, clear stale location errors, graceful place-link fallback, merge OSM POI search'"
Write-Host "  git push origin main"
Write-Host ""
Write-Host "Worth testing after deploy:" -ForegroundColor Cyan
Write-Host "  1. Use current location indoors/weak signal - should no longer lock in a bad reading instantly"
Write-Host "  2. Paste https://maps.app.goo.gl/JFCc1MK8LkMVJD9DA as pickup/dropoff - should resolve to Brigade Market's street, not fail"
Write-Host "  3. Trigger a GPS error, then search or paste a link instead - the red banner should disappear immediately"
Write-Host "  4. Search 'Brigade' or 'Kantin Kwari' in the location search - should now show OSM results if Mapbox alone has none"
