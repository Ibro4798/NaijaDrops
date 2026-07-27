import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { decodeWhatsAppUrl, isAllowedHost, extractCoordinates } from "@/utils/MapResolver";

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

    // 2. Link Expansion
    let coords = extractCoordinates(cleanUrl);
    
    if (!coords) {
      try {
        // Fetch automatically follows up to 20 redirects by default
        const res = await fetch(cleanUrl, {
          method: "GET",
          headers: {
             'User-Agent': 'curl/7.68.0', // Simpler user-agent often avoids consent screens
             'Accept': '*/*'
          }
        });

        const finalUrl = res.url;
        coords = extractCoordinates(finalUrl);

        if (!coords) {
           const text = await res.text();
           coords = extractCoordinates(text);
           
           // If still no coords, look for a meta refresh
           if (!coords) {
             const metaRefreshMatch = text.match(/URL=['"]?(https:\/\/[^'"]+)['"]?/i);
             if (metaRefreshMatch && metaRefreshMatch[1]) {
               const metaUrl = metaRefreshMatch[1].replace(/&amp;/g, '&');
               coords = extractCoordinates(metaUrl);
               
               if (!coords) {
                 // Try one more fetch on the meta URL
                 const metaRes = await fetch(metaUrl, { headers: { 'User-Agent': 'curl/7.68.0' } });
                 coords = extractCoordinates(metaRes.url) || extractCoordinates(await metaRes.text());
               }
             }
           }
        }
      } catch (err) {
        console.error("Fetch expansion error:", err);
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
