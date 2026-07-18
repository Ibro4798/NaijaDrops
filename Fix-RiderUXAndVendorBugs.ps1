<#
  Fix-RiderUXAndVendorBugs.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. RIDER HEADER OVERCROWDING (the screenshot you sent)
     src\app\rider\(main)\layout.jsx had five text links plus the full
     "NaijaDrops Rider" wordmark crammed onto one row with extra top padding -
     visibly overlapping on real device widths. Rebuilt as a compact icon-only
     nav row (Feed/Active/Money/Profile/Sign Out as icons with tooltips) so it
     fits cleanly at any width.

  2. ADMIN ACCESS FROM RIDER PROFILE - CONFIRMED SAFE, NO ACTUAL LEAK
     Checked directly: middleware.js gates every /ops-terminal route at the
     edge and 404s any non-admin before the page even loads, and the
     ops-terminal layout re-validates server-side on top of that. The rider
     Profile page has zero links or functionality tied to admin access - it
     just used alarming language ("Control Center", "terminal active",
     "Authorized Personnel Only") that reads like an admin panel but isn't
     one. Toned that copy down to plain account-settings language so it stops
     looking like something it's not. Also fixed a stray "15% Standard"
     commission display on that page - found a fourth spot still showing the
     old rate after the earlier 15%->20% fix only covered three locations.

  3. FEED - CONFIRMED WORKING, NO CHANGE NEEDED
     /rider (the Feed link) redirects straight to /rider/dashboard, which
     already has the job-broadcast feed and live location pinging wired in
     from the last round of fixes. Verified by reading the code directly.

  4. VENDOR DASHBOARD "ACTIVE" BADGE DIDN'T DO ANYTHING
     The "{n} Active" pill in the top-right of the vendor dashboard was a
     plain <div> - no onClick, no link, nothing happens when tapped. That's
     what "doesn't render" almost certainly meant in practice: it renders
     visually but is inert. Made it a real button that navigates straight to
     the tracking page for the vendor's actual most-recent active order.

  5. "USE MY LOCATION" - SLOW AND SOMETIMES SHOWS RAW COORDINATES
     Three compounding bugs, all fixed:
       a) utils/mapbox.js reverseGeocodeMapbox() had a hardcoded 3-second
          timeout. On Kano's patchy mobile networks this regularly aborted a
          request that would have succeeded given more time, and silently
          fell back to showing raw "lat, lng" instead of a place name.
          Bumped to 6 seconds (deliberately a single attempt, not a slow
          retry loop, so this doesn't make the worst case even slower).
       b) utils/geolocation.js getReliableLocation() forced a flat 5-second
          wait on every single call regardless of how good the GPS reading
          already was, and only resolved early if accuracy was under 20m AND
          a second ping had arrived - a bar many phones never clear indoors.
          Cut the forced wait to 2.5s and loosened early-resolve to any
          reading under 50m on the very first ping. This is the single
          biggest source of "the button is slow."
       c) send-package/step-1's own handleUseMyLocation() called
          getCurrentPosition() with no options object at all, meaning the
          browser's default timeout applies - which is infinite. Added an
          explicit 10s timeout and a real error message instead of the
          button silently doing nothing on failure.

  This script writes full file content for new/rewritten files, and does
  targeted find-and-replace for existing files it only needs to touch in
  part. Backs up everything to .fix-backup-uxfixes\ first. Includes a UTF-8
  BOM so the encoding corruption from an earlier script cannot recur here.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-RiderUXAndVendorBugs.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-uxfixes"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

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

function Resolve-TargetPath($originalRel, $movedRel) {
    if ($movedRel -ne $null) {
        $movedFull = Get-FullPath $movedRel
        if (Test-Path -LiteralPath $movedFull) { return $movedFull }
        $movedParent = Split-Path $movedFull -Parent
        if (Test-Path -LiteralPath $movedParent) { return $movedFull }
    }
    return Get-FullPath $originalRel
}

