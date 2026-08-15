# fix-image-upload.ps1
# Fixes the recurring "Couldn't upload the photo" / "Error uploading image" failures.
#
# Root cause found in the live repo: two upload paths sent the raw camera
# file straight to Supabase Storage with zero compression:
#   1. src/app/dashboard/page.jsx           (vendor avatar upload)
#   2. src/app/rider/(main)/active-job/page.jsx (rider delivery-confirmation photo)
# The delivery-photos and documents buckets both have a 5MB file_size_limit.
# Budget Android cameras routinely shoot 8-15MB raw JPEGs, so those uploads
# were failing on exactly the devices this app targets. The generic catch
# block then showed a vague error with no real explanation.
#
# One flow already had this fixed correctly: send-package/step-2 (package
# photo). This script promotes that proven pattern (compress on-device,
# fall back to original only if it already fits the limit, clear typed
# errors) into a single shared helper at src/utils/imageUpload.js, and
# points the two broken flows plus rider onboarding docs at it.
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File .\fix-image-upload.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Get-Location
Write-Host "Repo root: $repoRoot"

$newUtilPath = Join-Path $repoRoot "src\utils\imageUpload.js"
$dashboardPath = Join-Path $repoRoot "src\app\dashboard\page.jsx"
$activeJobPath = Join-Path $repoRoot "src\app\rider\(main)\active-job\page.jsx"
$onboardingPath = Join-Path $repoRoot "src\app\rider\onboarding\page.jsx"

foreach ($p in @($dashboardPath, $activeJobPath, $onboardingPath)) {
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Host "ABORT: expected file not found: $p"
        exit 1
    }
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Backup-File($path) {
    $backupPath = "$path.bak_$timestamp"
    Copy-Item -LiteralPath $path -Destination $backupPath
    Write-Host "Backed up: $backupPath"
}

function Replace-Guarded($path, $oldText, $newText) {
    $content = Get-Content -LiteralPath $path -Raw
    $count = ([regex]::Matches($content, [regex]::Escape($oldText))).Count
    if ($count -eq 0) {
        Write-Host "ABORT: no match found in $path. File may have changed since this script was written."
        exit 1
    }
    if ($count -gt 1) {
        Write-Host "ABORT: $count matches found in $path, expected exactly 1. Refusing to guess."
        exit 1
    }
    Backup-File $path
    $updated = $content.Replace($oldText, $newText)
    [System.IO.File]::WriteAllText($path, $updated, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "Patched: $path"
}

# 1. New shared utility -------------------------------------------------

$utilDir = Split-Path $newUtilPath -Parent
if (-not (Test-Path -LiteralPath $utilDir)) {
    New-Item -ItemType Directory -Path $utilDir -Force | Out-Null
}

if (Test-Path -LiteralPath $newUtilPath) {
    Write-Host "ABORT: $newUtilPath already exists. Delete it first if you want this script to recreate it, so nothing gets silently overwritten."
    exit 1
}

$utilContent = @'
"use client";

import imageCompression from "browser-image-compression";

// Matches the file_size_limit set on the delivery-photos and documents
// Supabase Storage buckets. Modern phone cameras routinely produce 8-15MB
// raw JPEGs on budget Android devices, which silently fail against this
// limit if uploaded uncompressed - that mismatch is what "Couldn't upload
// the photo" errors have actually been, most of the time.
export const BUCKET_LIMIT_BYTES = 5 * 1024 * 1024;

const COMPRESSION_TIMEOUT_MS = 12000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("COMPRESSION_TIMEOUT")), ms)
    ),
  ]);
}

