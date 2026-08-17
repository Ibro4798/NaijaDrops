// Mapbox Utilities for Kano Precision Search
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Kano Bounding Box [minLng, minLat, maxLng, maxLat]
const KANO_BBOX = "8.4000,11.9000,8.6500,12.1000";

/**
 * Location search strategy: three sources merged, no extra API keys required.
 *
 * 1. Mapbox Geocoding — best for roads, addresses, administrative areas.
 *    Does NOT return POIs/markets anymore (removed in v5/v6). Still useful
 *    for street-level searches.
 *
 * 2. Nominatim (OpenStreetMap) — free, no key. Covers named places/markets
 *    where OSM contributors have added them. Coverage in Kano varies.
 *
 * 3. Photon (photon.komoot.io) — free, no key. Also built on OSM data but
 *    uses a smarter Elasticsearch backend with proximity biasing. Often finds
 *    POIs that Nominatim misses because it scores by relevance + distance
 *    rather than just text matching. We bias it toward the Kano city center
 *    so results are ranked by proximity automatically.
 *
 * All three run in parallel, results are merged and de-duplicated.
 * Mapbox first (best address quality), then Nominatim, then Photon.
 *
 * Production note: Nominatim has a 1 req/sec rate limit for the public
 * endpoint. At scale, replace with LocationIQ or a self-hosted instance.
 * Photon's public endpoint has no published hard limit but should not be
 * hammered in production either.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api";

// Kano city center for Photon proximity biasing
const KANO_CENTER_LAT = 12.0022;
const KANO_CENTER_LNG = 8.5920;
const KANO_LAT_MIN = 11.9000;
const KANO_LAT_MAX = 12.1000;
const KANO_LNG_MIN = 8.4000;
const KANO_LNG_MAX = 8.6500;

function isInsideKano(lat, lng) {
    return lat >= KANO_LAT_MIN && lat <= KANO_LAT_MAX &&
           lng >= KANO_LNG_MIN && lng <= KANO_LNG_MAX;
}

async function getNominatimSuggestions(query) {
    try {
        const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(query + ", Kano, Nigeria")}&countrycodes=ng&limit=5&addressdetails=1`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'NaijaDrops/1.0' } });
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];

        return data
            .filter(item => isInsideKano(parseFloat(item.lat), parseFloat(item.lon)))
            .map(item => ({
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

async function getPhotonSuggestions(query) {
    try {
        // Bias results toward Kano center; bbox limits to Kano state
        const url = `${PHOTON_URL}/?q=${encodeURIComponent(query)}&lat=${KANO_CENTER_LAT}&lon=${KANO_CENTER_LNG}&limit=5&lang=en&bbox=${KANO_LNG_MIN},${KANO_LAT_MIN},${KANO_LNG_MAX},${KANO_LAT_MAX}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'NaijaDrops/1.0' } });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data?.features || !Array.isArray(data.features)) return [];

        return data.features
            .filter(f => {
                const [lng, lat] = f.geometry?.coordinates || [];
                return isInsideKano(lat, lng);
            })
            .map(f => {
                const props = f.properties || {};
                const [lng, lat] = f.geometry.coordinates;
                // Build a human-readable description from Photon's property bag
                const nameParts = [
                    props.name,
                    props.street && props.housenumber ? `${props.housenumber} ${props.street}` : props.street,
                    props.district || props.suburb || props.locality,
                    props.city || props.county,
                    props.country
                ].filter(Boolean);
                return {
                    name: props.name || nameParts[0] || 'Unknown',
                    description: nameParts.join(', '),
                    lat,
                    lng,
                    id: `photon-${f.properties?.osm_type}-${f.properties?.osm_id}`,
                    isMapbox: false,
                    isOSM: true,
                    isPhoton: true
                };
            })
            .filter(r => r.name && r.name !== 'Unknown');
    } catch (error) {
        console.error("Photon suggestion error:", error);
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
    const photonPromise = getPhotonSuggestions(query);

    const [mapboxResults, osmResults, photonResults] = await Promise.all([
        mapboxPromise,
        nominatimPromise,
        photonPromise
    ]);

    const merged = [...mapboxResults];
    for (const candidate of [...osmResults, ...photonResults]) {
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
    if (!activeToken) return "Pinned location";

    // FIX: this used to fall back to raw "lat, lng" text on any failure
    // (API error, empty result, or the old flat 6s timeout) - a user has
    // no idea what "12.0047, 8.5371" means. Now we retry once with a
    // broader type filter (in case the strict filter excluded a real
    // match) and give slow connections more room before timing out.
    // If both attempts fail, we surface a legible fallback instead of
    // coordinates - the pin itself still holds the real lat/lng, only
    // the human-readable label is missing.
    const tryFetch = async (types, timeoutMs) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${activeToken}${types ? `&types=${types}` : ''}&limit=1`;
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                console.warn("Mapbox Reverse Geocode API Error", response.status);
                return null;
            }
            const data = await response.json();
            return data?.features?.[0]?.place_name || null;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.warn(`Mapbox reverse geocoding timed out (>${timeoutMs}ms)`);
            } else {
                console.error("Mapbox reverse geocode error:", error);
            }
            return null;
        }
    };

    // First attempt: precise types, generous timeout for slow connections
    let name = await tryFetch("address,poi,neighborhood,locality", 8000);
    if (name) return name;

    // Retry once, broader types, in case the strict filter excluded a real match
    name = await tryFetch(null, 8000);
    if (name) return name;

    return "Pinned location";
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