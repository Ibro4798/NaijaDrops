$ErrorActionPreference = "Stop"

function Decode-Base64 {
    param([string]$b64)
    $decodedBytes = [System.Convert]::FromBase64String($b64)
    return [System.Text.Encoding]::UTF8.GetString($decodedBytes)
}

function Count-Occurrences {
    param([string]$haystack, [string]$needle)
    if ($needle.Length -eq 0) { return 0 }
    $count = 0
    $idx = 0
    while ($true) {
        $found = $haystack.IndexOf($needle, $idx, [System.StringComparison]::Ordinal)
        if ($found -lt 0) { break }
        $count++
        $idx = $found + $needle.Length
    }
    return $count
}

function Patch-File {
    param(
        [string]$path,
        [string[]]$oldB64List,
        [string[]]$newB64List,
        [string]$label
    )

    if (-not (Test-Path $path)) {
        Write-Host "ERROR: Could not find $path from current directory." -ForegroundColor Red
        Write-Host "Run this script from the root of your NaijaDrops checkout." -ForegroundColor Red
        exit 1
    }

    Write-Host "Fixing: $label" -ForegroundColor Cyan
    Write-Host "  File: $path" -ForegroundColor Cyan

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$path.$timestamp.bak"
    Copy-Item -Path $path -Destination $backupPath -Force
    Write-Host "  Backup written to $backupPath" -ForegroundColor Yellow

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    if ($hasBom) {
        $content = $utf8NoBom.GetString($bytes, 3, $bytes.Length - 3)
    } else {
        $content = $utf8NoBom.GetString($bytes)
    }

    for ($i = 0; $i -lt $oldB64List.Count; $i++) {
        $oldStr = Decode-Base64 $oldB64List[$i]
        $newStr = Decode-Base64 $newB64List[$i]

        $count = Count-Occurrences $content $oldStr
        if ($count -ne 1) {
            Write-Host "  ERROR: Expected 1 match for anchor $($i + 1), found $count. Aborting without changes to this file." -ForegroundColor Red
            Write-Host "  File was not modified. Backup at $backupPath can be ignored (source untouched)." -ForegroundColor Yellow
            exit 1
        }

        $content = $content.Replace($oldStr, $newStr)
    }

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $content, $utf8Bom)

    Write-Host "  Patched successfully." -ForegroundColor Green
    Write-Host ""
}

$patchedFiles = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------------------
# Fix 1: Manage Drivers list crashes on load. Calls getSignedDocUrl() to
# resolve the profile photo into a signed URL but never imports it -
# ReferenceError on every page load. Swapped in resolveRiderDocUrls (the
# helper already used correctly elsewhere), which resolves all four
# document fields, not just the profile photo.
# ---------------------------------------------------------------------------
$path1 = "src/app/ops-terminal/drivers/page.jsx"
Patch-File `
    -path $path1 `
    -oldB64List @(
        "aW1wb3J0IEludml0ZURyaXZlckJ1dHRvbiBmcm9tICIuL0ludml0ZURyaXZlckJ1dHRvbiI7",
        "ICBjb25zdCBhbGwgPSBhd2FpdCBQcm9taXNlLmFsbCgKICAgIChyaWRlcnMgfHwgW10pLm1hcChhc3luYyAocikgPT4gKHsKICAgICAgLi4uciwKICAgICAgcHJvZmlsZV9waG90b191cmw6IGF3YWl0IGdldFNpZ25lZERvY1VybChzdXBhYmFzZSwgci5wcm9maWxlX3Bob3RvX3VybCksCiAgICB9KSkKICApOw=="
    ) `
    -newB64List @(
        "aW1wb3J0IEludml0ZURyaXZlckJ1dHRvbiBmcm9tICIuL0ludml0ZURyaXZlckJ1dHRvbiI7CmltcG9ydCB7IHJlc29sdmVSaWRlckRvY1VybHMgfSBmcm9tICJAL3V0aWxzL3NpZ25lZERvY1VybCI7",
        "ICBjb25zdCBhbGwgPSBhd2FpdCBQcm9taXNlLmFsbCgKICAgIChyaWRlcnMgfHwgW10pLm1hcCgocikgPT4gcmVzb2x2ZVJpZGVyRG9jVXJscyhzdXBhYmFzZSwgcikpCiAgKTs="
    ) `
    -label "Manage Drivers list crash (missing getSignedDocUrl import)"
