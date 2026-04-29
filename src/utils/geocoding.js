"use server";

/**
 * Standard Mapbox Forward Geocoding Helper
 * Translates a human-readable string address into a [lat, lng] object
 */
export async function geocodeAddress(addressQuery) {
  if (!addressQuery) return { success: false, error: "Empty query" };

  try {
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    // We add Kano to the query to strongly bias standard searches locally unless otherwise specified
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(addressQuery + ', Kano, Nigeria')}&access_token=${MAPBOX_TOKEN}&limit=1`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        success: true,
        lng: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
        formatted_address: feature.properties.full_address || feature.properties.name
      };
    }

    return { success: false, error: "Location not found" };

  } catch (error) {
    console.error("[GEOCODING ERROR]", error);
    return { success: false, error: "Failed to connect to Mapbox API" };
  }
}
