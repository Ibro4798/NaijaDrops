"use client";

/**
 * Client-side, no-API-key package size estimator, calibrated for a
 * tricycle-only delivery fleet.
 *
 * Loads TensorFlow.js + the pretrained COCO-SSD object detection model from
 * a CDN (once per page load, cached on `window`), runs it entirely in the
 * vendor's browser, and maps what it sees into Small / Medium / Large - or
 * flags it as likely too big for a single tricycle trip.
 *
 * v3 changes:
 *  - Combines ALL confident detections into one bounding region instead of
 *    trusting a single top guess, which is more robust for photos with
 *    several visible items.
 *  - Adds an `oversizedForTricycle` signal for object categories that a
 *    keke's cargo tray genuinely cannot carry (fridge, bed, couch, dining
 *    table, motorcycle) - previously these silently landed in "Large" as if
 *    deliverable. The threshold is intentionally generous: it only fires
 *    for categories that are unambiguous, since a false "too big" costs a
 *    bookable job, while an occasional under-estimate just costs the rider
 *    a bit of extra room.
 *
 * Still a heuristic, not a measurement - stated plainly, same as before:
 *  - COCO-SSD only recognizes ~90 everyday object categories and has no
 *    concept of "delivery package."
 *  - It has no real depth/scale sensing. A close-up photo of a small item
 *    can fill the frame the same way a photo of a fridge does, so category
 *    recognition (e.g. "this is a couch") is what actually drives the
 *    result in most cases; frame coverage is only a fallback for objects
 *    the model doesn't specifically recognize.
 *  - It exists purely as a zero-cost, zero-API-key fallback for when
 *    ANTHROPIC_API_KEY isn't configured or the server call fails, not as a
 *    replacement for the server-side Claude estimator when a key IS
 *    available.
 *
 * Returns the same { success, size, reasoning } shape as
 * /api/estimate-package, plus `source: "client-cv"` and
 * `oversizedForTricycle`, so callers can treat both interchangeably.
 */

const TFJS_SRC = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const COCO_SSD_SRC = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";

let loadPromise = null;
let modelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function ensureLibsLoaded() {
  if (!loadPromise) {
    loadPromise = (async () => {
      if (typeof window === "undefined") throw new Error("client_only");
      if (!window.tf) await loadScript(TFJS_SRC);
      if (!window.cocoSsd) await loadScript(COCO_SSD_SRC);
    })();
  }
  return loadPromise;
}

function getModel() {
  if (!modelPromise) {
    modelPromise = ensureLibsLoaded().then(() => window.cocoSsd.load());
  }
  return modelPromise;
}

// Known COCO-SSD categories mapped to a delivery bucket. Anything not
// listed here falls through to the frame-coverage heuristic below instead.
//
// A Keke Napep's rated payload runs roughly 250-400kg depending on model
// (rider + fuel + cargo combined, not one parcel alone), and its open cargo
// tray comfortably fits things up to roughly a large suitcase or a
// mid-size generator. "oversized" is reserved for categories that plainly
// exceed that - a full-size fridge, bed frame, dining table, or a second
// motor vehicle - not just "big." Kept deliberately short and generous:
// when in doubt, an item stays in "large" rather than getting turned away.
const CATEGORY_BUCKET = {
  cell_phone: "small",
  book: "small",
  handbag: "small",
  bottle: "small",
  cup: "small",
  remote: "small",
  mouse: "small",
  keyboard: "small",
  scissors: "small",
  "sports_ball": "small",
  laptop: "medium",
  backpack: "medium",
  suitcase: "medium",
  umbrella: "medium",
  "teddy_bear": "medium",
  skateboard: "medium",
  microwave: "medium",
  tv: "large",
  bicycle: "large",
  chair: "large",
  couch: "oversized",
  bed: "oversized",
  "dining_table": "oversized",
  refrigerator: "oversized",
  oven: "oversized",
  motorcycle: "oversized",
};

// Fallback when the detected category isn't in the lookup table above: use
// how much of the combined bounding region covers the photo frame instead.
// This is the weakest part of the heuristic (see file header) - a close
// object and a big object can look identical in frame coverage - so it's
// deliberately conservative about calling something "oversized" this way.
function bucketFromCoverage(fractionOfFrame) {
  if (fractionOfFrame < 0.12) return "small";
  if (fractionOfFrame < 0.35) return "medium";
  if (fractionOfFrame < 0.7) return "large";
  return "oversized";
}

/**
 * Runs detection against an already-loaded <img> element.
 */
export async function estimateSizeOnDevice(imgEl) {
  try {
    const model = await getModel();
    // Ask for more candidate boxes at a slightly looser threshold than the
    // library default (20 boxes @ 0.5 score) so the union below reflects
    // everything visible in the photo, not just the single best guess.
    const predictions = await model.detect(imgEl, 10, 0.35);

    if (!predictions || predictions.length === 0) {
      return { success: false, reason: "no_objects_detected" };
    }

    // Combine every confident detection into one bounding region instead
    // of trusting only the top-1 box - more robust when a package photo
    // shows several items, or when the top guess is a minor object.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of predictions) {
      const [x, y, w, h] = p.bbox;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    const best = predictions.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.score < 0.35) {
      return { success: false, reason: "low_confidence" };
    }

    const frameArea = imgEl.naturalWidth * imgEl.naturalHeight;
    const unionArea = (maxX - minX) * (maxY - minY);
    const fraction = frameArea ? unionArea / frameArea : 0;

    const categoryKey = best.class.replace(/\s+/g, "_").toLowerCase();
    const bucket = CATEGORY_BUCKET[categoryKey] || bucketFromCoverage(fraction);
    const pct = Math.round(fraction * 100);
    const oversized = bucket === "oversized";

    const reasoning = oversized
      ? `On-device guess: looks like "${best.class}" - this may be too big for one tricycle trip. Double-check before booking.`
      : `On-device guess: looks like "${best.class}", about ${pct}% of the frame.`;

    return {
      success: true,
      // Keep back-compat with the existing 3-way small/medium/large UI -
      // an oversized item still needs a size bucket selected, it just also
      // carries a warning the UI can choose to show.
      size: oversized ? "large" : bucket,
      oversizedForTricycle: oversized,
      reasoning,
      source: "client-cv",
      detectedLabel: best.class,
      confidence: Math.round(best.score * 100),
    };
  } catch (err) {
    console.error("On-device size estimation failed:", err);
    return { success: false, reason: "exception" };
  }
}

/**
 * Convenience wrapper: takes a File (e.g. from an <input type="file">),
 * decodes it into an <img>, and runs it through estimateSizeOnDevice.
 */
export function estimateSizeFromFile(file) {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ success: false, reason: "client_only" });
      return;
    }
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const result = await estimateSizeOnDevice(img);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ success: false, reason: "image_decode_error" });
    };
    img.src = url;
  });
}