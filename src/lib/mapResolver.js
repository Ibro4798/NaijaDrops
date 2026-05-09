/**
 * NAIJADROPS DETERMINISTIC MAP RESOLVER
 * Strict Coordinate Extraction Engine
 */

export function extractFirstUrl(input) {
  const regex = /(https?:\/\/[^\s]+)/g;
  const match = input.match(regex);
  return match ? match[0] : null;
}

export function decodeWhatsAppUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "l.whatsapp.com") {
      const inner = parsed.searchParams.get("u");
      if (inner) return decodeURIComponent(inner);
    }
    return url;
  } catch {
    return url;
  }
}

export const ALLOWED_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "maps.google.com",
  "maps.apple.com",
  "apple.co",
  "whatsapp.com"
];

export function isAllowedHost(url) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.some(allowed => host.includes(allowed));
  } catch {
    return false;
  }
}

export function extractCoordinates(url) {
  const patterns = [
    /@(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /[?&]q=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /[?&]ll=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /[?&]sll=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/i,
    /center=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /[?&]daddr=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i,
    /[?&]address=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }
  }

  return null;
}
