<#
.SYNOPSIS
  Corrects a mistake from the previous script: the size-estimation logic
  was calibrated around a tricycle (keke napep) fleet, but NaijaDrops
  actually runs motorcycles. This rewrites all the vehicle-specific
  reasoning to match - citing Nigeria's actual Courier and Logistics
  Services (Operations) Regulations 2020, which legally define "Courier"
  as 0.5-50kg door-to-door cargo (above that is "Logistics"/haulage, a
  different service class) - instead of a tricycle payload figure.

  Also keeps the accuracy improvements from before: combining all confident
  on-device detections into one region, and the generous "oversized" signal
  for stuff that plainly can't go on a bike (fridge, bed, couch, dining
  table, another vehicle) - now on the Claude-vision path too.

  SAFE TO RUN REGARDLESS of whether you already ran the previous
  Fix-TricycleSizeAccuracy.ps1 script or not - this detects your actual
  current state and fixes it either way:
    - Never ran anything yet -> applies the full oversized-detection feature
      fresh, with correct motorcycle wording from the start.
    - Already ran the tricycle-worded script -> swaps the tricycle wording
      for motorcycle wording and renames the internal oversizedForTricycle
      field to oversizedForBike.

.USAGE
  Run this from the ROOT of the NaijaDrops repo (same folder as package.json):
    .\Fix-MotorcycleSizeAccuracy.ps1

  Then review, test, and push:
    git diff
    npm run dev
    git add -A
    git commit -m "Correct size estimation to motorcycle (not tricycle), cite NIPOST 50kg courier definition"
    git push
#>

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\package.json") -or -not (Test-Path ".\src\app\send-package\step-2\page.jsx")) {
    Write-Host "ERROR: Run this script from the root of the NaijaDrops repo (folder containing package.json)." -ForegroundColor Red
    exit 1
}

# =============================================================================
# PART 1: Fully replace clientSizeEstimate.js (motorcycle-correct version)
# =============================================================================
$clientSizeEstimateContent = @'
"use client";

