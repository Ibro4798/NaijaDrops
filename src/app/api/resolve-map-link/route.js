import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 1. Follow the redirect to get the long URL
    // We use a custom user agent to look like a browser
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const finalUrl = response.url;

    // 2. Extract Latitude and Longitude using Regex
    // Patterns for Google Maps (e.g., /@11.9877,8.5309,15z/ or /search/11.9877,8.5309)
    const geoPattern = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = finalUrl.match(geoPattern);

    if (match) {
      return NextResponse.json({
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
        full_url: finalUrl
      });
    }

    // Fallback search pattern
    const searchPattern = /ll=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const matchAlt = finalUrl.match(searchPattern);

    if (matchAlt) {
      return NextResponse.json({
        lat: parseFloat(matchAlt[1]),
        lng: parseFloat(matchAlt[2]),
        full_url: finalUrl
      });
    }

    return NextResponse.json({ error: 'Could not extract coordinates from final URL' }, { status: 422 });

  } catch (error) {
    console.error('[RESOLVE_LINK_ERROR]', error);
    return NextResponse.json({ error: 'Failed to resolve link' }, { status: 500 });
  }
}
