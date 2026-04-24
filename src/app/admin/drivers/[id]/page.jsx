"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, ShieldCheck, ShieldAlert, FileText, 
  CheckCircle2, XCircle, Mail, Phone, MapPin, Truck, MessageCircle, Send, Zap, ChevronRight, Clock, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DriverReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [driver, setDriver] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!params.id) return;

    async function fetchData() {
      const { data: profile } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', params.id)
        .maybeSingle();
      
      if (profile) setDriver(profile);

      const { data: driverDocs } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', params.id);
      
      if (driverDocs) setDocs(driverDocs);
      setLoading(false);
    }
    fetchData();
  }, [params.id, supabase]);

  const sendNotification = async (title, message) => {
    await supabase.from('notifications').insert({
      user_id: params.id,
      title,
      message
    });
  };

  const handleUpdateStatus = async (newStatus, verifyBool = null) => {
    setActionLoading(true);
    try {
      const updates = { driver_status: newStatus };
      if (verifyBool !== null) updates.is_verified = verifyBool;

      const { error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', params.id);

      if (error) throw error;
      
      setDriver(prev => ({ ...prev, ...updates }));
      
      let msg = `Your application status has been updated to: ${newStatus.toUpperCase()}.`;
      if (newStatus === 'active') msg = "Congratulations! Your driver application has been approved. You can now go online and start accepting orders.";
      if (newStatus === 'paused') msg = "Your account has been temporarily paused by an administrator. Please contact support for more details.";
      if (newStatus === 'rejected') msg = "We regret to inform you that your driver application has been rejected at this time.";
      
      await sendNotification("Application Update", msg);
      alert(`Unit authorization set to: ${newStatus.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      alert('Transmission Error: ' + (err.message || 'Check connection'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDocStatus = async (docId, newStatus, reason = '') => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('driver_documents')
        .update({ status: newStatus, rejection_reason: reason })
        .eq('id', docId);

      if (error) throw error;
      
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: newStatus, rejection_reason: reason } : d));
      
      if (newStatus === 'rejected') {
        const doc = docs.find(d => d.id === docId);
        await sendNotification("Document Rejected", `Your ${doc.doc_type.replace('_', ' ')} was rejected. Reason: ${reason}. Please re-upload a clear photo.`);
      } else {
        await sendNotification("Document Approved", `Your ${docs.find(d => d.id === docId).doc_type.replace('_', ' ')} has been approved.`);
      }
      
      alert(`Asset status: ${newStatus.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      alert('Update failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleScheduleInspection = async () => {
    setActionLoading(true);
    try {
      const msg = `Your vehicle inspection has been scheduled. An administrator will contact you at ${driver.phone} or via email shortly to confirm the time and location.`;
      await sendNotification("Inspection Scheduled", msg);
      alert("Inspection invitation broadcasted via system notification.");
    } catch (err) {
      console.error(err);
      alert("Dispatch failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ admin_notes: driver.admin_notes })
        .eq('id', params.id);
      if (error) throw error;
      alert('Internal logs updated.');
    } catch (err) {
      console.error(err);
      alert('Log write failed.');
    }
  };

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p className="text-white font-black text-xs uppercase tracking-[0.3em] font-outfit animate-pulse">Syncing Unit Metadata...</p>
    </div>
  );
  
  if (!driver) return <div className="p-20 text-center text-red-500 font-black uppercase tracking-widest">Target Unit Null / Missing from grid</div>;

  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glow shadow-emerald-500/10',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    paused: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    rejected: 'bg-red-500/10 text-red-500 border-red-500/20'
  };

  return (
    <div className="max-w-6xl mx-auto pb-32 px-4">
      {/* Navigation & Breadcrumbs */}
      <div className="mb-12 flex items-center justify-between">
          <button 
            onClick={() => router.push('/admin/drivers')}
            className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all border border-white/5 group shadow-premium"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="glass-dark px-4 py-2 rounded-full border border-white/5 flex items-center gap-2">
              <Zap size={14} className="text-emerald-500" />
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-outfit">Unit Authorization Terminal</span>
          </div>
      </div>

      {/* Profile Header Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-dark border border-white/5 rounded-[3.5rem] p-10 mb-12 relative overflow-hidden shadow-premium"
      >
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
        
        <div className="flex flex-col lg:flex-row justify-between items-center gap-10">
          <div className="flex flex-col lg:flex-row items-center gap-8 text-center lg:text-left">
            <div className="w-32 h-32 glass-dark rounded-[2.5rem] flex items-center justify-center text-5xl font-black text-emerald-500 border border-white/10 shadow-inner group transition-transform hover:scale-105 duration-700">
              {driver.full_name?.[0]}
            </div>
            <div>
              <h1 className="text-5xl font-black mb-3 text-white font-outfit uppercase tracking-tighter italic leading-none">{driver.full_name}</h1>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${statusColors[driver.driver_status || 'pending']}`}>
                    {driver.driver_status || 'pending'}
                </span>
                <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 font-mono">
                    <Clock size={12} className="text-emerald-500" /> 
                    Joined {new Date(driver.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-6">
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold font-mono">
                    <Mail size={16} className="text-emerald-500" /> {driver.email}
                </span>
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold font-mono">
                    <Phone size={16} className="text-emerald-500" /> {driver.phone}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
            <button 
              onClick={() => handleUpdateStatus('active', true)}
              disabled={actionLoading || driver.driver_status === 'active'}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-2xl flex items-center justify-center gap-3 transition-all shadow-glow disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit"
            >
              <ShieldCheck size={20} /> Authorize Unit
            </button>
            <button 
              onClick={() => handleUpdateStatus('paused', false)}
              disabled={actionLoading || driver.driver_status === 'paused'}
              className="px-8 py-4 glass-dark text-white border border-white/10 hover:bg-white/5 font-black rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit shadow-premium"
            >
              <ShieldAlert size={20} /> Suspend Operations
            </button>
            <button 
              onClick={() => handleUpdateStatus('rejected', false)}
              disabled={actionLoading || driver.driver_status === 'rejected'}
              className="sm:col-span-2 px-8 py-4 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-black rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] font-outfit"
            >
              <XCircle size={20} /> Terminate Recruitment
            </button>
          </div>
        </div>
      </motion.div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Logs & Vehicle */}
        <div className="lg:col-span-1 space-y-8">
            {/* Admin Logs / Notes */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-dark border border-white/5 rounded-[2.5rem] p-8 shadow-premium"
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] font-outfit italic">Internal Logs</h3>
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-glow"></div>
                </div>
                <textarea 
                  value={driver.admin_notes || ''}
                  onChange={(e) => setDriver(prev => ({ ...prev, admin_notes: e.target.value }))}
                  placeholder="Record tactical assessment notes..."
                  className="w-full bg-charcoal-950/80 border border-white/5 rounded-[2rem] p-6 text-sm text-white focus:outline-none focus:border-emerald-500 focus:bg-black transition-all min-h-[160px] mb-6 font-bold placeholder:text-charcoal-800 shadow-inner"
                />
                <button 
                  onClick={handleSaveNotes}
                  className="w-full py-4 bg-white/10 hover:bg-emerald-500 hover:text-charcoal-950 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-[0.4em] border border-white/5 shadow-premium"
                >
                  Commit Log Entry
                </button>
            </motion.div>

            {/* Vehicle Data */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-dark border border-white/5 rounded-[2.5rem] p-8 shadow-premium relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12"></div>
                
                <h2 className="text-xl font-black mb-8 flex items-center gap-3 font-outfit uppercase tracking-tighter italic">
                    <Truck className="text-emerald-500" /> Vehicle <span className="text-emerald-500">Specs</span>
                </h2>
                
                <div className="space-y-6">
                    <div className="flex justify-between border-b border-white/5 pb-4">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Model / Class</span>
                        <span className="font-black text-xs text-white uppercase tracking-widest">{driver.vehicle_type || 'NONE'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-4">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Plate ID</span>
                        <span className="font-black text-xs text-emerald-500 uppercase tracking-widest italic">{driver.plate_number || 'UNKNOWN'}</span>
                    </div>
                    <div className="flex justify-between pb-2">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Insurance Node</span>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                            <span className="text-amber-500 font-black text-[9px] uppercase tracking-widest">Pending Review</span>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-white/5">
                    <button 
                        onClick={handleScheduleInspection}
                        disabled={actionLoading}
                        className="w-full py-5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-charcoal-950 font-black rounded-[2rem] transition-all flex items-center justify-center gap-3 disabled:opacity-30 uppercase tracking-[0.25em] text-[11px] font-outfit border border-emerald-500/20 active:scale-95 shadow-premium"
                    >
                        <Send size={18} /> Schedule Inspection
                    </button>
                </div>
            </motion.div>
        </div>

        {/* Right Column: Assets / Documents */}
        <div className="lg:col-span-2 space-y-8">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-dark border border-white/5 rounded-[3rem] p-10 shadow-premium"
            >
                <div className="flex items-center justify-between mb-10">
                    <h2 className="text-2xl font-black flex items-center gap-3 font-outfit uppercase tracking-tighter italic">
                        <FileText className="text-emerald-500" /> Digital <span className="text-emerald-500">Credentials</span>
                    </h2>
                    <div className="h-px bg-white/5 flex-1 mx-8 hidden sm:block"></div>
                    <span className="text-[10px] font-black text-charcoal-600 uppercase tracking-widest">{docs.length} Registered Assets</span>
                </div>
                
                {docs.length === 0 ? (
                    <div className="text-center py-20 px-8 glass-dark rounded-[2rem] border-dashed border-2 border-white/5">
                        <div className="w-20 h-20 bg-charcoal-950 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner ring-1 ring-white/5 text-charcoal-700">
                             <FileText size={40} />
                        </div>
                        <p className="text-white/40 font-black text-sm uppercase tracking-[0.4em] italic leading-relaxed">No credential metadata currently broadcasted to the grid.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {docs.map((doc, idx) => (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.1 }}
                              key={doc.id} 
                              className="glass-dark p-6 rounded-[2.5rem] border border-white/5 group hover:border-emerald-500/30 transition-all shadow-premium"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <div className="font-black text-[10px] uppercase tracking-[0.2em] text-white/50 group-hover:text-emerald-400 transition-colors font-outfit italic">{doc.doc_type.replace('_', ' ')}</div>
                                    <span className={`px-3 py-1 rounded-[1rem] text-[8px] font-black uppercase tracking-widest border ${doc.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glow shadow-emerald-500/10' : doc.status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                        {doc.status}
                                    </span>
                                </div>
                                <div className="relative h-48 rounded-[1.5rem] overflow-hidden bg-black/40 border border-white/5 shadow-inner mb-6 ring-1 ring-white/10 group-hover:ring-emerald-500/30 transition-all duration-700">
                                    <img src={doc.file_url} alt={doc.doc_type} className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                         <button onClick={() => window.open(doc.file_url, '_blank')} className="w-full py-2 bg-white/20 backdrop-blur-md rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/40 transition-all">Inspect Full Resolution</button>
                                    </div>
                                </div>
                                
                                {doc.rejection_reason && (
                                    <div className="mb-6 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-[9px] text-red-400 font-bold uppercase tracking-widest leading-relaxed">
                                        <span className="text-red-500 opacity-50 block mb-1">REJECTION CAUSE:</span> {doc.rejection_reason}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => handleUpdateDocStatus(doc.id, 'approved')}
                                        disabled={actionLoading || doc.status === 'approved'}
                                        className="py-3 bg-emerald-500/10 text-emerald-500 font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-emerald-500 hover:text-charcoal-950 transition-all disabled:opacity-20 border border-emerald-500/20 shadow-premium active:scale-95"
                                    >
                                        Verify
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const reason = prompt("Specify deviation reason:");
                                            if (reason) handleUpdateDocStatus(doc.id, 'rejected', reason);
                                        }}
                                        disabled={actionLoading}
                                        className="py-3 bg-red-500/5 text-red-400 font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-20 border border-red-500/10 shadow-premium active:scale-95"
                                    >
                                        Invalidate
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
      </div>
    </div>
  );
}
