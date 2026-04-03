import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        const response = await fetch(url, { 
            method: 'GET', 
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const finalUrl = response.url;
        const html = await response.text();

        // Strategy 1: Coordinates in the final redirected URL
        const urlCoords = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || 
                          finalUrl.match(/center=([-]?\d+\.\d+),([-]?\d+\.\d+)/) ||
                          finalUrl.match(/ll=([-]?\d+\.\d+),([-]?\d+\.\d+)/) ||
                          finalUrl.match(/q=([-]?\d+\.\d+),([-]?\d+\.\d+)/);

        if (urlCoords) {
            return NextResponse.json({ 
                resolvedUrl: finalUrl,
                coords: { lat: parseFloat(urlCoords[1]), lng: parseFloat(urlCoords[2]) }
            });
        }

        // Strategy 2: Deep scan HTML for static map or metadata
        const broadRegex = /center=([-]?\d+\.\d+)(?:%2C|,)([-]?\d+\.\d+)|ll=([-]?\d+\.\d+)(?:%2C|,)([-]?\d+\.\d+)|(?:"|')([-]?\d+\.\d+),([-]?\d+\.\d+)(?:"|')/g;
        let match;
        while ((match = broadRegex.exec(html)) !== null) {
            const lat = parseFloat(match[1] || match[3] || match[5]);
            const lng = parseFloat(match[2] || match[4] || match[6]);
            
            // Validate: Nigeria bounding box
            if (lat > 4 && lat < 14 && lng > 3 && lng < 15) {
                return NextResponse.json({
                    resolvedUrl: finalUrl,
                    coords: { lat, lng }
                });
            }
        }

        // Strategy 3: Script tags (APP_INITIALIZATION_STATE)
        const initStateMatch = html.match(/window\.APP_INITIALIZATION_STATE=\[\[\[([-]?\d+\.\d+),([-]?\d+\.\d+)\]/);
        if (initStateMatch) {
            return NextResponse.json({
                resolvedUrl: finalUrl,
                coords: { lat: parseFloat(initStateMatch[1]), lng: parseFloat(initStateMatch[2]) }
            });
        }

        return NextResponse.json({ 
            resolvedUrl: finalUrl,
            error: 'Coordinates not found. Please try a different link or use "My Current Location".'
        });

    } catch (error) {
        console.error('Link resolution error:', error.message);
        return NextResponse.json({ error: 'Failed to resolve link' }, { status: 500 });
    }
}
