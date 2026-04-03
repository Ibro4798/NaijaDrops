/**
 * Location Validation Utility
 * Validates locations are within Kano bounds and handles edge cases
 */

// Kano geographic boundaries
const KANO_BOUNDS = {
  minLat: 11.89,
  maxLat: 12.15,
  minLng: 8.40,
  maxLng: 8.65
};

/**
 * Check if coordinates are within Kano
 */
export function isInKano(lat, lng) {
  if (!lat || !lng) return false;
  return (
    lat >= KANO_BOUNDS.minLat &&
    lat <= KANO_BOUNDS.maxLat &&
    lng >= KANO_BOUNDS.minLng &&
    lng <= KANO_BOUNDS.maxLng
  );
}

/**
 * Validate a location with detailed feedback
 */
export function validateLocation(lat, lng, name = '') {
  // Check for null/undefined
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return {
      valid: false,
      error: 'Invalid coordinates. Please select a location.'
    };
  }

  // Check for NaN
  if (isNaN(lat) || isNaN(lng)) {
    return {
      valid: false,
      error: 'Invalid coordinates received. Please try again.'
    };
  }

  // Check global bounds first
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return {
      valid: false,
      error: 'Coordinates are outside valid Earth bounds.'
    };
  }

  // Check Kano bounds
  if (!isInKano(lat, lng)) {
    const distance = getDistanceFromKano(lat, lng);
    return {
      valid: false,
      error: `Location is ${distance.toFixed(1)}km outside Kano. Please drop a pin within Kano city.`
    };
  }

  return { valid: true };
}

/**
 * Calculate distance to nearest Kano boundary
 * Returns distance in km
 */
export function getDistanceFromKano(lat, lng) {
  const { calculateDistance } = require('./distance');

  // Clamp coordinates to Kano bounds
  const clampedLat = Math.max(KANO_BOUNDS.minLat, Math.min(KANO_BOUNDS.maxLat, lat));
  const clampedLng = Math.max(KANO_BOUNDS.minLng, Math.min(KANO_BOUNDS.maxLng, lng));

  // Calculate distance to nearest boundary point
  return calculateDistance(lat, lng, clampedLat, clampedLng);
}

/**
 * Get Kano center point for map default view
 */
export function getKanoCenter() {
  return {
    lat: (KANO_BOUNDS.minLat + KANO_BOUNDS.maxLat) / 2,
    lng: (KANO_BOUNDS.minLng + KANO_BOUNDS.maxLng) / 2
  };
}

/**
 * Get Kano bounding box as [minLng, minLat, maxLng, maxLat]
 * (Used by Mapbox API)
 */
export function getKanoBbox() {
  return [KANO_BOUNDS.minLng, KANO_BOUNDS.minLat, KANO_BOUNDS.maxLng, KANO_BOUNDS.maxLat];
}
