"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Truck, ShieldCheck, ChevronRight, ArrowLeft,
  Camera, Loader2, CheckCircle2, AlertCircle, Cloud, Check
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
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadStats, setUploadStats] = useState({});
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
  const [existingStatus, setExistingStatus] = useState(null); // 'pending' | 'approved' | 'rejected' | null
  const [pageLoading, setPageLoading] = useState(true);

  // Load existing draft or application status. A 'draft' row resumes the form at
  // whatever step was last saved; pending/approved/rejected show the status screen.
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth/login"); return; }

      const { data: rider } = await supabase.from("riders").select("*").eq("user_id", user.id).single();
      if (rider) {
        setFormData(prev => ({ ...prev, ...rider }));

        if (rider.status === 'pending' || rider.status === 'approved' || rider.status === 'paused') {
          setExistingStatus(rider.status);
        } else if (rider.status === 'rejected') {
          setExistingStatus('rejected');
        } else {
          // status is null/draft - resume the form where they left off
          setStep(rider.onboarding_step || 1);
        }
      }
      setPageLoading(false);
    }
    loadData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Saves the current form state to the server as a draft and advances to the next
  // step. This is the core fix: progress lives on the server tied to the account,
  // not just in this component's memory - close the tab, lose the phone, switch
  // devices, it's still there when you come back.
  const saveDraftAndAdvance = async (nextStep) => {
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: saveErr } = await supabase.from("riders").upsert({
        user_id: user.id,
        ...formData,
        status: 'draft',
        onboarding_step: nextStep
      }, { onConflict: 'user_id' });

      if (saveErr) throw saveErr;

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      setStep(nextStep);
    } catch (err) {
      setError(`Couldn't save your progress: ${err.message}. Check your connection and try again.`);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => setStep(s => s - 1);

  const compressAndUpload = async (file, fieldName) => {
    if (!file) return;
    setUploadStats(prev => ({ ...prev, [fieldName]: 'uploading' }));

    try {
      const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);

      const { data: { user } } = await supabase.auth.getUser();
      const fileName = `${user.id}/${fieldName}_${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw uploadErr;

      // Documents bucket is private now - store the storage path, not a public
      // URL (which would be dead on arrival). Signed URLs are generated
      // on-demand server-side when an admin reviews the docs.
      // Document uploads save immediately too, independent of step navigation -
      // a photo that's uploaded should never be lost even if the app closes
      // before "Continue" is tapped.
      const updatedFormData = { ...formData, [`${fieldName}_url`]: fileName };
      setFormData(updatedFormData);
      await supabase.from("riders").upsert({
        user_id: user.id,
        ...updatedFormData,
        status: 'draft',
        onboarding_step: 3
      }, { onConflict: 'user_id' });

      setUploadStats(prev => ({ ...prev, [fieldName]: 'done' }));
    } catch (err) {
      console.error(err);
      setError(`Failed to upload ${fieldName}. Please try again.`);
      setUploadStats(prev => ({ ...prev, [fieldName]: 'idle' }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase.from("riders").upsert({
        user_id: user.id,
        ...formData,
        status: 'pending',
        documents_submitted_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      if (updateErr) throw updateErr;
      setExistingStatus('pending');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-[100dvh] bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  if (existingStatus) {
    return (
      <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col items-center justify-center p-8 text-center">
        {existingStatus === 'pending' && (
          <>
            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-8 relative">
              <ShieldCheck className="text-emerald-500 animate-pulse" size={40} />
              <div className="absolute inset-0 w-24 h-24 rounded-full border border-emerald-500/20 animate-ping opacity-30" />
            </div>
            <h2 className="text-2xl font-black text-ink mb-4 font-outfit">Application Under Review</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-8 max-w-xs">
              We've received your documents. Our team in Kano is currently verifying your license and vehicle details. This usually takes 24-48 hours.
            </p>
            <div className="w-full max-w-sm bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-left mb-8">
              <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-3">Verification Progress</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-ink font-bold">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Documents received
                </div>
                <div className="flex items-center gap-3 text-xs text-charcoal-500">
                  <div className="w-1.5 h-1.5 bg-charcoal-700 rounded-full" /> Manual ID verification
                </div>
                <div className="flex items-center gap-3 text-xs text-charcoal-500">
                  <div className="w-1.5 h-1.5 bg-charcoal-700 rounded-full" /> Profile activation
                </div>
              </div>
            </div>
          </>
        )}
        {existingStatus === 'approved' && (
          <>
            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-8">
              <CheckCircle2 className="text-emerald-500" size={40} />
            </div>
            <h2 className="text-2xl font-black text-ink mb-4 font-outfit">You're Verified!</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-8 max-w-xs">
              Your driver profile has been approved. You can now access the Rider Dashboard and start accepting deliveries.
            </p>
            <button
              onClick={() => router.push("/rider")}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl uppercase text-sm tracking-widest shadow-[0_0_24px_rgba(16,185,129,0.3)] mb-4"
            >
              Open Rider Dashboard
            </button>
          </>
        )}
        {existingStatus === 'rejected' && (
          <>
            <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-8">
              <AlertCircle className="text-red-500" size={40} />
            </div>
            <h2 className="text-2xl font-black text-ink mb-4 font-outfit">Application Not Approved</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-4 max-w-xs">
              Unfortunately your application was not approved.
            </p>
            {formData.rejection_reason && (
              <div className="w-full max-w-sm bg-red-500/5 border border-red-500/10 rounded-2xl p-4 mb-8 text-left">
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Reason</div>
                <p className="text-charcoal-300 text-xs">{formData.rejection_reason}</p>
              </div>
            )}
            <button
              onClick={() => { setExistingStatus(null); setStep(1); }}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-sm tracking-widest mb-4"
            >
              Update & Resubmit
            </button>
          </>
        )}
        {existingStatus === 'paused' && (
          <>
            <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-8">
              <AlertCircle className="text-amber-500" size={40} />
            </div>
            <h2 className="text-2xl font-black text-ink mb-4 font-outfit">You've Been Paused</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-4 max-w-xs">
              This isn't a rejection - you're still a NaijaDrops rider. Message support below and we'll help resolve it so you can go back online.
            </p>
            {formData.rejection_reason && (
              <div className="w-full max-w-sm bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-8 text-left">
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Reason</div>
                <p className="text-charcoal-300 text-xs">{formData.rejection_reason}</p>
              </div>
            )}
          </>
        )}
        <button
          onClick={() => router.push("/support")}
          className="w-full max-w-sm py-4 bg-white/5 border border-white/10 rounded-2xl text-ink font-bold text-sm hover:bg-white/10 transition-all"
        >
          Back to Support
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      <div className="px-6 pt-14 pb-8">
         <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button onClick={() => step > 1 ? handleBack() : router.back()} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink">
                 <ArrowLeft size={18} />
              </button>
              <div>
                 <h1 className="text-xl font-black text-ink tracking-tight">Rider Onboarding</h1>
                 <p className="text-charcoal-500 text-xs font-medium">Verify your profile to start earning</p>
              </div>
            </div>

            {/* Save status indicator - standard pattern for resumable multi-step forms */}
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
              {saving ? (
                <><Cloud size={12} className="text-charcoal-500 animate-pulse" /><span className="text-charcoal-500">Saving...</span></>
              ) : justSaved ? (
                <><Check size={12} className="text-emerald-500" /><span className="text-emerald-500">Saved</span></>
              ) : null}
            </div>
         </div>

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

      <div className="flex-1 px-6 pb-24 overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Full Name</label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="As seen on your ID"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-ink placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
               </div>
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Phone Number</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="080XXXXXXXX"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-ink placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
               </div>
               {error && (
                 <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <AlertCircle size={16} className="text-red-400" />
                    <p className="text-red-400 text-xs font-bold">{error}</p>
                 </div>
               )}
               <button
                  onClick={() => saveDraftAndAdvance(2)}
                  disabled={!formData.full_name || !formData.phone || saving}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ChevronRight size={18} /></>}
               </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
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
               <div>
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Plate Number</label>
                  <input type="text" name="plate_number" value={formData.plate_number} onChange={handleInputChange} placeholder="ABC-123-XY"
                    className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 px-5 text-ink placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 uppercase" />
               </div>
               {error && (
                 <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <AlertCircle size={16} className="text-red-400" />
                    <p className="text-red-400 text-xs font-bold">{error}</p>
                 </div>
               )}
               <button onClick={() => saveDraftAndAdvance(3)} disabled={!formData.plate_number || saving}
                 className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ChevronRight size={18} /></>}
               </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
               {[
                 { id: 'id_card', label: 'Government ID Card' },
                 { id: 'license', label: "Driver's License" },
                 { id: 'vehicle_photo', label: 'Vehicle Photo' },
                 { id: 'profile_photo', label: 'Clear Profile Photo' }
               ].map((doc) => (
                 <div key={doc.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                       <div className="text-ink text-sm font-black">{doc.label}</div>
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

               <button onClick={handleSubmit} disabled={loading || !formData.id_card_url || !formData.profile_photo_url || !formData.full_name}
                 className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 mt-8 disabled:opacity-50 shadow-[0_0_24px_rgba(16,185,129,0.3)]">
                  {loading ? <Loader2 size={22} className="animate-spin" /> : "Complete Application"}
               </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-6 pointer-events-none">
        <div className="mx-auto max-w-sm flex items-center gap-2 justify-center py-3 bg-charcoal-950/80 backdrop-blur-md rounded-full border border-white/5">
           <ShieldCheck size={14} className="text-emerald-500" />
           <span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Secured & Encrypted Registration</span>
        </div>
      </div>
    </div>
  );
}
