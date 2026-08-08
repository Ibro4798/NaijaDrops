#Requires -Version 5.1
<#
Fix-LayoutDynamicSSR.ps1

Fixes the Vercel/Turbopack error:
"ssr: false is not allowed with next/dynamic in Server Components."

This script:
1. Clones a fresh copy of NaijaDrops.
2. Creates LazyNotificationListeners.jsx as a Client Component.
3. Removes next/dynamic + ssr:false from layout.js.
4. Imports and renders LazyNotificationListeners in layout.js.
5. Runs npm install and npm run build.
6. Pushes only if the build succeeds.
#>

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/Ibro4798/NaijaDrops.git"
$WorkDir = Join-Path $PWD "NaijaDrops"
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Write-Utf8Bom {
    param(
        [string]$Path,
        [string]$Content
    )

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8Bom)
}

Write-Host "== Cloning fresh copy of NaijaDrops ==" -ForegroundColor Cyan

if (Test-Path $WorkDir) {
    Remove-Item $WorkDir -Recurse -Force
}

git clone --depth 1 $RepoUrl $WorkDir

if ($LASTEXITCODE -ne 0) {
    throw "Git clone failed. Aborting."
}

Set-Location $WorkDir

$LayoutPath = Join-Path $WorkDir "src\app\layout.js"
$NewCompPath = Join-Path $WorkDir "src\components\LazyNotificationListeners.jsx"

if (-not (Test-Path $LayoutPath)) {
    throw "Could not find src/app/layout.js. Aborting."
}

$layoutContent = Get-Content -Raw -Path $LayoutPath

$chatDynamic = 'const ChatNotificationListener = dynamic(() => import("@/components/ChatNotificationListener"), { ssr: false });'
$orderDynamic = 'const OrderStatusNotificationListener = dynamic(() => import("@/components/OrderStatusNotificationListener"), { ssr: false });'

$chatCount = ([regex]::Matches($layoutContent, [regex]::Escape($chatDynamic))).Count
$orderCount = ([regex]::Matches($layoutContent, [regex]::Escape($orderDynamic))).Count

if ($chatCount -ne 1 -or $orderCount -ne 1) {
    throw "layout.js does not contain the expected dynamic imports. Found Chat=$chatCount Order=$orderCount. Aborting."
}

$chatRender = '<ChatNotificationListener />'
$orderRender = '<OrderStatusNotificationListener />'

$chatRenderCount = ([regex]::Matches($layoutContent, [regex]::Escape($chatRender))).Count
$orderRenderCount = ([regex]::Matches($layoutContent, [regex]::Escape($orderRender))).Count

if ($chatRenderCount -ne 1 -or $orderRenderCount -ne 1) {
    throw "layout.js does not contain the expected listener JSX. Found Chat=$chatRenderCount Order=$orderRenderCount. Aborting."
}

Write-Host "== Backing up layout.js ==" -ForegroundColor Cyan
Copy-Item $LayoutPath "$LayoutPath.bak_$Stamp"

Write-Host "== Creating LazyNotificationListeners.jsx ==" -ForegroundColor Cyan

$newComponent = @'
"use client";

import dynamic from "next/dynamic";

const ChatNotificationListener = dynamic(
    () => import("@/components/ChatNotificationListener"),
    { ssr: false }
);

const OrderStatusNotificationListener = dynamic(
    () => import("@/components/OrderStatusNotificationListener"),
    { ssr: false }
);

export default function LazyNotificationListeners() {
    return (
        <>
            <ChatNotificationListener />
            <OrderStatusNotificationListener />
        </>
    );
}
'@

Write-Utf8Bom -Path $NewCompPath -Content $newComponent

Write-Host "== Updating layout.js ==" -ForegroundColor Cyan

# Remove next/dynamic import.
$layoutContent = $layoutContent.Replace(
    'import dynamic from "next/dynamic";' + "`r`n",
    ""
)

$layoutContent = $layoutContent.Replace(
    'import dynamic from "next/dynamic";' + "`n",
    ""
)

# Add the new Client Component import.
$serviceWorkerImport = 'import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";'

if (-not $layoutContent.Contains($serviceWorkerImport)) {
    throw "Could not find ServiceWorkerRegister import. Aborting."
}