function Write-FileContent($targetFull, $content) {
    Backup-Path $targetFull
    $targetParent = Split-Path $targetFull -Parent
    if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
    Set-Content -LiteralPath $targetFull -Value $content -NoNewline -Encoding UTF8
    Write-Host "  WROTE: $targetFull" -ForegroundColor Green
}

function Patch-File($targetFull, $oldStrLF, $newStrLF, $label) {
    if (-not (Test-Path -LiteralPath $targetFull)) {
        Write-Host "  SKIP (not found): $targetFull" -ForegroundColor Yellow
        return
    }
    $raw = Get-Content -LiteralPath $targetFull -Raw -Encoding UTF8
    # Normalize CRLF -> LF before matching, then restore CRLF on write only if
    # the file had it originally. This is the fix for a bug found last time:
    # anchors built as plain LF silently failed to match files Windows git
    # checkout had converted to CRLF.
    $hadCRLF = $raw.Contains("`r`n")
    $normalized = $raw -replace "`r`n", "`n"

    if ($normalized.Contains($oldStrLF)) {
        Backup-Path $targetFull
        $normalized = $normalized.Replace($oldStrLF, $newStrLF)
        if ($hadCRLF) { $normalized = $normalized -replace "`n", "`r`n" }
        Set-Content -LiteralPath $targetFull -Value $normalized -NoNewline -Encoding UTF8
        Write-Host "  PATCHED: $label" -ForegroundColor Green
    } elseif ($normalized.Contains($newStrLF)) {
        Write-Host "  ALREADY PATCHED: $label" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: anchor text not found for $label - skipped, the file may have changed. Send me its current content and I will regenerate this." -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying rider UX, vendor dashboard, and location-speed fixes:" -ForegroundColor Cyan

$content0 = @'
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Clock, ShieldAlert, AlertTriangle, Radar, Truck, Wallet, User, LogOut } from "lucide-react";
import SignOutButton from "@/components/ui/SignOutButton";

export default async function RiderLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Access control is strictly enforced by the Bouncer Middleware.
  if (!user) redirect("/auth/login");

  // 2. Fetch Driver Profile & Enrollment Status
  const { data: rider } = await supabase
    .from("riders")
    .select("status, rejection_reason, users(full_name)")
    .eq("user_id", user.id)
    .single();

  // Redirect to onboarding if they haven't submitted anything yet
  if (!rider) {
    redirect("/rider/onboarding");
  }

  const isApproved = rider.status === "approved";
  const isPending = rider.status === "pending";
  const isRejected = rider.status === "rejected";
  const isPaused = rider.status === "paused";

  return (
    <div className="flex flex-col min-h-[100dvh] bg-charcoal-950 text-white selection:bg-emerald-500 overflow-x-hidden">
      {/* Universal Driver Header - icon-only nav so it stays readable on small
          screens. Previously five text links plus the logo were crammed onto
          one row with a pt-12 top offset, which visibly overlapped on
          narrower devices. */}
      <nav className="border-b border-white/5 px-4 sm:px-6 pt-6 pb-3 flex justify-between items-center bg-charcoal-950/80 backdrop-blur-xl z-50 sticky top-0">
        <div className="font-outfit font-black text-lg italic tracking-tighter shrink-0">
          NaijaDrops <span className="text-emerald-500">Rider</span>
        </div>
        {isApproved && (
          <div className="flex gap-1">
            <Link href="/rider" title="Feed" className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-all">
              <Radar size={18} />
            </Link>
            <Link href="/rider/active-job" title="Active Job" className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-all">
              <Truck size={18} />
            </Link>
            <Link href="/rider/earnings" title="Money" className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-all">
              <Wallet size={18} />
            </Link>
            <Link href="/profile" title="Profile" className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-all">
              <User size={18} />
            </Link>
            <SignOutButton title="Sign Out" className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all bg-transparent border-0 cursor-pointer">
              <LogOut size={18} />
            </SignOutButton>
          </div>
        )}
      </nav>
      
      <main className="flex-1 w-full max-w-lg mx-auto relative px-5 py-4">
        {/* SOFT-LOCK OVERLAYS (STRICT SPEC RULE #16) */}
        
        {/* 1. Pending Toast (Removed Overlay so they can see feed) */}
        {isPending && (
          <div className="fixed top-20 inset-x-0 z-[100] flex justify-center pointer-events-none">
            <div className="bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md px-6 py-3 rounded-full text-emerald-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-glow">
              <Clock className="animate-pulse" size={14} /> View Only Mode - Verification Pending
            </div>
          </div>
        )}

        {/* 2. Rejected / Paused Lock */}
        {(isRejected || isPaused) && (
          <div className="fixed inset-0 z-[100] bg-charcoal-950 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-8">
               <ShieldAlert className="text-red-500" size={36} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">{isRejected ? "Access Denied" : "Account Paused"}</h2>
            <p className="text-red-400/80 text-xs font-black uppercase tracking-widest mb-6">Status ID: {rider.status}</p>
            
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 mb-8 w-full">
               <div className="flex items-start gap-3 text-left">
                  <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                  <div>
                    <div className="text-white text-sm font-bold mb-1">Reason for restriction:</div>
                    <p className="text-charcoal-400 text-xs leading-relaxed">
                      {rider.rejection_reason || "Your profile requires further verification or violated terms of service. Please contact our Kano operations center."}
                    </p>
                  </div>
               </div>
            </div>

            <SignOutButton className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-black text-sm block text-center cursor-pointer hover:bg-white/10 transition-colors">
              Sign Out
            </SignOutButton>
          </div>
        )}

        {/* 3. Approved Content */}
        {(!isRejected && !isPaused) && children}
      </main>
    </div>
  );
}
'@
$target0 = Resolve-TargetPath "src\app\rider\layout.jsx" "src\app\rider\(main)\layout.jsx"
Write-FileContent $target0 $content0

