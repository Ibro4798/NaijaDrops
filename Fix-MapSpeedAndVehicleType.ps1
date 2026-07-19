<#
  Fix-MapSpeedAndVehicleType.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. MAP LOAD SPEED - "should start loading before the page is reached"
     MapModal and the send-package map are already correctly code-split via
     next/dynamic (good), but nothing ever warms that JS chunk ahead of time,
     so the FIRST time a user opens a map, the browser cold-starts: fetches
     the chunk, parses it, THEN starts fetching map tiles on top of that.
     Three changes:
       a) Root layout now preconnects to Mapbox's domains site-wide, so the
          DNS/TLS handshake is already warm by the time any page needs it -
          near-zero cost, pure win.
       b) New src/utils/warmMapBundle.js, called from the vendor dashboard
          (the page most vendors land on right before tapping "Send
          Package") - fires the same dynamic import early so the map chunk
          is already cached by the time they actually reach a map.
       c) MapModal's Mapbox style switched from the full "streets-v12" style
          to the lighter "light-v11" - fewer layers to fetch/render, faster
          first paint on patchy connections, still clear enough to drop a
          pin accurately.

  2. "USE MY LOCATION" - FAILS WITH NO FEEDBACK
     MapModal's own useMyLocation() (the actual button most people tap - not
     the one on send-package/step-1, which was fixed in an earlier round)
     had no failure path at all: if GPS and the IP fallback both failed
     (denied permission, dead network, or the free ipapi.co fallback getting
     rate-limited), the button just stopped spinning with zero indication of
     what happened. Added a real, visible error message and a disabled state
     while resolving.

  3. VEHICLE TYPE - CAR OPTION REMOVED, MOTORCYCLE ONLY
     The pilot fleet is 100% motorcycle riders, but three separate places in
     the app still let people pick "Car": rider onboarding (a rider signing
     up could select Mini Car), send-package step 2 (a vendor could request
     Car delivery that no rider could actually fulfil), and the admin
     invite-rider form (Car/Van options that don't match reality). All three
     are now locked to motorcycle only, with a short explanatory note instead
     of silently removing the choice.

  This script writes full file content for new/rewritten files and does
  targeted find-and-replace for existing files it only needs to touch in
  part. Backs up everything to .fix-backup-batch6\ first. Includes a UTF-8
  BOM. Uses -LiteralPath throughout.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-MapSpeedAndVehicleType.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-batch6"
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
        Write-Host "  WARNING: anchor text not found for $label - skipped, file may have changed. Send me its current content and I will regenerate this." -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying map speed, use-my-location error handling, and motorcycle-only vehicle type:" -ForegroundColor Cyan

$content0 = @'
/**
 * Warm the map bundle before the user actually needs it.
 *
 * MapModal and the send-package map are already correctly code-split via
 * next/dynamic (good - they don't bloat every page's bundle), but that also
 * means the FIRST time a user opens a map, the browser has to fetch and
 * parse that whole chunk cold, on top of the map's own tile/style requests.
 * That cold-start is most of what "the map is slow to load" actually is.
 *
 * Calling this from a page that's a likely stepping stone toward a map
 * (e.g. the vendor dashboard, right before someone taps "Send Package")
 * kicks off the same dynamic import ahead of time, so by the time the map
 * actually needs to render, the chunk is already downloaded and cached.
 *
 * Safe to call multiple times / from multiple pages - the browser dedupes
 * identical chunk requests automatically.
 */
export function warmMapBundle() {
  if (typeof window === "undefined") return;
  // Fire-and-forget; failures here should never affect the page that called this.
  import("react-map-gl").catch(() => {});
  import("mapbox-gl").catch(() => {});
  import("@/components/MapModal").catch(() => {});
}
'@
$target0 = Get-FullPath "src\utils\warmMapBundle.js"
Write-FileContent $target0 $content0

$patchOld0 = @'
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <body className="font-sans bg-charcoal-50 text-charcoal-900 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
'@
$patchNew0 = @'
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <head>
        {/* Warms the DNS/TLS connection to Mapbox ahead of time, site-wide,
            so whichever page first opens a map isn't also paying for that
            handshake on top of downloading the map bundle itself. This is a
            near-zero-cost hint - browsers only actually use it if something
            on the page ends up requesting these domains. */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
      </head>
      <body className="font-sans bg-charcoal-50 text-charcoal-900 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
'@
$patchTarget0 = Get-FullPath "src\app\layout.js"
Patch-File $patchTarget0 $patchOld0 $patchNew0 "root layout Mapbox preconnect"

$patchOld1 = @'
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
'@
$patchNew1 = @'
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { warmMapBundle } from "@/utils/warmMapBundle";
'@
$patchTarget1 = Get-FullPath "src\app\dashboard\page.jsx"
Patch-File $patchTarget1 $patchOld1 $patchNew1 "vendor dashboard warmMapBundle import"

$patchOld2 = @'
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
'@
$patchNew2 = @'
  useEffect(() => {
    // Vendors land here first, then usually tap "Send Package" - which is
    // the first time MapModal would otherwise cold-start. Kicking off the
    // same dynamic import now means it's already cached by the time they
    // get there.
    warmMapBundle();
  }, []);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
'@
$patchTarget2 = Get-FullPath "src\app\dashboard\page.jsx"
Patch-File $patchTarget2 $patchOld2 $patchNew2 "vendor dashboard warm-up effect"

$patchOld3 = @'
  const [isResolving, setIsResolving] = useState(false);
'@
$patchNew3 = @'
  const [isResolving, setIsResolving] = useState(false);
  const [locationError, setLocationError] = useState(null);
'@
$patchTarget3 = Get-FullPath "src\components\MapModal.jsx"
Patch-File $patchTarget3 $patchOld3 $patchNew3 "MapModal locationError state"

$patchOld4 = @'
  const useMyLocation = async () => {
    setIsResolving(true);
    try {
      const loc = await getReliableLocation();
      if (loc) {
        setMarkerPosition({ lat: loc.lat, lng: loc.lng });
        setViewState({ ...viewState, longitude: loc.lng, latitude: loc.lat, zoom: 14.5 });
        reverseGeocode(loc.lat, loc.lng);
      }
    } catch (error) {
       console.error("Geolocation error:", error);
    } finally {
      setIsResolving(false);
    }
  };
'@
$patchNew4 = @'
  const useMyLocation = async () => {
    setIsResolving(true);
    setLocationError(null);
    try {
      const loc = await getReliableLocation();
      if (loc) {
        setMarkerPosition({ lat: loc.lat, lng: loc.lng });
        setViewState({ ...viewState, longitude: loc.lng, latitude: loc.lat, zoom: 14.5 });
        reverseGeocode(loc.lat, loc.lng);
      } else {
        // FIX: previously did nothing at all here - the button would just
        // stop spinning with zero indication of what happened. This is what
        // "the button fails" meant in practice: GPS and the IP fallback can
        // both genuinely fail (denied permission, dead network, IP lookup
        // rate-limited), and there was no way to tell the difference between
        // "still working" and "gave up."
        setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
      }
    } catch (error) {
       console.error("Geolocation error:", error);
       setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
    } finally {
      setIsResolving(false);
    }
  };
'@
$patchTarget4 = Get-FullPath "src\components\MapModal.jsx"
Patch-File $patchTarget4 $patchOld4 $patchNew4 "MapModal useMyLocation error handling"

$patchOld5 = @'
                mapStyle="mapbox://styles/mapbox/streets-v12"
'@
$patchNew5 = @'
                // Lighter style than streets-v12 - fewer layers to fetch and
                // render, meaningfully faster first paint on patchy mobile
                // connections while still showing roads/labels clearly
                // enough to drop a delivery pin accurately.
                mapStyle="mapbox://styles/mapbox/light-v11"
'@
$patchTarget5 = Get-FullPath "src\components\MapModal.jsx"
Patch-File $patchTarget5 $patchOld5 $patchNew5 "MapModal lighter map style"

$patchOld6 = @'
          <button onClick={useMyLocation} className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-emerald-600 hover:scale-105 active:scale-95 transition-all group z-10 border border-gray-100">
            <Navigation size={22} className="group-hover:rotate-12 transition-transform" />
          </button>

          {/* Overlaid Confirm Footer */}
'@
$patchNew6 = @'
          <button onClick={useMyLocation} disabled={isResolving} className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-emerald-600 hover:scale-105 active:scale-95 transition-all group z-10 border border-gray-100 disabled:opacity-60">
            <Navigation size={22} className="group-hover:rotate-12 transition-transform" />
          </button>

          {locationError && (
            <div className="absolute top-[calc(50%+50px)] right-4 z-10 max-w-[220px] bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl">
              {locationError}
            </div>
          )}

          {/* Overlaid Confirm Footer */}
'@
$patchTarget6 = Get-FullPath "src\components\MapModal.jsx"
Patch-File $patchTarget6 $patchOld6 $patchNew6 "MapModal error message display"

$patchOld7 = @'
               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setFormData(p => ({ ...p, vehicle_type: 'bike' }))}
                    className={`p-5 rounded-2xl border transition-all text-left ${formData.vehicle_type === 'bike' ? "bg-emerald-500/10 border-emerald-500" : "bg-white/[0.03] border-white/10"}`}>
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${formData.vehicle_type === 'bike' ? "bg-emerald-500 text-charcoal-950" : "bg-white/5 text-charcoal-400"}`}>
                       <Truck size={20} />
                     </div>
                     <div className={`font-black text-sm ${formData.vehicle_type === 'bike' ? "text-emerald-500" : "text-ink"}`}>Motorcycle</div>
                     <div className="text-charcoal-500 text-[10px] mt-1">Recommended for Kano</div>
                  </button>
                  <button onClick={() => setFormData(p => ({ ...p, vehicle_type: 'car' }))}
                    className={`p-5 rounded-2xl border transition-all text-left ${formData.vehicle_type === 'car' ? "bg-emerald-500/10 border-emerald-500" : "bg-white/[0.03] border-white/10"}`}>
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${formData.vehicle_type === 'car' ? "bg-emerald-500 text-charcoal-950" : "bg-white/5 text-charcoal-400"}`}>
                       <Truck size={20} />
                     </div>
                     <div className={`font-black text-sm ${formData.vehicle_type === 'car' ? "text-emerald-500" : "text-ink"}`}>Mini Car</div>
                     <div className="text-charcoal-500 text-[10px] mt-1">Faster for big parcels</div>
                  </button>
               </div>
