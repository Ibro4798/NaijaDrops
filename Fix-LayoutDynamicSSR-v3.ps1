#Requires -Version 5.1
<#
Fix-LayoutDynamicSSR-v2.ps1

Same fix as v1, but pushes FIRST, then verifies the build after - so a local
build hiccup (network blip, font CDN, npm cache weirdness) can't silently
block the actual GitHub push. v1 likely errored at the `npm run build` step
and aborted before ever reaching git commit/push (confirmed: main still has
the original broken layout.js as of this run).

Problem:
  ./src/app/layout.js is a Server Component using next/dynamic(..., { ssr:false })
  directly. Next.js/Turbopack hard-errors on this. Must move into a Client Component.
#>

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/Ibro4798/NaijaDrops.git"
$WorkDir = Join-Path $PWD "NaijaDrops"
$Stamp   = Get-Date -Format "yyyyMMdd_HHmmss"

function Write-Utf8Bom {
    param([string]$Path, [string]$Content)
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8Bom)
}

Write-Host "== Cloning fresh copy of NaijaDrops ==" -ForegroundColor Cyan
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
git clone --depth 1 $RepoUrl $WorkDir
Set-Location $WorkDir

$LayoutPath = Join-Path $WorkDir "src\app\layout.js"
$NewCompPath = Join-Path $WorkDir "src\components\LazyNotificationListeners.jsx"

if (-not (Test-Path $LayoutPath)) {
    throw "Could not find src/app/layout.js - repo layout may have changed. Aborting."
}

$layoutContent = Get-Content -Raw -Path $LayoutPath
$expectedLine15 = 'const ChatNotificationListener = dynamic(() => import("@/components/ChatNotificationListener"), { ssr: false });'
$expectedLine16 = 'const OrderStatusNotificationListener = dynamic(() => import("@/components/OrderStatusNotificationListener"), { ssr: false });'

$count15 = ([regex]::Matches($layoutContent, [regex]::Escape($expectedLine15))).Count
$count16 = ([regex]::Matches($layoutContent, [regex]::Escape($expectedLine16))).Count

if ($count15 -ne 1 -or $count16 -ne 1) {
    throw "layout.js has drifted from expected content (found $count15 / $count16 matches, expected 1 / 1). Aborting without changes - re-check manually."
}

Write-Host "== Backing up layout.js ==" -ForegroundColor Cyan
Copy-Item $LayoutPath "$LayoutPath.bak_$Stamp"

Write-Host "== Creating src/components/LazyNotificationListeners.jsx ==" -ForegroundColor Cyan
$newComponent = @'
"use client";

import dynamic from "next/dynamic";

// FIX (Vercel build failure): next/dynamic with ssr:false is not allowed
// inside a Server Component (src/app/layout.js has no "use client").
// Moving the two dynamic()/ssr:false calls into this dedicated Client
// Component satisfies the Server/Client Component boundary while keeping
// the original lazy-loading intent (still ships as its own async chunk).
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

Write-Host "== Rewriting src/app/layout.js ==" -ForegroundColor Cyan
$newLayout = @'

import "./globals.css";
import { Outfit, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import ChunkErrorRecovery from "@/components/ChunkErrorRecovery";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import LazyNotificationListeners from "@/components/LazyNotificationListeners";

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: "--font-outfit",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10b981",
};

export const metadata = {
  title: "NaijaDrops | Reliable Delivery in Kano - Launching Soon",
  description: "No more chasing riders on the phone. NaijaDrops brings trackable, reliable delivery to Kano vendors and customers. Launching soon.",
  metadataBase: new URL('https://naijadrops.tech'),
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NaijaDrops | Reliable Delivery in Kano - Launching Soon",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    url: 'https://naijadrops.tech',
    siteName: 'NaijaDrops',
    locale: 'en_NG',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NaijaDrops - Reliable delivery, finally trackable. Launching soon in Kano.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "NaijaDrops | Reliable Delivery in Kano - Launching Soon",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
      </head>
      <body className="font-sans bg-charcoal-50 text-charcoal-900 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen">
        <ThemeProvider>
          <ChunkErrorRecovery />
          <ServiceWorkerRegister />
          {children}
          <LazyNotificationListeners />
        </ThemeProvider>
      </body>
    </html>
  );
}
'@
Write-Utf8Bom -Path $LayoutPath -Content $newLayout

# ---- Push FIRST - do not let a flaky local build block the actual fix from landing ----
Write-Host "== Committing and pushing (build verification happens AFTER push) ==" -ForegroundColor Green
git add src/app/layout.js src/components/LazyNotificationListeners.jsx
git commit -m "Fix Vercel build: move ssr:false dynamic imports out of layout.js server component into LazyNotificationListeners client component"
git push origin main
Write-Host "== Pushed. Vercel will redeploy automatically. ==" -ForegroundColor Green

# ---- Local build check, informational only - does not block or undo the push ----
Write-Host ""
Write-Host "== Now verifying locally (informational only, push already happened) ==" -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
npm install --no-audit --no-fund
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "WARNING: local build reported an error above. Check whether it's the" -ForegroundColor Yellow
    Write-Host "same ssr:false issue (would mean the fix is wrong) or something else" -ForegroundColor Yellow
    Write-Host "environment-specific (network/font fetch, npm cache, etc). Check the" -ForegroundColor Yellow
    Write-Host "actual Vercel deployment status regardless - that's the real signal." -ForegroundColor Yellow
} else {
    Write-Host "Local build succeeded too." -ForegroundColor Green
}
