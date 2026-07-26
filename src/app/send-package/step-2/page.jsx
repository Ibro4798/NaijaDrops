"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Package, Phone, User, ArrowRight, Bell, Camera, X, Loader2, Sparkles, AlertTriangle
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { estimateSizeFromFile } from "@/utils/clientSizeEstimate";
import imageCompression from "browser-image-compression";

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
  const [oversizedWarning, setOversizedWarning] = useState(false);
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
      // Phone camera photos routinely come in at 4-10MB, well over the
      // delivery-photos bucket's size limit. Compress first (same settings
      // used for rider onboarding docs elsewhere in the app) so uploads
      // stop failing on large images, and reuse the compressed copy for
      // both the upload and the size estimate below - faster and smaller.
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      // Upload the actual photo for the rider to see later, and run the
      // (much smaller, resized) version through the size-estimate API in
      // parallel - neither one blocks the other.
      const fileName = `package_${Date.now()}.jpg`;
      const uploadPromise = supabase.storage.from("delivery-photos").upload(fileName, compressedFile, { contentType: "image/jpeg" });

      const estimatePromise = (async () => {
        setEstimating(true);
        try {
          const base64 = await fileToResizedBase64(compressedFile);
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
            setOversizedWarning(!!result.oversized);
            return;
          }

          // Server estimate unavailable (no ANTHROPIC_API_KEY, rate limit,
          // network issue, etc). Fall back to a free, on-device guess using
          // TensorFlow.js + COCO-SSD instead of giving up silently.
          const clientResult = await estimateSizeFromFile(compressedFile);
          if (clientResult.success) {
            setSize(clientResult.size);
            setSizeSource("client-cv");
            setEstimateReasoning(clientResult.reasoning);
            setOversizedWarning(!!clientResult.oversizedForBike);
          }
          // If that also fails, we say nothing - manual sizing already
          // works fine and always did, this is a bonus when it works.
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
    setOversizedWarning(false);
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
            <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-xl border ${oversizedWarning
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-emerald-500/10 border-emerald-500/20"}`}>
              {oversizedWarning
                ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                : <Sparkles size={13} className="text-emerald-400 shrink-0 mt-0.5" />}
              <p className={`text-[11px] font-medium leading-snug ${oversizedWarning ? "text-amber-400" : "text-emerald-400"}`}>
                {estimateReasoning}
              </p>
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
            {sizeSource === "client-cv" && (
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Sparkles size={10} /> Estimated on-device
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