$content1 = @'
"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton({ className = "", children, ...rest }) {
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <button onClick={handleSignOut} className={className} {...rest}>
      {children}
    </button>
  );
}
'@
$target1 = Resolve-TargetPath "src\components\ui\SignOutButton.jsx" $null
Write-FileContent $target1 $content1

$content2 = @'
// Mapbox Utilities for Kano Precision Search
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Kano Bounding Box [minLng, minLat, maxLng, maxLat]
const KANO_BBOX = "8.4000,11.9000,8.6500,12.1000";

/**
 * Get address suggestions from Mapbox Geocoding API v5
 */
export const getMapboxSuggestions = async (query, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !query || query.length < 2) return [];

    try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${activeToken}&bbox=${KANO_BBOX}&country=ng&limit=6&autocomplete=true`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            console.error("Mapbox API Error:", data);
            return [];
        }
        
        if (data && data.features) {
            return data.features.map(feature => ({
                name: feature.text,
                description: feature.place_name,
                lat: feature.center[1], // Mapbox uses [lng, lat]
                lng: feature.center[0],
                id: feature.id,
                isMapbox: true
            }));
        }
        return [];
    } catch (error) {
        console.error("Mapbox suggestion error:", error);
        return [];
    }
};

/**
 * Reverse Geocode: Get street address from coordinates
 * Mapbox expects [lng, lat]
 *
 * FIX: was a hardcoded 3-second timeout, which on Kano's patchy mobile
 * networks regularly aborted mid-request and silently fell back to raw
 * coordinates - the "sometimes shows coordinates instead of the location
 * name" symptom. Bumped to 6 seconds, which is generous enough to survive a
 * slow network round-trip without making the single-attempt worst case any
 * slower than a user would tolerate. Deliberately NOT doing a slow multi-
 * attempt retry here - that would fix the coordinate-fallback problem at the
 * cost of making the "it's slow" complaint worse.
 */
export const reverseGeocodeMapbox = async (lat, lng, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${activeToken}&types=address,poi,neighborhood,locality&limit=1`;

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("Mapbox Reverse Geocode API Error");
            return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        const data = await response.json();
        if (data && data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn("Mapbox reverse geocoding timed out (>6s), using coordinates fallback");
        } else {
            console.error("Mapbox reverse geocode error:", error);
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

/**
 * Fetch a driving route from Mapbox Directions API
 */
export const getMapboxRoute = async (start, end, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !start || !end) return null;

    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${activeToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            return {
                geometry: data.routes[0].geometry,
                distance: data.routes[0].distance,
                duration: data.routes[0].duration
            };
        }
        return null;
    } catch (error) {
        console.error("Mapbox Directions API error:", error);
        return null;
    }
};