/**
 * App-wide standard for compressing and uploading an image to Supabase
 * Storage. Used by avatar upload, rider onboarding documents, package
 * photos, and delivery-confirmation photos, so every upload path behaves
 * the same way and fails for the same understandable reasons.
 *
 * Compresses on-device first so budget Android cameras never hit a
 * bucket's real size limit. If compression itself fails or times out
 * (a stuck Web Worker, an older WebView choking on a large image - both
 * common on cheap devices), falls back to the original file only when
 * it already fits the limit on its own.
 *
 * Throws an Error with a `.code` of:
 *   NO_FILE         - no file was passed in
 *   PHOTO_TOO_LARGE - original exceeds the bucket limit and compression
 *                     failed or timed out, so there is nothing safe to send
 *   UPLOAD_FAILED    - Supabase Storage rejected the upload (RLS, network,
 *                     bucket misconfig, etc) - .cause holds the original
 *                     Supabase error for logging
 */
export async function compressAndUploadImage({
  file,
  supabase,
  bucket,
  path,
  contentTypeFallback = "image/jpeg",
  compress = true,
  maxSizeMB = 1.5,
  maxWidthOrHeight = 1280,
  upsert = false,
  cacheControl,
}) {
  if (!file) {
    throw Object.assign(new Error("NO_FILE"), { code: "NO_FILE" });
  }

  let uploadFile = file;

  if (compress) {
    try {
      uploadFile = await withTimeout(
        imageCompression(file, {
          maxSizeMB,
          maxWidthOrHeight,
          useWebWorker: true,
          maxIteration: 4,
          initialQuality: 0.75,
        }),
        COMPRESSION_TIMEOUT_MS
      );
    } catch (compressErr) {
      console.warn(
        "Image compression timed out or failed, falling back to original:",
        compressErr
      );
      if (file.size <= BUCKET_LIMIT_BYTES) {
        uploadFile = file;
      } else {
        throw Object.assign(new Error("PHOTO_TOO_LARGE"), {
          code: "PHOTO_TOO_LARGE",
        });
      }
    }
  } else if (file.size > BUCKET_LIMIT_BYTES) {
    throw Object.assign(new Error("PHOTO_TOO_LARGE"), {
      code: "PHOTO_TOO_LARGE",
    });
  }

  const uploadOptions = {
    contentType: uploadFile.type || contentTypeFallback,
  };
  if (upsert) uploadOptions.upsert = true;
  if (cacheControl) uploadOptions.cacheControl = cacheControl;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, uploadFile, uploadOptions);

  if (error || !data) {
    throw Object.assign(new Error(error?.message || "UPLOAD_FAILED"), {
      code: "UPLOAD_FAILED",
      cause: error,
    });
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { path, publicUrl: publicUrlData?.publicUrl || null };
}
'@

[System.IO.File]::WriteAllText($newUtilPath, $utilContent, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "Created: $newUtilPath"

# 2. dashboard/page.jsx - avatar upload ---------------------------------

$dashOldImport = 'import { createClient } from "@/utils/supabase/client";'
$dashNewImport = @'
import { createClient } from "@/utils/supabase/client";
import { compressAndUploadImage } from "@/utils/imageUpload";
'@
Replace-Guarded $dashboardPath $dashOldImport $dashNewImport

$dashOldBody = @'
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatar(publicUrl);
    } catch (error) {
      alert("Error uploading image: " + error.message);
    } finally {
      setUploading(false);
    }
  };
'@

$dashNewBody = @'
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;

      // FIX: this used to upload the raw camera file straight to Supabase
      // Storage with no compression. Budget Android cameras routinely
      // produce 8-15MB photos, which silently failed to upload with no
      // useful detail beyond a generic error - now it is compressed
      // first, same standard used for delivery and package photos.
      const { publicUrl } = await compressAndUploadImage({
        file,
        supabase,
        bucket: 'avatars',
        path: fileName,
      });

      setAvatar(publicUrl);
    } catch (error) {
      alert(
        error?.code === "PHOTO_TOO_LARGE"
          ? "That photo is too large to upload. Try a smaller image."
          : "Error uploading image: " + error.message
      );
    } finally {
      setUploading(false);
    }
  };
