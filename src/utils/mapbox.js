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