$patchedFiles.Add($path1)

# ---------------------------------------------------------------------------
# Fix 2: Rider review page crashes (click into any individual rider from
# Manage Drivers). Same root cause: calls resolveRiderDocUrls() without
# importing it. This is where the approve/reject buttons live.
# ---------------------------------------------------------------------------
$path2 = "src/app/ops-terminal/drivers/[driverId]/page.jsx"
Patch-File `
    -path $path2 `
    -oldB64List @("aW1wb3J0IERyaXZlclJldmlld0FjdGlvbnMgZnJvbSAiLi9Ecml2ZXJSZXZpZXdBY3Rpb25zIjs=") `
    -newB64List @("aW1wb3J0IERyaXZlclJldmlld0FjdGlvbnMgZnJvbSAiLi9Ecml2ZXJSZXZpZXdBY3Rpb25zIjsKaW1wb3J0IHsgcmVzb2x2ZVJpZGVyRG9jVXJscyB9IGZyb20gIkAvdXRpbHMvc2lnbmVkRG9jVXJsIjs=") `
    -label "Rider review page crash (missing resolveRiderDocUrls import)"
$patchedFiles.Add($path2)

# ---------------------------------------------------------------------------
# Fix 3: Customer tracking page can crash. A null-check sat between two
# useEffect hooks - React requires the same hooks in the same order every
# render, so the page throws the moment driverLocation goes from null to a
# real value (rider comes online after being assigned). Moved the guard to
# after all hooks are declared, right before the JSX return.
# ---------------------------------------------------------------------------
$path3 = "src/components/TrackingMap.jsx"
Patch-File `
    -path $path3 `
    -oldB64List @(
        "ICBjb25zdCBhbmltYXRpb25SZWYgPSB1c2VSZWYobnVsbCk7CgogIGlmICghZHJpdmVyTG9jYXRpb24pIHJldHVybiBudWxsOwoKICAvLyBGZXRjaCBSb3V0ZQ==",
        "ICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgcmVhY3QtaG9va3MvZXhoYXVzdGl2ZS1kZXBzCiAgfSwgW2RyaXZlckxvY2F0aW9uXSk7CgogIHJldHVybiAo"
    ) `
    -newB64List @(
        "ICBjb25zdCBhbmltYXRpb25SZWYgPSB1c2VSZWYobnVsbCk7CgogIC8vIEZldGNoIFJvdXRl",
        "ICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgcmVhY3QtaG9va3MvZXhoYXVzdGl2ZS1kZXBzCiAgfSwgW2RyaXZlckxvY2F0aW9uXSk7CgogIGlmICghZHJpdmVyTG9jYXRpb24pIHJldHVybiBudWxsOwoKICByZXR1cm4gKA=="
    ) `
    -label "TrackingMap conditional-hooks crash (customer tracking page)"
$patchedFiles.Add($path3)

