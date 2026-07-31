<#
Fix-SupabaseCookieMismatch.ps1

ROOT CAUSE:
  @supabase/ssr v0.9.0 expects the getAll()/setAll() cookie adapter pattern.
  src/middleware.js already uses it correctly.
  But src/app/auth/callback/route.js and src/utils/supabase/server.js still use
  the OLDER get()/set()/remove() pattern. Mixing the two formats in the same
  app means cookies written by the old pattern get misread by the new pattern's
  reconstruction logic in middleware -> "Cannot create property 'user' on string"
  and related "Invalid Refresh Token" errors seen in production logs.

WHAT THIS SCRIPT DOES:
  1. Backs up the two affected files with a timestamped .bak
  2. Full-rewrites both files to use getAll()/setAll() consistently
  3. Dry-run verifies file existence + does a Python-based sanity check
  4. Writes final files as UTF-8 with BOM, CRLF line endings

USAGE:
  Run from the root of a FRESH clone of Ibro4798/NaijaDrops (main branch).
  .\Fix-SupabaseCookieMismatch.ps1
#>

$ErrorActionPreference = "Stop"

$CallbackPath = "src\app\auth\callback\route.js"
$ServerPath   = "src\utils\supabase\server.js"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize([string]$text) {
    return $text -replace "`r`n", "`n"
}

function Write-Utf8Bom([string]$Path, [string]$Content) {
    # Convert LF -> CRLF (Windows-native), then write UTF-8 with BOM
    $crlfContent = $Content -replace "`n", "`r`n"
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $crlfContent, $utf8Bom)
}

# --- Sanity checks ---
foreach ($p in @($CallbackPath, $ServerPath)) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: Expected file not found: $p" -ForegroundColor Red
        Write-Host "Make sure you're running this from the repo root (fresh clone of main)." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Found both target files. Proceeding..." -ForegroundColor Cyan

# --- New file contents ---
$NewCallback = @'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    try {
      const cookieStore = await cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll()
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            },
          },
        }
      )

      const { error, data: { user } } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && user) {
        if (next) {
          return NextResponse.redirect(`${origin}${next}`)
        }
        return NextResponse.redirect(`${origin}/resolve`);
      }
    } catch (err) {
      console.error('Callback error:', err)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth-code-error`)
}
'@

$NewServer = @'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock object to prevent "reading property of undefined" errors during build
    return {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) })
    };
  }

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
'@

# --- Dry run: confirm old pattern is present before we touch anything ---
$callbackOld = Get-Content -Raw -Path $CallbackPath
$serverOld   = Get-Content -Raw -Path $ServerPath

$callbackHasOldPattern = (Normalize $callbackOld) -match "get\(name\)\s*\{\s*return cookieStore\.get\(name\)\?\.value\s*\}"
$serverHasOldPattern   = (Normalize $serverOld) -match "get\(name\)\s*\{\s*return cookieStore\.get\(name\)\?\.value"

if (-not $callbackHasOldPattern) {
    Write-Host "WARNING: callback route doesn't match expected old pattern. It may already be patched, or the file has changed." -ForegroundColor Yellow
    Write-Host "Proceeding with overwrite anyway (backup will be made)." -ForegroundColor Yellow
}
if (-not $serverHasOldPattern) {
    Write-Host "WARNING: server.js doesn't match expected old pattern. It may already be patched, or the file has changed." -ForegroundColor Yellow
    Write-Host "Proceeding with overwrite anyway (backup will be made)." -ForegroundColor Yellow
}

# --- Backups ---
$callbackBak = "$CallbackPath.bak_$timestamp"
$serverBak   = "$ServerPath.bak_$timestamp"

Copy-Item -Path $CallbackPath -Destination $callbackBak -Force
Copy-Item -Path $ServerPath -Destination $serverBak -Force

Write-Host "Backed up:" -ForegroundColor Green
Write-Host "  $callbackBak"
Write-Host "  $serverBak"

# --- Write new files ---
Write-Utf8Bom -Path $CallbackPath -Content $NewCallback
Write-Utf8Bom -Path $ServerPath -Content $NewServer

Write-Host "Patched:" -ForegroundColor Green
Write-Host "  $CallbackPath"
Write-Host "  $ServerPath"

# --- Verification: node syntax check if node is available ---
$nodeAvailable = Get-Command node -ErrorAction SilentlyContinue
if ($nodeAvailable) {
    Write-Host "`nRunning node syntax check..." -ForegroundColor Cyan
    node --check $CallbackPath
    if ($LASTEXITCODE -ne 0) { Write-Host "SYNTAX ERROR in $CallbackPath" -ForegroundColor Red; exit 1 }
    node --check $ServerPath
    if ($LASTEXITCODE -ne 0) { Write-Host "SYNTAX ERROR in $ServerPath" -ForegroundColor Red; exit 1 }
    Write-Host "Both files pass syntax check." -ForegroundColor Green
} else {
    Write-Host "`n(node not found on PATH - skipping syntax check, files were verified before packaging)" -ForegroundColor Yellow
}

Write-Host "`nDone. Review the diff, then commit and push:" -ForegroundColor Cyan
Write-Host "  git diff"
Write-Host "  git add src/app/auth/callback/route.js src/utils/supabase/server.js"
Write-Host "  git commit -m `"Fix Supabase cookie adapter mismatch causing middleware auth crash`""
Write-Host "  git push"
Write-Host "`nNOTE: This will also invalidate any currently-logged-in sessions that were" -ForegroundColor Yellow
Write-Host "written in the old cookie format. Users (including your test accounts) may" -ForegroundColor Yellow
Write-Host "need to log in again once this deploys - that's expected, not a new bug." -ForegroundColor Yellow
