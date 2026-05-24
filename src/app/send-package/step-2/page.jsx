"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Package, Bike, Car, Phone, FileText,
  User, MapPin, ArrowRight, ChevronRight, Bell, Mic, Square, Play, Trash2, Loader2
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
  { id: "small", label: "Small", sub: "Fits in a bag", emoji: "ðŸŽ’", desc: "Documents, envelopes, small items" },
  { id: "medium", label: "Medium", sub: "Small box", emoji: "ðŸ“¦", desc: "Shoes, electronics, food orders" },
  { id: "large", label: "Large", sub: "Big load", emoji: "ðŸ—ƒï¸", desc: "Multiple items, large packages" },
];

const VEHICLES = [
  { id: "bike", label: "Motorcycle", sub: "Faster & cheaper", emoji: "ðŸï¸", badge: "Popular" },
  { id: "car", label: "Car", sub: "Bigger & safer", emoji: "ðŸš—", badge: "Secure" },
];

export default function Step2Page() {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [size, setSize] = useState("small");
  const [vehicle, setVehicle] = useState("bike");
  const [description, setDescription] = useState("");
  const [voiceNoteUrl, setVoiceNoteUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [notifyReceiver, setNotifyReceiver] = useState(false);

  const supabase = createClient();
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const estimatedPrice = calcPrice(draft?.distance_m, vehicle, size);

  const distanceKm = draft?.distance_m ? (draft.distance_m / 1000).toFixed(1) : null;

  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.dropoff) { router.replace("/send-package/step-1"); return; }
      setDraft(d);
      // Restore selections if returning from step 3
      if (d.size) setSize(d.size);
      if (d.vehicle) setVehicle(d.vehicle);
      if (d.description) setDescription(d.description);
      if (d.voice_note_url) setVoiceNoteUrl(d.voice_note_url);
      if (d.recipient_name) setReceiverName(d.recipient_name);
      if (d.recipient_phone) setReceiverPhone(d.recipient_phone);
      if (d.notify_receiver !== undefined) setNotifyReceiver(d.notify_receiver);
    } catch {
      router.replace("/send-package/step-1");
    }
  }, []);

  const canContinue = size && vehicle && description.trim() && receiverName.trim() && receiverPhone.trim().length >= 8;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        setIsUploadingAudio(true);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        
        // Upload to Supabase Storage
        const fileName = `voice_note_${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from("documents").upload(fileName, blob, { contentType: "audio/webm" });
        
        if (!error && data) {
           const { data: publicUrlData } = supabase.storage.from("documents").getPublicUrl(fileName);
           setVoiceNoteUrl(publicUrlData.publicUrl);
        } else {
           alert("Failed to upload voice note. Make sure the 'documents' bucket exists.");
        }
        setIsUploadingAudio(false);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  function handleContinue() {
    if (!canContinue) return;
    const updated = {
      ...draft,
      size,
      vehicle,
      description: description.trim(),
      voice_note: voiceNoteUrl, // Save the URL to the draft
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
        <button onClick={() => router.push("/send-package/step-1")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 2 of 3</div>
          <h1 className="text-xl font-black text-white tracking-tight">Package Details</h1>
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
          <div className="text-white font-black text-lg">{distanceKm ? `${distanceKm} km` : "â€”"}</div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div className="text-right">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Price Estimate</div>
          <AnimatePresence mode="wait">
            <motion.div key={`${vehicle}-${size}-${estimatedPrice}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-emerald-400 font-black text-2xl">
              {estimatedPrice ? `â‚¦${estimatedPrice.toLocaleString()}` : "â€”"}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Route</div>
          <div className="text-white font-black text-sm truncate max-w-[80px]">
            {draft.pickup?.name?.split(",")[0] || "â€”"}
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-6 space-y-6">
        {/* Package Size */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-3 block">Package Size</label>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map(s => (
              <button key={s.id} onClick={() => setSize(s.id)}
                className={`p-3 rounded-2xl border-2 flex flex-col gap-1 text-left transition-all active:scale-95 ${size === s.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}>
                <span className="text-2xl">{s.emoji}</span>
                <span className={`text-xs font-black ${size === s.id ? "text-white" : "text-charcoal-300"}`}>{s.label}</span>
                <span className="text-[10px] text-charcoal-500">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Type */}
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
                  <div className={`text-sm font-black ${vehicle === v.id ? "text-white" : "text-charcoal-200"}`}>{v.label}</div>
                  <div className="text-charcoal-500 text-xs">{v.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Text Inputs */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 block">Package & Receiver Info</label>

          <div className="relative">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="text" placeholder="Package description (e.g. Red shoes, size 42)"
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>

          <div className="bg-charcoal-900 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-charcoal-400">
                 <Mic size={18} />
               </div>
               <div>
                 <div className="text-white text-sm font-bold">Voice Instructions</div>
                 <div className="text-charcoal-500 text-xs">Record special handling notes</div>
               </div>
             </div>
             
             {isUploadingAudio ? (
                <div className="flex items-center text-emerald-500 gap-2 text-xs font-bold px-4 py-2 bg-emerald-500/10 rounded-xl">
                  <Loader2 size={14} className="animate-spin" /> Uploading...
                </div>
             ) : voiceNoteUrl ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => { const a = new Audio(voiceNoteUrl); a.play(); }} className="p-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-colors">
                    <Play size={16} fill="currentColor" />
                  </button>
                  <button onClick={() => setVoiceNoteUrl("")} className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
             ) : (
                <button 
                  onClick={isRecording ? stopRecording : startRecording} 
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isRecording ? "bg-red-500 text-white animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.4)]" : "bg-emerald-500 hover:bg-emerald-400 text-charcoal-950"}`}
                >
                  {isRecording ? <><Square size={12} fill="currentColor" /> Stop</> : "Record"}
                </button>
             )}
          </div>

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="text" placeholder="Receiver full name"
              value={receiverName} onChange={e => setReceiverName(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>

          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
            <input type="tel" placeholder="Receiver phone (e.g. 08012345678)"
              value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
          </div>
        </div>

        {/* Notify toggle */}
        <button onClick={() => setNotifyReceiver(!notifyReceiver)}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${notifyReceiver ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.02]"}`}>
          <div className="flex items-center gap-3">
            <Bell size={16} className={notifyReceiver ? "text-emerald-400" : "text-charcoal-500"} />
            <div className="text-left">
              <div className={`text-sm font-bold ${notifyReceiver ? "text-white" : "text-charcoal-300"}`}>Notify Receiver</div>
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
