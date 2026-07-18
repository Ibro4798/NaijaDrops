// Mapbox Utilities for Kano Precision Search
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Kano Bounding Box [minLng, minLat, maxLng, maxLat]
const KANO_BBOX = "8.4000,11.9000,8.6500,12.1000";

/**
 * Get address suggestions from Mapbox Geocoding API v5
 */
export const getMapboxSuggestions = async (query, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !query || query.length < 2) return [];

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
};

/**
 * Reverse Geocode: Get street address from coordinates
 * Mapbox expects [lng, lat]
 * FIX #4: Added 3-second timeout to prevent hanging
 */
export const reverseGeocodeMapbox = async (lat, lng, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);  // 3 second timeout

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
            console.warn("Mapbox reverse geocoding timed out (>3s), using coordinates fallback");
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