'@
$patchNew7 = @'
               <div className="p-5 rounded-2xl border bg-emerald-500/10 border-emerald-500">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500 text-charcoal-950 shrink-0">
                       <Truck size={20} />
                     </div>
                     <div>
                       <div className="font-black text-sm text-emerald-500">Motorcycle</div>
                       <div className="text-charcoal-500 text-[10px] mt-1">We're starting the pilot with motorcycle riders only - other vehicle types will open up as the fleet grows.</div>
                     </div>
                  </div>
               </div>
'@
$patchTarget7 = Get-FullPath "src\app\rider\onboarding\page.jsx"
Patch-File $patchTarget7 $patchOld7 $patchNew7 "rider onboarding motorcycle-only"

$patchOld8 = @'
const VEHICLES = [
  { id: "bike", label: "Motorcycle", sub: "Faster & cheaper", emoji: "🏍️", badge: "Popular" },
  { id: "car", label: "Car", sub: "Bigger & safer", emoji: "🚗", badge: "Secure" },
];
'@
$patchNew8 = @'
const VEHICLES = [
  { id: "bike", label: "Motorcycle", sub: "Faster & cheaper", emoji: "🏍️", badge: "Popular" },
];
'@
$patchTarget8 = Get-FullPath "src\app\send-package\step-2\page.jsx"
Patch-File $patchTarget8 $patchOld8 $patchNew8 "send-package VEHICLES array"

