<#
  fix-private-documents-bucket.ps1

  Fixes the fallout from making the Supabase 'documents' storage bucket private
  (rider ID cards / licenses / vehicle photos / profile photos).

  Problem:
    - Old code stored a permanent "public" URL (getPublicUrl) in the riders
      table and rendered it directly as <img src=...>. Now that the bucket
      is private, those URLs 403.

  Fix:
    1. New file: src/utils/signedDocUrl.js
       - getSignedDocUrl(supabase, urlOrPath, expiresIn)
         Accepts either a legacy public URL or a bare storage path, extracts
         the path, and generates a short-lived signed URL server-side.
       - resolveRiderDocUrls(supabase, rider, expiresIn)
         Resolves all four doc/photo fields on a rider record at once.

    2. src/app/ops-terminal/drivers/page.jsx
       - Resolves profile_photo_url (the only field rendered as <img> on
         this list page) to a signed URL for each rider before render.

    3. src/app/ops-terminal/drivers/[driverId]/page.jsx
       - Resolves all four doc/photo fields to signed URLs before render.

    4. src/app/rider/onboarding/page.jsx
       - Stops storing a dead "public" URL on upload. Stores the bare
         storage path instead, which the helper above already knows how
         to sign on read. (Existing rows with the old public-URL format
         still work fine — the helper handles both formats.)

  Usage:
    1. Place this script in an EMPTY working folder (it does its own fresh
       clone — do not run inside your existing working copy).
    2. Run: powershell -ExecutionPolicy Bypass -File .\fix-private-documents-bucket.ps1
    3. Review the diff it prints, then cd into NaijaDrops_patched and push.

  Safety:
    - Fresh clone only, never touches your existing local repo.
    - Every file this script writes is copied to <file>.bak_<timestamp>
      immediately before any change, inside the fresh clone.
    - Each find-and-replace patch requires an EXACT match count of 1.
      If the source has drifted since this script was written, it stops
      and tells you exactly which patch failed instead of guessing.
#>

$ErrorActionPreference = "Stop"

$RepoUrl   = "https://github.com/Ibro4798/NaijaDrops.git"
$CloneDir  = "NaijaDrops_patched"
$Stamp     = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize([string]$s) {
    # Match logic ignores CRLF vs LF so patches survive Windows line endings
    return $s -replace "`r`n", "`n"
}

function Backup-File([string]$path) {
    $bak = "$path.bak_$Stamp"
    Copy-Item -LiteralPath $path -Destination $bak -Force
    Write-Host "  backed up -> $bak"
}

function Patch-File {
    param(
        [string]$Path,
        [string]$OldStr,
        [string]$NewStr,
        [string]$Label
    )

    Write-Host "Patching: $Label"
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $normRaw = Normalize $raw
    $normOld = Normalize $OldStr

    $count = ([regex]::Matches($normRaw, [regex]::Escape($normOld))).Count
    if ($count -ne 1) {
        throw "Expected exactly 1 match for '$Label' in $Path but found $count. Aborting - source may have changed."
    }

    Backup-File $Path

    # Do the replace on the CRLF-normalized text (literal, not regex), then restore CRLF, then write with BOM.
    $normNew = Normalize $NewStr
    $patchedNorm = $normRaw.Replace($normOld, $normNew)
    $patchedCRLF = $patchedNorm -replace "`n", "`r`n"

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $patchedCRLF, $utf8Bom)
    Write-Host "  OK`n"
}

Write-Host "== Cloning fresh copy of NaijaDrops ==`n"
if (Test-Path $CloneDir) {
    throw "$CloneDir already exists. Delete it or run this in a clean folder."
}
git clone $RepoUrl $CloneDir
Set-Location $CloneDir

# ---------------------------------------------------------------------------
# 1. New helper file: src/utils/signedDocUrl.js
# ---------------------------------------------------------------------------
Write-Host "== Creating src/utils/signedDocUrl.js ==`n"

$helperContent = @'
// Documents bucket is private. Old rows may still hold a legacy "public" URL
// (from supabase.storage.from('documents').getPublicUrl(...)); new rows just
// store the bare storage path. This resolves either form into a short-lived
// signed URL, server-side, at render time.

const PUBLIC_MARKER = "/object/public/documents/";
const SIGN_MARKER = "/object/sign/documents/";

function extractPath(urlOrPath) {
  if (!urlOrPath) return null;

  const publicIdx = urlOrPath.indexOf(PUBLIC_MARKER);
  if (publicIdx !== -1) {
    return urlOrPath.slice(publicIdx + PUBLIC_MARKER.length);
  }

  const signIdx = urlOrPath.indexOf(SIGN_MARKER);
  if (signIdx !== -1) {
    return urlOrPath.slice(signIdx + SIGN_MARKER.length).split("?")[0];
  }

  // Not a URL at all — assume it's already a bare storage path.
  if (!urlOrPath.startsWith("http")) {
    return urlOrPath;
  }

  return null;
}

