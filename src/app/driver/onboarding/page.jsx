"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, Truck, ShieldCheck, ChevronRight, ArrowLeft, 
  Camera, Loader2, CheckCircle2, AlertCircle, Upload 
} from "lucide-react";
import imageCompression from 'browser-image-compression';

const STEPS = [
  { id: 1, title: "Identity", icon: User },
  { id: 2, title: "Vehicle", icon: Truck },
  { id: 3, title: "Verification", icon: ShieldCheck }
];

export default function DriverOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadStats, setUploadStats] = useState({}); // { fieldName: 'idle' | 'uploading' | 'done' }
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    vehicle_type: "bike",
    plate_number: "",
    id_card_url: "",
    license_url: "",
    vehicle_photo_url: "",
    profile_photo_url: ""
  });
  const [error, setError] = useState(null);

  // Load existing profile info if any
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth/login"); return; }
      
      const { data: rider } = await supabase.from("riders").select("*").eq("user_id", user.id).single();
      if (rider) {
        setFormData(prev => ({ ...prev, ...rider }));
        // If already approved or pending, check status
        if (rider.status === 'pending' || rider.status === 'approved') {
           router.replace("/driver/dashboard");
        }
      }
    }
    loadData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const compressAndUpload = async (file, fieldName) => {
    if (!file) return;

    setUploadStats(prev => ({ ...prev, [fieldName]: 'uploading' }));
    
    try {
      // 1. Compression (The Kano Hardening Logic)
      const options = {
        maxSizeMB: 0.8, // Low bandwidth friendly
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      
      // 2. Upload to Supabase Storage
      const { data: { user } } = await supabase.auth.getUser();
      const fileName = `${user.id}/${fieldName}_${Date.now()}.jpg`;
      
      const { data, error: uploadErr } = await supabase.storage
        .from('onboarding-docs')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });

      if (uploadErr) throw uploadErr;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage.from('onboarding-docs').getPublicUrl(fileName);
      
      setFormData(prev => ({ ...prev, [`${fieldName}_url`]: publicUrl }));
      setUploadStats(prev => ({ ...prev, [fieldName]: 'done' }));
    } catch (err) {
      console.error(err);
      setError(`Failed to upload ${fieldName}. Please try again.`);
      setUploadStats(prev => ({ ...prev, [fieldName]: 'idle' }));
    }
  };

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: updateErr } = await supabase.from("riders").upsert({
        user_id: user.id,
        ...formData,
        status: 'pending', // Strictly set to pending on submission
        documents_submitted_at: new Date().toISOString()
      });

      if (updateErr) throw updateErr;

      // Success -> Redirect to status page
      router.push("/driver/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Dynamic Header */}
      <div className="px-6 pt-14 pb-8">
         <div className="flex items-center gap-4 mb-6">
            <button onClick={() => step > 1 ? handleBack() : router.back()} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white">
               <ArrowLeft size={18} />
            </button>
            <div>
               <h1 className="text-xl font-black text-white tracking-tight">Driver Onboarding</h1>
               <p className="text-charcoal-500 text-xs font-medium">Verify your profile to start earning</p>
            </div>
         </div>

         {/* Step Indicator */}
         <div className="flex gap-2">
            {STEPS.map((s) => (
               <div key={s.id} className="flex-1">
                  <div className={`h-1.5 rounded-full transition-all duration-500 ${step >= s.id ? "bg-emerald-500" : "bg-charcoal-800"}`} />
                  <div className={`text-[9px] mt-2 font-black uppercase tracking-widest ${step >= s.id ? "text-emerald-500" : "text-charcoal-600"}`}>
                     {s.title}
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 px-6 pb-24 overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Full Name</label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="As seen on your ID"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
               </div>
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Phone Number</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="080XXXXXXXX"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
               </div>
               <button onClick={handleNext} disabled={!formData.full_name || !formData.phone}
                 className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50">
                  Continue <ChevronRight size={18} />
               </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setFormData(p => ({ ...p, vehicle_type: 'bike' }))}
                    className={`p-5 rounded-2xl border transition-all text-left ${formData.vehicle_type === 'bike' ? "bg-emerald-500/10 border-emerald-500" : "bg-white/[0.03] border-white/10"}`}>
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${formData.vehicle_type === 'bike' ? "bg-emerald-500 text-charcoal-950" : "bg-white/5 text-charcoal-400"}`}>🏍️</div>
                     <div className={`font-black text-sm ${formData.vehicle_type === 'bike' ? "text-emerald-500" : "text-white"}`}>Motorcycle</div>
                     <div className="text-charcoal-500 text-[10px] mt-1">Recommended for Kano</div>
                  </button>
                  <button onClick={() => setFormData(p => ({ ...p, vehicle_type: 'car' }))}
                    className={`p-5 rounded-2xl border transition-all text-left ${formData.vehicle_type === 'car' ? "bg-emerald-500/10 border-emerald-500" : "bg-white/[0.03] border-white/10"}`}>
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${formData.vehicle_type === 'car' ? "bg-emerald-500 text-charcoal-950" : "bg-white/5 text-charcoal-400"}`}>🚗</div>
                     <div className={`font-black text-sm ${formData.vehicle_type === 'car' ? "text-emerald-500" : "text-white"}`}>Mini Car</div>
                     <div className="text-charcoal-500 text-[10px] mt-1">Faster for big parcels</div>
                  </button>
               </div>
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Plate Number</label>
                  <input type="text" name="plate_number" value={formData.plate_number} onChange={handleInputChange} placeholder="ABC-123-XY"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 uppercase" />
               </div>
               <button onClick={handleNext} disabled={!formData.plate_number}
                 className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50">
                  Verification <ChevronRight size={18} />
               </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
               {/* Document Upload Grid */}
               {[
                 { id: 'id_card', label: 'Government ID Card' },
                 { id: 'license', label: 'Driver\'s License' },
                 { id: 'vehicle_photo', label: 'Vehicle Photo' },
                 { id: 'profile_photo', label: 'Clear Profile Photo' }
               ].map((doc) => (
                 <div key={doc.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                       <div className="text-white text-sm font-black">{doc.label}</div>
                       <div className="text-charcoal-500 text-[10px] font-medium">Clear photo required</div>
                    </div>
                    <div className="relative">
                       <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" 
                         onChange={(e) => compressAndUpload(e.target.files[0], doc.id)} disabled={uploadStats[doc.id] === 'uploading'} />
                       
                       {uploadStats[doc.id] === 'uploading' ? (
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center"><Loader2 size={18} className="text-emerald-500 animate-spin" /></div>
                       ) : formData[`${doc.id}_url`] ? (
                          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500"><CheckCircle2 size={18} /></div>
                       ) : (
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-charcoal-400"><Camera size={18} /></div>
                       )}
                    </div>
                 </div>
               ))}

               {error && (
                 <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <AlertCircle size={16} className="text-red-400" />
                    <p className="text-red-400 text-xs font-bold">{error}</p>
                 </div>
               )}

               <button onClick={handleSubmit} disabled={loading || !formData.id_card_url || !formData.profile_photo_url}
                 className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50 shadow-[0_0_24px_rgba(16,185,129,0.3)]">
                  {loading ? <Loader2 size={22} className="animate-spin" /> : "Complete Application"}
               </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating status bar (Kano Friendly) */}
      <div className="fixed bottom-0 inset-x-0 p-6 pointer-events-none">
        <div className="mx-auto max-w-sm flex items-center gap-2 justify-center py-3 bg-charcoal-950/80 backdrop-blur-md rounded-full border border-white/5">
           <ShieldCheck size={14} className="text-emerald-500" />
           <span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Secured & Encrypted Registration</span>
        </div>
      </div>
    </div>
  );
}
