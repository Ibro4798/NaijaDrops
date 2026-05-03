"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, ShieldCheck, ShieldAlert, FileText, 
  CheckCircle2, XCircle, Mail, Phone, ExternalLink, Send, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function DriverReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!params.id) return;

    async function fetchData() {
      // Fetch from 'riders' table, joining 'users' for email
      const { data: profile } = await supabase
        .from('riders')
        .select('*, users(email)')
        .eq('id', params.id)
        .maybeSingle();
      
      if (profile) setDriver(profile);
      setLoading(false);
    }
    fetchData();
  }, [params.id, supabase]);

  const handleUpdateStatus = async (newStatus, reason = null) => {
    setActionLoading(true);
    try {
      const updates = { status: newStatus };
      if (reason) updates.rejection_reason = reason;

      const { error } = await supabase
        .from('riders')
        .update(updates)
        .eq('id', params.id);

      if (error) throw error;
      
      setDriver(prev => ({ ...prev, ...updates }));
      
      alert(`Driver status updated to: ${newStatus.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      alert('Error updating status: ' + (err.message || 'Check connection'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p className="text-white font-black text-xs uppercase tracking-[0.3em] font-outfit animate-pulse">Loading Driver Profile...</p>
    </div>
  );
  
  if (!driver) return <div className="p-20 text-center text-red-500 font-black uppercase tracking-widest">Driver Not Found</div>;

  const statusColors = {
    approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glow shadow-emerald-500/10',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    paused: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    rejected: 'bg-red-500/10 text-red-500 border-red-500/20'
  };

  const docs = [
    { label: 'Profile Photo', url: driver.profile_photo_url },
    { label: 'Government ID', url: driver.id_card_url },
    { label: 'Driver License', url: driver.license_url },
    { label: 'Vehicle Photo', url: driver.vehicle_photo_url }
  ].filter(d => Boolean(d.url));

  return (
    <div className="max-w-6xl mx-auto pb-32 px-4">
      {/* Navigation & Breadcrumbs */}
      <div className="mb-12 flex items-center justify-between">
          <button 
            onClick={() => router.back()}
            className="w-12 h-12 bg-white/[0.03] rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all border border-white/5 group shadow-sm"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="glass px-4 py-2 rounded-full border border-white/5 flex items-center gap-2">
              <Zap size={14} className="text-emerald-500" />
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-outfit">Unit Authorization Terminal</span>
          </div>
      </div>

      {/* Profile Header Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.02] border border-white/5 rounded-[3.5rem] p-10 mb-12 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
        
        <div className="flex flex-col lg:flex-row justify-between items-center gap-10">
          <div className="flex flex-col lg:flex-row items-center gap-8 text-center lg:text-left">
            <div className="w-32 h-32 bg-charcoal-900 rounded-[2.5rem] flex items-center justify-center border border-white/10 overflow-hidden">
              {driver.profile_photo_url ? (
                  <img src={driver.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                  <span className="text-5xl font-black text-emerald-500">{driver.full_name?.[0] || 'D'}</span>
              )}
            </div>
            <div>
              <h1 className="text-4xl font-black mb-3 text-white tracking-tight">{driver.full_name || 'Incomplete Profile'}</h1>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${statusColors[driver.status || 'pending']}`}>
                    {driver.status || 'pending'}
                </span>
                <span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest font-mono">
                    Plate: {driver.plate_number || 'WAITING'}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-6">
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold font-mono">
                    <Mail size={16} className="text-emerald-500" /> {driver.users?.email || 'No email'}
                </span>
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold font-mono">
                    <Phone size={16} className="text-emerald-500" /> {driver.phone || 'No phone'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
            <button 
              onClick={() => handleUpdateStatus('approved')}
              disabled={actionLoading || driver.status === 'approved'}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit"
            >
              <ShieldCheck size={20} /> Approve
            </button>
            <button 
              onClick={() => handleUpdateStatus('paused')}
              disabled={actionLoading || driver.status === 'paused'}
              className="px-8 py-4 bg-charcoal-900 text-white border border-white/10 hover:bg-white/5 font-black rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit"
            >
              <ShieldAlert size={20} /> Suspend
            </button>
            <button 
              onClick={() => {
                const reason = prompt("Enter Rejection Reason (Sent to Driver):");
                if (reason) handleUpdateStatus('rejected', reason);
              }}
              disabled={actionLoading || driver.status === 'rejected'}
              className="sm:col-span-2 px-8 py-4 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-black rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit"
            >
              <XCircle size={20} /> Reject & Tell Driver Why
            </button>
          </div>
        </div>
      </motion.div>

      {/* Asset Grid */}
      <h2 className="text-2xl font-black flex items-center gap-3 font-outfit uppercase tracking-tighter italic mb-8">
          <FileText className="text-emerald-500" /> Submitted <span className="text-emerald-500">Documents</span>
      </h2>

      {docs.length === 0 ? (
          <div className="text-center py-20 px-8 bg-white/[0.02] rounded-[2rem] border border-white/5">
              <p className="text-charcoal-500 font-black text-sm uppercase tracking-[0.4em]">No documents uploaded yet.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {docs.map((doc, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    key={idx} 
                    className="bg-white/[0.03] p-4 rounded-3xl border border-white/5 group"
                  >
                      <div className="flex justify-between items-center mb-4 px-2 pt-2">
                          <div className="font-black text-xs uppercase tracking-[0.2em] text-white/50">{doc.label}</div>
                      </div>
                      <div className="relative h-48 rounded-2xl overflow-hidden bg-charcoal-900 border border-white/5">
                          <img src={doc.url} alt={doc.label} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                               <button onClick={() => window.open(doc.url, '_blank')} className="px-6 py-3 bg-white/20 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/40 border border-white/10 flex items-center gap-2">
                                  <ExternalLink size={14} /> View Full
                               </button>
                          </div>
                      </div>
                  </motion.div>
              ))}
          </div>
      )}
    </div>
  );
}
