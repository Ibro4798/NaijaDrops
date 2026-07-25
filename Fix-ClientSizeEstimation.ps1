<#
.SYNOPSIS
  Adds a free, no-API-key package size estimator (TensorFlow.js + COCO-SSD,
  loaded from a CDN, runs entirely client-side) as an automatic fallback for
  when /api/estimate-package has no ANTHROPIC_API_KEY configured or fails.

  v2: fixed a bug where PowerShell's -like operator misinterpreted square
  brackets in Tailwind classes (e.g. "text-[9px]") as wildcard patterns,
  causing the badge-block patch to silently fail to match. Now uses literal
  .Contains()/.Replace() string matching throughout - safe to re-run even if
  v1 already applied some edits.

.USAGE
  Run this from the ROOT of the NaijaDrops repo (same folder as package.json):
    .\Fix-ClientSizeEstimation.ps1

  Then review the diff, test locally, and push:
    git diff
    npm run dev          # try uploading a package photo on /send-package/step-2
    git add -A
    git commit -m "Add client-side (no API key) package size estimation fallback"
    git push
#>

$ErrorActionPreference = "Stop"

# --- Sanity check: are we in the repo root? ---------------------------------
if (-not (Test-Path ".\package.json") -or -not (Test-Path ".\src\app\send-package\step-2\page.jsx")) {
    Write-Host "ERROR: Run this script from the root of the NaijaDrops repo (folder containing package.json)." -ForegroundColor Red
    exit 1
}

# --- 1. Write the new feature file ------------------------------------------
$utilsDir = ".\src\utils"
if (-not (Test-Path $utilsDir)) { New-Item -ItemType Directory -Path $utilsDir -Force | Out-Null }

$clientSizeEstimateContent = @'
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
'@

$targetFile = Join-Path $utilsDir "clientSizeEstimate.js"
Set-Content -Path $targetFile -Value $clientSizeEstimateContent -Encoding UTF8 -NoNewline
Write-Host "Wrote $targetFile" -ForegroundColor Green

# --- 2. Patch step-2/page.jsx to use it as a fallback -----------------------
$step2Path = ".\src\app\send-package\step-2\page.jsx"
$content = Get-Content -Path $step2Path -Raw -Encoding UTF8

$editsApplied = 0

# Edit 1: add the import
$oldImport = 'import { createClient } from "@/utils/supabase/client";'
$newImport = "import { createClient } from `"@/utils/supabase/client`";`nimport { estimateSizeFromFile } from `"@/utils/clientSizeEstimate`";"
if ($content.Contains("clientSizeEstimate")) {
    Write-Host "Import already present - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldImport)) {
    $content = $content.Replace($oldImport, $newImport)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the import line to patch. File may have changed - patch it manually." -ForegroundColor Red
}

# Edit 2: fall back to the on-device estimator on server failure
$oldBlock = @'
          const res = await fetch("/api/estimate-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
          });
          const result = await res.json();
          if (result.success) {
            setSize(result.size);
            setSizeSource("ai");
            setEstimateReasoning(result.reasoning);
          }
          // On failure, we simply say nothing - manual sizing already works
          // fine and always did, this is a bonus when it works.
        } catch {
'@

$newBlock = @'
          const res = await fetch("/api/estimate-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
          });
          const result = await res.json();
          if (result.success) {
            setSize(result.size);
            setSizeSource("ai");
            setEstimateReasoning(result.reasoning);
            return;
          }

          // Server estimate unavailable (no ANTHROPIC_API_KEY, rate limit,
          // network issue, etc). Fall back to a free, on-device guess using
          // TensorFlow.js + COCO-SSD instead of giving up silently.
          const clientResult = await estimateSizeFromFile(file);
          if (clientResult.success) {
            setSize(clientResult.size);
            setSizeSource("client-cv");
            setEstimateReasoning(clientResult.reasoning);
          }
          // If that also fails, we say nothing - manual sizing already
          // works fine and always did, this is a bonus when it works.
        } catch {
'@

if ($content.Contains("estimateSizeFromFile(file)")) {
    Write-Host "Fallback logic already present - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldBlock)) {
    $content = $content.Replace($oldBlock, $newBlock)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the estimate block to patch. File may have changed - patch it manually." -ForegroundColor Red
}

# Edit 3: add the "Estimated on-device" badge
$oldBadge = @'
            {sizeSource === "ai" && (
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Sparkles size={10} /> Estimated from photo
              </span>
            )}
'@

$newBadge = @'
            {sizeSource === "ai" && (
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Sparkles size={10} /> Estimated from photo
              </span>
            )}
            {sizeSource === "client-cv" && (
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Sparkles size={10} /> Estimated on-device
              </span>
            )}
'@

if ($content.Contains("Estimated on-device")) {
    Write-Host "Badge already present - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldBadge)) {
    $content = $content.Replace($oldBadge, $newBadge)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the badge block to patch. File may have changed - patch it manually." -ForegroundColor Red
}

Set-Content -Path $step2Path -Value $content -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "Done. $editsApplied edit(s) applied to $step2Path." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  git diff"
Write-Host "  npm run dev    # test uploading a package photo on /send-package/step-2 (run this on its own, then Ctrl+C when done)"
Write-Host "  git add -A"
Write-Host "  git commit -m `"Add client-side (no API key) package size estimation fallback`""
Write-Host "  git push"
