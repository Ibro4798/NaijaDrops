<#
.SYNOPSIS
  Fixes the "Couldn't upload the photo" error: phone camera photos (often
  4-10MB) were being uploaded raw to Supabase Storage, which rejects
  anything over the delivery-photos bucket's size limit. This compresses
  the photo client-side before upload (same pattern already used in rider
  onboarding elsewhere in the app) and reuses the compressed copy for size
  estimation too.

  NOTE: The bucket's size limit was also raised from 3MB -> 5MB directly on
  your Supabase project as a safety margin. That part is already live and
  does not require a push - this script only handles the code side.

  Uses .Contains()/.Replace() literal string matching throughout (not
  wildcard -like) to avoid the bracket-matching bug from the earlier script.
  Safe to re-run - each edit is skipped if already applied.

.USAGE
  Run this from the ROOT of the NaijaDrops repo (same folder as package.json):
    .\Fix-PhotoUploadCompression.ps1

  Then review, test, and push:
    git diff
    npm run dev
    git add -A
    git commit -m "Compress package photos before upload to fix Supabase size-limit failures"
    git push
#>

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\package.json") -or -not (Test-Path ".\src\app\send-package\step-2\page.jsx")) {
    Write-Host "ERROR: Run this script from the root of the NaijaDrops repo (folder containing package.json)." -ForegroundColor Red
    exit 1
}

$step2Path = ".\src\app\send-package\step-2\page.jsx"
$content = Get-Content -Path $step2Path -Raw -Encoding UTF8
$editsApplied = 0

# --- Edit 1: import ----------------------------------------------------------
$oldImport = "import { estimateSizeFromFile } from `"@/utils/clientSizeEstimate`";"
$newImport = "import { estimateSizeFromFile } from `"@/utils/clientSizeEstimate`";`nimport imageCompression from `"browser-image-compression`";"

if ($content.Contains("browser-image-compression")) {
    Write-Host "Import already present - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldImport)) {
    $content = $content.Replace($oldImport, $newImport)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the import line to patch. Patch it manually - see the diff in chat." -ForegroundColor Red
}

# --- Edit 2: compress + use compressedFile for upload and base64 estimate --
$oldA = @'
    try {
      // Upload the actual photo for the rider to see later, and run the
      // (much smaller, resized) version through the size-estimate API in
      // parallel - neither one blocks the other.
      const fileName = `package_${Date.now()}.jpg`;
      const uploadPromise = supabase.storage.from("delivery-photos").upload(fileName, file, { contentType: file.type || "image/jpeg" });

      const estimatePromise = (async () => {
        setEstimating(true);
        try {
          const base64 = await fileToResizedBase64(file);
'@

$newA = @'
    try {
      // Phone camera photos routinely come in at 4-10MB, well over the
      // delivery-photos bucket's size limit. Compress first (same settings
      // used for rider onboarding docs elsewhere in the app) so uploads
      // stop failing on large images, and reuse the compressed copy for
      // both the upload and the size estimate below - faster and smaller.
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      // Upload the actual photo for the rider to see later, and run the
      // (much smaller, resized) version through the size-estimate API in
      // parallel - neither one blocks the other.
      const fileName = `package_${Date.now()}.jpg`;
      const uploadPromise = supabase.storage.from("delivery-photos").upload(fileName, compressedFile, { contentType: "image/jpeg" });

      const estimatePromise = (async () => {
        setEstimating(true);
        try {
          const base64 = await fileToResizedBase64(compressedFile);
'@

if ($content.Contains("const compressedFile = await imageCompression(file")) {
    Write-Host "Compression block already present - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldA)) {
    $content = $content.Replace($oldA, $newA)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the upload/estimate block to patch. Patch it manually - see the diff in chat." -ForegroundColor Red
}

# --- Edit 3: use compressedFile in the client-cv fallback too --------------
$oldB = "const clientResult = await estimateSizeFromFile(file);"
$newB = "const clientResult = await estimateSizeFromFile(compressedFile);"

if ($content.Contains("estimateSizeFromFile(compressedFile)")) {
    Write-Host "Fallback already using compressedFile - skipping (already patched?)" -ForegroundColor Yellow
} elseif ($content.Contains($oldB)) {
    $content = $content.Replace($oldB, $newB)
    $editsApplied++
} else {
    Write-Host "WARNING: Could not find the client-cv fallback line to patch. Patch it manually - see the diff in chat." -ForegroundColor Red
}

Set-Content -Path $step2Path -Value $content -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "Done. $editsApplied edit(s) applied to $step2Path." -ForegroundColor Green
Write-Host "(browser-image-compression is already in package.json - no npm install needed.)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  git diff"
Write-Host "  npm run dev    # test uploading a large camera photo on /send-package/step-2 (then Ctrl+C)"
Write-Host "  git add -A"
Write-Host "  git commit -m `"Compress package photos before upload to fix Supabase size-limit failures`""
Write-Host "  git push"
