"use client";

/**
 * Client-side, no-API-key package size estimator.
 *
 * Loads TensorFlow.js + the pretrained COCO-SSD object detection model from
 * a CDN (once per page load, cached on `window`), runs it entirely in the
 * vendor's browser, and maps the best-detected object's category + how much
 * of the frame it fills into Small / Medium / Large.
 *
 * This is a heuristic, not a real vision-language read of "is this a good
 * delivery package" - COCO-SSD only knows ~90 everyday object categories and
 * has no idea what a wrapped/boxed parcel specifically looks like. It exists
 * purely as a zero-cost, zero-API-key fallback for when ANTHROPIC_API_KEY
 * isn't configured (or the server call fails for any reason), not as a
 * replacement for the server-side Claude estimator when a key IS available.
 *
 * Returns the same { success, size, reasoning } shape as
 * /api/estimate-package, plus `source: "client-cv"`, so callers can treat
 * both interchangeably.
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

// Known COCO-SSD categories mapped to a sensible default size. Anything not
// listed here falls through to the frame-coverage heuristic below instead.
const CATEGORY_SIZE = {
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
  couch: "large",
  bed: "large",
  "dining_table": "large",
  refrigerator: "large",
  oven: "large",
  bicycle: "large",
  motorcycle: "large",
  chair: "large",
};

// Fallback when the detected category isn't in the lookup table above: use
// how much of the photo frame the object's bounding box fills instead.
function sizeFromCoverage(fractionOfFrame) {
  if (fractionOfFrame < 0.12) return "small";
  if (fractionOfFrame < 0.35) return "medium";
  return "large";
}

/**
 * Runs detection against an already-loaded <img> element.
 */
export async function estimateSizeOnDevice(imgEl) {
  try {
    const model = await getModel();
    const predictions = await model.detect(imgEl);

    if (!predictions || predictions.length === 0) {
      return { success: false, reason: "no_objects_detected" };
    }

    const best = predictions.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.score < 0.35) {
      return { success: false, reason: "low_confidence" };
    }

    const frameArea = imgEl.naturalWidth * imgEl.naturalHeight;
    const [, , boxW, boxH] = best.bbox;
    const fraction = frameArea ? (boxW * boxH) / frameArea : 0;

    const categoryKey = best.class.replace(/\s+/g, "_").toLowerCase();
    const size = CATEGORY_SIZE[categoryKey] || sizeFromCoverage(fraction);
    const pct = Math.round(fraction * 100);

    return {
      success: true,
      size,
      reasoning: `On-device guess: looks like "${best.class}", about ${pct}% of the frame.`,
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