$newImport = $serviceWorkerImport + "`r`nimport LazyNotificationListeners from `"@/components/LazyNotificationListeners`";"

$layoutContent = $layoutContent.Replace(
    $serviceWorkerImport,
    $newImport
)

# Remove the dynamic declarations.
$layoutContent = $layoutContent.Replace($chatDynamic + "`r`n", "")
$layoutContent = $layoutContent.Replace($orderDynamic + "`r`n", "")
$layoutContent = $layoutContent.Replace($chatDynamic + "`n", "")
$layoutContent = $layoutContent.Replace($orderDynamic + "`n", "")

# Replace both listener elements with the single Client Component.
$twoRenderCRLF = "          <ChatNotificationListener />`r`n          <OrderStatusNotificationListener />"
$twoRenderLF = "          <ChatNotificationListener />`n          <OrderStatusNotificationListener />"

$layoutContent = $layoutContent.Replace(
    $twoRenderCRLF,
    "          <LazyNotificationListeners />"
)

$layoutContent = $layoutContent.Replace(
    $twoRenderLF,
    "          <LazyNotificationListeners />"
)

# Verify transformation.
if ($layoutContent.Contains("next/dynamic")) {
    throw "layout.js still contains next/dynamic. Aborting."
}

if ($layoutContent.Contains("ssr: false")) {
    throw "layout.js still contains ssr:false. Aborting."
}

if (-not $layoutContent.Contains("LazyNotificationListeners")) {
    throw "LazyNotificationListeners was not added to layout.js. Aborting."
}

if (-not $layoutContent.Contains("<LazyNotificationListeners />")) {
    throw "LazyNotificationListeners JSX was not added to layout.js. Aborting."
}

Write-Utf8Bom -Path $LayoutPath -Content $layoutContent

Write-Host "== Verifying patch ==" -ForegroundColor Cyan

$verifyLayout = Get-Content -Raw -Path $LayoutPath
$verifyComponent = Get-Content -Raw -Path $NewCompPath

if ($verifyLayout.Contains("next/dynamic")) {
    throw "Verification failed: next/dynamic remains in layout.js."
}

if ($verifyLayout.Contains("ssr: false")) {
    throw "Verification failed: ssr:false remains in layout.js."
}

if (-not $verifyLayout.Contains("import LazyNotificationListeners from")) {
    throw "Verification failed: Client Component import missing."
}

if (-not $verifyLayout.Contains("<LazyNotificationListeners />")) {
    throw "Verification failed: Client Component JSX missing."
}

if (-not $verifyComponent.Contains('"use client";')) {
    throw "Verification failed: LazyNotificationListeners.jsx is not a Client Component."
}

if (-not $verifyComponent.Contains("{ ssr: false }")) {
    throw "Verification failed: ssr:false dynamic imports are missing from Client Component."
}

if (-not $verifyComponent.Contains("<ChatNotificationListener />")) {
    throw "Verification failed: ChatNotificationListener is not rendered."
}

if (-not $verifyComponent.Contains("<OrderStatusNotificationListener />")) {
    throw "Verification failed: OrderStatusNotificationListener is not rendered."
}

Write-Host "== Patch verified ==" -ForegroundColor Green

Write-Host "== Installing dependencies ==" -ForegroundColor Cyan

npm install --no-audit --no-fund

if ($LASTEXITCODE -ne 0) {
    throw "npm install failed. NOT pushing."
}

Write-Host "== Running production build ==" -ForegroundColor Cyan

npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Production build failed. NOT pushing."
}

Write-Host "== Build succeeded. Committing fix ==" -ForegroundColor Green

git add src/app/layout.js src/components/LazyNotificationListeners.jsx

git commit -m "Fix Vercel build: move ssr:false dynamic imports into client component"

if ($LASTEXITCODE -ne 0) {
    throw "Git commit failed. NOT pushing."
}

Write-Host "== Pushing to main ==" -ForegroundColor Cyan

git push origin main

if ($LASTEXITCODE -ne 0) {
    throw "Git push failed. The build passed, but the push did not complete."
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " SUCCESS: Fix committed and pushed to main " -ForegroundColor Green
Write-Host " Vercel should now begin a new deployment.  " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