/**
 * Fetch a distance matrix using Mapbox Matrix API
 * Useful for AI Batching (Maestro) to find real driving distances between multiple points.
 */
export const getMapboxMatrix = async (coordinates, providedToken = null) => {
    const activeToken = providedToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!activeToken || !coordinates || coordinates.length < 2) return null;

    try {
        const coordString = coordinates.map(c => `${c.lng},${c.lat}`).join(';');
        const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordString}?annotations=distance,duration&access_token=${activeToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok') {
            return {
                distances: data.distances, // 2D array of distances in meters
                durations: data.durations  // 2D array of durations in seconds
            };
        }
        return null;
    } catch (error) {
        console.error("Mapbox Matrix API error:", error);
        return null;
    }
};
'@
$target2 = Resolve-TargetPath "src\utils\mapbox.js" $null
Write-FileContent $target2 $content2

$content3 = @'
/**
 * Reliable Geolocation Utility
 * Tiered fetching: GPS -> Wifi/Cell -> IP-API Fallback
 */

const DEMO_LOCATION = {
    lat: 12.0022,
    lng: 8.5167,
    accuracy: 10,
    source: 'demo'
};

export async function getReliableLocation(onProgress) {
    return new Promise(async (resolve) => {
        const hasMapbox = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        
        let locationFound = false;
        let bestReading = null;
        let pingsReceived = 0;

        const updateStatus = (msg) => {
            if (onProgress) onProgress(msg);
        };

        // Real IP-based Geolocation Fallback
        const getIPLocation = async () => {
            try {
                updateStatus("🌍 Resolving city via IP...");
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                if (data.latitude && data.longitude) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude,
                        city: data.city,
                        accuracy: 5000,
                        source: 'ip-api'
                    };
                }
            } catch (e) {
                console.error("IP Geolocate failed:", e);
            }
            return null;
        };

        if ("geolocation" in navigator) {
            updateStatus("🛰️ Synchronizing GPS...");

            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    pingsReceived++;
                    if (!bestReading || pos.coords.accuracy < bestReading.accuracy) {
                        bestReading = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            source: 'gps'
                        };
                        updateStatus(`🎯 Precision Lock: ±${Math.round(pos.coords.accuracy)}m`);
                    }

                    // FIX: previously required accuracy < 20m AND a second ping
                    // before resolving early - on a phone that only ever reports
                    // ~30-40m accuracy (common indoors/under cloud cover in Kano)
                    // this condition never fired, so every single request paid
                    // the full 5-second forced wait below. 50m is still a solid,
                    // usable fix for picking a delivery address, and firing on
                    // the very first ping (not just the second) saves real time
                    // on a clean GPS lock.
                    if (pos.coords.accuracy < 50) {
                        cleanup();
                        resolve(bestReading);
                    }
                },
                (err) => {
                    console.warn("GPS Watch failed:", err.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );

            const cleanup = () => {
                locationFound = true;
                navigator.geolocation.clearWatch(watchId);
            };

            // FIX: reduced from 5000ms to 2500ms. This was a flat wait applied
            // on every call regardless of how good the reading already was -
            // the single biggest contributor to "the location button is slow."
            // Readings that don't stabilize to a usable accuracy in 2.5s are
            // unlikely to improve much by waiting longer anyway; the IP
            // fallback below still catches anything genuinely bad.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                if (bestReading && bestReading.accuracy < 200) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else if (bestReading) {
                        resolve(bestReading); // Use the poor GPS reading if IP fails too
                    } else {
                        // Ultimate fallback: Null or let user know
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 2500); 

        } else {
            const ipLoc = await getIPLocation();
            resolve(ipLoc);
        }
    });
}
/**
 * Industry Standard Geolocation (One-shot)
 * Used for "Use Current Location" buttons
 */
