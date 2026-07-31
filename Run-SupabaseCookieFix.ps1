<#
Run-SupabaseCookieFix.ps1

Full end-to-end runner:
  1. Fresh-clones Ibro4798/NaijaDrops (main) into a timestamped folder
  2. Applies the getAll()/setAll() cookie fix to:
       - src/app/auth/callback/route.js
       - src/utils/supabase/server.js
  3. Backs up originals with .bak_<timestamp>
  4. Verifies with node --check (if node is available)
  5. Shows you the diff and asks for confirmation
  6. Commits and pushes to main

USAGE:
  Just run it from anywhere - it clones fresh, you don't need to be in the repo already.
    .\Run-SupabaseCookieFix.ps1

  If you want to skip the push (just patch + inspect locally), add -NoPush:
    .\Run-SupabaseCookieFix.ps1 -NoPush
#>

param(
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$RepoUrl   = "https://github.com/Ibro4798/NaijaDrops.git"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$CloneDir  = "NaijaDrops_fix_$timestamp"

Write-Host "=== Step 1: Fresh clone ===" -ForegroundColor Cyan
git clone $RepoUrl $CloneDir
if ($LASTEXITCODE -ne 0) { Write-Host "git clone failed." -ForegroundColor Red; exit 1 }

Push-Location $CloneDir

$CallbackPath = "src\app\auth\callback\route.js"
$ServerPath   = "src\utils\supabase\server.js"

foreach ($p in @($CallbackPath, $ServerPath)) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: Expected file not found: $p" -ForegroundColor Red
        Write-Host "Repo layout may have changed since this script was written." -ForegroundColor Yellow
        Pop-Location
        exit 1
    }
}

Write-Host "`n=== Step 2: Backing up originals ===" -ForegroundColor Cyan

function Write-Utf8Bom([string]$Path, [string]$Content) {
    $crlfContent = $Content -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $crlfContent, $utf8Bom)
}

$callbackBak = "$CallbackPath.bak_$timestamp"
$serverBak   = "$ServerPath.bak_$timestamp"
Copy-Item -Path $CallbackPath -Destination $callbackBak -Force
Copy-Item -Path $ServerPath -Destination $serverBak -Force
Write-Host "  $callbackBak"
Write-Host "  $serverBak"

Write-Host "`n=== Step 3: Applying fix ===" -ForegroundColor Cyan

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

Write-Utf8Bom -Path $CallbackPath -Content $NewCallback
Write-Utf8Bom -Path $ServerPath -Content $NewServer
Write-Host "Patched both files." -ForegroundColor Green

Write-Host "`n=== Step 4: Verification ===" -ForegroundColor Cyan
$nodeAvailable = Get-Command node -ErrorAction SilentlyContinue
if ($nodeAvailable) {
    node --check $CallbackPath
    if ($LASTEXITCODE -ne 0) { Write-Host "SYNTAX ERROR in $CallbackPath - aborting, nothing pushed." -ForegroundColor Red; Pop-Location; exit 1 }
    node --check $ServerPath
    if ($LASTEXITCODE -ne 0) { Write-Host "SYNTAX ERROR in $ServerPath - aborting, nothing pushed." -ForegroundColor Red; Pop-Location; exit 1 }
    Write-Host "Both files pass syntax check." -ForegroundColor Green
} else {
    Write-Host "(node not found on PATH - skipping syntax check)" -ForegroundColor Yellow
}

Write-Host "`n=== Step 5: Diff review ===" -ForegroundColor Cyan
git diff -- $CallbackPath $ServerPath

if ($NoPush) {
    Write-Host "`n-NoPush was set. Stopping here." -ForegroundColor Yellow
    Write-Host "Repo is at: $(Get-Location)" -ForegroundColor Yellow
    Pop-Location
    exit 0
}

Write-Host "`n=== Step 6: Commit and push ===" -ForegroundColor Cyan
$confirm = Read-Host "Push this fix to main now? (y/n)"
if ($confirm -ne "y") {
    Write-Host "Not pushed. Repo is at: $(Get-Location)" -ForegroundColor Yellow
    Pop-Location
    exit 0
}

git add $CallbackPath $ServerPath
git commit -m "Fix Supabase cookie adapter mismatch causing middleware auth crash"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nPushed successfully. Vercel will auto-deploy from main." -ForegroundColor Green
    Write-Host "Heads up: this invalidates sessions written in the old cookie format." -ForegroundColor Yellow
    Write-Host "You and your test accounts will need to log in again after this deploys." -ForegroundColor Yellow
} else {
    Write-Host "`nPush failed - check output above (auth, branch protection, etc.)." -ForegroundColor Red
}

Pop-Location
Write-Host "`nDone. Local repo copy kept at: $CloneDir" -ForegroundColor Cyan
