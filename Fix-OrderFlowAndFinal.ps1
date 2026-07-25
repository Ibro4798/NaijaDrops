<#
  Fix-OrderFlowAndFinal.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. RIDER "COULD NOT GET YOUR LOCATION" - the dashboard's "Go Online" was
     calling navigator.geolocation.getCurrentPosition directly with
     enableHighAccuracy:true and only a 10s timeout, no fallback, and showed
     the same generic message regardless of whether the real problem was a
     timeout, a denied permission, or something else. Switched to the same
     tiered GPS -> IP-location fallback already built and used elsewhere in
     the app, so a slow/weak GPS lock (very common indoors or under cloud
     cover) no longer means an outright failure.

  2. THEME DEFAULT REVERTED TO DARK - light is still fully available via the
     Light/Dark/System picker on the Profile page, it's just no longer what
     a fresh visitor sees automatically.

  3. SUPPORT EMAIL - re-checked the entire codebase: support@naijadrops.tech
     does not appear anywhere anymore. It was already removed in an earlier
     round (Support page + Footer). If it's still visible somewhere for you,
     that's almost certainly a stale cached page or an old deploy, not code
     that still needs fixing - let me know exactly where you're seeing it if
     it persists after this deploys and I'll track it down specifically.

  4. THE FULL ORDER FLOW REDESIGN (the big one):
     - Step 1 (locations): each of pickup and dropoff now gets its own
       inline, optional "Help your rider find you" section right after it's
       confirmed - a text note, or a "record voice note instead" toggle
       (capped at 45s). This replaced the old single voice-note field that
       lived on step 2.
     - Step 2 (package details): add a package photo. The moment it's
       attached, it's sent to Claude's vision API for a Small/Medium/Large
       size estimate (shown with an "estimated from photo" badge) - fully
       overridable with one tap, and if the API isn't configured or fails
       for any reason, it silently falls back to the manual picker that
       already existed. Vehicle type stays the motorcycle-only confirmation
       from before.
     - Step 3: unchanged (review, price, Find a Driver, the launch gate).
     - Rider side: the pickup note/voice note now surfaces on the Active Job
       screen exactly when heading to pickup - not buried in a form filled
       out earlier. The dropoff note/voice and the package photo (so the
       rider can confirm they're carrying the right item) surface once
       picked up. Before the final "Mark Delivered" slide, there's now an
       encouraged (not required) delivery photo capture - cheap insurance
       for a "no one home" or "wrong item" dispute later, without blocking a
       rider's income over an optional step they can't always complete.

  NEW ENVIRONMENT VARIABLE NEEDED: ANTHROPIC_API_KEY, for the package photo
  size estimate. Add it in Vercel -> Project Settings -> Environment
  Variables (Production) and redeploy. Until it's set, that one feature just
  quietly does nothing extra - manual size selection keeps working exactly
  as it does today, nothing breaks.

  This script writes full file content for rewritten files and does targeted
  find-and-replace for existing files it only needs to touch in part. Backs
  up everything to .fix-backup-batch9\ first. Includes a UTF-8 BOM. Uses
  -LiteralPath throughout.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-OrderFlowAndFinal.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-batch9"
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

Write-Host "`nApplying the full order flow redesign and final fixes:" -ForegroundColor Cyan

$content0 = @'
import { NextResponse } from "next/server";

/**
 * Estimates a package size (small/medium/large) from a photo, using Claude's
 * vision API. This is advisory only - the frontend always lets the vendor
 * override it with a manual tap, so a wrong or missing guess never blocks
 * anyone from continuing.
 *
 * Requires ANTHROPIC_API_KEY to be set in the environment. If it's missing,
 * or the API call fails for any reason (bad image, network issue, rate
 * limit), this returns { success: false } and the frontend just falls back
 * to the existing manual Small/Medium/Large picker - no error is shown to
 * the vendor, since a failed "nice-to-have" guess isn't worth interrupting
 * the flow over.
 */
export async function POST(req) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY not set - package photo estimation disabled, falling back to manual sizing.");
      return NextResponse.json({ success: false, reason: "not_configured" });
    }

    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ success: false, reason: "no_image" });
    }

    const prompt = `You are helping estimate a delivery package size for a motorcycle courier in Kano, Nigeria. Look at this photo of a package/item to be delivered.

Classify it into exactly one of these three sizes:
- "small": fits in a bag or under the arm (documents, phones, small envelopes, jewelry, shoes in a small bag)
- "medium": a small-to-medium box (electronics boxes, food orders, clothing bundles, medium bags)
- "large": bulky or multiple items, needs both hands or won't fit in a backpack (large boxes, multiple bags, furniture pieces, large appliances)

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"size": "small" | "medium" | "large", "reasoning": "one short sentence explaining why"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return NextResponse.json({ success: false, reason: "api_error" });
    }

    const data = await response.json();
    const textBlock = data.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ success: false, reason: "no_response" });
    }

    let parsed;
    try {
      // Claude sometimes wraps JSON in a code fence despite instructions - strip that first.
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ success: false, reason: "unparseable" });
    }

    if (!["small", "medium", "large"].includes(parsed.size)) {
      return NextResponse.json({ success: false, reason: "invalid_size" });
    }

    return NextResponse.json({
      success: true,
      size: parsed.size,
      reasoning: parsed.reasoning || null,
    });
  } catch (err) {
    console.error("Package estimation error:", err);
    return NextResponse.json({ success: false, reason: "exception" });
  }
}
'@
$target0 = Get-FullPath "src\app\api\estimate-package\route.js"
Write-FileContent $target0 $content0

$content1 = @'
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Navigation, Search, ArrowRight, X, Link as LinkIcon,
  Loader2, ArrowLeft, ChevronRight, Mic, Square, Play, Trash2, MessageSquareText
} from "lucide-react";
import { getMapboxSuggestions, reverseGeocodeMapbox, getMapboxRoute } from "@/utils/mapbox";
import { extractFirstUrl } from "@/utils/MapResolver";
import { createClient } from "@/utils/supabase/client";

const Map = dynamic(() => import("react-map-gl").then(m => m.default), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then(m => m.Marker), { ssr: false });
const Source = dynamic(() => import("react-map-gl").then(m => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl").then(m => m.Layer), { ssr: false });

const DRAFT_KEY = "nd_order_draft";
const LAST_PICKUP_KEY = "nd_last_pickup";
const KANO_CENTER = { lat: 11.9964, lng: 8.5200 };

function formatDistance(meters) {
  if (!meters) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * "Help your rider find you" - inline, optional note per location. Text by
 * default, with a "record voice note instead" toggle. This is what replaced
 * the old single voice-note field on step 2 - a pin alone often isn't enough
 * in Kano's markets, but a strict text-vs-voice choice was worse than just
 * letting someone do whichever's faster for them in the moment.
 */
function LocationNoteSection({ label, note, onNoteChange, voiceUrl, onVoiceUrlChange, storagePrefix }) {
  const supabase = createClient();
  const [mode, setMode] = useState("text"); // 'text' | 'voice'
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        setIsUploading(true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fileName = `${storagePrefix}_${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from("documents").upload(fileName, blob, { contentType: "audio/webm" });
        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from("documents").getPublicUrl(fileName);
          onVoiceUrlChange(publicUrlData.publicUrl);
        } else {
          alert("Couldn't upload the voice note. Try again or use text instead.");
        }
        setIsUploading(false);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      // Soft cap so notes stay quick to listen to - matches the WhatsApp
      // voice-note length this ICP already uses daily.
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        setIsRecording(false);
      }, 45000);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div className="mt-2 bg-white/[0.03] border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-charcoal-400">
          <MessageSquareText size={14} />
          <span className="text-xs font-bold">Help your rider find you</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-charcoal-600 bg-white/5 px-2 py-0.5 rounded-full">Optional</span>
        </div>
        <div className="flex gap-1 bg-charcoal-950 rounded-full p-1">
          <button
            onClick={() => setMode("text")}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === "text" ? "bg-emerald-500 text-charcoal-950" : "text-charcoal-500"}`}
          >
            Text
          </button>
          <button
            onClick={() => setMode("voice")}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === "voice" ? "bg-emerald-500 text-charcoal-950" : "text-charcoal-500"}`}
          >
            Voice
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={`e.g. "Blue gate, ask for ${label === "pickup" ? "Aunty Fatima's shop" : "the security man"}"`}
          rows={2}
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-3 text-ink placeholder:text-charcoal-600 text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
      ) : (
        <div className="flex items-center gap-3">
          {isUploading ? (
            <div className="flex items-center text-emerald-500 gap-2 text-xs font-bold px-4 py-2.5 bg-emerald-500/10 rounded-xl">
              <Loader2 size={14} className="animate-spin" /> Uploading...
            </div>
          ) : voiceUrl ? (
            <>
              <button onClick={() => { const a = new Audio(voiceUrl); a.play(); }} className="p-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-colors">
                <Play size={16} fill="currentColor" />
              </button>
              <span className="text-charcoal-400 text-xs font-bold">Voice note recorded</span>
              <button onClick={() => onVoiceUrlChange("")} className="ml-auto p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-emerald-500 hover:bg-emerald-400 text-charcoal-950"}`}
            >
              {isRecording ? <><Square size={12} fill="currentColor" /> Stop</> : <><Mic size={12} /> Record (max 45s)</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Step1Page() {
  const router = useRouter();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [pickup, setPickup] = useState(null);   // { name, lat, lng }
  const [dropoff, setDropoff] = useState(null);  // { name, lat, lng }
  const [pickupInput, setPickupInput] = useState("");
  const [dropoffInput, setDropoffInput] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [activeInput, setActiveInput] = useState(null); // 'pickup' | 'dropoff'
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
  const [mapViewState, setMapViewState] = useState({ longitude: KANO_CENTER.lng, latitude: KANO_CENTER.lat, zoom: 12 });
  const [linkInput, setLinkInput] = useState("");
  const [linkTarget, setLinkTarget] = useState(null); // 'pickup' | 'dropoff'
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const searchTimeout = useRef(null);

  // Per-location "help your rider find you" notes.
  const [pickupNote, setPickupNote] = useState("");
  const [pickupVoiceUrl, setPickupVoiceUrl] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [dropoffVoiceUrl, setDropoffVoiceUrl] = useState("");

  // Preload last pickup on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lastPickup = JSON.parse(localStorage.getItem(LAST_PICKUP_KEY));
      if (lastPickup?.lat && lastPickup?.lng) {
        setPickup(lastPickup);
        setPickupInput(lastPickup.name || "Last pickup location");
      }
    } catch {}
    // Also restore any existing draft
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (draft?.pickup) { setPickup(draft.pickup); setPickupInput(draft.pickup.name); }
      if (draft?.dropoff) { setDropoff(draft.dropoff); setDropoffInput(draft.dropoff.name); }
      if (draft?.pickup_note) setPickupNote(draft.pickup_note);
      if (draft?.pickup_voice_note_url) setPickupVoiceUrl(draft.pickup_voice_note_url);
      if (draft?.dropoff_note) setDropoffNote(draft.dropoff_note);
      if (draft?.dropoff_voice_note_url) setDropoffVoiceUrl(draft.dropoff_voice_note_url);
    } catch {}
  }, []);

  // Auto-fetch route when both pins set
  useEffect(() => {
    if (!pickup || !dropoff) { setRouteData(null); setRouteInfo(null); return; }
    async function fetchRoute() {
      const route = await getMapboxRoute(pickup, dropoff, mapboxToken);
      if (route?.geometry) {
        setRouteData(route.geometry);
        setRouteInfo({ distance: route.distance, duration: route.duration });
      }
    }
    fetchRoute();

    // Auto-zoom map to fit both pins
    const minLng = Math.min(pickup.lng, dropoff.lng);
    const maxLng = Math.max(pickup.lng, dropoff.lng);
    const minLat = Math.min(pickup.lat, dropoff.lat);
    const maxLat = Math.max(pickup.lat, dropoff.lat);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const spread = Math.max(maxLng - minLng, maxLat - minLat);
    const zoom = Math.max(10, Math.min(14, 14 - Math.log2(spread * 100)));
    setMapViewState({ longitude: centerLng, latitude: centerLat, zoom });
  }, [pickup, dropoff]);

  // Search handler
  async function handleSearch(val, type) {
    if (type === "pickup") { setPickupInput(val); setPickup(null); }
    else { setDropoffInput(val); setDropoff(null); }
    clearTimeout(searchTimeout.current);
    if (val.length < 2) { type === "pickup" ? setPickupSuggestions([]) : setDropoffSuggestions([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const results = await getMapboxSuggestions(val, mapboxToken);
      if (type === "pickup") setPickupSuggestions(results);
      else setDropoffSuggestions(results);
    }, 280);
  }

  function selectLocation(loc, type) {
    const point = { name: loc.description || loc.name, lat: loc.lat, lng: loc.lng };
    if (type === "pickup") {
      setPickup(point); setPickupInput(point.name); setPickupSuggestions([]);
    } else {
      setDropoff(point); setDropoffInput(point.name); setDropoffSuggestions([]);
    }
    setActiveInput(null);
  }

  async function handleUseMyLocation() {
    setGpsLoading(true);
    setGpsError(null);
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

  async function handleLinkPaste() {
    if (!linkInput) return;

    const extractedUrl = extractFirstUrl(linkInput);

    if (!extractedUrl) {
      alert("No valid map link found in the text.");
      return;
    }

    setGpsLoading(true);
    setLinkError(null);
    try {
      const resp = await fetch("/api/resolve-link", {
        method: "POST",
        body: JSON.stringify({ url: extractedUrl }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();

      if (data.lat && data.lng) {
        const name = await reverseGeocodeMapbox(data.lat, data.lng, mapboxToken);
        const point = { name, lat: data.lat, lng: data.lng };
        selectLocation(point, linkTarget);
        setShowLinkModal(false);
        setLinkInput("");
      } else {
        setLinkError(data.error || "Unable to resolve this map link. Please try a different link or search manually.");
      }
    } catch (err) {
      setLinkError("Connection failed. Please check your network and try again.");
    } finally {
      setGpsLoading(false);
    }
  }

  function handleContinue() {
    if (!pickup || !dropoff) return;
    const draft = {
      pickup, dropoff,
      distance_m: routeInfo?.distance, duration_s: routeInfo?.duration,
      pickup_note: pickupNote.trim(),
      pickup_voice_note_url: pickupVoiceUrl,
      dropoff_note: dropoffNote.trim(),
      dropoff_voice_note_url: dropoffVoiceUrl,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    localStorage.setItem(LAST_PICKUP_KEY, JSON.stringify(pickup));
    router.push("/send-package/step-2");
  }

  const bothSet = pickup && dropoff;

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/dashboard")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 1 of 3</div>
          <h1 className="text-xl font-black text-ink tracking-tight">Set Locations</h1>
        </div>
        {/* Step pills */}
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s === 1 ? "w-6 bg-emerald-500" : "w-3 bg-white/20"}`} />
          ))}
        </div>
      </div>

      {/* Map Preview */}
      <div className={`mx-5 rounded-3xl overflow-hidden border border-white/10 transition-all duration-500 ${bothSet ? "h-52" : "h-36"}`}>
        {mapboxToken ? (
          <Map
            mapboxAccessToken={mapboxToken}
            {...mapViewState}
            onMove={e => setMapViewState(e.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
          >
            {routeData && (
              <Source id="route" type="geojson" data={{ type: "Feature", geometry: routeData }}>
                <Layer id="routeLine" type="line" layout={{ "line-join": "round", "line-cap": "round" }}
                  paint={{ "line-color": "#10b981", "line-width": 4, "line-opacity": 0.85 }} />
              </Source>
            )}
            {pickup && (
              <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
                <div className="w-8 h-8 bg-white rounded-full border-4 border-charcoal-900 flex items-center justify-center shadow-xl">
                  <div className="w-3 h-3 bg-charcoal-900 rounded-full" />
                </div>
              </Marker>
            )}
            {dropoff && (
              <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
                <MapPin size={32} className="text-emerald-400 drop-shadow-lg" fill="#10b981" fillOpacity={0.2} />
              </Marker>
            )}
          </Map>
        ) : (
          <div className="w-full h-full bg-charcoal-900 flex items-center justify-center">
            <span className="text-charcoal-600 text-sm font-medium">Map preview</span>
          </div>
        )}
      </div>

      {/* Route info bar */}
      <AnimatePresence>
        {routeInfo && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-5 mt-3 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <MapPin size={14} />
              <span className="font-black text-sm">{formatDistance(routeInfo.distance)}</span>
            </div>
            <div className="h-px flex-1 mx-3 bg-emerald-500/20" />
            <div className="text-emerald-400 font-black text-sm">{formatDuration(routeInfo.duration)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Inputs */}
      <div className="flex-1 px-5 pt-4 pb-6 space-y-3 overflow-y-auto">
        {/* Pickup field */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Pickup Location</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-charcoal-600" />
            <input
              type="text"
              placeholder="Where to pick up from?"
              value={pickupInput}
              onFocus={() => setActiveInput("pickup")}
              onChange={e => handleSearch(e.target.value, "pickup")}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium"
            />
            {pickupInput && (
              <button onClick={() => { setPickupInput(""); setPickup(null); setPickupSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-ink transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          {/* GPS + Paste link buttons */}
          <div className="flex gap-2 mt-2">
            <button onClick={handleUseMyLocation} disabled={gpsLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              {gpsLoading ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
              Use my location
            </button>
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
          <AnimatePresence>
            {activeInput === "pickup" && pickupSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                {pickupSuggestions.map((s, i) => (
                  <button key={i} onClick={() => selectLocation(s, "pickup")}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <MapPin className="text-charcoal-500 shrink-0 mt-0.5" size={14} />
                    <div>
                      <div className="text-ink text-sm font-semibold leading-tight">{s.name}</div>
                      <div className="text-charcoal-500 text-xs mt-0.5 leading-tight">{s.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline "help your rider find you" note - appears once pickup is confirmed */}
          <AnimatePresence>
            {pickup && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <LocationNoteSection
                  label="pickup"
                  note={pickupNote}
                  onNoteChange={setPickupNote}
                  voiceUrl={pickupVoiceUrl}
                  onVoiceUrlChange={setPickupVoiceUrl}
                  storagePrefix="pickup_note"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dropoff field */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Dropoff Location</label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" size={15} />
            <input
              type="text"
              placeholder="Where to deliver to?"
              value={dropoffInput}
              onFocus={() => setActiveInput("dropoff")}
              onChange={e => handleSearch(e.target.value, "dropoff")}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium"
            />
            {dropoffInput && (
              <button onClick={() => { setDropoffInput(""); setDropoff(null); setDropoffSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-ink transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setLinkTarget("dropoff"); setShowLinkModal(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              <LinkIcon size={12} />
              Paste map link
            </button>
          </div>

          <AnimatePresence>
            {activeInput === "dropoff" && dropoffSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                {dropoffSuggestions.map((s, i) => (
                  <button key={i} onClick={() => selectLocation(s, "dropoff")}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <MapPin className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                    <div>
                      <div className="text-ink text-sm font-semibold leading-tight">{s.name}</div>
                      <div className="text-charcoal-500 text-xs mt-0.5 leading-tight">{s.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline "help your rider find you" note - appears once dropoff is confirmed */}
          <AnimatePresence>
            {dropoff && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <LocationNoteSection
                  label="dropoff"
                  note={dropoffNote}
                  onNoteChange={setDropoffNote}
                  voiceUrl={dropoffVoiceUrl}
                  onVoiceUrlChange={setDropoffVoiceUrl}
                  storagePrefix="dropoff_note"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06]">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleContinue}
          disabled={!bothSet}
          className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all ${bothSet
            ? "bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 shadow-[0_0_24px_rgba(16,185,129,0.35)]"
            : "bg-white/[0.05] text-charcoal-600 border border-white/10 cursor-not-allowed"}`}
        >
          Continue <ArrowRight size={18} />
        </motion.button>
        {!bothSet && (
          <p className="text-center text-charcoal-600 text-xs mt-3 font-medium">Both locations required to continue</p>
        )}
      </div>

      {/* Paste link modal */}
      <AnimatePresence>
        {showLinkModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal-950/90 backdrop-blur-sm flex items-end">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="w-full bg-charcoal-900 border-t border-white/10 rounded-t-[2rem] p-6">
              <h3 className="text-ink font-black text-lg mb-1">Paste a Map Link</h3>
              <p className="text-charcoal-500 text-sm mb-4">Works with Google Maps, Apple Maps URLs</p>

              <div className="relative mb-4">
                <textarea value={linkInput} onChange={e => { setLinkInput(e.target.value); setLinkError(null); }} rows={3}
                  disabled={gpsLoading}
                  placeholder="Paste your maps link here..."
                  className={`w-full bg-charcoal-800 border ${linkError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl p-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-sm font-medium resize-none transition-all`} />

                {gpsLoading && (
                  <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-2">
                    <Loader2 className="text-emerald-500 animate-spin" size={24} />
                    <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Resolving coordinates...</span>
                  </div>
                )}
              </div>

              {linkError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                  <X className="text-red-500 shrink-0" size={18} />
                  <p className="text-red-400 text-xs font-bold leading-tight">{linkError}</p>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setShowLinkModal(false); setLinkInput(""); setLinkError(null); }}
                  disabled={gpsLoading}
                  className="flex-1 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-charcoal-300 font-bold text-sm disabled:opacity-50">Cancel</button>
                <button onClick={handleLinkPaste}
                  disabled={gpsLoading || !linkInput.trim()}
                  className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 rounded-2xl text-charcoal-950 font-black text-sm disabled:opacity-50 shadow-glow">
                  {gpsLoading ? "Extracting..." : "Extract Location"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
'@
$target1 = Get-FullPath "src\app\send-package\step-1\page.jsx"
Write-FileContent $target1 $content1

$content2 = @'
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Package, Phone, User, ArrowRight, Bell, Camera, X, Loader2, Sparkles
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const DRAFT_KEY = "nd_order_draft";

// Pricing constants
const BASE_PRICE = 500;
const PRICE_PER_KM = { bike: 120, car: 200 };
const SIZE_MULTIPLIERS = { small: 1.0, medium: 1.25, large: 1.6 };

function calcPrice(distanceM, vehicleType, sizeId) {
  if (!distanceM) return null;
  const km = distanceM / 1000;
  const rate = PRICE_PER_KM[vehicleType] || PRICE_PER_KM.bike;
  const sizeMultiplier = SIZE_MULTIPLIERS[sizeId] || 1.0;
  return Math.round((BASE_PRICE + km * rate) * sizeMultiplier);
}

const SIZES = [
  { id: "small", label: "Small", sub: "Fits in a bag", emoji: "🎒", desc: "Documents, envelopes, small items" },
  { id: "medium", label: "Medium", sub: "Small box", emoji: "📦", desc: "Shoes, electronics, food orders" },
  { id: "large", label: "Large", sub: "Big load", emoji: "🗃️", desc: "Multiple items, large packages" },
];

const VEHICLES = [
  { id: "bike", label: "Motorcycle", sub: "Faster & cheaper", emoji: "🏍️", badge: "Popular" },
];

// Compresses + converts a File to base64 for the estimation API, capping
// dimensions so the request stays small and fast over patchy connections.
function fileToResizedBase64(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  });
}

export default function Step2Page() {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [size, setSize] = useState("small");
  const [sizeSource, setSizeSource] = useState(null); // null | 'ai' | 'manual'
  const [vehicle, setVehicle] = useState("bike");
  const [description, setDescription] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [notifyReceiver, setNotifyReceiver] = useState(false);

  const [packagePhotoUrl, setPackagePhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimateReasoning, setEstimateReasoning] = useState(null);
  const fileInputRef = useRef(null);

  const supabase = createClient();

  const estimatedPrice = calcPrice(draft?.distance_m, vehicle, size);
  const distanceKm = draft?.distance_m ? (draft.distance_m / 1000).toFixed(1) : null;

  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.dropoff) { router.replace("/send-package/step-1"); return; }
      setDraft(d);
      if (d.size) { setSize(d.size); setSizeSource(d.size_source || null); }
      if (d.vehicle) setVehicle(d.vehicle);
      if (d.description) setDescription(d.description);
      if (d.package_photo_url) setPackagePhotoUrl(d.package_photo_url);
      if (d.recipient_name) setReceiverName(d.recipient_name);
      if (d.recipient_phone) setReceiverPhone(d.recipient_phone);
      if (d.notify_receiver !== undefined) setNotifyReceiver(d.notify_receiver);
    } catch {
      router.replace("/send-package/step-1");
    }
  }, []);

  const canContinue = size && vehicle && description.trim() && receiverName.trim() && receiverPhone.trim().length >= 8;

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    setEstimateReasoning(null);

    try {
      // Upload the actual photo for the rider to see later, and run the
      // (much smaller, resized) version through the size-estimate API in
      // parallel - neither one blocks the other.
      const fileName = `package_${Date.now()}.jpg`;
      const uploadPromise = supabase.storage.from("delivery-photos").upload(fileName, file, { contentType: file.type || "image/jpeg" });

      const estimatePromise = (async () => {
        setEstimating(true);
        try {
          const base64 = await fileToResizedBase64(file);
          const res = await fetch("/api/estimate-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
          });
          const result = await res.json();
          if (result.success) {
            setSize(result.size);
            setSizeSource("ai");
            setEstimateReasoning(result.reasoning);
          }
          // On failure, we simply say nothing - manual sizing already works
          // fine and always did, this is a bonus when it works.
        } catch {
          // Same as above - silent fallback to manual sizing.
        } finally {
          setEstimating(false);
        }
      })();

      const [{ data, error }] = await Promise.all([uploadPromise, estimatePromise]);
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from("delivery-photos").getPublicUrl(fileName);
        setPackagePhotoUrl(publicUrlData.publicUrl);
      } else {
        alert("Couldn't upload the photo. You can still continue without it.");
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto() {
    setPackagePhotoUrl("");
    setPhotoPreview(null);
    setEstimateReasoning(null);
    setSizeSource(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleContinue() {
    if (!canContinue) return;
    const updated = {
      ...draft,
      size,
      size_source: sizeSource,
      vehicle,
      description: description.trim(),
      package_photo_url: packagePhotoUrl,
      recipient_name: receiverName.trim(),
      recipient_phone: receiverPhone.trim(),
      notify_receiver: notifyReceiver,
      estimated_price: estimatedPrice,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    router.push("/send-package/step-3");
  }

  if (!draft) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/send-package/step-1")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 2 of 3</div>
          <h1 className="text-xl font-black text-ink tracking-tight">Package Details</h1>
        </div>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s <= 2 ? "w-6 bg-emerald-500" : "w-3 bg-white/20"}`} />
          ))}
        </div>
      </div>

      {/* Price + Distance Strip */}
      <div className="mx-5 mb-5 bg-gradient-to-r from-emerald-500/10 to-emerald-400/5 border border-emerald-500/20 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Distance</div>
          <div className="text-ink font-black text-lg">{distanceKm ? `${distanceKm} km` : "—"}</div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div className="text-right">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Price Estimate</div>
          <AnimatePresence mode="wait">
            <motion.div key={`${vehicle}-${size}-${estimatedPrice}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-emerald-400 font-black text-2xl">
              {estimatedPrice ? `₦${estimatedPrice.toLocaleString()}` : "—"}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Route</div>
          <div className="text-ink font-black text-sm truncate max-w-[80px]">
            {draft.pickup?.name?.split(",")[0] || "—"}
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-6 space-y-6">
        {/* Package Photo */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-3 block">Package Photo</label>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" id="package-photo-input" />
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-white/10">
              <img src={photoPreview} alt="Package" className="w-full h-40 object-cover" />
              {(uploadingPhoto || estimating) && (
                <div className="absolute inset-0 bg-charcoal-950/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                  <Loader2 className="text-emerald-500 animate-spin" size={24} />
                  <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                    {estimating ? "Estimating size..." : "Uploading..."}
                  </span>
                </div>
              )}
              <button onClick={removePhoto} className="absolute top-3 right-3 w-8 h-8 bg-charcoal-950/80 backdrop-blur-md rounded-xl flex items-center justify-center text-ink">
                <X size={16} />
              </button>
            </div>
          ) : (
            <label htmlFor="package-photo-input" className="flex flex-col items-center justify-center gap-2 py-8 bg-charcoal-900 border border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-emerald-500/40 transition-all">
              <Camera size={24} className="text-charcoal-500" />
              <span className="text-charcoal-400 text-xs font-bold">Add a photo - we'll suggest a size for you</span>
              <span className="text-charcoal-600 text-[10px]">Optional, but helps set the right price</span>
            </label>
          )}
          {estimateReasoning && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Sparkles size={13} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-emerald-400 text-[11px] font-medium leading-snug">{estimateReasoning}</p>
            </div>
          )}
        </div>

        {/* Package Size */}
        <div>
          <div className="flex items-center justify-between ml-1 mb-3">
            <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Package Size</label>
            {sizeSource === "ai" && (
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Sparkles size={10} /> Estimated from photo
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map(s => (
              <button key={s.id} onClick={() => { setSize(s.id); setSizeSource("manual"); }}
                className={`p-3 rounded-2xl border-2 flex flex-col gap-1 text-left transition-all active:scale-95 ${size === s.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}>
                <span className="text-2xl">{s.emoji}</span>
                <span className={`text-xs font-black ${size === s.id ? "text-ink" : "text-charcoal-300"}`}>{s.label}</span>
                <span className="text-[10px] text-charcoal-500">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Type */}
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

        {/* Text Inputs */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 block">Package & Receiver Info</label>

          <div className="relative">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="text" placeholder="Package description (e.g. Red shoes, size 42)"
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="text" placeholder="Receiver full name"
              value={receiverName} onChange={e => setReceiverName(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>

          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="tel" placeholder="Receiver phone (e.g. 08012345678)"
              value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>
        </div>

        {/* Notify toggle */}
        <button onClick={() => setNotifyReceiver(!notifyReceiver)}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${notifyReceiver ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.02]"}`}>
          <div className="flex items-center gap-3">
            <Bell size={16} className={notifyReceiver ? "text-emerald-400" : "text-charcoal-500"} />
            <div className="text-left">
              <div className={`text-sm font-bold ${notifyReceiver ? "text-ink" : "text-charcoal-300"}`}>Notify Receiver</div>
              <div className="text-charcoal-500 text-xs">Call before delivery (optional)</div>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-all ${notifyReceiver ? "bg-emerald-500" : "bg-charcoal-700"} relative`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${notifyReceiver ? "left-6" : "left-1"}`} />
          </div>
        </button>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06]">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleContinue} disabled={!canContinue}
          className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all ${canContinue
            ? "bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 shadow-[0_0_24px_rgba(16,185,129,0.35)]"
            : "bg-white/[0.05] text-charcoal-600 border border-white/10 cursor-not-allowed"}`}>
          Find Drivers <ArrowRight size={18} />
        </motion.button>
      </div>
    </div>
  );
}
'@
$target2 = Get-FullPath "src\app\send-package\step-2\page.jsx"
Write-FileContent $target2 $content2

$content3 = @'
'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({
  theme: 'dark',       // resolved theme actually applied: 'light' | 'dark'
  mode: 'dark',        // user's chosen mode: 'light' | 'dark' | 'system'
  setMode: () => {},
  toggleTheme: () => {},
});

function applyTheme(resolved) {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
    // Dark is the default theme - light is available as an explicit choice
    // via the picker on the Profile page.
    const [mode, setModeState] = useState('dark');
    const [theme, setTheme] = useState('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem('themeMode'); // 'light' | 'dark' | 'system'
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const resolve = (m) => (m === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : m);

        const initialMode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
        setModeState(initialMode);
        const resolved = resolve(initialMode);
        setTheme(resolved);
        applyTheme(resolved);

        // Keep tracking OS changes live while mode is 'system'.
        const handleSystemChange = (e) => {
            const currentMode = localStorage.getItem('themeMode') || 'dark';
            if (currentMode === 'system') {
                const next = e.matches ? 'dark' : 'light';
                setTheme(next);
                applyTheme(next);
            }
        };
        mediaQuery.addEventListener('change', handleSystemChange);
        return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }, []);

    const setMode = useCallback((newMode) => {
        localStorage.setItem('themeMode', newMode);
        setModeState(newMode);
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const resolved = newMode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : newMode;
        setTheme(resolved);
        applyTheme(resolved);
    }, []);

    // Kept for the existing Navbar toggle button - simple light/dark flip,
    // treated as explicitly choosing that mode (not 'system').
    const toggleTheme = useCallback(() => {
        setMode(theme === 'light' ? 'dark' : 'light');
    }, [theme, setMode]);

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
            {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
'@
$target3 = Get-FullPath "src\components\ThemeProvider.jsx"
Write-FileContent $target3 $content3

$patchOld0 = @'
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import IncomingOrderCard from '@/components/rider/IncomingOrderCard';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
'@
$patchNew0 = @'
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import IncomingOrderCard from '@/components/rider/IncomingOrderCard';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import { getReliableLocation } from '@/utils/geolocation';
'@
$movedFull0 = Get-FullPath "src\app\rider\(main)\dashboard\page.jsx"
if (Test-Path -LiteralPath $movedFull0) { $patchTarget0 = $movedFull0 } else { $patchTarget0 = Get-FullPath "src\app\rider\dashboard\page.jsx" }
Patch-File $patchTarget0 $patchOld0 $patchNew0 "rider dashboard imports"

$patchOld1 = @'
    // Going online requires a real location fix - get_nearby_online_riders() filters
    // on current_lat/current_lng being non-null, so skipping this breaks matching entirely.
    if (!navigator.geolocation) {
      setError('Location services are required to go online.');
      setToggling(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const { error: updErr } = await supabase.from('riders').update({
          operational_status: 'online',
          current_lat: latitude,
          current_lng: longitude
        }).eq('id', rider.id);
        if (!updErr) {
          setRider({ ...rider, operational_status: 'online', current_lat: latitude, current_lng: longitude });
          await fetchBroadcastJobs(rider.id);
        }
        setToggling(false);
      },
      () => { setError('Could not get your location. Enable location access and try again.'); setToggling(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
'@
$patchNew1 = @'
    // Going online requires a real location fix - get_nearby_online_riders() filters
    // on current_lat/current_lng being non-null, so skipping this breaks matching entirely.
    //
    // FIX: this used to call navigator.geolocation.getCurrentPosition directly
    // with enableHighAccuracy:true and only a 10s timeout - on a real phone
    // with a weak GPS lock (indoors, cloud cover, patchy signal) that
    // regularly timed out, and the error handler showed the same "enable
    // location access" message regardless of whether the real problem was a
    // timeout, a denied permission, or something else. Switched to the same
    // tiered GPS -> IP-location fallback already used elsewhere in the app,
    // so a slow/weak GPS fix no longer means an outright failure.
    if (!navigator.geolocation) {
      setError('Location services are required to go online.');
      setToggling(false);
      return;
    }

    const loc = await getReliableLocation();
    if (!loc) {
      setError('Could not get your location. Check that location access is enabled for this site, and that you have a network connection, then try again.');
      setToggling(false);
      return;
    }

    const { error: updErr } = await supabase.from('riders').update({
      operational_status: 'online',
      current_lat: loc.lat,
      current_lng: loc.lng
    }).eq('id', rider.id);
    if (!updErr) {
      setRider({ ...rider, operational_status: 'online', current_lat: loc.lat, current_lng: loc.lng });
      await fetchBroadcastJobs(rider.id);
    } else {
      setError('Could not update your status. Try again.');
    }
    setToggling(false);
'@
$movedFull1 = Get-FullPath "src\app\rider\(main)\dashboard\page.jsx"
if (Test-Path -LiteralPath $movedFull1) { $patchTarget1 = $movedFull1 } else { $patchTarget1 = Get-FullPath "src\app\rider\dashboard\page.jsx" }
Patch-File $patchTarget1 $patchOld1 $patchNew1 "rider dashboard reliable geolocation"

$patchOld2 = @'
      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: vendorProfile.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        voice_note_url: draft.voice_note,
        // ✅ FIX: Use correct column names matching DB schema
        recipient_name: draft.recipient_name,
        recipient_phone: draft.recipient_phone,
        notify_receiver: draft.notify_receiver,
        agreed_price: draft.estimated_price,
        status: "pending",
      }).select().single();
'@
$patchNew2 = @'
      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: vendorProfile.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        pickup_details: draft.pickup_note || null,
        pickup_voice_note_url: draft.pickup_voice_note_url || null,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        dropoff_details: draft.dropoff_note || null,
        dropoff_voice_note_url: draft.dropoff_voice_note_url || null,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        package_photo_url: draft.package_photo_url || null,
        voice_note_url: draft.voice_note,
        // ✅ FIX: Use correct column names matching DB schema
        recipient_name: draft.recipient_name,
        recipient_phone: draft.recipient_phone,
        notify_receiver: draft.notify_receiver,
        agreed_price: draft.estimated_price,
        status: "pending",
      }).select().single();
'@
$patchTarget2 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget2 $patchOld2 $patchNew2 "step-3 order insert with new fields"

$patchOld3 = @'
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/rider/SlideToConfirm';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import OrderChat from '@/components/OrderChat';

export default function ActiveJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
'@
$patchNew3 = @'
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
'@
$movedFull3 = Get-FullPath "src\app\rider\(main)\active-job\page.jsx"
if (Test-Path -LiteralPath $movedFull3) { $patchTarget3 = $movedFull3 } else { $patchTarget3 = Get-FullPath "src\app\rider\active-job\page.jsx" }
Patch-File $patchTarget3 $patchOld3 $patchNew3 "active-job imports/state + NoteCard component"

$patchOld4 = @'
  const updateStatus = async (nextStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        router.push('/rider/earnings');
      } else {
        setOrder({ ...order, status: nextStatus });
      }
    }
    setUpdating(false);
  };
'@
$patchNew4 = @'
  const updateStatus = async (nextStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus, delivery_photo_url: deliveryPhotoUrl || undefined })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        router.push('/rider/earnings');
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
'@
$movedFull4 = Get-FullPath "src\app\rider\(main)\active-job\page.jsx"
if (Test-Path -LiteralPath $movedFull4) { $patchTarget4 = $movedFull4 } else { $patchTarget4 = Get-FullPath "src\app\rider\active-job\page.jsx" }
Patch-File $patchTarget4 $patchOld4 $patchNew4 "active-job delivery photo handler"

$patchOld5 = @'
        {/* Route Details */}
        <div className="space-y-6 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-white/5"></div>
          <div className={`flex items-start gap-5 relative transition-opacity ${!isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-full border-4 border-charcoal-950 shrink-0 z-10 ${isHeadingToPickup ? 'bg-amber-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1">Step 1: Pick up</div>
               <div className="text-lg font-black text-ink leading-tight">{order.pickup_name}</div>
            </div>
          </div>
          <div className={`flex items-start gap-5 relative transition-opacity ${isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-lg border-4 border-charcoal-950 shrink-0 z-10 ${!isHeadingToPickup ? 'bg-emerald-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Step 2: Deliver to</div>
               <div className="text-lg font-black text-ink leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} • {order.recipient_phone}</div>
            </div>
          </div>
        </div>

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

        {/* Progress Action - SLIDE TO CONFIRM */}
        <div className="pt-4">
           {order.status === 'matched' && (
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
               <Loader2 size={14} className="animate-spin" /> Transmitting Protocol Update...
             </div>
           )}
'@
$patchNew5 = @'
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
           {order.status === 'matched' && (
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
               <Loader2 size={14} className="animate-spin" /> Transmitting Protocol Update...
             </div>
           )}
'@
$movedFull5 = Get-FullPath "src\app\rider\(main)\active-job\page.jsx"
if (Test-Path -LiteralPath $movedFull5) { $patchTarget5 = $movedFull5 } else { $patchTarget5 = Get-FullPath "src\app\rider\active-job\page.jsx" }
Patch-File $patchTarget5 $patchOld5 $patchNew5 "active-job notes/photo display"


if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "feat: full order flow redesign (per-location notes, package photo with AI size estimate, delivery photo); fix: rider location reliability, revert theme default to dark"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-batch9\ if needed." -ForegroundColor Green
Write-Host "Supabase: added pickup_voice_note_url, dropoff_voice_note_url, package_photo_url columns to orders - already applied directly." -ForegroundColor Green
Write-Host "`n>>> Add ANTHROPIC_API_KEY to Vercel Production env vars and redeploy for the photo size-estimate feature to activate. Everything else works without it." -ForegroundColor Yellow