export async function getSignedDocUrl(supabase, urlOrPath, expiresIn = 3600) {
  const path = extractPath(urlOrPath);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("getSignedDocUrl error for path:", path, error.message);
    return null;
  }

  return data.signedUrl;
}

const RIDER_DOC_FIELDS = [
  "profile_photo_url",
  "id_card_url",
  "license_url",
  "vehicle_photo_url",
];

export async function resolveRiderDocUrls(supabase, rider, expiresIn = 3600) {
  if (!rider) return rider;

  const resolved = { ...rider };
  await Promise.all(
    RIDER_DOC_FIELDS.map(async (field) => {
      if (rider[field]) {
        resolved[field] = await getSignedDocUrl(supabase, rider[field], expiresIn);
      }
    })
  );

  return resolved;
}
'@

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$helperPath = "src\utils\signedDocUrl.js"
$helperCRLF = $helperContent -replace "`n", "`r`n"
[System.IO.File]::WriteAllText($helperPath, $helperCRLF, $utf8Bom)
Write-Host "  created -> $helperPath`n"

# ---------------------------------------------------------------------------
# 2. src/app/ops-terminal/drivers/page.jsx
# ---------------------------------------------------------------------------

Patch-File `
  -Path "src\app\ops-terminal\drivers\page.jsx" `
  -Label "add getSignedDocUrl import" `
  -OldStr @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
'@ `
  -NewStr @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { getSignedDocUrl } from "@/utils/signedDocUrl";
'@

Patch-File `
  -Path "src\app\ops-terminal\drivers\page.jsx" `
  -Label "resolve profile_photo_url to signed URL for each rider" `
  -OldStr @'
  const { data: riders } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .order("created_at", { ascending: false });

  const all = riders || [];
'@ `
  -NewStr @'
  const { data: riders } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .order("created_at", { ascending: false });

  const all = await Promise.all(
    (riders || []).map(async (r) => ({
      ...r,
      profile_photo_url: await getSignedDocUrl(supabase, r.profile_photo_url),
    }))
  );
'@

# ---------------------------------------------------------------------------
# 3. src/app/ops-terminal/drivers/[driverId]/page.jsx
# ---------------------------------------------------------------------------

Patch-File `
  -Path "src\app\ops-terminal\drivers\[driverId]\page.jsx" `
  -Label "add resolveRiderDocUrls import" `
  -OldStr @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
'@ `
  -NewStr @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { resolveRiderDocUrls } from "@/utils/signedDocUrl";
'@

Patch-File `
  -Path "src\app\ops-terminal\drivers\[driverId]\page.jsx" `
  -Label "resolve all doc/photo fields to signed URLs" `
  -OldStr @'
  const { data: rider } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .eq("user_id", driverId)
    .single();

  if (!rider) {
'@ `
  -NewStr @'
  const { data: riderRaw } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .eq("user_id", driverId)
    .single();

  const rider = riderRaw ? await resolveRiderDocUrls(supabase, riderRaw) : null;

  if (!rider) {
'@

# ---------------------------------------------------------------------------
# 4. src/app/rider/onboarding/page.jsx
# ---------------------------------------------------------------------------

Patch-File `
  -Path "src\app\rider\onboarding\page.jsx" `
  -Label "store bare storage path instead of dead public URL" `
  -OldStr @'
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);

      // Document uploads save immediately too, independent of step navigation -
      // a photo that's uploaded should never be lost even if the app closes
      // before "Continue" is tapped.
      const updatedFormData = { ...formData, [`${fieldName}_url`]: publicUrl };
'@ `
  -NewStr @'
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw uploadErr;

      // Documents bucket is private now - store the storage path, not a public
      // URL (which would be dead on arrival). Signed URLs are generated
      // on-demand server-side when an admin reviews the docs.
      // Document uploads save immediately too, independent of step navigation -
      // a photo that's uploaded should never be lost even if the app closes
      // before "Continue" is tapped.
      const updatedFormData = { ...formData, [`${fieldName}_url`]: fileName };
'@

Write-Host "`n== All patches applied successfully ==`n"
Write-Host "Files changed:"
Write-Host "  - src/utils/signedDocUrl.js (new)"
Write-Host "  - src/app/ops-terminal/drivers/page.jsx"
Write-Host "  - src/app/ops-terminal/drivers/[driverId]/page.jsx"
Write-Host "  - src/app/rider/onboarding/page.jsx"
Write-Host "`nBackups (.bak_$Stamp) sit next to each modified file inside $CloneDir."
Write-Host "Review with 'git diff', then commit and push from $CloneDir when happy."
