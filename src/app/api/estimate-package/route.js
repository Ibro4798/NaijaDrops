import { NextResponse } from "next/server";

/**
 * Estimates a package size (small/medium/large) from a photo, using Claude's
 * vision API. This is advisory only - the frontend always lets the vendor
 * override it with a manual tap, so a wrong or missing guess never blocks
 * anyone from continuing.
 *
 * Requires ANTHROPIC_API_KEY to be set in the environment. If it's missing,
 * or the API call fails for any reason (bad image, network issue, rate
 * limit), this returns { success: false } and the frontend just falls back
 * to the existing manual Small/Medium/Large picker - no error is shown to
 * the vendor, since a failed "nice-to-have" guess isn't worth interrupting
 * the flow over.
 */
export async function POST(req) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY not set - package photo estimation disabled, falling back to manual sizing.");
      return NextResponse.json({ success: false, reason: "not_configured" });
    }

    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ success: false, reason: "no_image" });
    }

    const prompt = `You are helping estimate a delivery package size for a motorcycle courier in Kano, Nigeria. Look at this photo of a package/item to be delivered.

Classify it into exactly one of these three sizes:
- "small": fits in a bag or under the arm (documents, phones, small envelopes, jewelry, shoes in a small bag)
- "medium": a small-to-medium box (electronics boxes, food orders, clothing bundles, medium bags)
- "large": bulky or multiple items, needs both hands or won't fit in a backpack (large boxes, multiple bags, furniture pieces, large appliances)

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"size": "small" | "medium" | "large", "reasoning": "one short sentence explaining why"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return NextResponse.json({ success: false, reason: "api_error" });
    }

    const data = await response.json();
    const textBlock = data.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ success: false, reason: "no_response" });
    }

    let parsed;
    try {
      // Claude sometimes wraps JSON in a code fence despite instructions - strip that first.
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ success: false, reason: "unparseable" });
    }

    if (!["small", "medium", "large"].includes(parsed.size)) {
      return NextResponse.json({ success: false, reason: "invalid_size" });
    }

    return NextResponse.json({
      success: true,
      size: parsed.size,
      reasoning: parsed.reasoning || null,
    });
  } catch (err) {
    console.error("Package estimation error:", err);
    return NextResponse.json({ success: false, reason: "exception" });
  }
}