# ---------------------------------------------------------------------------
# Fix 4: Pre-launch order block. handleFindDriver() checked the logged-in
# user's email against a single hardcoded allowlisted address and showed a
# "We're almost open, come back Saturday" modal instead of creating the
# order for anyone else. Removes the gate, its state, its modal, and the
# now-unused Clock import entirely. Everyone can create real orders now.
# ---------------------------------------------------------------------------
$path4 = "src/app/send-package/step-3/page.jsx"
Patch-File `
    -path $path4 `
    -oldB64List @(
        "aW1wb3J0IHsgQXJyb3dMZWZ0LCBaYXAsIExvYWRlcjIsIExvY2ssIENsb2NrIH0gZnJvbSAibHVjaWRlLXJlYWN0Ijs=",
        "ICBjb25zdCBbc2hvd0F1dGhHYXRlLCBzZXRTaG93QXV0aEdhdGVdID0gdXNlU3RhdGUoZmFsc2UpOwogIGNvbnN0IFtzaG93TGF1bmNoR2F0ZSwgc2V0U2hvd0xhdW5jaEdhdGVdID0gdXNlU3RhdGUoZmFsc2UpOwogIGNvbnN0IFtzaG93UGhvbmVHYXRlLCBzZXRTaG93UGhvbmVHYXRlXSA9IHVzZVN0YXRlKGZhbHNlKTs=",
        "ICBjb25zdCBMQVVOQ0hfR0FURV9BTExPV0VEX0VNQUlMID0gImlicm9pYnJhaGltNjY1QGdtYWlsLmNvbSI7CgogIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpbmREcml2ZXIoKSB7CiAgICBjb25zdCB7IGRhdGE6IHsgdXNlciB9IH0gPSBhd2FpdCBzdXBhYmFzZS5hdXRoLmdldFVzZXIoKTsKICAgIGlmICghdXNlcikgewogICAgICBzZXRTaG93QXV0aEdhdGUodHJ1ZSk7CiAgICAgIHJldHVybjsKICAgIH0KCiAgICBjb25zdCB7IGRhdGE6IHVzZXJSb3cgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oInVzZXJzIikuc2VsZWN0KCJwaG9uZSIpLmVxKCJpZCIsIHVzZXIuaWQpLnNpbmdsZSgpOwogICAgaWYgKCF1c2VyUm93Py5waG9uZSkgewogICAgICBzZXRTaG93UGhvbmVHYXRlKHRydWUpOwogICAgICByZXR1cm47CiAgICB9CgogICAgaWYgKHVzZXIuZW1haWwgIT09IExBVU5DSF9HQVRFX0FMTE9XRURfRU1BSUwpIHsKICAgICAgc2V0U2hvd0xhdW5jaEdhdGUodHJ1ZSk7CiAgICAgIHJldHVybjsKICAgIH0KICAgIGF3YWl0IGNyZWF0ZU9yZGVyKCk7CiAgfQ==",
        "ICAgICAgPC9BbmltYXRlUHJlc2VuY2U+CgogICAgICA8QW5pbWF0ZVByZXNlbmNlPgogICAgICAgIHtzaG93TGF1bmNoR2F0ZSAmJiAoCiAgICAgICAgICA8bW90aW9uLmRpdiBpbml0aWFsPXt7IG9wYWNpdHk6IDAgfX0gYW5pbWF0ZT17eyBvcGFjaXR5OiAxIH19IGV4aXQ9e3sgb3BhY2l0eTogMCB9fSBjbGFzc05hbWU9ImZpeGVkIGluc2V0LTAgYmctY2hhcmNvYWwtOTUwLzkwIGJhY2tkcm9wLWJsdXItbWQgei01MCBmbGV4IGl0ZW1zLWVuZCBqdXN0aWZ5LWNlbnRlciBwYi0xMCBweC01Ij4KICAgICAgICAgICAgPG1vdGlvbi5kaXYgaW5pdGlhbD17eyB5OiA4MCwgb3BhY2l0eTogMCB9fSBhbmltYXRlPXt7IHk6IDAsIG9wYWNpdHk6IDEgfX0gZXhpdD17eyB5OiA4MCwgb3BhY2l0eTogMCB9fSBjbGFzc05hbWU9InctZnVsbCBtYXgtdy1zbSBiZy1jaGFyY29hbC05MDAgYm9yZGVyIGJvcmRlci13aGl0ZS8xMCByb3VuZGVkLVsycmVtXSBwLTggdGV4dC1jZW50ZXIiPgogICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJ3LTE2IGgtMTYgYmctZW1lcmFsZC01MDAvMTAgYm9yZGVyIGJvcmRlci1lbWVyYWxkLTUwMC8yMCByb3VuZGVkLWZ1bGwgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgbXgtYXV0byBtYi02Ij4KICAgICAgICAgICAgICAgIDxDbG9jayBzaXplPXsyOH0gY2xhc3NOYW1lPSJ0ZXh0LWVtZXJhbGQtNTAwIiAvPgogICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgIDxoMiBjbGFzc05hbWU9InRleHQteGwgZm9udC1ibGFjayB0ZXh0LWluayBtYi0zIj5XZSdyZSBhbG1vc3Qgb3BlbiE8L2gyPgogICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT0idGV4dC1jaGFyY29hbC00MDAgdGV4dC1zbSBsZWFkaW5nLXJlbGF4ZWQgbWItMiI+CiAgICAgICAgICAgICAgICBOYWlqYURyb3BzIGxhdW5jaGVzIGZ1bGx5IGluIEthbm8gb24gPHNwYW4gY2xhc3NOYW1lPSJ0ZXh0LWluayBmb250LWJvbGQiPlNhdHVyZGF5LCBBdWd1c3QgMjksIDIwMjY8L3NwYW4+LgogICAgICAgICAgICAgIDwvcD4KICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9InRleHQtY2hhcmNvYWwtNTAwIHRleHQteHMgbGVhZGluZy1yZWxheGVkIG1iLTgiPgogICAgICAgICAgICAgICAgWW91ciByb3V0ZSBhbmQgcHJpY2luZyBhcmUgc2F2ZWQgLSBjb21lIGJhY2sgYWZ0ZXIgbGF1bmNoIGFuZCBkaXNwYXRjaCB3aWxsIGJlIGxpdmUuCiAgICAgICAgICAgICAgPC9wPgogICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0U2hvd0xhdW5jaEdhdGUoZmFsc2UpfSBjbGFzc05hbWU9InctZnVsbCBiZy1lbWVyYWxkLTUwMCBob3ZlcjpiZy1lbWVyYWxkLTQwMCB0ZXh0LWNoYXJjb2FsLTk1MCBmb250LWJsYWNrIHB5LTQgcm91bmRlZC0yeGwgdHJhbnNpdGlvbi1hbGwiPgogICAgICAgICAgICAgICAgR290IGl0CiAgICAgICAgICAgICAgPC9idXR0b24+CiAgICAgICAgICAgIDwvbW90aW9uLmRpdj4KICAgICAgICAgIDwvbW90aW9uLmRpdj4KICAgICAgICApfQogICAgICA8L0FuaW1hdGVQcmVzZW5jZT4KCiAgICAgIDxkaXYgY2xhc3NOYW1lPSJmbGV4LTEgZmxleCBmbGV4LWNvbCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcHgtNSBwYi0xMCI+"
    ) `
    -newB64List @(
        "aW1wb3J0IHsgQXJyb3dMZWZ0LCBaYXAsIExvYWRlcjIsIExvY2sgfSBmcm9tICJsdWNpZGUtcmVhY3QiOw==",
        "ICBjb25zdCBbc2hvd0F1dGhHYXRlLCBzZXRTaG93QXV0aEdhdGVdID0gdXNlU3RhdGUoZmFsc2UpOwogIGNvbnN0IFtzaG93UGhvbmVHYXRlLCBzZXRTaG93UGhvbmVHYXRlXSA9IHVzZVN0YXRlKGZhbHNlKTs=",
        "ICBhc3luYyBmdW5jdGlvbiBoYW5kbGVGaW5kRHJpdmVyKCkgewogICAgY29uc3QgeyBkYXRhOiB7IHVzZXIgfSB9ID0gYXdhaXQgc3VwYWJhc2UuYXV0aC5nZXRVc2VyKCk7CiAgICBpZiAoIXVzZXIpIHsKICAgICAgc2V0U2hvd0F1dGhHYXRlKHRydWUpOwogICAgICByZXR1cm47CiAgICB9CgogICAgY29uc3QgeyBkYXRhOiB1c2VyUm93IH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKCJ1c2VycyIpLnNlbGVjdCgicGhvbmUiKS5lcSgiaWQiLCB1c2VyLmlkKS5zaW5nbGUoKTsKICAgIGlmICghdXNlclJvdz8ucGhvbmUpIHsKICAgICAgc2V0U2hvd1Bob25lR2F0ZSh0cnVlKTsKICAgICAgcmV0dXJuOwogICAgfQoKICAgIGF3YWl0IGNyZWF0ZU9yZGVyKCk7CiAgfQ==",
        "ICAgICAgPC9BbmltYXRlUHJlc2VuY2U+CgogICAgICA8ZGl2IGNsYXNzTmFtZT0iZmxleC0xIGZsZXggZmxleC1jb2wgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHB4LTUgcGItMTAiPg=="
    ) `
    -label "Pre-launch order block removed (send-package/step-3)"
$patchedFiles.Add($path4)

git add $patchedFiles
git commit -m "Fix Manage Drivers, rider review, and TrackingMap crashes; remove pre-launch order gate"

Write-Host ""
Write-Host "All four fixes applied and committed locally." -ForegroundColor Green
Write-Host "Push when ready with: git push" -ForegroundColor Cyan
