<#
    NaijaDrops - apply-fixes.ps1  (consolidated)
    ------------------------------------------------------------------
    NONE of the fixes from recent sessions have made it into a live
    deploy yet, so this script is now the single, complete source of
    truth - it fully overwrites each file listed below with its final,
    correct version. Every call is safe to re-run: if a file already
    matches, it's skipped.

    Written for Windows PowerShell 5.1 (the version that ships with
    Windows by default) - no PowerShell 7-only syntax is used.

    WHAT'S IN THIS PASS:
      - Pay Now button on Active Orders (src/app/vendor/active-orders/page.jsx)
      - Location accuracy - 12s timeout + jump-rejection helper (src/utils/geolocation.js)
      - Remove Contact Support email (src/app/dashboard/page.jsx)
      - verify-payment real error messages (src/app/api/verify-payment/route.js)
      - Payment page wording + theme (src/app/payment/page.jsx)
      - Public track API - extra fields for receipts/map (src/app/api/track/[orderId]/route.js)
      - New: receipt-specific share button (src/components/ui/ReceiptShareButton.jsx)
      - New: dedicated receipt page (src/app/receipt/[orderId]/page.jsx)
      - Tracking page - stepper, map, share link, redirect to receipt (src/app/tracking/[orderId]/page.jsx)
      - Map - multi-marker bounds fit + route line (src/components/MapCanvas.jsx)
      - New: vendor order-status toast notifications (src/components/OrderStatusNotificationListener.jsx)
      - Fix chat notification vendor/rider id bug (src/components/ChatNotificationListener.jsx)
      - Mount notification listeners globally (src/app/layout.js)
      - Add receipt display name field (src/app/profile/page.jsx)
      - Link delivered orders to receipt page (src/app/vendor/history/page.jsx)
      - Rider live location - watchPosition + jump-rejection (src/components/rider/DriverHeartbeat.jsx)
      - Fix back-button-after-delivery bug + wording (src/app/rider/(main)/active-job/page.jsx)
      - New: visual status stepper component (src/components/ui/OrderStatusStepper.jsx)

    HOW TO RUN:
      1) Copy this file into the ROOT of your project (the folder that
         contains the "src" folder).
      2) Right-click apply-fixes.ps1 -> "Run with PowerShell"
         OR open PowerShell in that folder and run:
           powershell -ExecutionPolicy Bypass -File .\apply-fixes.ps1
      3) Commit and redeploy. Review the .bak backups or `git diff`
         first if you want to see exactly what changed.

    DATABASE: the receipt_display_name column and the service_role
    table-grants fix were already applied directly to your live
    Supabase project in an earlier session - nothing to run there.
#>

$ErrorActionPreference = "Stop"

# NOTE: this project has folders literally named "[orderId]" (Next.js
# dynamic route syntax). Square brackets are wildcard characters to
# PowerShell's default -Path parameter, so EVERY path operation below
# uses -LiteralPath explicitly - without that, Test-Path/Copy-Item would
# silently fail to find files inside those folders.
function Set-WholeFile {
    param(
        [string]$RelativePath,
        [string]$NewContent,
        [string]$Label
    )

    $fullPath = Join-Path -Path (Get-Location) -ChildPath $RelativePath
    $dir = Split-Path -Path $fullPath -Parent

    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if (Test-Path -LiteralPath $fullPath) {
        $existing = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
        if ($existing -eq $NewContent) {
            Write-Host "[OK]   $Label - already applied, nothing to do." -ForegroundColor Green
            return
        }
        $backupPath = "$fullPath.bak"
        if (-not (Test-Path -LiteralPath $backupPath)) {
            Copy-Item -LiteralPath $fullPath -Destination $backupPath
        }
        Set-Content -LiteralPath $fullPath -Value $NewContent -Encoding UTF8 -NoNewline
        Write-Host "[DONE] $Label - updated. Backup saved as $(Split-Path $backupPath -Leaf)" -ForegroundColor Cyan
    } else {
        Set-Content -LiteralPath $fullPath -Value $NewContent -Encoding UTF8 -NoNewline
        Write-Host "[NEW]  $Label - created $RelativePath" -ForegroundColor Magenta
    }
}

Write-Host ""
Write-Host "NaijaDrops - consolidated fix pass" -ForegroundColor White
Write-Host "-----------------------------------"
Write-Host "Run this from your project ROOT (the folder containing 'src')." -ForegroundColor DarkGray
Write-Host ""

# ------------------------------------------------------------------
# Pay Now button on Active Orders
# ------------------------------------------------------------------
$content_0 = @'
﻿"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Package, MapPin, Clock, Loader2, X, ChevronRight, AlertTriangle } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { cancelOrder } from "./actions";

const STATUS_LABELS = {
  pending: "Finding a rider",
  looking_for_driver: "Finding a rider",
  matched: "Rider assigned",
  picked_up: "Picked up",
  in_transit: "On the way",
};

const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  looking_for_driver: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  matched: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  picked_up: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_transit: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const CANCELLABLE = ["pending", "looking_for_driver"];