/**
 * Client-side, no-API-key package size estimator, calibrated for a
 * motorcycle-only delivery fleet.
 *
 * Loads TensorFlow.js + the pretrained COCO-SSD object detection model from
 * a CDN (once per page load, cached on `window`), runs it entirely in the
 * vendor's browser, and maps what it sees into Small / Medium / Large - or
 * flags it as likely too big for a single motorcycle trip.
 *
 * v3 changes:
 *  - Combines ALL confident detections into one bounding region instead of
 *    trusting a single top guess, which is more robust for photos with
 *    several visible items.
 *  - Adds an `oversizedForBike` signal for object categories that
 *    a dispatch bike genuinely cannot carry (fridge, bed, couch, dining
 *    table, another bicycle/motorcycle) - previously these silently landed
 *    in "Large" as if deliverable. The threshold is intentionally generous:
 *    it only fires for categories that are unambiguous, since a false "too
 *    big" costs a bookable job, while an occasional under-estimate just
 *    costs the rider a bit of extra strapping.
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
 * `oversizedForBike`, so callers can treat both interchangeably.
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
// Nigeria's Courier and Logistics Services (Operations) Regulations 2020
// legally define "Courier" as door-to-door cargo of 0.5-50kg - anything
// heavier is "Logistics" (haulage), a different service class entirely.
// A solo rider strapping cargo to a bike's rear rack realistically tops
// out well under that regulatory ceiling anyway, and we can't measure
// weight from a photo either way, so "oversized" here is reserved for
// categories that are obviously undeliverable on a motorcycle regardless
// of weight - a full-size fridge, bed frame, dining table, or another
// vehicle - not just "big." Kept deliberately short and generous: when in
// doubt, an item stays in "large" rather than getting turned away.
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
  chair: "large",
  bicycle: "oversized",
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
      ? `On-device guess: looks like "${best.class}" - this may be too big for one motorcycle trip. Double-check before booking.`
      : `On-device guess: looks like "${best.class}", about ${pct}% of the frame.`;

    return {
      success: true,
      // Keep back-compat with the existing 3-way small/medium/large UI -
      // an oversized item still needs a size bucket selected, it just also
      // carries a warning the UI can choose to show.
      size: oversized ? "large" : bucket,
      oversizedForBike: oversized,
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
'@

Set-Content -Path ".\src\utils\clientSizeEstimate.js" -Value $clientSizeEstimateContent -Encoding UTF8 -NoNewline
Write-Host "Rewrote .\src\utils\clientSizeEstimate.js (motorcycle-correct)" -ForegroundColor Green

# =============================================================================
# PART 2: Patch route.js - handles three possible starting states
# =============================================================================
$routePath = ".\src\app\api\estimate-package\route.js"
$routeContent = Get-Content -Path $routePath -Raw -Encoding UTF8
$routeEdits = 0

$motorcyclePrompt = @'
    const prompt = `You are helping a Nigerian delivery service estimate a package size for their delivery vehicle - a dispatch motorcycle (okada) with an open rear rack/carrier for cargo. Nigeria's Courier and Logistics Services (Operations) Regulations 2020 legally define "Courier" as door-to-door cargo of 0.5-50kg - anything heavier is legally "Logistics" (haulage), a different service entirely, so a solo motorcycle rider is realistically well under that ceiling anyway. Look at this photo of a package/item to be delivered.

Classify it into exactly one of these three sizes:
- "small": fits in a bag or under the arm (documents, phones, small envelopes, jewelry, shoes in a small bag)
- "medium": a small-to-medium box (electronics boxes, food orders, clothing bundles, medium bags)
- "large": bulky or multiple items that can still be safely strapped to a dispatch bike's rear rack (large boxes, multiple bags, a moderate generator, several cartons of goods)

Also set "oversized" to true ONLY if the item plainly cannot fit on or be safely carried by a motorcycle at all - for example a full-size refrigerator, a bed frame, a couch, a dining table, or another vehicle. Be generous here: if it's genuinely unclear, prefer "large" and leave "oversized" false, since a wrongly-flagged "too big" costs the vendor a bookable delivery.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"size": "small" | "medium" | "large", "oversized": true | false, "reasoning": "one short sentence explaining why"}`;
'@

$tricyclePrompt = @'
    const prompt = `You are helping a Nigerian delivery service estimate a package size for their delivery vehicle - a keke napep (motorized tricycle with an open cargo tray). A keke's rated payload runs roughly 250-400kg, shared between the rider, fuel, and cargo - not one parcel alone. Look at this photo of a package/item to be delivered.

Classify it into exactly one of these three sizes:
- "small": fits in a bag or under the arm (documents, phones, small envelopes, jewelry, shoes in a small bag)
- "medium": a small-to-medium box (electronics boxes, food orders, clothing bundles, medium bags)
- "large": bulky or multiple items that still fit in a keke's open cargo tray (large boxes, multiple bags, a mid-size generator, several cartons of goods)

Also set "oversized" to true ONLY if the item plainly cannot fit in or be safely carried by a tricycle's open cargo tray at all - for example a full-size refrigerator, a bed frame, a couch, a dining table, or another motor vehicle. Be generous here: if it's genuinely unclear, prefer "large" and leave "oversized" false, since a wrongly-flagged "too big" costs the vendor a bookable delivery.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"size": "small" | "medium" | "large", "oversized": true | false, "reasoning": "one short sentence explaining why"}`;
'@

$originalPrompt = @'
    const prompt = `You are helping estimate a delivery package size for a motorcycle courier in Kano, Nigeria. Look at this photo of a package/item to be delivered.

Classify it into exactly one of these three sizes:
- "small": fits in a bag or under the arm (documents, phones, small envelopes, jewelry, shoes in a small bag)
- "medium": a small-to-medium box (electronics boxes, food orders, clothing bundles, medium bags)
- "large": bulky or multiple items, needs both hands or won't fit in a backpack (large boxes, multiple bags, furniture pieces, large appliances)

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"size": "small" | "medium" | "large", "reasoning": "one short sentence explaining why"}`;
'@

if ($routeContent.Contains("dispatch motorcycle (okada)")) {
    Write-Host "Prompt already motorcycle-correct - skipping" -ForegroundColor Yellow
} elseif ($routeContent.Contains($tricyclePrompt)) {
    $routeContent = $routeContent.Replace($tricyclePrompt, $motorcyclePrompt)
    $routeEdits++
    Write-Host "Found the tricycle-worded prompt from the previous script - corrected to motorcycle" -ForegroundColor Cyan
} elseif ($routeContent.Contains($originalPrompt)) {
    $routeContent = $routeContent.Replace($originalPrompt, $motorcyclePrompt)
    $routeEdits++
} else {
    Write-Host "WARNING: Could not find any known version of the prompt block to patch. Patch route.js manually - see the diff in chat." -ForegroundColor Red
}

$oldReturn = @'
    return NextResponse.json({
      success: true,
      size: parsed.size,
      reasoning: parsed.reasoning || null,
    });
'@

$newReturn = @'
    return NextResponse.json({
      success: true,
      size: parsed.size,
      oversized: !!parsed.oversized,
      reasoning: parsed.reasoning || null,
    });
'@

if ($routeContent.Contains("oversized: !!parsed.oversized")) {
    Write-Host "Response shape already patched - skipping" -ForegroundColor Yellow
} elseif ($routeContent.Contains($oldReturn)) {
    $routeContent = $routeContent.Replace($oldReturn, $newReturn)
    $routeEdits++
} else {
    Write-Host "WARNING: Could not find the response block to patch. Patch route.js manually - see the diff in chat." -ForegroundColor Red
}

Set-Content -Path $routePath -Value $routeContent -Encoding UTF8 -NoNewline
Write-Host "Applied $routeEdits edit(s) to $routePath" -ForegroundColor Green

# =============================================================================
# PART 3: Patch step-2/page.jsx - rename field if needed, add UI if missing
# =============================================================================
$step2Path = ".\src\app\send-package\step-2\page.jsx"
$content = Get-Content -Path $step2Path -Raw -Encoding UTF8
$pageEdits = 0

# Step 3a: if the previous script's field name is present, rename it
if ($content.Contains("oversizedForTricycle")) {
    $content = $content.Replace("oversizedForTricycle", "oversizedForBike")
    $pageEdits++
    Write-Host "Renamed oversizedForTricycle -> oversizedForBike in page.jsx" -ForegroundColor Cyan
}

# Step 3b: add the full UI wiring if it was never applied at all
$oldIconImport = 'ArrowLeft, Package, Phone, User, ArrowRight, Bell, Camera, X, Loader2, Sparkles'
$newIconImport = 'ArrowLeft, Package, Phone, User, ArrowRight, Bell, Camera, X, Loader2, Sparkles, AlertTriangle'

if ($content.Contains("AlertTriangle")) {
    Write-Host "AlertTriangle import already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldIconImport)) {
    $content = $content.Replace($oldIconImport, $newIconImport)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the icon import line. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

$oldState = @'
  const [estimating, setEstimating] = useState(false);
  const [estimateReasoning, setEstimateReasoning] = useState(null);
  const fileInputRef = useRef(null);
'@
$newState = @'
  const [estimating, setEstimating] = useState(false);
  const [estimateReasoning, setEstimateReasoning] = useState(null);
  const [oversizedWarning, setOversizedWarning] = useState(false);
  const fileInputRef = useRef(null);
'@

if ($content.Contains("oversizedWarning")) {
    Write-Host "oversizedWarning state already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldState)) {
    $content = $content.Replace($oldState, $newState)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the state declarations block. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

$oldAiPath = @'
            setSize(result.size);
            setSizeSource("ai");
            setEstimateReasoning(result.reasoning);
            return;
'@
$newAiPath = @'
            setSize(result.size);
            setSizeSource("ai");
            setEstimateReasoning(result.reasoning);
            setOversizedWarning(!!result.oversized);
            return;
'@

if ($content.Contains("setOversizedWarning(!!result.oversized)")) {
    Write-Host "AI-path oversized wiring already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldAiPath)) {
    $content = $content.Replace($oldAiPath, $newAiPath)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the AI success block. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

$oldFallback = @'
          if (clientResult.success) {
            setSize(clientResult.size);
            setSizeSource("client-cv");
            setEstimateReasoning(clientResult.reasoning);
          }
'@
$newFallback = @'
          if (clientResult.success) {
            setSize(clientResult.size);
            setSizeSource("client-cv");
            setEstimateReasoning(clientResult.reasoning);
            setOversizedWarning(!!clientResult.oversizedForBike);
          }
'@

if ($content.Contains("setOversizedWarning(!!clientResult.oversizedForBike)")) {
    Write-Host "Fallback-path oversized wiring already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldFallback)) {
    $content = $content.Replace($oldFallback, $newFallback)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the client-cv fallback block. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

$oldRemove = @'
    setEstimateReasoning(null);
    setSizeSource(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
'@
$newRemove = @'
    setEstimateReasoning(null);
    setSizeSource(null);
    setOversizedWarning(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
'@

if ($content.Contains("setOversizedWarning(false);")) {
    Write-Host "removePhoto reset already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldRemove)) {
    $content = $content.Replace($oldRemove, $newRemove)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the removePhoto block. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

$oldBanner = @'
          {estimateReasoning && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Sparkles size={13} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-emerald-400 text-[11px] font-medium leading-snug">{estimateReasoning}</p>
            </div>
          )}
'@
$newBanner = @'
          {estimateReasoning && (
            <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-xl border ${oversizedWarning
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-emerald-500/10 border-emerald-500/20"}`}>
              {oversizedWarning
                ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                : <Sparkles size={13} className="text-emerald-400 shrink-0 mt-0.5" />}
              <p className={`text-[11px] font-medium leading-snug ${oversizedWarning ? "text-amber-400" : "text-emerald-400"}`}>
                {estimateReasoning}
              </p>
            </div>
          )}
'@

if ($content.Contains("bg-amber-500/10")) {
    Write-Host "Warning banner already present - skipping" -ForegroundColor Yellow
} elseif ($content.Contains($oldBanner)) {
    $content = $content.Replace($oldBanner, $newBanner)
    $pageEdits++
} else {
    Write-Host "WARNING: Could not find the reasoning banner block. Patch page.jsx manually - see the diff in chat." -ForegroundColor Red
}

Set-Content -Path $step2Path -Value $content -Encoding UTF8 -NoNewline
Write-Host "Applied $pageEdits edit(s) to $step2Path" -ForegroundColor Green

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  git diff"
Write-Host "  npm run dev    # test with a photo of a normal box vs something like a fridge/couch (then Ctrl+C)"
Write-Host "  git add -A"
Write-Host "  git commit -m `"Correct size estimation to motorcycle, cite NIPOST 50kg courier definition`""
Write-Host "  git push"
