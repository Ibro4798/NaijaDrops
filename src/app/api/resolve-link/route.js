import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { decodeWhatsAppUrl, isAllowedHost, extractCoordinates } from "@/lib/mapResolver";

/**
 * DETERMINISTIC LINK EXPANDER
 * Follows redirects server-side to extract raw coordinates.
 */
export async function POST(request) {
  try {
    const { url: rawUrl } = await request.json();
    if (!rawUrl) return NextResponse.json({ error: "MISSING_URL" }, { status: 400 });

    const cleanUrl = decodeWhatsAppUrl(rawUrl);
    
    if (!isAllowedHost(cleanUrl)) {
      return NextResponse.json({ error: "UNSUPPORTED_DOMAIN" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Cache Check
    const { data: cached } = await supabase
      .from("resolved_links")
      .select("lat, lng")
      .eq("original_url", cleanUrl)
      .single();

    if (cached) {
      return NextResponse.json({ lat: cached.lat, lng: cached.lng, cached: true });
    }

    // 2. Link Expansion (Max 5 redirects)
    let current = cleanUrl;
    let coords = null;

    for (let i = 0; i < 5; i++) {
      // Try to extract from current URL first (e.g. apple maps often has it in the query)
      coords = extractCoordinates(current);
      if (coords) break;

      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) break;
        current = next.startsWith("http") ? next : new URL(next, current).href;
      } else {
        // Final landing page
        coords = extractCoordinates(current);
        break;
      }
    }

    if (!coords) {
      return NextResponse.json({ error: "NO_COORDINATES_FOUND" }, { status: 404 });
    }

    // 3. Cache Success
    await supabase.from("resolved_links").insert({
      original_url: cleanUrl,
      lat: coords.lat,
      lng: coords.lng
    });

    return NextResponse.json(coords);
  } catch (err) {
    console.error("Resolver Error:", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