function CancelModal({ order, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const res = await cancelOrder(order.id, reason);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onCancelled(order.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-400" size={18} />
          </div>
          <div>
            <h3 className="text-ink font-black text-base">Cancel this delivery?</h3>
            <p className="text-charcoal-500 text-xs">No rider has accepted it yet - this is free to cancel.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional: why are you cancelling? (helps us improve)"
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-3 min-h-[80px] text-ink text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Keep Order
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Cancel It
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    let channel;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
      if (!vendor) { setLoading(false); return; }

      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("vendor_id", vendor.id)
        .in("status", ["pending", "looking_for_driver", "matched", "picked_up", "in_transit"])
        .order("created_at", { ascending: false });

      setOrders(data || []);
      setLoading(false);

      channel = supabase
        .channel(`vendor-active-orders-${vendor.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
          () => load())
        .subscribe();
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [supabase, router]);

  const handleCancelled = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setCancelTarget(null);
  };

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 pb-24">
      <div className="sticky top-0 z-20 bg-charcoal-950/90 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-ink font-black text-lg font-outfit">Active Orders</h1>
          <p className="text-charcoal-500 text-xs">{orders.length} in progress</p>
        </div>
      </div>

      <div className="px-5 py-6 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="mx-auto text-charcoal-700 mb-4" size={40} />
            <p className="text-charcoal-500 text-sm">No active orders right now.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-charcoal-400" />
                  <span className="text-ink font-bold text-sm">{order.item_description || "Package"}</span>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_STYLES[order.status] || "bg-charcoal-800 text-charcoal-400 border-white/10"}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span className="truncate">{order.pickup_name}</span>
                </div>
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{order.dropoff_name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-charcoal-600 text-[10px]">
                  <Clock size={11} />
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center gap-2">
                  {CANCELLABLE.includes(order.status) && (
                    <button
                      onClick={() => setCancelTarget(order)}
                      className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  {order.status === "matched" && order.payment_status !== "paid" ? (
                    <button
                      onClick={() => router.push(`/payment?orderId=${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-3 py-2 rounded-lg transition-all active:scale-95"
                    >
                      Pay Now <ChevronRight size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/tracking/${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-all"
                    >
                      Track <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cancelTarget && (
        <CancelModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\app\vendor\active-orders\page.jsx" -NewContent $content_0 -Label "Pay Now button on Active Orders"

# ------------------------------------------------------------------
# Location accuracy - 12s timeout + jump-rejection helper
# ------------------------------------------------------------------
$content_1 = @'
/**
 * Reliable Geolocation Utility
 * Tiered fetching: GPS -> Wifi/Cell -> IP-API Fallback
 *
 * Deterministic accuracy rules used across the app (both the one-time
 * "Use My Location" flow below AND the rider's live-tracking heartbeat in
 * DriverHeartbeat.jsx), tuned for Nigerian mobile networks specifically:
 *
 * 1. GPS/device readings are ALWAYS preferred over IP-based location.
 *    IP geolocation on Nigerian mobile networks resolves to the carrier's
 *    gateway city, not the device - it can be tens of kilometers off, in a
 *    different part of the state entirely. It's used only as an absolute
 *    last resort when the device returns nothing at all.
 * 2. A reading is only trusted immediately if it's excellent (<25m). A
 *    "good enough" reading (25-60m - the common case on budget Android
 *    phones here, indoors or under cloud cover) needs a second confirming
 *    ping first, since a phone's very first GPS fix after a cold start is
 *    often a low-quality "quick fix" that still reports a deceptively
 *    reasonable accuracy number.
 * 3. Give it real time. 12 seconds, not the ~4.5s this used to allow -
 *    enough for a real device fix to come back before ever considering the
 *    IP fallback.
 * 4. For CONTINUOUS tracking (not just a one-time button press - see
 *    isPlausibleMove below), a single wildly-off reading is rejected by a
 *    speed sanity check rather than blindly overwriting the last known-good
 *    position. A rider/vendor physically cannot teleport 10km in 20
 *    seconds; a reading that implies that is noise, not movement.
 */

const DEMO_LOCATION = {
    lat: 12.0022,
    lng: 8.5167,
    accuracy: 10,
    source: 'demo'
};

export async function getReliableLocation(onProgress) {
    return new Promise(async (resolve) => {
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

                    const isExcellent = pos.coords.accuracy < 25;
                    const isGoodAndStable = pos.coords.accuracy < 60 && pingsReceived >= 2;

                    if (isExcellent || isGoodAndStable) {
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

            // FIX: extended from 4500ms to 12000ms. 4500ms was still too
            // short for a device (especially a laptop/desktop or a phone
            // relying on WiFi-based positioning rather than a cold GPS fix)
            // to ever land a reading tight enough to beat the threshold
            // below - so most requests were timing out onto the IP fallback
            // by default. That's exactly what made "Use My Location" (and
            // "Go Online" for riders) resolve to essentially random places.
            // 12s is still fast enough to not feel broken, but gives real
            // device positioning a genuine chance to report back first.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                // ANY real device reading is preferred over the IP fallback,
                // not just tight ones - IP is used only when we truly got
                // nothing from the device at all.
                if (bestReading) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else {
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 12000);

        } else {
            const ipLoc = await getIPLocation();
            resolve(ipLoc);
        }
    });
}

/**
 * Haversine distance between two lat/lng points, in meters.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Deterministic jump-rejection for continuous tracking (the rider
 * heartbeat). Returns false if the implied speed between two readings is
 * physically impossible for a bike/car courier, meaning the NEW reading is
 * almost certainly noise (a bad single-shot GPS fix, or a network-position
 * fallback landing far away) and should be discarded in favor of keeping
 * the last known-good position.
 *
 * maxSpeedKph defaults to 100 - generous enough to never reject genuine
 * motorbike/car movement in city traffic, but tight enough to catch the
 * multi-kilometer "teleports" that show up as a rider's dot jumping across
 * the map on a bad reading.
 */
export function isPlausibleMove(prev, next, maxSpeedKph = 100) {
    if (!prev || !next) return true; // nothing to compare against yet - accept it
    const elapsedHours = (next.timestamp - prev.timestamp) / 3600000;
    if (elapsedHours <= 0) return true;
    const meters = distanceMeters(prev.lat, prev.lng, next.lat, next.lng);
    const impliedKph = (meters / 1000) / elapsedHours;
    return impliedKph <= maxSpeedKph;
}

/**
 * @deprecated No longer used anywhere in the app as of this fix. This was a
 * bare one-shot navigator.geolocation.getCurrentPosition() call with a flat
 * 10s timeout and zero fallback - on weak/indoor GPS signal it just failed
 * outright, which is what made "use my location" buttons feel unreliable.
 * Every location button in the app now calls getReliableLocation() above
 * instead. Left in place only in case anything outside this codebase still
 * imports it directly - safe to delete once confirmed unused.
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

Set-WholeFile -RelativePath "src\utils\geolocation.js" -NewContent $content_1 -Label "Location accuracy - 12s timeout + jump-rejection helper"

# ------------------------------------------------------------------
# Remove Contact Support email
# ------------------------------------------------------------------
$content_2 = @'
﻿"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Package, 
  Clock, 
  ChevronRight, 
  AlertCircle, 
  Loader2, 
  Marker as MarkerIcon,
  Navigation,
  Star,
  ShieldCheck,
  CheckCircle2,
  Truck,
  MapPin,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Phone,
  FileText,
  History as HistoryIcon
} from "lucide-react";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { warmMapBundle } from "@/utils/warmMapBundle";
import { getReliableLocation } from "@/utils/geolocation";

const KANO_CENTER = { lat: 12.0022, lng: 8.5920 };

const STATUS_CONFIG = {
  pending: { label: "Searching", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", icon: <Clock size={16} /> },
  assigned: { label: "Rider Found", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", icon: <Truck size={16} /> },
  picked_up: { label: "Picked Up", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <Package size={16} /> },
  in_transit: { label: "In Transit", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <Navigation size={16} /> },
};

import { Camera, Image as ImageIcon } from "lucide-react";

// ─── Profile Completion Modal ────────────────────────────────────────────────
function ProfileModal({ isOpen, onClose, onSave, currentName, currentAvatar }) {
  const [name, setName] = useState(currentName || "");
  const [avatar, setAvatar] = useState(currentAvatar || "");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setName(currentName || "");
      setAvatar(currentAvatar || "");
      setLoading(false);
    }
  }, [isOpen, currentName, currentAvatar]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatar(publicUrl);
    } catch (error) {
      alert("Error uploading image: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-charcoal-950/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} 
        className="relative w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
        
        <div className="text-center">
            <h2 className="text-2xl font-black text-ink italic uppercase tracking-tighter font-outfit">Identity Profile</h2>
            <p className="text-charcoal-500 text-xs mt-2 uppercase font-bold tracking-widest">Help riders find you faster</p>
        </div>

        {/* Avatar Upload */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-charcoal-950 border-2 border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
              {avatar ? (
                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={40} className="text-charcoal-800" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-charcoal-950/60 flex items-center justify-center">
                  <Loader2 className="animate-spin text-emerald-500" />
                </div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
              <Camera size={16} className="text-charcoal-950" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>
          <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">Click to upload photo</span>
        </div>
        
        <div className="space-y-4">
           <div>
              <label className="text-[10px] font-black text-charcoal-600 uppercase tracking-widest block mb-2 px-1">Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-charcoal-950 border border-white/10 rounded-2xl px-5 py-4 text-ink font-bold focus:border-emerald-500 transition-all outline-none"
              />
           </div>
           
           <button 
             onClick={async () => { 
               setLoading(true); 
               try {
                 await onSave(name, avatar); 
               } finally {
                 setLoading(false);
               }
             }}
             disabled={loading || uploading || !name}
             className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-glow disabled:opacity-50"
           >
             {loading ? <Loader2 className="animate-spin mx-auto" /> : "Save Profile"}
           </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Menu Modal ─────────────────────────────────────────────────────────────
function MenuModal({ isOpen, onClose, onLogout, onProfile, userAvatar }) {
  const router = useRouter();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-end p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-charcoal-950/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
        className="relative w-full max-w-[280px] bg-charcoal-900 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
           <span className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Menu</span>
           <button onClick={onClose} className="p-2 text-charcoal-500 hover:text-ink transition-colors"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
           <button onClick={() => { onProfile(); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-ink transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all overflow-hidden">
                {userAvatar ? <img src={userAvatar} className="w-full h-full object-cover" /> : <UserIcon size={20} />}
              </div>
              <span className="font-bold text-sm">Identity Profile</span>
           </button>

           <button onClick={() => { router.push("/vendor/history"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-ink transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all">
                <HistoryIcon size={20} />
              </div>
              <span className="font-bold text-sm">Order History</span>
           </button>

           <button onClick={() => { router.push("/rider/onboarding"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 text-emerald-500 transition-all group text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="font-black text-sm uppercase tracking-tight">Become a Rider</div>
                <div className="text-[9px] font-bold opacity-60 uppercase tracking-widest">Verify & Earn</div>
              </div>
           </button>

           <div className="h-px bg-white/5 my-2" />

           <div className="px-4 py-2">
              <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Support</span>
           </div>

           <a href="https://wa.me/2349118267433" target="_blank" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-emerald-500/10 text-emerald-400 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Phone size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">WhatsApp Help</div>
                <div className="text-[10px] opacity-60">09118267433</div>
              </div>
           </a>

           <button onClick={() => { router.push("/terms"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-charcoal-400 transition-all">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <span className="font-bold text-sm text-charcoal-400">Terms & Conditions</span>
           </button>

           <div className="h-px bg-white/5 my-2" />

           <button onClick={onLogout} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-500/10 text-charcoal-400 hover:text-red-400 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-red-500 group-hover:text-charcoal-950 transition-all">
                <LogOut size={20} />
              </div>
              <span className="font-bold text-sm">Sign Out</span>
           </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [user, setUser] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);
  // Distinct from latestOrder (most recent by date, any status) - this is
  // specifically the most recent order that is still active, used to make the
  // "Active" badge actually navigate somewhere real when tapped.
  const [latestActiveOrder, setLatestActiveOrder] = useState(null);
  const [userLocation, setUserLocation] = useState(KANO_CENTER);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [greeting, setGreeting] = useState("Good day");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
  }, []);

  async function loadData() {
    // 1. Get User
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    setUser(u);

    // 2. Get User Profile Name & Avatar
    const { data: profile } = await supabase.from("users").select("name, avatar_url").eq("id", u.id).single();
    if (profile?.name) {
      setDisplayName(profile.name.split(" ")[0]);
      setAvatarUrl(profile.avatar_url || "");
    } else {
      // Auto-open modal if profile is empty
      setIsProfileModalOpen(true);
    }

    // 3. Get Vendor Profile (to get the correct vendor_id)
    const { data: vendorProfile } = await supabase.from("vendors").select("id").eq("user_id", u.id).single();
    const vendorId = vendorProfile?.id;

    // 4. Get Orders using the correct Vendor ID
    if (vendorId) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, pickup_name, dropoff_name, agreed_price, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (orders) {
        const active = orders.filter(o => ["pending", "matched", "picked_up", "in_transit"].includes(o.status));
        setActiveOrderCount(active.length);
        setLatestOrder(orders[0] || null);
        setLatestActiveOrder(active[0] || null);
      }
    }
  }

  useEffect(() => {
    loadData();

    // FIX: standardized on the same reliable/tiered location helper used
    // everywhere else in the app (GPS -> better GPS reading -> IP
    // fallback) instead of a bare getCurrentPosition() call with no
    // timeout and no fallback, which could hang indefinitely on a weak
    // signal and never resolve at all. This is a passive background fetch
    // (no button, no error shown) so it just quietly does nothing if
    // location truly can't be resolved.
    getReliableLocation().then(loc => {
      if (loc) setUserLocation({ lat: loc.lat, lng: loc.lng });
    });
  }, []);

  const handleUpdateProfile = async (name, avatar) => {
    const { error } = await supabase.from("users").update({ 
      name: name,
      avatar_url: avatar 
    }).eq("id", user.id);
    
    if (!error) {
       setIsProfileModalOpen(false);
       loadData();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <div className="h-[100dvh] w-full relative overflow-hidden bg-charcoal-950">
      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
        onSave={handleUpdateProfile} 
        currentName={displayName}
        currentAvatar={avatarUrl}
      />

      <AnimatePresence>
        {isMenuOpen && (
          <MenuModal 
            isOpen={isMenuOpen} 
            onClose={() => setIsMenuOpen(false)} 
            onLogout={handleLogout}
            onProfile={() => setIsProfileModalOpen(true)}
            userAvatar={avatarUrl}
          />
        )}
      </AnimatePresence>

      {/* Full-screen Mapbox Map */}
      <div className="absolute inset-0 z-0">
        {mapboxToken ? (
          <Map
            mapboxAccessToken={mapboxToken}
            initialViewState={{ longitude: userLocation.lng, latitude: userLocation.lat, zoom: 13 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onLoad={() => setMapLoaded(true)}
          >
            {/* User location pin */}
            <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
              <div className="relative">
                <div className="w-5 h-5 bg-emerald-500 rounded-full border-4 border-white shadow-[0_0_16px_rgba(16,185,129,0.8)]" />
                <div className="absolute inset-0 w-5 h-5 bg-emerald-400 rounded-full animate-ping opacity-40" />
              </div>
            </Marker>
          </Map>
        ) : (
          <div className="w-full h-full bg-charcoal-900 flex items-center justify-center">
            <div className="text-charcoal-600 text-sm font-medium">Map loading...</div>
          </div>
        )}
      </div>

      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-charcoal-950/80 to-transparent z-10 pointer-events-none" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-6 pt-14 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-charcoal-900 border border-white/10 overflow-hidden flex items-center justify-center shadow-xl">
               {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-charcoal-600" size={20} />}
             </div>
             <div>
               <p className="text-charcoal-400 text-[10px] font-bold uppercase tracking-widest leading-none mb-1">{greeting}</p>
               <h1 className="text-ink font-black text-xl tracking-tight font-outfit leading-none">
                 {displayName || "Dashboard"}
               </h1>
             </div>
          </div>
          <div className="flex items-center gap-3">
            {activeOrderCount > 0 && (
              <button
                onClick={() => router.push("/vendor/active-orders")}
                className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-emerald-500/30 transition-all active:scale-95"
              >
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">{activeOrderCount} Active</span>
              </button>
            )}
            <button onClick={() => setIsMenuOpen(true)} className="w-12 h-12 bg-charcoal-900 border border-white/10 rounded-2xl text-ink flex items-center justify-center hover:bg-white/5 transition-all shadow-xl">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        <div className="absolute inset-x-0 bottom-0 h-[400px] bg-gradient-to-t from-charcoal-950 via-charcoal-950/95 to-transparent pointer-events-none" />

        <div className="relative px-5 pb-8 pt-6 space-y-4">
          {/* PRIMARY CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/send-package/step-1")}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-6 rounded-3xl flex items-center justify-center gap-3 text-xl uppercase tracking-wider shadow-[0_0_32px_rgba(16,185,129,0.4)] transition-all mb-4"
          >
            <Package size={24} strokeWidth={2.5} />
            Send Package
          </motion.button>
        </div>
      </div>

      {/* Pilot zone label */}
      {mapLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
        >
          <div className="bg-charcoal-950/60 backdrop-blur-sm border border-emerald-500/20 rounded-full px-4 py-1.5">
            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">🟢 Kano Pilot Zone Active</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}


'@

Set-WholeFile -RelativePath "src\app\dashboard\page.jsx" -NewContent $content_2 -Label "Remove Contact Support email"

# ------------------------------------------------------------------
# verify-payment real error messages
# ------------------------------------------------------------------
$content_3 = @'
﻿import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with the SERVICE ROLE key to bypass RLS for secure updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { reference, orderId } = await req.json();

    if (!reference || !orderId) {
      return NextResponse.json({ error: 'Missing reference or orderId' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('dummy')) {
      console.error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing/placeholder - verify-payment cannot look up or update orders. Set it in .env.local and in Vercel Production env vars, then redeploy.');
      return NextResponse.json({ error: 'Payment verification is misconfigured on the server (missing Supabase service role key). Contact support before retrying.' }, { status: 500 });
    }

    if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('dummy')) {
        console.warn('Using dummy verification due to missing PAYSTACK_SECRET_KEY');
        // FALLBACK FOR DEV: If no secret key is set, simulate success but warn clearly
        return simulateSuccess(reference, orderId);
    }

    // 1. Verify payment with Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const paystackData = await paystackRes.json();

    // FIX: a non-2xx response from Paystack here (most commonly 401, when
    // PAYSTACK_SECRET_KEY is present but wrong - e.g. a live key paired with
    // a pk_test_ public key, or a stale/revoked key) used to fall through
    // to the generic !paystackData.status check below with whatever vague
    // message Paystack's error body happened to contain. Checking res.ok
    // explicitly first means a bad secret key now reports plainly as an
    // auth problem instead of a confusing "verification failed".
    if (!paystackRes.ok) {
      console.error('Paystack verify call failed:', paystackRes.status, paystackData);
      if (paystackRes.status === 401) {
        return NextResponse.json({ error: 'Payment gateway rejected the request (invalid PAYSTACK_SECRET_KEY). Check the key in Vercel env vars.' }, { status: 502 });
      }
      return NextResponse.json({ error: paystackData?.message || 'Could not reach the payment gateway to verify this transaction.' }, { status: 502 });
    }

    if (!paystackData.status) {
      return NextResponse.json({ error: paystackData.message || 'Verification failed' }, { status: 400 });
    }

    const { status: txStatus, amount: paidAmount, currency } = paystackData.data;

    if (txStatus !== 'success') {
      return NextResponse.json({ error: `Transaction is ${txStatus}` }, { status: 400 });
    }

    // FIX: this was never actually checked before - a transaction that came
    // back in a currency other than NGN (shouldn't normally happen given
    // initializePaystack() hardcodes currency: 'NGN', but a tampered client
    // request or a misconfigured Paystack account could produce one) would
    // still pass the kobo comparison below since it only looks at the raw
    // numeric amount, regardless of what currency that number is actually
    // denominated in.
    if (currency !== 'NGN') {
      console.error(`Unexpected transaction currency: ${currency} for reference ${reference}`);
      return NextResponse.json({ error: `Unexpected transaction currency (${currency})` }, { status: 400 });
    }

    // 2. Fetch the order from Supabase to verify the amount
    // FIX: payment_status wasn't in this select at all, so the "already
    // marked as paid" check further down was comparing against `undefined`
    // every single time - it could never actually short-circuit a repeat
    // verification call, meaning a double-fired webhook+client verification
    // (or a user re-submitting) would regenerate a brand new delivery PIN
    // and silently invalidate whatever PIN the rider/recipient already had.
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('agreed_price, status, payment_status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
        console.error('verify-payment: order lookup failed for orderId', orderId, orderErr);
        return NextResponse.json({ error: orderErr ? `Order lookup failed: ${orderErr.message}` : 'Order not found' }, { status: 404 });
    }

    // FIX: agreed_price is a nullable column. If it were ever null here,
    // `null * 100` evaluates to 0, and the amount check below
    // (`paidAmount < expectedAmountKobo`) would then pass for literally any
    // paid amount, including ₦0 - the check would exist in the code but be
    // silently meaningless for that order. Fail loudly instead.
    if (!order.agreed_price || order.agreed_price <= 0) {
      console.error(`Order ${orderId} has no valid agreed_price (${order.agreed_price}) - refusing to verify payment against it.`);
      return NextResponse.json({ error: 'This order has no valid agreed price on file. Contact support before retrying payment.' }, { status: 409 });
    }

    // Paystack returns amount in kobo (multiply Naira by 100)
    const expectedAmountKobo = order.agreed_price * 100;

    // FIX: kept as a "paid less than agreed" check rather than requiring an
    // exact match, so a legitimate overpayment (e.g. a stale price shown
    // client-side for a second before a debounced recalculation) isn't
    // rejected - but anything short of the agreed price is refused outright
    // rather than silently accepted.
    if (paidAmount < expectedAmountKobo) {
        console.error(`Amount mismatch for order ${orderId}: paid ${paidAmount} kobo, expected at least ${expectedAmountKobo} kobo (agreed_price=${order.agreed_price}).`);
        return NextResponse.json({ error: 'Amount paid is less than the agreed price for this order.' }, { status: 400 });
    }

    if (order.payment_status === 'paid') {
        return NextResponse.json({ success: true, message: 'Already marked as paid' });
    }

    // 3. Update the order safely using the Admin connection
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

    const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function simulateSuccess(reference, orderId) {
     const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
     const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) return NextResponse.json({ error: 'Simulated update failed', details: updateErr }, { status: 500 });
    return NextResponse.json({ success: true });
}
'@

Set-WholeFile -RelativePath "src\app\api\verify-payment\route.js" -NewContent $content_3 -Label "verify-payment real error messages"

# ------------------------------------------------------------------
# Payment page wording + theme
# ------------------------------------------------------------------
$content_4 = @'
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, ShieldCheck, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { loadPaystackScript, initializePaystack } from '@/utils/paystack';
import { motion, AnimatePresence } from 'framer-motion';

import { Suspense } from 'react';

function PaymentContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get('orderId');
    const supabase = createClient();

    const [driverData, setDriverData] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [paystackError, setPaystackError] = useState(null);
    // FIX: this used to fire loadPaystackScript() and forget about it - no
    // state tracked whether it actually finished, so a fast click on "Pay
    // Now" (or a slow connection) could hit initializePaystack() before
    // window.PaystackPop existed yet, showing "gateway failed to load" even
    // though it would have worked a moment later. Now the button itself
    // reflects real load state: disabled + spinning while loading, a clear
    // error if the script genuinely fails to load, and only enabled once
    // Paystack's SDK has actually confirmed ready.
    const [paystackReady, setPaystackReady] = useState(false);
    const [paystackLoadFailed, setPaystackLoadFailed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [loading, setLoading] = useState(true);

    // FIX: this used to be inlined directly in the mount effect below with
    // no way to run it again - if the Paystack script genuinely failed to
    // load (ad-blocker, flaky connection, anything blocking a third-party
    // script), the "Couldn't load the payment gateway" error would show,
    // but the only way forward was a full page reload, and the "Pay Now"
    // button itself just stayed on "Loading Secure Gateway..." forever with
    // no click doing anything - which is exactly what looks like "I click
    // it and nothing happens." Pulling this out into its own function lets
    // the retry button below re-run the exact same load attempt in place.
    const attemptLoadPaystack = () => {
        setPaystackLoadFailed(false);
        loadPaystackScript().then((ok) => {
            setPaystackReady(!!ok);
            setPaystackLoadFailed(!ok);
        });
        // Safety net: if the script request itself never fires onload or
        // onerror at all (e.g. blocked entirely by an ad/tracker
        // blocker rather than cleanly failing), the button would
        // otherwise be stuck on "Loading Secure Gateway..." forever
        // with no way forward.
        setTimeout(() => {
            setPaystackReady((ready) => {
                if (!ready) setPaystackLoadFailed(true);
                return ready;
            });
        }, 8000);
    };

    useEffect(() => {
        if (!orderId) {
            router.push('/send');
            return;
        }

        async function fetchPaymentDetails() {
            attemptLoadPaystack();

            try {
                const { data: order, error: orderErr } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                if (orderErr) throw orderErr;
                setOrderData(order);

                if (order.rider_id) {
                    // FIX: orders.rider_id is a foreign key to riders.id, not
                    // riders.user_id - querying by user_id here meant this
                    // .single() lookup almost never matched anything, threw,
                    // and got swallowed by the outer catch, so the assigned
                    // rider's name silently never showed up (fell back to
                    // the generic "Rider" label instead).
                    const { data: driver, error: driverErr } = await supabase
                        .from('riders')
                        .select('*, users(full_name, receipt_display_name)')
                        .eq('id', order.rider_id)
                        .single();

                    if (driverErr) throw driverErr;
                    setDriverData({ ...driver, full_name: driver?.users?.receipt_display_name || driver?.users?.full_name });
                }
            } catch (err) {
                console.error("Fetch payment details failed", err);
            } finally {
                setLoading(false);
            }
        }

        fetchPaymentDetails();
    }, [orderId, supabase, router]);

    const handleInitiatePayment = () => {
        if (!paystackReady) return;
        setPaystackError(null);
        // FIX: orders has no user_id column at all (never has - vendor and
        // customer flows both only ever set vendor_id), so this was always
        // undefined and every transaction showed up in Paystack's dashboard
        // under the exact same generic email, making real transactions
        // impossible to tell apart. Keying it to the order's actual
        // vendor_id at least makes each vendor's payments distinguishable.
        const userEmail = orderData.vendor_id ? `vendor-${orderData.vendor_id}@naijadrops.com` : 'customer@naijadrops.com';

        initializePaystack({
            email: userEmail,
            amount: orderData.agreed_price,
            reference: `ND_${Date.now()}_${orderId.slice(0, 5)}`,
            onSuccess: (response) => {
                handleRealPaymentSuccess(response.reference);
            },
            onClose: () => {
                console.log("Paystack closed");
            },
            onError: (message) => {
                setPaystackError(message);
            }
        });
    };

    const handleRealPaymentSuccess = async (reference) => {
        setIsProcessing(true);
        try {
            const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, orderId })
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.error || 'Verification failed');

            setIsSuccess(true);
            setIsProcessing(false);

            setTimeout(() => {
                router.push(`/tracking/${orderId}`);
            }, 2000);
        } catch (err) {
            console.error(err);
            setPaystackError(`Payment verification failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    // FIX: removed the fake "OPay" payment path entirely. It used to fake
    // a Paystack-style reference (ND_OPAY_...) and mark the order paid via
    // /api/verify-payment's dev-only simulateSuccess fallback - but the
    // moment a real PAYSTACK_SECRET_KEY is configured (which is the whole
    // point of "fully wiring up" this integration), that verify call tries
    // to check the fake reference against Paystack's real API, which
    // correctly rejects it as a transaction that never happened. So this
    // button would go from "fake-successful" in dev to permanently broken
    // the moment real payments were turned on - and even before that, no
    // actual money was ever collected through it, just a UI simulation.
    // Paystack's own real checkout already supports card, bank transfer,
    // USSD, and mobile money as channels within one verified transaction,
    // so there's no coverage lost by removing the separate fake button -
    // just one single, real, fully verified payment path now.

    const handleCancelOrder = async () => {
        if (!window.confirm("Cancel this order? The rider will be notified right away.")) return;

        try {
            await supabase
                .from('orders')
                .update({ status: 'cancelled' })
                .eq('id', orderId);

            router.push('/');
        } catch (err) {
            console.error("Cancellation failed", err);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-10 font-black tracking-tight text-ink">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-emerald-500" size={40} />
                <p>Loading your order...</p>
            </div>
        </div>
    );

    if (!orderData) return <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-10 text-red-400 font-black text-center">We couldn't find this order. Check the link and try again.</div>;

    return (
        <main className="bg-charcoal-950 min-h-[100dvh] relative overflow-hidden flex flex-col items-center justify-start py-20 px-4">
            <div className="w-full max-w-lg z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-12">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-ink hover:bg-white/10 transition-all group"
                    >
                        <ArrowLeft size={22} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2">
                        <Lock size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-ink uppercase tracking-[0.3em]">Secure Checkout</span>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isSuccess ? (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white/[0.03] border border-emerald-500/20 backdrop-blur-xl rounded-3xl p-12 text-center shadow-premium"
                        >
                            <div className="w-24 h-24 bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
                                <CheckCircle2 size={56} className="stroke-[3]" />
                            </div>
                            <h1 className="text-4xl font-black text-ink mb-4 tracking-tight">Payment Successful</h1>
                            <p className="text-charcoal-400 font-medium text-sm mb-10 leading-relaxed">
                                {driverData?.full_name || 'Your rider'} has been notified and can now head to pickup.
                                <br />Estimated arrival: <span className="text-emerald-500 font-bold">30-50 minutes</span>
                            </p>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] inline-block animate-pulse">
                                Taking you to your order...
                            </div>
                        </motion.div>
                    ) : (
                        <div className="space-y-8">
                            {/* Summary Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-premium relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
                                <div className="text-center mb-8">
                                    <div className="text-[10px] font-black text-charcoal-400 uppercase tracking-[0.3em] mb-2">Delivery Fare</div>
                                    <div className="text-6xl font-black text-ink tracking-tighter">₦{orderData.agreed_price?.toLocaleString()}</div>
                                </div>
                                <div className="bg-black/20 rounded-2xl p-5 space-y-3 border border-white/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Delivery Type</span>
                                        <span className="font-black text-xs text-ink uppercase">Package Delivery</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Rider</span>
                                        <span className="font-black text-xs text-emerald-500 uppercase flex items-center gap-2">
                                            <ShieldCheck size={14} /> {driverData?.full_name || 'Assigned rider'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Payment Action - single, real Paystack path. Paystack's own
                                checkout already presents card, bank transfer, USSD, and
                                mobile money as channels inside one verified transaction,
                                so there's nothing missing by not having a separate fake
                                "OPay" button next to it. */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="space-y-4"
                            >
                                <div className="bg-white/[0.03] border border-blue-500/20 rounded-2xl p-6 flex items-center gap-5">
                                    <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 shrink-0">
                                        <CreditCard size={28} />
                                    </div>
                                    <div>
                                        <div className="font-black text-lg tracking-tight text-ink">Pay with Paystack</div>
                                        <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mt-1">Card, Bank Transfer, USSD & Mobile Money</div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Action Area */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="pt-4 space-y-6"
                            >
                                {paystackError && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <p className="text-red-400 text-xs font-medium leading-relaxed">{paystackError}</p>
                                    </div>
                                )}

                                {paystackLoadFailed && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <div className="flex-1">
                                            <p className="text-red-400 text-xs font-medium leading-relaxed mb-2">Couldn't load the payment gateway. This is usually an ad-blocker or privacy extension blocking a third-party script, or a flaky connection. Try disabling any ad-blocker for this site, then retry.</p>
                                            <button
                                                onClick={attemptLoadPaystack}
                                                className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-widest underline underline-offset-2 transition-colors"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleInitiatePayment}
                                    disabled={!paystackReady || isProcessing}
                                    className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-3 shadow-premium active:scale-95 relative group ${
                                        (!paystackReady || isProcessing) ? 'bg-white/10 text-white/30 cursor-not-allowed border border-white/5' :
                                        'bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 hover:shadow-glow'
                                    }`}
                                >
                                    <span className="relative z-10 flex items-center gap-3">
                                        {isProcessing ? (
                                            <><Loader2 size={22} className="animate-spin" /> Verifying...</>
                                        ) : !paystackReady ? (
                                            <><Loader2 size={22} className="animate-spin" /> Loading Secure Gateway...</>
                                        ) : (
                                            <>Pay ₦{orderData.agreed_price?.toLocaleString()} Now <ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" /></>
                                        )}
                                    </span>
                                </button>

                                <button
                                    onClick={handleCancelOrder}
                                    className="w-full py-4 bg-white/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all border border-white/10 hover:border-red-500/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <AlertTriangle size={14} /> Cancel Order
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[160px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-blue-500/10 rounded-full blur-[160px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
        </main>
    );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-10 font-black text-ink animate-in fade-in">Loading...</div>}>
      <PaymentContent />
    </Suspense>
  );
}
'@

Set-WholeFile -RelativePath "src\app\payment\page.jsx" -NewContent $content_4 -Label "Payment page wording + theme"

# ------------------------------------------------------------------
# Public track API - extra fields for receipts/map
# ------------------------------------------------------------------
$content_5 = @'
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS intentionally, because this route is the ONLY
// path an anonymous customer (no account) can use to check their delivery. It must
// never return anything beyond the fields explicitly selected below.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req, { params }) {
  const { orderId } = params;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, status, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, item_description,
      created_at, updated_at, agreed_price, rider_id,
      riders ( id, current_lat, current_lng, users ( full_name, receipt_display_name ) ),
      vendors ( users ( receipt_display_name ) )
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Deliberately narrow response: never leak recipient_phone, notes, voice_note_url,
  // or the vendor's real business_name/account identity to an anonymous requester.
  // The one exception is receipt_display_name - that's a name the vendor
  // explicitly chose to show on receipts (set in their profile), so surfacing
  // it here is the whole point of that field rather than a leak.
  const safePayload = {
    id: order.id,
    status: order.status,
    pickup_name: order.pickup_name,
    pickup_lat: order.pickup_lat,
    pickup_lng: order.pickup_lng,
    dropoff_name: order.dropoff_name,
    dropoff_lat: order.dropoff_lat,
    dropoff_lng: order.dropoff_lng,
    item_description: order.item_description,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_price: order.status === 'delivered' ? order.agreed_price : null,
    sender_display_name: order.vendors?.users?.receipt_display_name || null,
    rider: order.riders ? {
      first_name: (order.riders.users?.receipt_display_name || order.riders.users?.full_name || 'Rider').split(' ')[0],
      current_lat: order.riders.current_lat,
      current_lng: order.riders.current_lng
    } : null
  };

  return NextResponse.json({ success: true, order: safePayload });
}
'@

Set-WholeFile -RelativePath "src\app\api\track\[orderId]\route.js" -NewContent $content_5 -Label "Public track API - extra fields for receipts/map"

# ------------------------------------------------------------------
# New: receipt-specific share button
# ------------------------------------------------------------------
$content_6 = @'
"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

/**
 * Shares THIS specific delivery receipt (its own URL + a short summary of
 * this order) - deliberately separate from the generic ShareButton used on
 * the landing page, which shares the marketing site instead. Mixing the two
 * up is exactly what made the old "Share" button on the receipt view feel
 * generic instead of about the actual delivery that just happened.
 */
export default function ReceiptShareButton({ itemDescription, price, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const priceText = price ? ` (₦${Number(price).toLocaleString()})` : "";
    const text = `Delivery receipt${itemDescription ? ` for ${itemDescription}` : ""}${priceText} — delivered via NaijaDrops.`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "NaijaDrops delivery receipt", text, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // ignore - nothing else we can do without navigator.share or clipboard
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 ${className}`}
    >
      {copied ? <><Check size={16} className="text-emerald-500" /> Link Copied</> : <><Share2 size={16} /> Share Receipt</>}
    </button>
  );
}
'@

Set-WholeFile -RelativePath "src\components\ui\ReceiptShareButton.jsx" -NewContent $content_6 -Label "New: receipt-specific share button"

# ------------------------------------------------------------------
# New: dedicated receipt page
# ------------------------------------------------------------------
$content_7 = @'
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { CheckCircle2, Package, Printer, Star, ArrowRight, Sparkles } from 'lucide-react';
import ReceiptShareButton from '@/components/ui/ReceiptShareButton';
import ReviewModal from '@/components/ReviewModal';

export default function ReceiptPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(users(full_name, receipt_display_name)), vendors(business_name, logo_url, users(receipt_display_name))')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          return;
        }
      }

      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
  }, [orderId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-ink font-black text-xl mb-2">Receipt not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again.</p>
      </div>
    );
  }

  if (order.status !== 'delivered') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6 gap-6">
        <div>
          <p className="text-ink font-black text-xl mb-2">This order hasn't been delivered yet</p>
          <p className="text-charcoal-400 text-sm">The receipt shows up here as soon as it's marked delivered.</p>
        </div>
        <button
          onClick={() => router.push(`/tracking/${orderId}`)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black text-sm px-6 py-3 rounded-2xl transition-all active:scale-95"
        >
          Track this delivery <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const riderName = order.riders?.users?.receipt_display_name || order.riders?.users?.full_name || order.rider?.first_name || null;
  // Deliberately: anonymous (customer-side) receipts only ever see a
  // sender name the vendor explicitly opted into showing on receipts
  // (sender_display_name from the public track API) - never their real
  // business_name unless that's what they chose to set as their receipt name.
  const senderName = isVendorView
    ? (order.vendors?.users?.receipt_display_name || order.vendors?.business_name || null)
    : (order.sender_display_name || null);
  const senderLogo = isVendorView ? (order.vendors?.logo_url || null) : null;
  const commission = isVendorView && order.agreed_price ? Math.round(order.agreed_price * 0.20) : null;
  const total = Number(order.agreed_price ?? order.total_price ?? 0);

  return (
    <div className="min-h-screen bg-charcoal-950 print:bg-white">
      {/* Vibrant hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-charcoal-950 pt-16 pb-24 px-6 print:hidden">
        <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-charcoal-950/30 rounded-full blur-3xl"></div>
        <Sparkles className="absolute top-8 right-10 text-white/20" size={40} />
        <Sparkles className="absolute bottom-16 left-16 text-white/20" size={24} />

        <div className="relative max-w-md mx-auto text-center">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <CheckCircle2 className="text-emerald-500" size={44} />
          </div>
          <p className="text-white/70 font-black text-[10px] uppercase tracking-[0.3em] mb-2">Delivered Successfully</p>
          <p className="text-white font-black text-5xl tracking-tighter">₦{total.toLocaleString()}</p>
          <p className="text-white/60 text-xs font-bold mt-2">{new Date(order.updated_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 -mt-14 pb-16 print:mt-0 print:px-0">
        <div className="bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 space-y-6 shadow-premium print:bg-white print:border-none print:shadow-none print:text-black">

          {(senderName || senderLogo) && (
            <div className="flex flex-col items-center text-center gap-3 pb-4 border-b border-white/10 print:border-charcoal-300">
              {senderLogo ? (
                <img src={senderLogo} alt={senderName || 'Sender'} className="w-14 h-14 rounded-2xl object-cover border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-lg">
                  {(senderName || 'ND').slice(0, 2).toUpperCase()}
                </div>
              )}
              {senderName && <p className="text-ink font-black text-lg print:text-black">{senderName}</p>}
              <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Sent via NaijaDrops</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm mb-1"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold print:text-black">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink font-bold print:text-black text-right">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink font-bold print:text-black text-right">{order.dropoff_name}</span></div>
            {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold print:text-black">{riderName}</span></div>}
            <div className="flex justify-between text-sm pt-3 border-t border-white/10 print:border-charcoal-300"><span className="text-charcoal-400">Total Paid</span><span className="text-emerald-400 font-black text-lg print:text-black">₦{total.toLocaleString()}</span></div>
            {isVendorView && commission !== null && (
              <div className="flex justify-between text-sm opacity-70"><span className="text-charcoal-400">Platform Commission (20%)</span><span className="text-ink print:text-black">₦{commission.toLocaleString()}</span></div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-2 print:hidden">
            <div className="grid grid-cols-2 gap-3">
              <ReceiptShareButton itemDescription={order.item_description} price={total} />
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
              >
                <Printer size={16} /> Print
              </button>
            </div>
            {isVendorView && riderName && (
              <button
                onClick={() => setShowReview(true)}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95"
              >
                <Star size={16} /> Rate this delivery
              </button>
            )}
            {isVendorView && (
              <button
                onClick={() => router.push('/vendor/active-orders')}
                className="text-charcoal-400 hover:text-ink text-xs font-bold text-center pt-1 transition-colors"
              >
                Back to active orders
              </button>
            )}
          </div>
        </div>
      </div>

      {isVendorView && riderName && (
        <ReviewModal
          order={order}
          driverProfile={{ full_name: riderName }}
          reviewerId={currentUserId}
          isOpen={showReview}
          onClose={() => setShowReview(false)}
        />
      )}
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\app\receipt\[orderId]\page.jsx" -NewContent $content_7 -Label "New: dedicated receipt page"

# ------------------------------------------------------------------
# Tracking page - stepper, map, share link, redirect to receipt
# ------------------------------------------------------------------
$content_8 = @'
﻿"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, MessageCircle, Share2, Radar, X, AlertTriangle, CreditCard, Check } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import OrderStatusStepper from '@/components/ui/OrderStatusStepper';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import Skeleton from '@/components/ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';

const STATUS_STEPS = ['pending', 'looking_for_driver', 'matched', 'picked_up', 'in_transit', 'delivered'];
const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const expandPollRef = useRef(null);
  const anonPollRef = useRef(null);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first — covers vendors viewing their own order
      // history (vendor/history links here) via normal RLS.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(current_lat, current_lng, users(full_name)), vendors(business_name, logo_url)')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          prevStatusRef.current = authedOrder.status;
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          channel = supabase
            .channel(`track-${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
              (payload) => {
                setOrder(prev => ({ ...prev, ...payload.new }));
                announceStatusChange(payload.new.status);
              })
            .subscribe();
          return;
        }
      }

      // Anonymous / no access via RLS: use the scoped public tracking API instead.
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        prevStatusRef.current = json.order.status;
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orderId, supabase]);

  function announceStatusChange(newStatus) {
    if (prevStatusRef.current === newStatus) return;
    prevStatusRef.current = newStatus;
    setStatusToast(STATUS_LABELS[newStatus] || newStatus);
    setTimeout(() => setStatusToast(null), 4500);
  }

  // FIX: anonymous customers (no account, viewing via the public link) had
  // no realtime subscription at all - the authenticated path above gets
  // live postgres_changes updates, but this path only ever saw whatever
  // status the order was in at the moment the page first loaded. A
  // customer sitting on this page during pickup/in-transit/delivery would
  // never see it change without manually refreshing. Light polling closes
  // that gap without needing a realtime connection for someone who isn't
  // logged in.
  useEffect(() => {
    if (isVendorView || !order || notFound) return;
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    anonPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        announceStatusChange(json.order.status);
        setOrder(json.order);
      } catch {
        // transient network issue - just try again next tick
      }
    }, 12000);

    return () => { if (anonPollRef.current) clearInterval(anonPollRef.current); };
  }, [isVendorView, order?.status, orderId, notFound]);

  // --- Once delivered, this page hands off to the dedicated receipt page.
  useEffect(() => {
    if (order?.status === 'delivered') {
      const t = setTimeout(() => router.replace(`/receipt/${orderId}`), 600);
      return () => clearTimeout(t);
    }
  }, [order?.status, orderId, router]);

  // FIX: the "expanding search radius" shown below only ever actually
  // expanded if the sender happened to still have the send-package
  // confirmation screen open in the same tab - vendor-created orders (and
  // anyone who navigated away and came back to this tracking page instead)
  // had no path that ever grew the radius or re-triggered dispatch, so
  // riders outside the initial radius were never found even though the UI
  // implied a live, growing search. This runs the same expand + re-dispatch
  // cycle here instead, so it works from whichever screen is actually being
  // watched. It only runs while genuinely waiting (pending/looking_for_driver)
  // and stops itself as soon as the order leaves that state.
  useEffect(() => {
    if (!order || !orderId) return;
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
      return;
    }
    if (expandPollRef.current) return; // already polling

    const triggerDispatch = async () => {
      try {
        await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
      } catch (e) {
        console.error('Dispatch retry failed:', e);
      }
    };

    expandPollRef.current = setInterval(async () => {
      const { data: fresh, error: freshErr } = await supabase
        .from('orders')
        .select('status, broadcast_radius_km, max_broadcast_radius_km')
        .eq('id', orderId)
        .single();
      if (freshErr || !fresh) return;
      if (fresh.status !== 'pending' && fresh.status !== 'looking_for_driver') {
        clearInterval(expandPollRef.current);
        expandPollRef.current = null;
        return;
      }

      const currentRadius = Number(fresh.broadcast_radius_km) || 1.5;
      const maxRadius = Number(fresh.max_broadcast_radius_km) || 8;
      if (currentRadius >= maxRadius) {
        // Already at max - just keep re-broadcasting in case a rider has
        // come online/back in range since the last attempt.
        await triggerDispatch();
        return;
      }

      await supabase.rpc('expand_order_radius', { p_order_id: orderId });
      await triggerDispatch();
    }, 15000);

    return () => {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
    };
  }, [order?.status, orderId, supabase]);

  // Shares the tracking link itself (this page's URL) - distinct from the
  // receipt page's own share button, which shares the finished receipt.
  const handleShareTrackingLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `Track your delivery live: ${order.item_description || 'your package'} is on its way.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Track your NaijaDrops delivery', text, url });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950">
        <Skeleton className="h-64 w-full rounded-none" />
        <div className="px-6 py-8 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-1.5 w-full rounded-full mt-3" />
          </div>
          <div className="border-t border-white/10 pt-6 space-y-4">
            <Skeleton className="h-4 w-40" />
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-ink font-black text-xl mb-2">Delivery not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again, or contact the sender.</p>
      </div>
    );
  }

  const riderName = order.riders?.users?.full_name || order.rider?.first_name || null;
  const riderLat = order.riders?.current_lat ?? order.rider?.current_lat;
  const riderLng = order.riders?.current_lng ?? order.rider?.current_lng;

  // --- Delivered: brief handoff to the dedicated receipt page ---
  if (order.status === 'delivered') {
    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="text-emerald-500" size={48} />
        <p className="text-ink font-black text-lg">Delivered! Loading your receipt...</p>
        <Loader2 className="animate-spin text-emerald-500" size={20} />
      </div>
    );
  }

  // --- In progress ---
  const isWaitingForRider = order.status === 'pending' || order.status === 'looking_for_driver';

  async function handleCancelOrder() {
    setCancelling(true);
    const res = await cancelOrder(order.id, 'Cancelled from tracking page');
    setCancelling(false);
    if (res.success) {
      router.push('/vendor/active-orders');
    } else {
      setShowCancelConfirm(false);
      alert(res.error || 'Could not cancel this order.');
    }
  }

  const StatusToastBanner = () => (
    <AnimatePresence>
      {statusToast && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-4 left-4 right-4 z-[200] max-w-md mx-auto"
        >
          <div className="bg-emerald-500 text-charcoal-950 rounded-2xl px-5 py-3 shadow-glow flex items-center gap-3 font-black text-sm">
            <CheckCircle2 size={18} /> Status update: {statusToast}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // --- Waiting for a rider: dedicated, simpler view - nothing has happened
  // yet, so a full 6-step timeline and an empty map box (the old behavior)
  // just added noise and made it look stuck. This shows what's actually
  // happening: a live, expanding search radius, matching the real dispatch
  // system underneath.
  if (isWaitingForRider) {
    const radius = Number(order.broadcast_radius_km) || 1.5;
    const maxRadius = Number(order.max_broadcast_radius_km) || 8;
    const searchPct = Math.min(100, Math.round((radius / maxRadius) * 100));

    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col">
        <StatusToastBanner />
        <div className="h-64 relative bg-charcoal-900 flex items-center justify-center overflow-hidden">
          <div className="absolute w-40 h-40 rounded-full border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute w-28 h-28 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
          <div className="relative w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-glow">
            <Radar className="text-charcoal-950 animate-spin" size={28} style={{ animationDuration: '3s' }} />
          </div>
        </div>

        <div className="px-6 py-8 space-y-8">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">Finding a rider</p>
            <p className="text-charcoal-500 text-sm mt-2">
              Searching within <span className="text-emerald-500 font-bold">{radius.toFixed(1)}km</span> of your pickup point{radius < maxRadius ? ' — expanding automatically' : ''}.
            </p>
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${searchPct}%` }} />
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          </div>

          {isVendorView && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleShareTrackingLink}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {linkCopied ? <><Check size={14} className="text-emerald-500" /> Copied</> : <><Share2 size={14} /> Share Link</>}
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
              >
                Cancel Order
              </button>
            </div>
          )}
        </div>

        {showCancelConfirm && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="text-red-400" size={18} />
                </div>
                <div>
                  <h3 className="text-ink font-black text-base">Cancel this delivery?</h3>
                  <p className="text-charcoal-500 text-xs">No rider has accepted it yet - this is free to cancel.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Cancel It
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Rider matched or later: full timeline + live map ---
  const mapMarkers = [];
  if (order.pickup_lat && order.pickup_lng) mapMarkers.push({ lat: order.pickup_lat, lng: order.pickup_lng, type: 'pickup', label: 'Pickup' });
  if (riderLat && riderLng) mapMarkers.push({ lat: riderLat, lng: riderLng, type: 'rider', label: riderName || 'Rider' });
  if (order.dropoff_lat && order.dropoff_lng) mapMarkers.push({ lat: order.dropoff_lat, lng: order.dropoff_lng, type: 'dropoff', label: 'Drop-off' });

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <StatusToastBanner />
      <div className="h-80 relative">
        {mapMarkers.length > 0 ? (
          <>
            <MapCanvas markers={mapMarkers} showRoute />
            {riderLat && riderLng && (
              <div className="absolute top-4 left-4 bg-charcoal-950/80 backdrop-blur border border-emerald-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-none">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Live</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm bg-charcoal-900">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          {/* FIX: text block had no min-w-0, so a longer status label had
              nowhere to go but push against/under the 48px chat button on
              narrow screens instead of truncating cleanly. */}
          <div className="min-w-0">
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit truncate">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isVendorView && (
              <button
                onClick={handleShareTrackingLink}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-ink hover:bg-white/10 transition-all active:scale-95"
                title="Share tracking link"
              >
                {linkCopied ? <Check size={18} className="text-emerald-500" /> : <Share2 size={18} />}
              </button>
            )}
            {isVendorView && (
              <button
                onClick={() => setShowChat(true)}
                className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95"
                title="Message rider"
              >
                <MessageCircle size={20} />
              </button>
            )}
          </div>
        </div>

        <OrderStatusStepper steps={STATUS_STEPS} currentStatus={order.status} />

        {/* Payment gate: a rider is assigned but the vendor hasn't paid yet.
            The rider's app is deliberately locked from heading to pickup
            until payment_status flips to 'paid' (see /api/verify-payment),
            so this needs to be impossible to miss here. */}
        {isVendorView && order.status === 'matched' && order.payment_status !== 'paid' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <CreditCard size={16} /> Payment required
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              A rider has been assigned. Complete payment now so they can head to pickup - this order stays paused until then.
            </p>
            <button
              onClick={() => router.push(`/payment?orderId=${order.id}`)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95"
            >
              Pay ₦{order.agreed_price?.toLocaleString()} Now
            </button>
          </div>
        )}

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold">{riderName}</span></div>}
        </div>
      </div>

      {isVendorView && showChat && currentUserId && (
        <OrderChat
          orderId={order.id}
          currentUserId={currentUserId}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\app\tracking\[orderId]\page.jsx" -NewContent $content_8 -Label "Tracking page - stepper, map, share link, redirect to receipt"

# ------------------------------------------------------------------
# Map - multi-marker bounds fit + route line
# ------------------------------------------------------------------
$content_9 = @'
"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Map, { Marker, NavigationControl, Source, Layer } from "react-map-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation, Flag } from "lucide-react";

/**
 * Reusable MapCanvas Component 
 * Handles:
 * 1. Viewing live markers (Rider tracking)
 * 2. Picking locations (Create Delivery)
 *
 * @param {Array} markers - Array of {lat, lng, color, type, label} objects.
 *   type: 'rider' | 'pickup' | 'dropoff' | undefined - controls icon/label.
 * @param {boolean} interactive - Whether the user can click to drop a pin
 * @param {function} onLocationSelect - Callback when pin is dropped (returns {lat, lng})
 * @param {object} center - Default center {lat, lng}
 * @param {boolean} showRoute - Draw a connecting line between markers, in the order given
 */
export default function MapCanvas({
  markers = [],
  orders = [],
  interactive = false,
  onLocationSelect = () => {},
  center = null,
  zoom: initialZoom = 12,
  showRoute = false,
}) {
  // Merge markers and orders (orders get converted to marker format)
  const allMarkers = [
    ...markers,
    ...orders.filter(o => o.pickup_lat && o.pickup_lng).map(o => ({
      lat: o.pickup_lat,
      lng: o.pickup_lng,
      color: 'emerald',
      type: 'pickup'
    }))
  ];
  const mapRef = useRef();

  // Default to Kano Center if not provided
  const [viewState, setViewState] = useState({
    longitude: center?.lng || 8.5200,
    latitude: center?.lat || 11.9964,
    zoom: initialZoom
  });

  const [activePin, setActivePin] = useState(null);

  // Auto center if new single marker is passed
  useEffect(() => {
     if (allMarkers.length === 1 && !interactive) {
        setViewState((prev) => ({
           ...prev,
           longitude: allMarkers[0].lng,
           latitude: allMarkers[0].lat,
           zoom: 14
        }));
     }
  }, [allMarkers.length === 1 ? `${allMarkers[0].lat},${allMarkers[0].lng}` : null, interactive]);

  // FIX: with multiple markers (pickup + dropoff + rider together, which is
  // the whole point of showing them all at once), the map used to just sit
  // on the Kano-center default and never actually frame what was on
  // screen - the caller had to already know where to look. Fit the camera
  // to whatever's actually being shown instead.
  useEffect(() => {
    if (allMarkers.length < 2 || interactive || !mapRef.current) return;
    const lats = allMarkers.map(m => m.lat);
    const lngs = allMarkers.map(m => m.lng);
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    try {
      mapRef.current.fitBounds(bounds, { padding: 64, duration: 800, maxZoom: 15 });
    } catch {
      // map not fully ready yet - safe to skip, next update will retry
    }
  }, [JSON.stringify(allMarkers.map(m => [m.lat, m.lng])), interactive]);

  const routeGeoJson = useMemo(() => {
    if (!showRoute || allMarkers.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: allMarkers.map(m => [m.lng, m.lat]),
      },
    };
  }, [showRoute, JSON.stringify(allMarkers.map(m => [m.lat, m.lng]))]);

  const handleMapClick = (e) => {
    if (!interactive) return;

    const { lng, lat } = e.lngLat;
    setActivePin({ lng, lat });
    onLocationSelect({ lng, lat });
  };

  const markerVisual = (m) => {
    if (m.type === 'rider') {
      return (
        <div className="relative flex items-center justify-center">
          <div className="absolute w-11 h-11 rounded-full bg-emerald-500/30 animate-ping" />
          <div className="relative w-9 h-9 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center">
            <Navigation size={16} className="text-charcoal-950" />
          </div>
        </div>
      );
    }
    if (m.type === 'dropoff') {
      return (
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center -mb-1">
            <Flag size={14} className="text-white" />
          </div>
          <div className="w-2 h-2 bg-rose-500 rotate-45 -mt-1" />
        </div>
      );
    }
    // pickup / default
    return (
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center -mb-1">
          <MapPin size={14} className="text-charcoal-950" />
        </div>
        <div className="w-2 h-2 bg-emerald-500 rotate-45 -mt-1" />
      </div>
    );
  };

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
        onClick={handleMapClick}
        cursor={interactive ? 'crosshair' : 'grab'}
      >
        <NavigationControl position="top-right" />

        {routeGeoJson && (
          <Source id="route" type="geojson" data={routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#10b981', 'line-width': 3, 'line-dasharray': [0.2, 1.5], 'line-opacity': 0.8 }}
            />
          </Source>
        )}

        {/* Render fixed markers (e.g. Riders, Pickup, Dropoff) */}
        {allMarkers.map((m, idx) => (
          <Marker key={idx} longitude={m.lng} latitude={m.lat} anchor={m.type === 'rider' ? 'center' : 'bottom'}>
            <div className="relative group">
              {markerVisual(m)}
              {m.label && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap bg-charcoal-950/90 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg pointer-events-none">
                  {m.label}
                </div>
              )}
            </div>
          </Marker>
        ))}

        {/* Render temporary interactive pin */}
        {interactive && activePin && (
          <Marker longitude={activePin.lng} latitude={activePin.lat} anchor="bottom">
             <div className="relative group">
                <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-sm"></div>
                <MapPin size={36} className="text-emerald-500 relative z-10 drop-shadow-xl -translate-y-2" />
             </div>
          </Marker>
        )}
      </Map>
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\components\MapCanvas.jsx" -NewContent $content_9 -Label "Map - multi-marker bounds fit + route line"

# ------------------------------------------------------------------
# New: vendor order-status toast notifications
# ------------------------------------------------------------------
$content_10 = @'
"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Package, Truck, CheckCircle2, UserCheck, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// Milestones worth interrupting the vendor's day for. Keyed by the order's
// new status - anything not listed here doesn't toast.
const MILESTONES = {
  matched: { icon: UserCheck, label: 'Rider assigned', text: (o) => `A rider is on the way to pick up ${o.item_description || 'your package'}.` },
  picked_up: { icon: Package, label: 'Picked up', text: (o) => `${o.item_description || 'Your package'} has been picked up and is headed out.` },
  in_transit: { icon: Truck, label: 'On the way', text: (o) => `${o.item_description || 'Your package'} is on the way to ${o.dropoff_name || 'the drop-off'}.` },
  delivered: { icon: CheckCircle2, label: 'Delivered', text: (o) => `${o.item_description || 'Your package'} has been delivered.` },
};

function StatusToast({ notification, onClose, onTap }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const Icon = notification.icon;

  return (
    <motion.div
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="w-full max-w-sm"
    >
      <button
        onClick={onTap}
        className="w-full glass-dark border border-white/10 rounded-[2rem] p-4 flex items-center gap-4 shadow-premium text-left active:scale-95 transition-transform group relative"
      >
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-transform">
          <Icon size={22} className="text-charcoal-950" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-1">{notification.label}</p>
          <p className="text-sm text-white font-semibold leading-tight">{notification.text}</p>
          <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">Tap to view order</p>
        </div>

        <ChevronRight size={16} className="text-white/20 group-hover:text-emerald-500 shrink-0 transition-colors group-hover:translate-x-0.5" />

        <div
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all pointer-events-auto"
        >
          <X size={12} />
        </div>
      </button>
    </motion.div>
  );
}

export default function OrderStatusNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const subRef = useRef(null);
  const vendorIdRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // FIX: orders.vendor_id is a foreign key to vendors.id, not the
      // user's own id (the same mismatch that quietly made
      // ChatNotificationListener match zero orders) - has to be resolved
      // through the vendors table first.
      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!vendorRow) return; // not a vendor - riders/customers don't get this listener
      vendorIdRef.current = vendorRow.id;

      subRef.current = supabase
        .channel(`order-status-notify-${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `vendor_id=eq.${vendorRow.id}`,
        }, (payload) => {
          const order = payload.new;
          const prevStatus = payload.old?.status;
          if (order.status === prevStatus) return; // some other field changed, not a milestone

          const milestone = MILESTONES[order.status];
          if (!milestone) return;

          const newNotif = {
            id: `${order.id}-${order.status}-${Date.now()}`,
            orderId: order.id,
            status: order.status,
            icon: milestone.icon,
            label: milestone.label,
            text: milestone.text(order),
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(milestone.label, { body: newNotif.text, icon: '/favicon.png' });
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [supabase]);

  const dismiss = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  const handleTap = (notification) => {
    dismiss(notification.id);
    const dest = notification.status === 'delivered' ? `/receipt/${notification.orderId}` : `/tracking/${notification.orderId}`;
    router.push(dest);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map(notif => (
          <div key={notif.id} className="pointer-events-auto relative">
            <StatusToast
              notification={notif}
              onClose={() => dismiss(notif.id)}
              onTap={() => handleTap(notif)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\components\OrderStatusNotificationListener.jsx" -NewContent $content_10 -Label "New: vendor order-status toast notifications"

# ------------------------------------------------------------------
# Fix chat notification vendor/rider id bug
# ------------------------------------------------------------------
$content_11 = @'
"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MessageSquare, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// â”€â”€â”€ Toast Notification Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ChatToast({ notification, onClose, onTap }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="w-full max-w-sm"
    >
      <button
        onClick={onTap}
        className="w-full glass-dark border border-white/10 rounded-[2rem] p-4 flex items-center gap-4 shadow-premium text-left active:scale-95 transition-transform group"
      >
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-transform">
          <MessageSquare size={22} className="text-charcoal-950" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-1">
            {notification.senderLabel}
          </p>
          <p className="text-sm text-white font-semibold truncate leading-tight">
            {notification.text}
          </p>
          <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">
            Tap to open chat
          </p>
        </div>

        <ChevronRight size={16} className="text-white/20 group-hover:text-emerald-500 shrink-0 transition-colors group-hover:translate-x-0.5" />

        <div
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all pointer-events-auto"
        >
          <X size={12} />
        </div>
      </button>
    </motion.div>
  );
}

// â”€â”€â”€ Global Listener Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ChatNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const subRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // FIX: vendor_id/rider_id on orders are foreign keys to vendors.id
      // and riders.id - NOT the user's own id - so this always matched zero
      // orders for a vendor and silently did nothing. Resolve the user's
      // actual vendor_id/rider_id row first.
      const [{ data: vendorRow }, { data: riderRow }] = await Promise.all([
        supabase.from('vendors').select('id').eq('user_id', user.id).single(),
        supabase.from('riders').select('id').eq('user_id', user.id).single(),
      ]);

      const orFilters = [];
      if (vendorRow) orFilters.push(`vendor_id.eq.${vendorRow.id}`);
      if (riderRow) orFilters.push(`rider_id.eq.${riderRow.id}`);
      if (orFilters.length === 0) return;

      // Find any active orders for this user
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, vendor_id, rider_id')
        .or(orFilters.join(','))
        .not('status', 'in', '("delivered")')
        .order('created_at', { ascending: false });

      if (!activeOrders || activeOrders.length === 0) return;

      const orderIds = activeOrders.map(o => o.id);

      // Listen for new messages in ANY active order
      subRef.current = supabase
        .channel(`chat-notify-unified-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, async (payload) => {
          const msg = payload.new;
          if (!orderIds.includes(msg.order_id)) return;
          if (msg.sender_id === user.id) return;

          // Fetch sender name
          const { data: sender } = await supabase
            .from('users')
            .select('name, role')
            .eq('id', msg.sender_id)
            .single();

          const senderLabel = sender ? `${sender.role.toUpperCase()}: ${sender.name.split(' ')[0]}` : 'New Message';

          const newNotif = {
            id: msg.id,
            text: msg.message, // Use 'message' field from schema
            senderLabel,
            orderId: msg.order_id,
            createdAt: msg.created_at,
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(senderLabel, { body: msg.message, icon: '/favicon.png' });
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [supabase]);

  const dismiss = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleTap = (notification) => {
    dismiss(notification.id);
    // Use the generic tracking page which is role-agnostic for chat
    router.push(`/tracking/${notification.orderId}?openChat=1`);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map(notif => (
          <div key={notif.id} className="pointer-events-auto relative">
            <ChatToast
              notification={notif}
              onClose={() => dismiss(notif.id)}
              onTap={() => handleTap(notif)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\components\ChatNotificationListener.jsx" -NewContent $content_11 -Label "Fix chat notification vendor/rider id bug"

# ------------------------------------------------------------------
# Mount notification listeners globally
# ------------------------------------------------------------------
$content_12 = @'
﻿
import "./globals.css";
import 'mapbox-gl/dist/mapbox-gl.css';
import { Outfit, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import ChatNotificationListener from "@/components/ChatNotificationListener";
import OrderStatusNotificationListener from "@/components/OrderStatusNotificationListener";

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
  title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 10",
  description: "No more chasing riders on the phone. NaijaDrops brings trackable, reliable delivery to Kano vendors and customers. Launching August 10.",
  metadataBase: new URL('https://naijadrops.tech'),
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 10",
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
        alt: 'NaijaDrops — Reliable delivery, finally trackable. Launching August 10 in Kano.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 10",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    images: ['/og-image.png'],
  },
};

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
          <ChatNotificationListener />
          <OrderStatusNotificationListener />
        </ThemeProvider>
      </body>
    </html>
  );
}
'@

Set-WholeFile -RelativePath "src\app\layout.js" -NewContent $content_12 -Label "Mount notification listeners globally"

# ------------------------------------------------------------------
# Add receipt display name field
# ------------------------------------------------------------------
$content_13 = @'
﻿"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { User, Camera, Shield, Save, ArrowLeft, Star, Clock, MapPin, Sun, Moon, Monitor } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import { useTheme } from "@/components/ThemeProvider";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [receiptDisplayName, setReceiptDisplayName] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  useEffect(() => {
    async function loadProfile() {
      const { user: u, role: r, profile: p } = await getUserRole(supabase);
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setRole(r);
      setProfile(p);
      setFullName(p?.name || "");
      setAvatarUrl(p?.avatar_url || "");
      setReceiptDisplayName(p?.receipt_display_name || "");
      setIsLoading(false);
    }
    loadProfile();
  }, [supabase, router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: fullName,
          avatar_url: avatarUrl,
          receipt_display_name: receiptDisplayName || null
        })
        .eq("id", user.id);

      if (error) throw error;
      alert("Settings updated successfully!");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 pt-32 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        
        <header className="mb-12 flex items-center justify-between">
           <div>
              <h1 className="text-4xl font-black text-ink tracking-tighter italic font-outfit">Account Settings</h1>
              <p className="text-charcoal-500 font-bold text-[10px] uppercase tracking-widest mt-1">Your Profile & Details</p>
           </div>
           {role === 'rider' && (
             <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                <Star size={16} className="text-emerald-500" fill="currentColor" />
                <span className="text-ink font-black text-sm italic">{profile?.rating || "5.0"}</span>
             </div>
           )}
        </header>

        <section className="glass rounded-[3rem] p-10 border-white/5 relative overflow-hidden mb-8">
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none"></div>
           
           <div className="flex flex-col md:flex-row items-center gap-10 mb-12">
              <div className="relative group">
                 <div className="w-32 h-32 rounded-[2.5rem] bg-charcoal-800 flex items-center justify-center overflow-hidden border-2 border-white/10 group-hover:border-emerald-500 transition-all">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={48} className="text-charcoal-600" />
                    )}
                 </div>
                 <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-ink rounded-xl flex items-center justify-center shadow-glow hover:bg-emerald-400 transition-all">
                    <Camera size={18} />
                 </button>
              </div>

              <div className="flex-1 space-y-2 text-center md:text-left">
                 <div className="text-ink font-black text-2xl tracking-tight">{profile?.name || "New Dispatcher"}</div>
                 <div className="text-charcoal-500 font-bold text-sm tracking-tight">{user?.email}</div>
                 <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{role} account active</span>
                 </div>
              </div>
           </div>

           <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aliyu Ibrahim"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Name Shown on Delivery Receipts</label>
                    <input 
                      type="text" 
                      value={receiptDisplayName}
                      onChange={(e) => setReceiptDisplayName(e.target.value)}
                      placeholder={role === 'vendor' ? 'e.g. your business name' : 'e.g. your preferred display name'}
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">
                      {role === 'vendor'
                        ? "Shown to customers on their delivery receipt instead of your account name. Leave blank to use your business name."
                        : "Shown on receipts as the rider who delivered the order. Leave blank to use your full name."}
                    </p>
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Registered Email Address (Locked)</label>
                    <input 
                      type="email" 
                      value={user?.email || ""}
                      readOnly
                      disabled
                      className="w-full bg-white/5 border-2 border-white/5 rounded-2xl px-6 py-4 text-charcoal-400 font-bold tracking-tight outline-none cursor-not-allowed opacity-60"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Avatar Source URL</label>
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://image-source.com/photo.jpg"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">Note: We currently support direct image URLs. Full upload system coming soon.</p>
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-4">
                 <button 
                   onClick={handleSave}
                   disabled={isSaving}
                   className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-charcoal-700 text-ink font-black py-4 rounded-2xl transition-all shadow-glow active:scale-95 flex items-center justify-center gap-3"
                 >
                    {isSaving ? "Updating System..." : <><Save size={18} /> Commit Changes</>}
                 </button>
                 <button 
                   onClick={() => router.back()}
                   className="bg-white/5 border border-white/10 text-ink font-black px-8 rounded-2xl hover:bg-white/10 transition-all"
                 >
                    Discard
                 </button>
              </div>
           </div>
        </section>

        {role === 'rider' && (
          <section className="bg-emerald-500/5 border border-emerald-500/10 rounded-[3rem] p-10">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-ink shadow-glow">
                   <Shield size={24} />
                </div>
                <div>
                   <h3 className="text-ink font-black text-xl italic tracking-tight">Rider Details</h3>
                   <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Your Rider Account</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Status</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">Operational</div>
                </div>
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Commission</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">20% Standard</div>
                </div>
             </div>
          </section>
        )}

        <section className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                 <Sun size={24} />
              </div>
              <div>
                 <h3 className="text-ink font-black text-xl italic tracking-tight">Appearance</h3>
                 <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Light, Dark, or Match Your Device</p>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', Icon: Sun },
                { value: 'dark', label: 'Dark', Icon: Moon },
                { value: 'system', label: 'System', Icon: Monitor },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemeMode(value)}
                  className={`flex flex-col items-center gap-2 py-5 rounded-2xl border transition-all ${
                    themeMode === value
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-charcoal-900 border-white/5 text-charcoal-500 hover:text-ink hover:border-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                </button>
              ))}
           </div>
        </section>

      </div>
    </main>
  );
}
'@

Set-WholeFile -RelativePath "src\app\profile\page.jsx" -NewContent $content_13 -Label "Add receipt display name field"

# ------------------------------------------------------------------
# Link delivered orders to receipt page
# ------------------------------------------------------------------
$content_14 = @'
﻿"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight, Navigation, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';

export default function VendorHistoryPage() {
    const router = useRouter();
    const supabase = createClient();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [vendorId, setVendorId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push('/auth/login');
                    return;
                }

                // Fetch vendor ID first
                const { data: vendorProfile } = await supabase
                    .from('vendors')
                    .select('id')
                    .eq('user_id', user.id)
                    .single();

                if (!vendorProfile) {
                    setOrders([]);
                    setLoading(false);
                    return;
                }
                setVendorId(vendorProfile.id);

                const { data, error } = await supabase
                    .from('orders')
                    .select('*, riders!rider_id(user_id, vehicle_type)')
                    .eq('vendor_id', vendorProfile.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setOrders(data || []);
            } catch (err) {
                console.error("Failed to fetch history:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [supabase, router]);

    const getStatusStyle = (status) => {
        switch (status) {
            case 'delivered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'in_transit': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-white/10 text-charcoal-400 border-white/10';
        }
    };

    // Cancelled orders are just noise once they're done - the vendor asked to
    // be able to clear them out so only real (delivered / still in-flight)
    // history remains. Scoped to vendor_id again here even though RLS
    // already allows it, so this can never touch another vendor's row.
    async function handleDeleteCancelled(orderId) {
        setDeletingId(orderId);
        try {
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', orderId)
                .eq('vendor_id', vendorId)
                .eq('status', 'cancelled');
            if (error) throw error;
            setOrders(prev => prev.filter(o => o.id !== orderId));
        } catch (err) {
            console.error("Failed to delete order:", err);
            alert("Couldn't delete this order. Try again.");
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/vendor/dashboard" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
                    <ArrowLeft size={20} className="text-ink" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-ink tracking-tight font-outfit italic">
                        Operation <span className="text-emerald-500 text-outfit italic">History</span>
                    </h1>
                    <p className="text-charcoal-400 text-sm font-medium">Registry of all city-wide dispatches.</p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 space-y-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-2.5 w-32" />
                                        <Skeleton className="h-5 w-40" />
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Skeleton className="h-5 w-16 rounded-lg" />
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                {[1, 2].map((j) => (
                                    <div key={j} className="flex items-center gap-3">
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="space-y-1.5 flex-1">
                                            <Skeleton className="h-2.5 w-12" />
                                            <Skeleton className="h-3.5 w-28" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-charcoal-900 rounded-full flex items-center justify-center mb-6 border border-white/5">
                        <Package size={40} className="text-charcoal-600" />
                    </div>
                    <h2 className="text-xl font-black text-ink mb-2">No active records found.</h2>
                    <p className="text-charcoal-500 mb-8 max-w-xs mx-auto text-sm">Initialize your first delivery to start logging operations.</p>
                    <Link href="/send-package/step-1" className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl shadow-glow hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
                        Dispatch Load
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <div
                            key={order.id}
                            className="group relative bg-white/[0.03] hover:bg-white/[0.05] rounded-[2rem] border border-white/10 transition-all hover:border-emerald-500/30 overflow-hidden"
                        >
                            <Link
                                href={order.status === 'delivered' ? `/receipt/${order.id}` : `/tracking/${order.id}`}
                                className="block p-6"
                            >
                                {/* FIX: the status pill + price used to be absolutely
                                    positioned over this row with no reserved space,
                                    so on anything narrower than a wide tablet the
                                    package icon/title and the price/status pill
                                    physically overlapped each other. This now lays
                                    out as a normal flex row - title truncates and
                                    the price/status block keeps a fixed width next
                                    to it instead of floating on top. */}
                                <div className="flex items-start justify-between gap-3 mb-6">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
                                            <Package size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black tracking-widest text-charcoal-500 uppercase mb-1 truncate">
                                                ID: {order.id.slice(0, 8)} • {new Date(order.created_at).toLocaleDateString()}
                                            </div>
                                            <h3 className="text-lg font-black text-ink font-outfit uppercase tracking-tight truncate">{order.item_category || 'General Package'}</h3>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border whitespace-nowrap ${getStatusStyle(order.status)}`}>
                                            {order.status}
                                        </div>
                                        <div className="text-xl font-black text-ink italic tracking-tighter whitespace-nowrap">₦{order.agreed_price?.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5 shrink-0">
                                            <MapPin size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit">Origin</div>
                                            <div className="text-sm font-bold text-ink truncate">{order.pickup_name}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5 shrink-0">
                                            <Navigation size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit italic">Terminal</div>
                                            <div className="text-sm font-bold text-ink truncate">{order.dropoff_name}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-charcoal-400 group-hover:text-emerald-500 transition-colors">
                                    <span className="truncate">Rider ID: {order.rider_id ? order.rider_id.slice(0, 8) : 'AWAITING ASSIGNMENT'}</span>
                                    <div className="flex items-center gap-2 shrink-0">View Analysis <ChevronRight size={14} /></div>
                                </div>
                            </Link>

                            {/* Only cancelled orders are deletable - delivered history
                                and anything still in-flight stays put. */}
                            {order.status === 'cancelled' && (
                                <div className="px-6 pb-6 -mt-2">
                                    {confirmDeleteId === order.id ? (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                                            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex-1">Delete this record?</span>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setConfirmDeleteId(null); }}
                                                className="px-3 py-2 rounded-xl bg-white/5 text-charcoal-300 text-[10px] font-black uppercase tracking-widest"
                                            >
                                                Keep
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleDeleteCancelled(order.id); }}
                                                disabled={deletingId === order.id}
                                                className="px-3 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-60"
                                            >
                                                {deletingId === order.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                Delete
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => { e.preventDefault(); setConfirmDeleteId(order.id); }}
                                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-charcoal-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={12} /> Remove from history
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
'@

Set-WholeFile -RelativePath "src\app\vendor\history\page.jsx" -NewContent $content_14 -Label "Link delivered orders to receipt page"

# ------------------------------------------------------------------
# Rider live location - watchPosition + jump-rejection
# ------------------------------------------------------------------
$content_15 = @'
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { isPlausibleMove } from "@/utils/geolocation";

/**
 * Driver Heartbeat Component
 * - Behavior: Only syncs if the driver is ONLINE
 * - Resilience: Fails silently to prevent UI disruption
 *
 * FIX (location accuracy): this used to call a fresh, cold
 * navigator.geolocation.getCurrentPosition() every ~35 seconds with no
 * accuracy filtering at all - whatever came back within 10s got written
 * straight to the database and shown on the map. On Nigerian mobile
 * networks, a phone that hasn't locked GPS within that window commonly
 * falls back to network-based positioning, which can be badly wrong - so
 * the rider's dot would periodically jump to an inaccurate spot, then jump
 * back on the next good reading. That's the "inaccurate live location" bug.
 *
 * Now uses watchPosition() to keep the GPS radio warm continuously instead
 * of re-acquiring a fix from scratch every cycle (yields meaningfully
 * better accuracy over time), tracks the best (lowest-accuracy) sample
 * seen, and - critically - rejects any single reading that would imply
 * physically impossible movement since the last CONFIRMED position (see
 * isPlausibleMove in utils/geolocation.js) rather than blindly overwriting
 * a good position with a noisy one.
 */
const PUSH_INTERVAL_MS = 20000;
const MAX_PLAUSIBLE_KPH = 100;

export default function DriverHeartbeat({ riderId, isOnline }) {
  const supabase = createClient();
  const timerRef = useRef(null);
  const watchIdRef = useRef(null);
  const bestSampleRef = useRef(null); // best reading since the last push
  const lastConfirmedRef = useRef(null); // last position actually written to the DB

  useEffect(() => {
    if (!riderId || !isOnline || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      return;
    }

    // Keep GPS warm continuously - each callback is a fresh sample, and we
    // just remember whichever one had the best (lowest) accuracy since the
    // last time we pushed to the DB.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const sample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        if (!bestSampleRef.current || sample.accuracy < bestSampleRef.current.accuracy) {
          bestSampleRef.current = sample;
        }
      },
      (err) => {
        console.warn("[HEARTBEAT] watchPosition error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    const pushBestSample = async () => {
      const sample = bestSampleRef.current;
      if (!sample) return;

      // Deterministic jump-rejection: if this best sample implies an
      // impossible speed versus the last position we actually confirmed
      // and wrote to the DB, it's noise - skip this cycle rather than
      // publish a bad jump. The next cycle gets a fresh chance.
      if (!isPlausibleMove(lastConfirmedRef.current, sample, MAX_PLAUSIBLE_KPH)) {
        console.warn("[HEARTBEAT] Rejected implausible jump", sample);
        bestSampleRef.current = null;
        return;
      }

      try {
        await supabase
          .from("riders")
          .update({
            current_lat: sample.lat,
            current_lng: sample.lng,
            last_seen_at: new Date().toISOString()
          })
          .eq("id", riderId);

        await supabase
          .from("rider_locations")
          .insert({
            rider_id: riderId,
            lat: sample.lat,
            lng: sample.lng,
          });

        lastConfirmedRef.current = sample;
        console.log("[HEARTBEAT] Location synced at", new Date().toLocaleTimeString(), `±${Math.round(sample.accuracy)}m`);
      } catch (err) {
        // Silent fail to preserve driver experience
      } finally {
        // Reset so next interval only pushes a genuinely new sample.
        bestSampleRef.current = null;
      }
    };

    timerRef.current = setInterval(pushBestSample, PUSH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [riderId, isOnline]);

  return null; // Headless component
}
'@

Set-WholeFile -RelativePath "src\components\rider\DriverHeartbeat.jsx" -NewContent $content_15 -Label "Rider live location - watchPosition + jump-rejection"

# ------------------------------------------------------------------
# Fix back-button-after-delivery bug + wording
# ------------------------------------------------------------------
$content_16 = @'
﻿"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert, MessageCircle, Play, Camera, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/rider/SlideToConfirm';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import OrderChat from '@/components/OrderChat';

function NoteCard({ note, voiceUrl }) {
  if (!note && !voiceUrl) return null;
  return (
    <div className="mt-3 bg-charcoal-900/60 border border-white/10 rounded-2xl p-4">
      <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-500 mb-2">Note from vendor</div>
      {note && <p className="text-ink text-sm leading-snug mb-2">{note}</p>}
      {voiceUrl && (
        <button onClick={() => { const a = new Audio(voiceUrl); a.play(); }} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors">
          <Play size={12} fill="currentColor" /> Play voice note
        </button>
      )}
    </div>
  );
}

export default function ActiveJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [deliveryPhotoUrl, setDeliveryPhotoUrl] = useState(null);
  const [uploadingDeliveryPhoto, setUploadingDeliveryPhoto] = useState(false);
  const deliveryPhotoInputRef = useRef(null);

  useEffect(() => {
    async function fetchActiveJob() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
      if (!profile) return;
      setRiderId(profile.id);

      const { data, error } = await supabase
        .from('orders')
        .select('*, riders(*)')
        .eq('rider_id', profile.id)
        .in('status', ['matched', 'picked_up', 'in_transit'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data) setOrder(data);
      setLoading(false);
    }
    fetchActiveJob();

    const channel = supabase.channel('active-job-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (order && payload.new.id === order.id) {
          setOrder(prev => ({ ...prev, ...payload.new }));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase, order?.id]);

  const updateStatus = async (nextStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus, delivery_photo_url: deliveryPhotoUrl || undefined })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        // FIX: router.push() left this active-job page in browser history,
        // so pressing back afterward returned here showing the order still
        // in its pre-delivery state (looked like the delivery "undid"
        // itself). router.replace() swaps this entry out instead, so back
        // skips straight past it.
        router.replace('/rider/earnings');
      } else {
        setOrder({ ...order, status: nextStatus });
      }
    }
    setUpdating(false);
  };

  // Optional but encouraged proof-of-delivery photo, taken right before the
  // final "Mark Delivered" slide. Cheap insurance for a "no one home" or
  // "wrong item" dispute later - same pattern as the package photo, so it
  // doesn't feel like a new mechanic to learn.
  async function handleDeliveryPhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDeliveryPhoto(true);
    try {
      const fileName = `delivery_${order.id}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('delivery-photos').upload(fileName, file, { contentType: file.type || 'image/jpeg' });
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from('delivery-photos').getPublicUrl(fileName);
        setDeliveryPhotoUrl(publicUrlData.publicUrl);
      } else {
        alert("Couldn't upload the photo. You can still mark this delivered without one.");
      }
    } finally {
      setUploadingDeliveryPhoto(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  if (!order) {
    return (
      <div className="py-20 text-center px-8">
        <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-charcoal-600">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-xl font-black text-ink mb-2">No Active Delivery</h2>
        <p className="text-charcoal-500 text-sm mb-8">You don't have any assigned deliveries right now. Go back online to find jobs nearby.</p>
        <button onClick={() => router.push('/rider')} className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl uppercase text-xs tracking-widest">
          Find Jobs
        </button>
      </div>
    );
  }

  const isHeadingToPickup = order.status === 'matched';
  const targetLat = isHeadingToPickup ? order.pickup_lat : order.dropoff_lat;
  const targetLng = isHeadingToPickup ? order.pickup_lng : order.dropoff_lng;
  const targetName = isHeadingToPickup ? order.pickup_name : order.dropoff_name;

  return (
    <div className="space-y-6 pb-24">
      {/* Headless: continuous location pinging (~35s) for the entire duration of this
          delivery, regardless of the rider's general online/offline toggle. This is
          what makes the vendor/customer tracking map actually move instead of showing
          a single frozen point from whenever the rider last went online. */}
      {riderId && <DriverHeartbeat riderId={riderId} isOnline={true} />}

      {/* Dynamic Map Header */}
      <div className="h-[35vh] -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 relative overflow-hidden">
        <MapCanvas orders={[order]} zoom={15} center={[targetLng, targetLat]} />
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
          <button onClick={() => router.push('/rider')} className="w-12 h-12 bg-charcoal-950/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-ink border border-white/10 pointer-events-auto shadow-2xl">
            <ArrowLeft size={22} />
          </button>
          <div className={`px-4 py-2 rounded-full bg-charcoal-950/80 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest shadow-2xl pointer-events-auto flex items-center gap-2 ${isHeadingToPickup ? 'text-amber-500' : 'text-emerald-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isHeadingToPickup ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {order.status === 'in_transit' ? 'Delivering Package' : isHeadingToPickup ? 'Heading to Pickup' : 'Package Picked Up'}
          </div>
        </div>

        {/* Google Maps Intent Button */}
        <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-auto">
          <a 
            href={`google.navigation:q=${targetLat},${targetLng}&mode=l`}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-ink font-black rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
          >
            <Navigation size={20} fill="currentColor" />
            Launch GPS Navigation
          </a>
        </div>
      </div>

      {/* Mission Control Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 -mt-6 relative z-10 shadow-2xl space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-ink italic tracking-tighter font-outfit uppercase">Mission Protocol</h1>
            <p className="text-charcoal-500 text-[10px] font-black tracking-[0.2em] uppercase mt-1 italic">Payload: {order.item_category}</p>
          </div>
          <button
            onClick={() => setShowChat(true)}
            className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
            title="Message vendor"
          >
            <MessageCircle size={20} />
          </button>
        </div>

        {/* Route Details */}
        <div className="space-y-6 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-white/5"></div>
          <div className={`flex items-start gap-5 relative transition-opacity ${!isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-full border-4 border-charcoal-950 shrink-0 z-10 ${isHeadingToPickup ? 'bg-amber-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1">Step 1: Pick up</div>
               <div className="text-lg font-black text-ink leading-tight">{order.pickup_name}</div>
               {isHeadingToPickup && <NoteCard note={order.pickup_details} voiceUrl={order.pickup_voice_note_url} />}
            </div>
          </div>
          <div className={`flex items-start gap-5 relative transition-opacity ${isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-lg border-4 border-charcoal-950 shrink-0 z-10 ${!isHeadingToPickup ? 'bg-emerald-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Step 2: Deliver to</div>
               <div className="text-lg font-black text-ink leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} • {order.recipient_phone}</div>
               {!isHeadingToPickup && <NoteCard note={order.dropoff_details} voiceUrl={order.dropoff_voice_note_url} />}
            </div>
          </div>
        </div>

        {/* Package photo - shown once picked up so the rider can confirm
            they're carrying the right item */}
        {!isHeadingToPickup && order.package_photo_url && (
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <img src={order.package_photo_url} alt="Package" className="w-full h-32 object-cover" />
          </div>
        )}

        {/* Contact Actions */}
        <div className="grid grid-cols-2 gap-4">
           <a href={`tel:${order.vendor_phone || '08000'}`} className="flex flex-col items-center justify-center gap-3 py-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all active:scale-95">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                <Phone size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Call Vendor</span>
           </a>
           <a href={`tel:${order.recipient_phone}`} className="flex flex-col items-center justify-center gap-3 py-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all active:scale-95">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-blue-500 border border-white/5">
                <MessageSquare size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Call Receiver</span>
           </a>
        </div>

        {/* Delivery photo - encouraged, not required, right before the final
            confirm. Cheap insurance for a "no one home" or "wrong item"
            dispute later, without blocking a rider's income over an optional
            step they may not always be able to do (gate handoffs, etc). */}
        {order.status === 'in_transit' && (
          <div>
            <input ref={deliveryPhotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleDeliveryPhotoSelect} className="hidden" id="delivery-photo-input" />
            {deliveryPhotoUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-emerald-500/30">
                <img src={deliveryPhotoUrl} alt="Delivery proof" className="w-full h-28 object-cover" />
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-emerald-500 text-charcoal-950 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={11} /> Saved
                </div>
                <button onClick={() => setDeliveryPhotoUrl(null)} className="absolute top-2 left-2 w-7 h-7 bg-charcoal-950/80 rounded-lg flex items-center justify-center text-ink">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label htmlFor="delivery-photo-input" className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-emerald-500/40 transition-all">
                {uploadingDeliveryPhoto ? (
                  <><Loader2 size={16} className="animate-spin text-emerald-500" /> <span className="text-charcoal-400 text-xs font-bold">Uploading...</span></>
                ) : (
                  <><Camera size={16} className="text-charcoal-500" /> <span className="text-charcoal-400 text-xs font-bold">Add a delivery photo (recommended)</span></>
                )}
              </label>
            )}
          </div>
        )}

        {/* Progress Action - SLIDE TO CONFIRM */}
        <div className="pt-4">
           {/* FIX: previously a rider could slide straight to "picked up" the
               moment a job was matched, with no payment step in between at
               all. Now, once matched, the rider sees a locked "waiting for
               payment" state until order.payment_status flips to 'paid'
               (set server-side by /api/verify-payment once the vendor pays
               on /payment). The realtime subscription above already updates
               `order` in place, so this unlocks live without a refresh. */}
           {order.status === 'matched' && order.payment_status !== 'paid' && (
             <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-3">
               <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                 <Loader2 size={22} className="animate-spin" />
               </div>
               <p className="text-amber-500 font-black text-sm uppercase tracking-widest">Waiting for vendor payment</p>
               <p className="text-charcoal-400 text-xs leading-relaxed">
                 The vendor needs to complete payment before you head to pickup. This will unlock automatically the moment it's confirmed.
               </p>
             </div>
           )}
           {order.status === 'matched' && order.payment_status === 'paid' && (
             <SlideToConfirm 
               text="Slide to confirm Pickup" 
               color="bg-amber-500" 
               onConfirm={() => updateStatus('picked_up')} 
             />
           )}
           {order.status === 'picked_up' && (
             <SlideToConfirm 
               text="Slide to start Transit" 
               color="bg-blue-500" 
               onConfirm={() => updateStatus('in_transit')} 
             />
           )}
           {order.status === 'in_transit' && (
             <SlideToConfirm 
               text="Slide to Mark Delivered" 
               color="bg-emerald-500" 
               onConfirm={() => updateStatus('delivered')} 
             />
           )}
           
           {updating && (
             <div className="mt-4 flex items-center justify-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
               <Loader2 size={14} className="animate-spin" /> Updating...
             </div>
           )}
        </div>
      </div>

      <div className="px-8 text-center flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-charcoal-600">
          Sharing your live location
        </p>
      </div>

      <AnimatePresence>
        {showChat && currentUserId && (
          <OrderChat
            orderId={order.id}
            currentUserId={currentUserId}
            onClose={() => setShowChat(false)}
            isReadOnly={order.status === 'delivered' || order.status === 'cancelled'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\app\rider\(main)\active-job\page.jsx" -NewContent $content_16 -Label "Fix back-button-after-delivery bug + wording"

# ------------------------------------------------------------------
# New: visual status stepper component
# ------------------------------------------------------------------
$content_17 = @'
"use client";

import { CheckCircle2, UserCheck, Package, Truck, PartyPopper, Search } from 'lucide-react';

const STEP_META = {
  pending: { label: 'Finding a rider', icon: Search },
  looking_for_driver: { label: 'Finding a rider', icon: Search },
  matched: { label: 'Rider assigned', icon: UserCheck },
  picked_up: { label: 'Package picked up', icon: Package },
  in_transit: { label: 'On the way', icon: Truck },
  delivered: { label: 'Delivered', icon: PartyPopper },
};

/**
 * A connected, visual step tracker for order status - replaces the old
 * flat checkmark + label list. Each step is a filled circle (done),
 * pulsing ring (current), or outline (upcoming), joined by a progress
 * line that fills as the order advances.
 */
export default function OrderStatusStepper({ steps, currentStatus }) {
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const meta = STEP_META[step] || { label: step, icon: CheckCircle2 };
        const Icon = meta.icon;
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === steps.length - 1;

        return (
          <div key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-500 text-charcoal-950'
                    : isCurrent
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                    : 'bg-white/5 border-white/10 text-charcoal-600'
                }`}
              >
                {isCurrent && (
                  <span className="absolute w-9 h-9 rounded-full bg-emerald-500/30 animate-ping" />
                )}
                <Icon size={16} className="relative" />
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[28px] transition-all ${isDone ? 'bg-emerald-500' : 'bg-white/10'}`} />
              )}
            </div>
            <div className={`pb-7 pt-1.5 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-sm font-black ${isDone || isCurrent ? 'text-ink' : 'text-charcoal-600'}`}>
                {meta.label}
              </p>
              {isCurrent && (
                <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">In progress</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
'@

Set-WholeFile -RelativePath "src\components\ui\OrderStatusStepper.jsx" -NewContent $content_17 -Label "New: visual status stepper component"

Write-Host ""
Write-Host "Done. Review changes (git diff, or .bak files) before deploying." -ForegroundColor White
Write-Host ""