export async function getCurrentPositionStandard() {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error("Location services not supported."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: 'standard-gps'
                });
            },
            (err) => {
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}
'@
$target3 = Resolve-TargetPath "src\utils\geolocation.js" $null
Write-FileContent $target3 $content3

$patchOld0 = @'
              <h1 className="text-4xl font-black text-white tracking-tighter italic font-outfit">Control Center</h1>
              <p className="text-charcoal-500 font-bold text-[10px] uppercase tracking-widest mt-1">Identity & Security Interface</p>
'@
$patchNew0 = @'
              <h1 className="text-4xl font-black text-white tracking-tighter italic font-outfit">Account Settings</h1>
              <p className="text-charcoal-500 font-bold text-[10px] uppercase tracking-widest mt-1">Your Profile & Details</p>
'@
$patchTarget0 = Resolve-TargetPath "src\app\profile\page.jsx" $null
Patch-File $patchTarget0 $patchOld0 $patchNew0 "profile header copy"

$patchOld1 = @'
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{role} terminal active</span>
'@
$patchNew1 = @'
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{role} account active</span>
'@
$patchTarget1 = Resolve-TargetPath "src\app\profile\page.jsx" $null
Patch-File $patchTarget1 $patchOld1 $patchNew1 "profile status badge copy"

$patchOld2 = @'
                   <h3 className="text-white font-black text-xl italic tracking-tight">Rider Manifest</h3>
                   <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Authorized Personnel Only</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Status</div>
                   <div className="text-white font-black text-lg italic tracking-tight">Operational</div>
                </div>
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Commission</div>
                   <div className="text-white font-black text-lg italic tracking-tight">15% Standard</div>
                </div>
             </div>
'@
$patchNew2 = @'
                   <h3 className="text-white font-black text-xl italic tracking-tight">Rider Details</h3>
                   <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Your Rider Account</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Status</div>
                   <div className="text-white font-black text-lg italic tracking-tight">Operational</div>
                </div>
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Commission</div>
                   <div className="text-white font-black text-lg italic tracking-tight">20% Standard</div>
                </div>
             </div>
'@
$patchTarget2 = Resolve-TargetPath "src\app\profile\page.jsx" $null
Patch-File $patchTarget2 $patchOld2 $patchNew2 "profile manifest copy + 15pct->20pct commission"

$patchOld3 = @'
  const [user, setUser] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);
'@
$patchNew3 = @'
  const [user, setUser] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);
  // Distinct from latestOrder (most recent by date, any status) - this is
  // specifically the most recent order that is still active, used to make the
  // "Active" badge actually navigate somewhere real when tapped.
  const [latestActiveOrder, setLatestActiveOrder] = useState(null);
'@
$patchTarget3 = Resolve-TargetPath "src\app\dashboard\page.jsx" $null
Patch-File $patchTarget3 $patchOld3 $patchNew3 "vendor dashboard state"

$patchOld4 = @'
      if (orders) {
        const active = orders.filter(o => ["pending", "matched", "picked_up", "in_transit"].includes(o.status));
        setActiveOrderCount(active.length);
        setLatestOrder(orders[0] || null);
      }
'@
$patchNew4 = @'
      if (orders) {
        const active = orders.filter(o => ["pending", "matched", "picked_up", "in_transit"].includes(o.status));
        setActiveOrderCount(active.length);
        setLatestOrder(orders[0] || null);
        setLatestActiveOrder(active[0] || null);
      }
