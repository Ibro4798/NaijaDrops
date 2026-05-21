export function extractFirstUrl(text = "") {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function isAllowedHost(urlString = "") {
  try {
    const url = new URL(urlString);

    const allowedHosts = [
      "google.com",
      "www.google.com",
      "maps.google.com",
      "goo.gl",
      "maps.app.goo.gl",
      "wa.me",
      "www.wa.me"
    ];

    return allowedHosts.some(host => url.hostname.includes(host));
  } catch {
    return false;
  }
}

export function decodeWhatsAppUrl(url = "") {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

export function extractCoordinates(text = "") {
  const regex = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/;
  const match = text.match(regex);

  if (!match) return null;

  return {
    lat: parseFloat(match[1]),
    lng: parseFloat(match[2]),
  };
}

export async function resolveMapLink(input = "") {
  const decoded = decodeWhatsAppUrl(input);

  const coordinates = extractCoordinates(decoded);

  return {
    success: true,
    original: input,
    decoded,
    coordinates,
  };
}