$patchOld9 = @'
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-3 block">Delivery Type</label>
          <div className="grid grid-cols-2 gap-3">
            {VEHICLES.map(v => (
              <button key={v.id} onClick={() => setVehicle(v.id)}
                className={`p-4 rounded-2xl border-2 flex flex-col gap-2 text-left transition-all active:scale-95 relative overflow-hidden ${vehicle === v.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}>
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest absolute top-3 right-3">{v.badge}</span>
                <span className="text-3xl">{v.emoji}</span>
                <div>
                  <div className={`text-sm font-black ${vehicle === v.id ? "text-ink" : "text-charcoal-200"}`}>{v.label}</div>
                  <div className="text-charcoal-500 text-xs">{v.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
'@
$patchNew9 = @'
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-3 block">Delivery Type</label>
          <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 flex items-center gap-4">
            <span className="text-3xl">{VEHICLES[0].emoji}</span>
            <div className="flex-1">
              <div className="text-sm font-black text-ink">{VEHICLES[0].label}</div>
              <div className="text-charcoal-500 text-xs">Every rider on the pilot fleet right now</div>
            </div>
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{VEHICLES[0].badge}</span>
          </div>
        </div>
'@
$patchTarget9 = Get-FullPath "src\app\send-package\step-2\page.jsx"
Patch-File $patchTarget9 $patchOld9 $patchNew9 "send-package vehicle card render"

$patchOld10 = @'
              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Vehicle Type</label>
                <select 
                  name="vehicle_type"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all appearance-none"
                >
                  <option value="bike">Motorcycle (Bike)</option>
                  <option value="car">Car (Sedan)</option>
                  <option value="van">Van / Small Truck</option>
                </select>
              </div>
'@
$patchNew10 = @'
              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Vehicle Type</label>
                <div className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm flex items-center justify-between">
                  <span>Motorcycle (Bike)</span>
                  <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Only Option - Pilot Fleet</span>
                </div>
                <input type="hidden" name="vehicle_type" value="bike" />
              </div>
'@
$patchTarget10 = Get-FullPath "src\app\ops-terminal\drivers\InviteDriverButton.jsx"
Patch-File $patchTarget10 $patchOld10 $patchNew10 "admin invite form motorcycle-only"


if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "perf: preconnect + prefetch the map bundle ahead of time, lighter map style; fix: silent use-my-location failure now shows an error; restrict vehicle type to motorcycle only"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-batch6\ if needed." -ForegroundColor Green
Write-Host "No Supabase changes needed for this batch." -ForegroundColor Green