'@
$patchTarget4 = Resolve-TargetPath "src\app\dashboard\page.jsx" $null
Patch-File $patchTarget4 $patchOld4 $patchNew4 "vendor dashboard active-order fetch"

$patchOld5 = @'
            {activeOrderCount > 0 && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">{activeOrderCount} Active</span>
              </div>
            )}
'@
$patchNew5 = @'
            {activeOrderCount > 0 && (
              <button
                onClick={() => latestActiveOrder && router.push(`/tracking/${latestActiveOrder.id}`)}
                className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-emerald-500/30 transition-all active:scale-95"
              >
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">{activeOrderCount} Active</span>
              </button>
            )}
'@
$patchTarget5 = Resolve-TargetPath "src\app\dashboard\page.jsx" $null
Patch-File $patchTarget5 $patchOld5 $patchNew5 "vendor dashboard Active badge -> real button"

$patchOld6 = @'
  const [gpsLoading, setGpsLoading] = useState(false);
'@
$patchNew6 = @'
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
'@
$patchTarget6 = Resolve-TargetPath "src\app\send-package\step-1\page.jsx" $null
Patch-File $patchTarget6 $patchOld6 $patchNew6 "step-1 gpsError state"

$patchOld7 = @'
  async function handleUseMyLocation() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const name = await reverseGeocodeMapbox(lat, lng, mapboxToken);
      const point = { name, lat, lng };
      setPickup(point);
      setPickupInput(name);
      setMapViewState(v => ({ ...v, longitude: lng, latitude: lat, zoom: 14 }));
      setGpsLoading(false);
    }, () => setGpsLoading(false));
  }
'@
$patchNew7 = @'
  async function handleUseMyLocation() {
    setGpsLoading(true);
    setGpsError(null);
    // FIX: previously called with no options object at all, which means the
    // browser default (no timeout - it can wait forever) applied. On a weak
    // signal this could hang indefinitely with no feedback. 10s is enough for
    // a normal GPS fix without leaving the button stuck spinning.
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const name = await reverseGeocodeMapbox(lat, lng, mapboxToken);
      const point = { name, lat, lng };
      setPickup(point);
      setPickupInput(name);
      setMapViewState(v => ({ ...v, longitude: lng, latitude: lat, zoom: 14 }));
      setGpsLoading(false);
    }, (err) => {
      setGpsLoading(false);
      setGpsError(
        err.code === err.PERMISSION_DENIED
          ? "Location access denied. Enable it in your browser settings and try again."
          : "Couldn't get your location. Check your GPS/network and try again."
      );
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
'@
$patchTarget7 = Resolve-TargetPath "src\app\send-package\step-1\page.jsx" $null
Patch-File $patchTarget7 $patchOld7 $patchNew7 "step-1 handleUseMyLocation timeout+error"

$patchOld8 = @'
            <button onClick={() => { setLinkTarget("pickup"); setShowLinkModal(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              <LinkIcon size={12} />
              Paste map link
            </button>
          </div>

          {/* Pickup suggestions */}
'@
$patchNew8 = @'
            <button onClick={() => { setLinkTarget("pickup"); setShowLinkModal(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              <LinkIcon size={12} />
              Paste map link
            </button>
          </div>
          {gpsError && (
            <p className="text-red-400 text-[11px] font-bold mt-2">{gpsError}</p>
          )}

          {/* Pickup suggestions */}
'@
$patchTarget8 = Resolve-TargetPath "src\app\send-package\step-1\page.jsx" $null
Patch-File $patchTarget8 $patchOld8 $patchNew8 "step-1 gpsError display"


if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: compact rider nav header, tone down profile copy, fix stale 15pct commission, make vendor Active badge clickable, speed up + fix use-my-location coordinate fallback"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-uxfixes\ if needed." -ForegroundColor Green
Write-Host "No backend/Supabase changes were needed for this batch - everything here was frontend logic and copy." -ForegroundColor Green