'@
Replace-Guarded $dashboardPath $dashOldBody $dashNewBody

# 3. rider/active-job/page.jsx - delivery confirmation photo ------------

$ajOldImport = "import { distanceMeters } from '@/utils/geolocation';"
$ajNewImport = @'
import { distanceMeters } from '@/utils/geolocation';
import { compressAndUploadImage } from '@/utils/imageUpload';
'@
Replace-Guarded $activeJobPath $ajOldImport $ajNewImport

$ajOldBody = @'
    setUploadingDeliveryPhoto(true);
    try {
      const fileName = `delivery_${order.id}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('delivery-photos').upload(fileName, file, { contentType: file.type || 'image/jpeg' });
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from('delivery-photos').getPublicUrl(fileName);
        setDeliveryPhotoUrl(publicUrlData.publicUrl);
      } else {
        alert("Couldn't upload the photo. You can still mark this delivered without one.");
      }
    } finally {
      setUploadingDeliveryPhoto(false);
    }
  }
'@

$ajNewBody = @'
    setUploadingDeliveryPhoto(true);
    try {
      const fileName = `delivery_${order.id}_${Date.now()}.jpg`;
      // FIX: this was uploading the raw camera file with zero compression
      // straight against a bucket with a 5MB limit. Phone cameras on
      // budget Android devices routinely shoot 8-15MB photos, so this
      // failed silently on exactly the devices this app targets - riders
      // just saw "Couldn't upload the photo" with no way to know why.
      const { publicUrl } = await compressAndUploadImage({
        file,
        supabase,
        bucket: 'delivery-photos',
        path: fileName,
      });
      setDeliveryPhotoUrl(publicUrl);
    } catch (err) {
      console.error("Delivery photo upload failed:", err);
      alert("Couldn't upload the photo. You can still mark this delivered without one.");
    } finally {
      setUploadingDeliveryPhoto(false);
    }
  }
'@
Replace-Guarded $activeJobPath $ajOldBody $ajNewBody

# 4. rider/onboarding/page.jsx - document uploads ------------------------

$obOldImport = "import imageCompression from 'browser-image-compression';"
$obNewImport = "import { compressAndUploadImage } from '@/utils/imageUpload';"
Replace-Guarded $onboardingPath $obOldImport $obNewImport

$obOldBody = @'
    try {
      const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);

      const { data: { user } } = await supabase.auth.getUser();
      const fileName = `${user.id}/${fieldName}_${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw uploadErr;

      // Documents bucket is private now - store the storage path, not a public
'@

$obNewBody = @'
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileName = `${user.id}/${fieldName}_${Date.now()}.jpg`;

      // FIX: standardized on the shared compress+upload helper (same one
      // used for delivery/package photos and the avatar upload), which
      // adds a compression-timeout fallback this screen did not have -
      // a stuck Web Worker on an older WebView used to leave this hung
      // on "uploading" indefinitely instead of falling back or failing
      // visibly.
      await compressAndUploadImage({
        file,
        supabase,
        bucket: 'documents',
        path: fileName,
        maxSizeMB: 0.8,
        upsert: true,
        cacheControl: '3600',
      });

      // Documents bucket is private now - store the storage path, not a public
'@
Replace-Guarded $onboardingPath $obOldBody $obNewBody

# 5. Commit ---------------------------------------------------------------

Write-Host ""
Write-Host "All patches applied. Reviewing git status:"
git status

git add "src/utils/imageUpload.js"
git add "src/app/dashboard/page.jsx"
git add "src/app/rider/(main)/active-job/page.jsx"
git add "src/app/rider/onboarding/page.jsx"

git commit -m "Fix image upload failures: compress before upload on avatar, delivery photo, and rider docs flows"

Write-Host ""
Write-Host "Committed locally. Review with 'git show' or 'git diff HEAD~1' then push when ready:"
Write-Host "  git push"
