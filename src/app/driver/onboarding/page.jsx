"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { 
  ArrowLeft, 
  Car, 
  ShieldCheck, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  CreditCard,
  ChevronRight,
  Camera,
  Mail
} from 'lucide-react';

export default function DriverOnboarding() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  // Form State
  const [vehicleInfo, setVehicleInfo] = useState({
    type: '',
    plate: '',
    nin: ''
  });
  const [contactInfo, setContactInfo] = useState({
    whatsapp: ''
  });
  const [docs, setDocs] = useState({
    idCard: null,
    license: null
  });
  const [existingDocs, setExistingDocs] = useState({
    idCard: null,
    license: null
  });
  const [preview, setPreview] = useState({
    idCard: null,
    license: null
  });

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      setContactInfo(prev => ({ ...prev, email: user.email }));

      // Fetch profile
      const { data: profile } = await supabase
        .from('drivers')
        .select('is_verified, phone, vehicle_type, plate_number')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile) {
        setVehicleInfo({ type: profile.vehicle_type || '', plate: profile.plate_number || '' });
        setContactInfo({ whatsapp: profile.phone || '', email: user.email });
      }

      if (profile?.is_verified) {
        router.push('/driver');
        return;
      }

      // Fetch existing documents
      const { data: driverDocs } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', user.id);
      
      if (driverDocs) {
        const docObj = {};
        driverDocs.forEach(d => {
          docObj[d.doc_type === 'id_card' ? 'idCard' : 'license'] = d;
        });
        setExistingDocs(docObj);
      }
    }
    checkAuth();
  }, [supabase, router]);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size too large. Max 5MB.');
        return;
      }
      setDocs(prev => ({ ...prev, [type]: file }));
      setPreview(prev => ({ ...prev, [type]: URL.createObjectURL(file) }));
      setError('');
    }
  };

  const handleSubmit = async () => {
    // Check if we have what we need (either new upload or existing valid doc)
    const hasId = docs.idCard || (existingDocs.idCard && existingDocs.idCard.status !== 'rejected');
    const hasLicense = docs.license || (existingDocs.license && existingDocs.license.status !== 'rejected');

    if (!vehicleInfo.type || !vehicleInfo.plate || !(hasId || hasLicense) || !contactInfo.whatsapp) {
      setError('Please complete all steps and provide at least one valid identity document.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: profileErr } = await supabase
        .from('drivers')
        .update({
          vehicle_type: vehicleInfo.type,
          plate_number: vehicleInfo.plate,
          phone: contactInfo.whatsapp,
          driver_status: 'pending' // Reset status to pending when resubmitting
        })
        .eq('id', user.id);
      
      if (profileErr) throw profileErr;

      // 2. Upload and Update Documents
      const uploadDoc = async (file, type) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${type}_${Date.now()}.${fileExt}`;
        const filePath = `driver-docs/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        return publicUrl;
      };

      // Handle ID Card
      if (docs.idCard) {
        const idUrl = await uploadDoc(docs.idCard, 'id_card');
        const { error: idErr } = await supabase.from('driver_documents')
          .upsert({ 
            driver_id: user.id, 
            doc_type: 'id_card', 
            file_url: idUrl,
            status: 'pending',
            rejection_reason: null
          }, { onConflict: 'driver_id,doc_type' });
        if (idErr) throw idErr;
      }

      // Handle License
      if (docs.license) {
        const licUrl = await uploadDoc(docs.license, 'license');
        const { error: licErr } = await supabase.from('driver_documents')
          .upsert({ 
            driver_id: user.id, 
            doc_type: 'license', 
            file_url: licUrl,
            status: 'pending',
            rejection_reason: null
          }, { onConflict: 'driver_id,doc_type' });
        if (licErr) throw licErr;
      }

      setStep(3); // Success Step
    } catch (err) {
      console.error("Onboarding failed", err);
      setError(err.message || 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-charcoal-50 min-h-screen pt-20 pb-12">
      <div className="max-w-xl mx-auto px-4">
        
        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
            {[1, 2, 3].map((s) => (
                <div 
                    key={s} 
                    className={`h-2 flex-1 rounded-full transition-all duration-500 ${step >= s ? 'bg-emerald-500' : 'bg-gray-200'}`}
                />
            ))}
        </div>

        {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h1 className="text-3xl font-black text-charcoal-900 mb-2 tracking-tight">Vehicle Details</h1>
                <p className="text-charcoal-500 font-medium mb-8">Tell us about the vehicle you'll be using for deliveries.</p>

                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-charcoal-400 uppercase tracking-widest mb-2">Vehicle Type</label>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { id: 'bike', label: 'Motorcycle', icon: <ChevronRight size={18} /> },
                                { id: 'car', label: 'Car / Small Van', icon: <Car size={18} /> },
                            ].map((v) => (
                                <button
                                    key={v.id}
                                    onClick={() => setVehicleInfo(prev => ({ ...prev, type: v.id }))}
                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-3 text-left ${
                                        vehicleInfo.type === v.id 
                                        ? 'border-emerald-500 bg-emerald-50' 
                                        : 'border-white bg-white hover:border-gray-200 shadow-sm'
                                    }`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vehicleInfo.type === v.id ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-charcoal-500'}`}>
                                        {v.id === 'bike' ? <Navigation size={20} /> : <Car size={20} />}
                                    </div>
                                    <span className="font-bold text-charcoal-900">{v.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-charcoal-400 uppercase tracking-widest mb-2">Plate Number</label>
                        <input 
                            type="text" 
                            placeholder="e.g. KMC-123-AB"
                            value={vehicleInfo.plate}
                            onChange={(e) => setVehicleInfo(prev => ({ ...prev, plate: e.target.value.toUpperCase() }))}
                            className="w-full bg-white border-2 border-transparent focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-charcoal-900 shadow-sm transition-all outline-none mb-6"
                        />

                        <label className="block text-xs font-bold text-charcoal-400 uppercase tracking-widest mb-2 mt-6">Identity Number (NIN)</label>
                        <div className="mb-6">
                            <input 
                                type="text" 
                                maxLength={11}
                                placeholder="Enter your 11-digit NIN"
                                value={vehicleInfo.nin}
                                onChange={(e) => setVehicleInfo(prev => ({ ...prev, nin: e.target.value.replace(/\D/g, '') }))}
                                className="w-full bg-white border-2 border-transparent focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-charcoal-900 shadow-sm transition-all outline-none"
                            />
                        </div>

                        <label className="block text-xs font-bold text-charcoal-400 uppercase tracking-widest mb-2">WhatsApp Number</label>
                        <input 
                            type="tel" 
                            placeholder="e.g. +234 800 000 0000"
                            value={contactInfo.whatsapp}
                            onChange={(e) => setContactInfo(prev => ({ ...prev, whatsapp: e.target.value }))}
                            className="w-full bg-white border-2 border-transparent focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-charcoal-900 shadow-sm transition-all outline-none mb-6"
                        />

                        <label className="block text-xs font-bold text-charcoal-400 uppercase tracking-widest mb-2">Login Email (Permanent)</label>
                        <div className="w-full bg-gray-100 border-2 border-gray-100 px-6 py-4 rounded-2xl font-bold text-charcoal-500 shadow-sm transition-all mb-4 flex items-center gap-3">
                            <Mail size={18} />
                            {contactInfo.email}
                        </div>
                        <p className="text-[10px] text-charcoal-400 font-bold uppercase tracking-widest">
                            Important: Use this email and your chosen password to log in and check your application status.
                        </p>
                    </div>

                    <button 
                        onClick={() => setStep(2)}
                        disabled={!vehicleInfo.type || !vehicleInfo.plate || !contactInfo.whatsapp}
                        className="w-full py-5 bg-charcoal-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-black/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        Next Step <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        )}

        {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <button onClick={() => setStep(1)} className="flex items-center gap-2 text-charcoal-500 font-bold text-sm mb-4 hover:text-charcoal-900">
                    <ArrowLeft size={16} /> Back
                </button>
                <h1 className="text-3xl font-black text-charcoal-900 mb-2 tracking-tight">Identity Verification</h1>
                <p className="text-charcoal-500 font-medium mb-8">Upload **either** your Driver's License or National ID.</p>

                <div className="space-y-6">
                    {/* ID Card */}
                    <div className={`bg-white p-6 rounded-[2rem] shadow-sm border ${existingDocs.idCard?.status === 'rejected' ? 'border-red-200 bg-red-50/10' : (docs.idCard ? 'border-emerald-500 bg-emerald-50/20' : 'border-gray-100')}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 ${existingDocs.idCard?.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'} rounded-2xl flex items-center justify-center`}>
                                    <CreditCard size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-charcoal-900">National ID Card (NIN)</h3>
                                    <p className="text-xs text-charcoal-500 font-medium">Clear photo of your NIN card or slip</p>
                                </div>
                            </div>
                            {existingDocs.idCard && (
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                    existingDocs.idCard.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 
                                    existingDocs.idCard.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                                }`}>
                                    {existingDocs.idCard.status}
                                </span>
                            )}
                        </div>

                        {existingDocs.idCard?.status === 'rejected' && (
                            <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-xs text-red-600 font-bold flex gap-2 items-start">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <span>Reason: {existingDocs.idCard.rejection_reason}</span>
                            </div>
                        )}
                        
                        <label className="relative block w-full aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:bg-gray-100 transition-colors">
                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'idCard')} className="hidden" />
                            {preview.idCard ? (
                                <img src={preview.idCard} alt="Preview" className="w-full h-full object-cover" />
                            ) : existingDocs.idCard && existingDocs.idCard.status !== 'rejected' ? (
                                <img src={existingDocs.idCard.file_url} alt="Current" className="w-full h-full object-cover opacity-60" />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-charcoal-400">
                                    <Camera size={32} />
                                    <span className="text-sm font-bold">Tap to Upload NIN Card</span>
                                </div>
                            )}
                        </label>
                    </div>

                    <div className="flex items-center gap-4 px-4 overflow-hidden">
                        <div className="h-px bg-gray-200 flex-1"></div>
                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">OR</span>
                        <div className="h-px bg-gray-200 flex-1"></div>
                    </div>

                    {/* License */}
                    <div className={`bg-white p-6 rounded-[2rem] shadow-sm border ${existingDocs.license?.status === 'rejected' ? 'border-red-200 bg-red-50/10' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 ${existingDocs.license?.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-purple-50 text-purple-600'} rounded-2xl flex items-center justify-center`}>
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-charcoal-900">Driver's License</h3>
                                    <p className="text-xs text-charcoal-500 font-medium">Valid Nigerian Driver's License</p>
                                </div>
                            </div>
                            {existingDocs.license && (
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                    existingDocs.license.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 
                                    existingDocs.license.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                                }`}>
                                    {existingDocs.license.status}
                                </span>
                            )}
                        </div>

                        {existingDocs.license?.status === 'rejected' && (
                            <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-xs text-red-600 font-bold flex gap-2 items-start">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <span>Reason: {existingDocs.license.rejection_reason}</span>
                            </div>
                        )}
                        
                        <label className="relative block w-full aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:bg-gray-100 transition-colors">
                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'license')} className="hidden" />
                            {preview.license ? (
                                <img src={preview.license} alt="Preview" className="w-full h-full object-cover" />
                            ) : existingDocs.license && existingDocs.license.status !== 'rejected' ? (
                                <img src={existingDocs.license.file_url} alt="Current" className="w-full h-full object-cover opacity-60" />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-charcoal-400">
                                    <Camera size={32} />
                                    <span className="text-sm font-bold">{existingDocs.license?.status === 'rejected' ? 'Upload New Photo' : 'Tap to Upload'}</span>
                                </div>
                            )}
                        </label>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
                            <AlertCircle size={18} /> {error}
                        </div>
                    )}

                    <button 
                        onClick={handleSubmit}
                        disabled={loading || (!docs.idCard && !docs.license && !existingDocs.idCard && !existingDocs.license)}
                        className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Processing...' : 'Submit Verification'} <ShieldCheck size={20} />
                    </button>
                    <p className="text-[10px] text-center text-charcoal-400 font-bold uppercase tracking-widest">Your data is encrypted and secure</p>
                </div>
            </div>
        )}

        {step === 3 && (
            <div className="text-center py-12 animate-in zoom-in duration-500">
                <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-2xl mx-auto mb-8">
                    <CheckCircle2 size={48} className="stroke-[3]" />
                </div>
                <h1 className="text-4xl font-black text-charcoal-900 mb-4 tracking-tight">Application Sent!</h1>
                <p className="text-charcoal-500 font-medium text-lg mb-10">We're reviewing your documents. You'll be notified via **Email** once you're cleared to drive.</p>
                
                <button 
                    onClick={() => router.push('/driver')}
                    className="w-full py-5 bg-charcoal-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-black/20 transition-all"
                >
                    Back to Dashboard
                </button>
            </div>
        )}
      </div>
    </main>
  );
}

import { Navigation } from 'lucide-react'; // Fix missing import for bike icon
