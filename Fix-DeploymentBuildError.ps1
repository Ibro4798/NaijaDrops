<#
  Fix-DeploymentBuildError.ps1  ** URGENT - run this first **
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  YOUR LAST 3 PRODUCTION DEPLOYS FAILED TO BUILD. Checked Vercel directly:
  the last three pushes to main (commit messages "last few", "last", and
  "few") all show state ERROR, every one failing on the exact same line.
  Production has been silently serving the last SUCCESSFUL deploy from
  before those three ("bound to 50") this whole time - nothing you've
  approved since then has actually gone live: not the negotiate-button
  removal, not the Install App button, not the performance fixes, not the
  MapModal AI search fix. Vercel doesn't email or otherwise loudly warn
  about a failed deploy by default, which is exactly why this went
  unnoticed.

  ROOT CAUSE (my mistake, in the performance-fix batch):
  src\app\layout.js is the ROOT layout - a Server Component, no "use
  client" at the top. I added `next/dynamic(..., { ssr: false })` calls
  directly inside it to lazy-load the two notification-listener
  components. Next.js explicitly forbids `ssr: false` inside a Server
  Component - it is a hard build error, not a warning:
      "`ssr: false` is not allowed with `next/dynamic` in Server
      Components. Please move it into a Client Component."
  That single line has been breaking every build since.

  THE FIX:
    - src\components\ClientNotificationListeners.jsx (new): a small
      "use client" wrapper - literally the "Client Component" the error
      message asks for. It does the ssr:false dynamic imports internally,
      which is legal there.
    - src\app\layout.js: renders that one wrapper instead of calling
      dynamic() directly itself.
  Verified locally: a real `next build` now gets all the way past this
  file with zero errors (it only stops later on Google Fonts network
  access in this sandbox specifically, which is a sandbox limitation, not
  a real problem - Vercel's build servers have normal internet access).

  Writes full file content (base64-encoded, written as raw bytes - no
  PowerShell string-escaping of JS/JSX, no BOM-injection risk). Backs up
  every existing file it touches to .fix-backup-deploy-error\ first.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-DeploymentBuildError.ps1
  Then commit and push right away - every deploy is failing until this
  lands.
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-deploy-error"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

if (-not (Test-Path -LiteralPath (Join-Path $root "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    if (Test-Path -LiteralPath $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
        Copy-Item -LiteralPath $full -Destination $dest -Force
    }
}

function Write-FileFromBase64($relPath, $b64) {
    $full = Get-FullPath $relPath
    $targetParent = Split-Path $full -Parent
    if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
    Backup-Path $full
    $bytes = [Convert]::FromBase64String($b64)
    [System.IO.File]::WriteAllBytes($full, $bytes)
    Write-Host "  WROTE: $relPath" -ForegroundColor Green
}

Write-Host "`nApplying urgent deployment build-error fix:" -ForegroundColor Red

$b64_LAYOUT = "77u/CmltcG9ydCAiLi9nbG9iYWxzLmNzcyI7CmltcG9ydCB7IE91dGZpdCwgSW50ZXIgfSBmcm9tICJuZXh0L2ZvbnQvZ29vZ2xlIjsKaW1wb3J0IHsgVGhlbWVQcm92aWRlciB9IGZyb20gIkAvY29tcG9uZW50cy9UaGVtZVByb3ZpZGVyIjsKaW1wb3J0IENodW5rRXJyb3JSZWNvdmVyeSBmcm9tICJAL2NvbXBvbmVudHMvQ2h1bmtFcnJvclJlY292ZXJ5IjsKaW1wb3J0IFNlcnZpY2VXb3JrZXJSZWdpc3RlciBmcm9tICJAL2NvbXBvbmVudHMvU2VydmljZVdvcmtlclJlZ2lzdGVyIjsKaW1wb3J0IENsaWVudE5vdGlmaWNhdGlvbkxpc3RlbmVycyBmcm9tICJAL2NvbXBvbmVudHMvQ2xpZW50Tm90aWZpY2F0aW9uTGlzdGVuZXJzIjsKCmNvbnN0IG91dGZpdCA9IE91dGZpdCh7IAogIHN1YnNldHM6IFsibGF0aW4iXSwKICB2YXJpYWJsZTogIi0tZm9udC1vdXRmaXQiLAp9KTsKCmNvbnN0IGludGVyID0gSW50ZXIoeyAKICBzdWJzZXRzOiBbImxhdGluIl0sCiAgdmFyaWFibGU6ICItLWZvbnQtaW50ZXIiLAp9KTsKCmV4cG9ydCBjb25zdCB2aWV3cG9ydCA9IHsKICB3aWR0aDogImRldmljZS13aWR0aCIsCiAgaW5pdGlhbFNjYWxlOiAxLAogIG1heGltdW1TY2FsZTogMSwKICB1c2VyU2NhbGFibGU6IGZhbHNlLAogIHZpZXdwb3J0Rml0OiAiY292ZXIiLAogIHRoZW1lQ29sb3I6ICIjMTBiOTgxIiwKfTsKCmV4cG9ydCBjb25zdCBtZXRhZGF0YSA9IHsKICB0aXRsZTogIk5haWphRHJvcHMgfCBSZWxpYWJsZSBEZWxpdmVyeSBpbiBLYW5vIOKAlCBMYXVuY2hpbmcgU29vbiIsCiAgZGVzY3JpcHRpb246ICJObyBtb3JlIGNoYXNpbmcgcmlkZXJzIG9uIHRoZSBwaG9uZS4gTmFpamFEcm9wcyBicmluZ3MgdHJhY2thYmxlLCByZWxpYWJsZSBkZWxpdmVyeSB0byBLYW5vIHZlbmRvcnMgYW5kIGN1c3RvbWVycy4gTGF1bmNoaW5nIHNvb24uIiwKICBtZXRhZGF0YUJhc2U6IG5ldyBVUkwoJ2h0dHBzOi8vbmFpamFkcm9wcy50ZWNoJyksCiAgbWFuaWZlc3Q6ICIvbWFuaWZlc3QuanNvbiIsCiAgaWNvbnM6IHsKICAgIGljb246ICIvZmF2aWNvbi5wbmciLAogICAgYXBwbGU6ICIvZmF2aWNvbi5wbmciLAogIH0sCiAgb3BlbkdyYXBoOiB7CiAgICB0aXRsZTogIk5haWphRHJvcHMgfCBSZWxpYWJsZSBEZWxpdmVyeSBpbiBLYW5vIOKAlCBMYXVuY2hpbmcgU29vbiIsCiAgICBkZXNjcmlwdGlvbjogIk5vIG1vcmUgY2hhc2luZyByaWRlcnMgb24gdGhlIHBob25lLiBUcmFjayBldmVyeSBkZWxpdmVyeSBsaXZlLCByaWdodCBoZXJlIGluIEthbm8uIiwKICAgIHVybDogJ2h0dHBzOi8vbmFpamFkcm9wcy50ZWNoJywKICAgIHNpdGVOYW1lOiAnTmFpamFEcm9wcycsCiAgICBsb2NhbGU6ICdlbl9ORycsCiAgICB0eXBlOiAnd2Vic2l0ZScsCiAgICBpbWFnZXM6IFsKICAgICAgewogICAgICAgIHVybDogJy9vZy1pbWFnZS5wbmcnLAogICAgICAgIHdpZHRoOiAxMjAwLAogICAgICAgIGhlaWdodDogNjMwLAogICAgICAgIGFsdDogJ05haWphRHJvcHMg4oCUIFJlbGlhYmxlIGRlbGl2ZXJ5LCBmaW5hbGx5IHRyYWNrYWJsZS4gTGF1bmNoaW5nIHNvb24gaW4gS2Fuby4nLAogICAgICB9LAogICAgXSwKICB9LAogIHR3aXR0ZXI6IHsKICAgIGNhcmQ6ICdzdW1tYXJ5X2xhcmdlX2ltYWdlJywKICAgIHRpdGxlOiAiTmFpamFEcm9wcyB8IFJlbGlhYmxlIERlbGl2ZXJ5IGluIEthbm8g4oCUIExhdW5jaGluZyBTb29uIiwKICAgIGRlc2NyaXB0aW9uOiAiTm8gbW9yZSBjaGFzaW5nIHJpZGVycyBvbiB0aGUgcGhvbmUuIFRyYWNrIGV2ZXJ5IGRlbGl2ZXJ5IGxpdmUsIHJpZ2h0IGhlcmUgaW4gS2Fuby4iLAogICAgaW1hZ2VzOiBbJy9vZy1pbWFnZS5wbmcnXSwKICB9LAp9OwoKZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gUm9vdExheW91dCh7IGNoaWxkcmVuIH0pIHsKICByZXR1cm4gKAogICAgPGh0bWwgbGFuZz0iZW4iIHN1cHByZXNzSHlkcmF0aW9uV2FybmluZyBjbGFzc05hbWU9e2Ake291dGZpdC52YXJpYWJsZX0gJHtpbnRlci52YXJpYWJsZX1gfT4KICAgICAgPGhlYWQ+CiAgICAgICAgey8qIFdhcm1zIHRoZSBETlMvVExTIGNvbm5lY3Rpb24gdG8gTWFwYm94IGFoZWFkIG9mIHRpbWUsIHNpdGUtd2lkZSwKICAgICAgICAgICAgc28gd2hpY2hldmVyIHBhZ2UgZmlyc3Qgb3BlbnMgYSBtYXAgaXNuJ3QgYWxzbyBwYXlpbmcgZm9yIHRoYXQKICAgICAgICAgICAgaGFuZHNoYWtlIG9uIHRvcCBvZiBkb3dubG9hZGluZyB0aGUgbWFwIGJ1bmRsZSBpdHNlbGYuIFRoaXMgaXMgYQogICAgICAgICAgICBuZWFyLXplcm8tY29zdCBoaW50IC0gYnJvd3NlcnMgb25seSBhY3R1YWxseSB1c2UgaXQgaWYgc29tZXRoaW5nCiAgICAgICAgICAgIG9uIHRoZSBwYWdlIGVuZHMgdXAgcmVxdWVzdGluZyB0aGVzZSBkb21haW5zLiAqL30KICAgICAgICA8bGluayByZWw9InByZWNvbm5lY3QiIGhyZWY9Imh0dHBzOi8vYXBpLm1hcGJveC5jb20iIGNyb3NzT3JpZ2luPSJhbm9ueW1vdXMiIC8+CiAgICAgICAgPGxpbmsgcmVsPSJwcmVjb25uZWN0IiBocmVmPSJodHRwczovL2V2ZW50cy5tYXBib3guY29tIiBjcm9zc09yaWdpbj0iYW5vbnltb3VzIiAvPgogICAgICAgIDxsaW5rIHJlbD0iZG5zLXByZWZldGNoIiBocmVmPSJodHRwczovL2FwaS5tYXBib3guY29tIiAvPgogICAgICAgIDxsaW5rIHJlbD0iZG5zLXByZWZldGNoIiBocmVmPSJodHRwczovL2V2ZW50cy5tYXBib3guY29tIiAvPgogICAgICA8L2hlYWQ+CiAgICAgIDxib2R5IGNsYXNzTmFtZT0iZm9udC1zYW5zIGJnLWNoYXJjb2FsLTUwIHRleHQtY2hhcmNvYWwtOTAwIGFudGlhbGlhc2VkIG92ZXJmbG93LXgtaGlkZGVuIHNlbGVjdGlvbjpiZy1lbWVyYWxkLTUwMCBzZWxlY3Rpb246dGV4dC13aGl0ZSBmbGV4IGZsZXgtY29sIG1pbi1oLXNjcmVlbiI+CiAgICAgICAgPFRoZW1lUHJvdmlkZXI+CiAgICAgICAgICA8Q2h1bmtFcnJvclJlY292ZXJ5IC8+CiAgICAgICAgICA8U2VydmljZVdvcmtlclJlZ2lzdGVyIC8+CiAgICAgICAgICB7Y2hpbGRyZW59CiAgICAgICAgICA8Q2xpZW50Tm90aWZpY2F0aW9uTGlzdGVuZXJzIC8+CiAgICAgICAgPC9UaGVtZVByb3ZpZGVyPgogICAgICA8L2JvZHk+CiAgICA8L2h0bWw+CiAgKTsKfQ=="
Write-FileFromBase64 "src\app\layout.js" $b64_LAYOUT

$b64_WRAPPER = "InVzZSBjbGllbnQiOwoKaW1wb3J0IGR5bmFtaWMgZnJvbSAibmV4dC9keW5hbWljIjsKCi8vIEZJWCAodGhlIGFjdHVhbCBkZXBsb3ktYnJlYWtpbmcgYnVnKTogYHNzcjogZmFsc2VgIHdhcyBwYXNzZWQgdG8KLy8gbmV4dC9keW5hbWljKCkgZGlyZWN0bHkgaW5zaWRlIHNyYy9hcHAvbGF5b3V0LmpzLiBsYXlvdXQuanMgaGFzIG5vCi8vICJ1c2UgY2xpZW50IiBkaXJlY3RpdmUgLSBpdCdzIGEgU2VydmVyIENvbXBvbmVudCAtIGFuZCBOZXh0LmpzCi8vIGV4cGxpY2l0bHkgZm9yYmlkcyBgc3NyOiBmYWxzZWAgdGhlcmUgKCJgc3NyOiBmYWxzZWAgaXMgbm90IGFsbG93ZWQKLy8gd2l0aCBgbmV4dC9keW5hbWljYCBpbiBTZXJ2ZXIgQ29tcG9uZW50cy4gUGxlYXNlIG1vdmUgaXQgaW50byBhIENsaWVudAovLyBDb21wb25lbnQuIikuIFRoYXQgc2luZ2xlIGxpbmUgYnJva2UgZXZlcnkgcHJvZHVjdGlvbiBidWlsZCBzaW5jZSBpdAovLyB3YXMgaW50cm9kdWNlZDsgdGhlIHNpdGUga2VwdCBzZXJ2aW5nIHRoZSBsYXN0IHN1Y2Nlc3NmdWwgZGVwbG95IGZyb20KLy8gYmVmb3JlIGl0LCBzaWxlbnRseSwgd2l0aCBubyB2aXNpYmxlIGVycm9yIHRvIGFueW9uZSBidXQgVmVyY2VsJ3MgYnVpbGQKLy8gbG9nLiBUaGlzIGZpbGUgSVMgdGhhdCAiQ2xpZW50IENvbXBvbmVudCIgdGhlIGVycm9yIG1lc3NhZ2UgYXNrcyBmb3IgLQovLyBhIHRpbnkgInVzZSBjbGllbnQiIHdyYXBwZXIgaXMgYWxsIGBzc3I6IGZhbHNlYCBuZWVkcyB0byBiZSBsZWdhbCBhZ2FpbiwKLy8gd2hpbGUgc3RpbGwga2VlcGluZyB0aGVzZSB0d28gbGlzdGVuZXJzIG91dCBvZiB0aGUgbWFpbiBidW5kbGUgYXMgdGhlaXIKLy8gb3duIGFzeW5jIGNodW5rLgpjb25zdCBDaGF0Tm90aWZpY2F0aW9uTGlzdGVuZXIgPSBkeW5hbWljKCgpID0+IGltcG9ydCgiLi9DaGF0Tm90aWZpY2F0aW9uTGlzdGVuZXIiKSwgeyBzc3I6IGZhbHNlIH0pOwpjb25zdCBPcmRlclN0YXR1c05vdGlmaWNhdGlvbkxpc3RlbmVyID0gZHluYW1pYygoKSA9PiBpbXBvcnQoIi4vT3JkZXJTdGF0dXNOb3RpZmljYXRpb25MaXN0ZW5lciIpLCB7IHNzcjogZmFsc2UgfSk7CgpleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDbGllbnROb3RpZmljYXRpb25MaXN0ZW5lcnMoKSB7CiAgcmV0dXJuICgKICAgIDw+CiAgICAgIDxDaGF0Tm90aWZpY2F0aW9uTGlzdGVuZXIgLz4KICAgICAgPE9yZGVyU3RhdHVzTm90aWZpY2F0aW9uTGlzdGVuZXIgLz4KICAgIDwvPgogICk7Cn0K"
Write-FileFromBase64 "src\components\ClientNotificationListeners.jsx" $b64_WRAPPER

Write-Host "`nDone. Backups saved under .fix-backup-deploy-error\" -ForegroundColor Cyan
Write-Host "COMMIT AND PUSH NOW - every deploy has been failing until this lands." -ForegroundColor Yellow
Write-Host "After pushing, check Vercel shows a READY (not ERROR) production deployment." -ForegroundColor Cyan
