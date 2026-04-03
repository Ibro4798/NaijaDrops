import { encode } from 'open-location-code';

/**
 * Extracts coordinates from a resolved map URL using Regular Expressions.
 * @param {string} url - The resolved, full-length URL.
 * @returns {{ latitude: number, longitude: number } | null}
 */
const extractCoordinates = (url) => {
  // Google Maps pattern: /@latitude,longitude
  const googlePatternAt = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  // Google/Apple pattern: ll=latitude,longitude or q=latitude,longitude
  const queryPattern = /(?:ll|q)=(-?\d+\.\d+),(-?\d+\.\d+)/;

  let match = url.match(googlePatternAt);
  if (match) {
    return { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) };
  }

  match = url.match(queryPattern);
  if (match) {
    return { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) };
  }

  return null;
};

/**
 * Determines the original map provider based on the URL string.
 * @param {string} url 
 * @returns {string} provider name
 */
const determineProvider = (url) => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('apple.com')) return 'Apple Maps';
  if (lowerUrl.includes('wa.me') || lowerUrl.includes('whatsapp')) return 'WhatsApp';
  if (lowerUrl.includes('google.com') || lowerUrl.includes('goo.gl')) return 'Google Maps';
  return 'Unknown';
};

/**
 * Resolves a shared map link (Google, Apple, WhatsApp) into standard coordinates and a Plus Code.
 * Note: In React Native, fetch is not bound by CORS, allowing redirect resolution to work seamlessly.
 * 
 * @param {string} sharedUrl - The URL shared from the map app.
 * @returns {Promise<{ latitude: number, longitude: number, plusCode: string, originalProvider: string }>} 
 */
export const resolveMapLink = async (sharedUrl) => {
  if (!sharedUrl) {
    throw new Error('No URL provided. Please drop a manual pin.');
  }

  try {
    const originalProvider = determineProvider(sharedUrl);

    // Call our server-side API to bypass CORS
    const apiUrl = `/api/resolve-link?url=${encodeURIComponent(sharedUrl)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.error || !data.coords) {
      throw new Error(data.error || 'Could not parse coordinates from the resolved link. Please drop a manual pin.');
    }

    // Generate 10-character Plus Code (Open Location Code)
    const plusCode = encode(data.coords.lat, data.coords.lng);

    return {
      latitude: data.coords.lat,
      longitude: data.coords.lng,
      plusCode,
      originalProvider,
    };
  } catch (error) {
    // Catch fetch failures (e.g. no internet) or parsing errors
    throw new Error(error.message || 'Failed to resolve map link. Please drop a manual pin.');
  }
};
