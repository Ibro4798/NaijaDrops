import { NextResponse } from "next/server";
import { getMapboxSuggestions } from "@/utils/mapbox";

/**
 * "Smart" location search fallback for informal/colloquial local place names
 * (e.g. "Brigade" for Brigade Market) that Mapbox's own geocoder doesn't
 * index well for Kano. This is deliberately NOT a full swap to a different
 * geocoding provider (that would mean the user setting up a Google Cloud
 * billing account etc.) - instead it reuses the ANTHROPIC_API_KEY this app
 * already has configured (see /api/estimate-package) for a narrower job:
 *
 *   Claude never supplies coordinates itself - it only ever proposes a more
 *   complete, geocoder-friendly version of what the person typed (e.g.
 *   "brigade" -> "Brigade Market, Sabon Gari, Kano, Nigeria"), grounded in
 *   its general knowledge of well-known local places. That candidate string
 *   is then sent to the REAL geocoder (Mapbox) to resolve to an actual,
 *   authoritative coordinate. If Mapbox can't find a match for any proposed
 *   candidate, nothing is returned - we never fall back to trusting a
 *   model-guessed lat/lng directly, since that risks confidently sending a
 *   rider to the wrong place.
 *
 * Only called when the direct Mapbox search already came up empty (see the
 * frontend callers), so this adds latency/cost only on searches that were
 * already failing outright - not on every keystroke.
 */
export async function POST(req) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY not set - smart location search disabled.");
      return NextResponse.json({ success: false, reason: "not_configured", results: [] });
    }

    const { query, mapboxToken } = await req.json();
    const trimmed = (query || "").trim();
    if (trimmed.length < 3) {
      return NextResponse.json({ success: false, reason: "query_too_short", results: [] });
    }

    const prompt = `A user is searching for a place inside or near Kano, Kano State, Nigeria, in a delivery app's address search. Their raw search text was: "${trimmed}"

This is very likely a shorthand, nickname, or partial name for a real, well-known local place - a market, barracks, neighborhood, institution, hospital, mosque, motor park, or similar Kano landmark (e.g. "Brigade" commonly refers to Brigade Market, near the 3 Brigade Nigerian Army barracks in Kano).

If you recognize this as referring to one or more real, identifiable places in or near Kano, respond with up to 3 candidate full, geocoder-friendly names, most likely match first, each formatted as "Place Name, Area/Neighborhood, Kano, Nigeria" (include the area/neighborhood if you know it - this is what makes the search actually resolve, a bare place name alone often won't). Do NOT invent or guess GPS coordinates - only propose the name/text form.

If you don't recognize this as a specific real place (it's too vague, generic, or you have no genuine knowledge of it), return an empty candidates array rather than guessing.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"confident": true | false, "candidates": ["Full Name, Area, Kano, Nigeria", ...]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error (smart location search):", response.status, errText);
      return NextResponse.json({ success: false, reason: "api_error", results: [] });
    }

    const data = await response.json();
    const textBlock = data.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ success: false, reason: "no_response", results: [] });
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ success: false, reason: "unparseable", results: [] });
    }

    if (!parsed.confident || !Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Try each candidate against the real geocoder, in the order Claude
    // ranked them, and merge/dedupe whatever actually resolves.
    const seen = new Set();
    const results = [];
    for (const candidate of parsed.candidates.slice(0, 3)) {
      const matches = await getMapboxSuggestions(candidate, mapboxToken);
      for (const m of matches.slice(0, 2)) {
        const key = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...m, source: "ai-assisted" });
      }
      if (results.length >= 3) break;
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Smart location search error:", err);
    return NextResponse.json({ success: false, reason: "exception", results: [] });
  }
}
