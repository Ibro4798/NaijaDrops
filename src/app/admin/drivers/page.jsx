"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Search, UserCheck, Trash2, ChevronRight, Plus, X, Copy, Check, Loader2, Mail, Phone, User, Filter, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Add Driver Modal ────────────────────────────────────────────────────────
function AddDriverModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); 
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setResult(data);
        onSuccess?.();
      }
    } catch (err) {
      setError('System interference. Check transmission.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (result?.inviteLink) {
      navigator.clipboard.writeText(result.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-dark border border-white/10 rounded-[3rem] shadow-premium w-full max-w-lg overflow-hidden relative"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>

        {/* Header */}
        <div className="p-10 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-white font-outfit uppercase tracking-tighter italic">Fleet <span className="text-emerald-500">Recruitment</span></h2>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-2">Initialize encrypted login credentials.</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 glass-dark hover:bg-white/5 rounded-2xl transition-all text-gray-400 hover:text-white flex items-center justify-center border border-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-10">
          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 ml-2">Pilot Identity</label>
                <div className="relative group">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="Full Legal Name"
                    className="w-full pl-12 pr-6 py-4 bg-charcoal-950/60 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-bold placeholder:text-charcoal-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 ml-2">Encrypted Contact</label>
                <div className="relative group">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Verification Email"
                    className="w-full pl-12 pr-6 py-4 bg-charcoal-950/60 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-bold placeholder:text-charcoal-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 ml-2">Terminal ID (Phone)</label>
                <div className="relative group">
                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234..."
                    className="w-full pl-12 pr-6 py-4 bg-charcoal-950/60 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-bold placeholder:text-charcoal-800"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-6 py-4 text-xs text-red-400 font-black uppercase tracking-widest flex items-center gap-3">
                  <Zap size={16} fill="currentColor" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-white hover:bg-emerald-400 text-charcoal-950 font-black rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-40 uppercase tracking-[0.25em] text-xs shadow-premium"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {loading ? 'Initializing...' : 'Authorize Recruitment'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] p-6 shadow-glow">
                <p className="text-emerald-500 font-black text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Transmission Successful
                </p>
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                  Pilot <span className="text-white">{form.fullName}</span> has been synced to the database. Access key generated below.
                </p>
              </div>

              {result.inviteLink ? (
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 ml-2">Encrypted Access Link</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-charcoal-950/80 border border-white/5 rounded-2xl px-4 py-4 text-[10px] text-emerald-400 truncate font-mono tracking-widest">
                      {result.inviteLink}
                    </div>
                    <button
                      onClick={copyLink}
                      className={`w-14 h-14 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${copied ? 'bg-emerald-500 text-charcoal-950 border-emerald-500' : 'glass-dark border-white/10 text-gray-400 hover:text-white'}`}
                    >
                      {copied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                  <p className="text-emerald-500/60 text-[9px] font-black uppercase tracking-[0.2em] mt-4 flex items-center gap-2">
                    <Zap size={12} fill="currentColor" /> Link automatically expires after one usage cycle.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                  ⚠️ {result.warning}
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-5 glass-dark hover:bg-white/5 text-white font-black rounded-2xl transition-all mt-4 uppercase tracking-[0.3em] text-xs border border-white/5 active:scale-95"
              >
                Terminate Session
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Admin Drivers Page ─────────────────────────────────────────────────
export default function AdminDriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    async function fetchDrivers() {
      const { data: driversData } = await supabase
        .from('drivers')
        .select(`*, driver_documents (id)`)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        setDrivers((driversData || []).filter(d => d.driver_status === statusFilter));
      } else {
        setDrivers(driversData || []);
      }
      setLoading(false);
    }
    
    fetchDrivers();

    const channel = supabase
      .channel('admin-driver-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchDrivers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, fetchDrivers)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase, statusFilter]);

  const handleDeleteDriver = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this driver? This will permanently remove their application and login account.")) return;

    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id })
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete user');

      setDrivers(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete driver: " + err.message);
    }
  };

  const filteredDrivers = drivers.filter(d => {
    const searchMatch = d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                       d.email?.toLowerCase().includes(search.toLowerCase()) ||
                       d.phone?.includes(search);
    return searchMatch;
  });

  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    paused: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    rejected: 'bg-red-500/10 text-red-500 border-red-500/20'
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {showAddModal && (
        <AddDriverModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setTimeout(() => setShowAddModal(false), 3000);
          }}
        />
      )}

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-16 gap-8 px-4">
        <div>
           <motion.h1 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="text-5xl font-black mb-4 text-white font-outfit uppercase tracking-tighter italic"
          >
            Tactical <span className="text-emerald-500">Fleet</span>
          </motion.h1>
          <p className="text-gray-500 font-black text-[10px] uppercase tracking-[0.3em]">Manage and verify logistics operatives across the grid.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="flex glass-dark p-1.5 rounded-[1.5rem] border border-white/5 w-full sm:w-auto overflow-x-auto hide-scrollbar">
             {['all', 'pending', 'active', 'paused', 'rejected'].map(f => (
               <button 
                 key={f}
                 onClick={() => setStatusFilter(f)}
                 className={`px-6 py-2.5 rounded-[1rem] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === f ? 'bg-emerald-500 text-charcoal-950 shadow-glow' : 'text-gray-500 hover:text-white'}`}
               >
                 {f}
               </button>
             ))}
          </div>

          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search operative..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-6 py-4 bg-charcoal-950/60 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-bold placeholder:text-charcoal-800 w-full"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-3 bg-white hover:bg-emerald-400 text-charcoal-950 font-black text-[11px] px-8 py-4 rounded-2xl transition-all shadow-premium whitespace-nowrap uppercase tracking-[0.2em] group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-500" />
            Recruit Operative
          </button>
        </div>
      </div>

      {/* Drivers List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 px-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <div className="col-span-full py-32 text-center text-emerald-500/20 font-black text-2xl uppercase tracking-[0.5em] animate-pulse italic">
                Scanning Grid For Active Units...
            </div>
          ) : filteredDrivers.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-32 text-center text-charcoal-700 font-black text-xl bg-white/2 rounded-[3rem] border border-dashed border-white/5 uppercase tracking-widest italic"
            >
                No Matching Operatives Located.
            </motion.div>
          ) : (
            filteredDrivers.map((driver, index) => (
              <motion.div
                key={driver.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                  <Link 
                    href={`/admin/drivers/${driver.id}`}
                    className="glass-dark border border-white/5 p-8 rounded-[3rem] hover:bg-black/40 hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row items-center justify-between group relative overflow-hidden shadow-premium"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all"></div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10 w-full">
                      <div className="w-20 h-20 glass-dark rounded-[2rem] flex items-center justify-center text-3xl font-black text-emerald-500 border border-white/5 shadow-inner group-hover:scale-110 transition-transform">
                        {driver.full_name?.[0]}
                      </div>
                      <div className="text-center sm:text-left flex-1 min-w-0">
                        <div className="font-black text-xl text-white group-hover:text-emerald-400 transition-colors flex items-center justify-center sm:justify-start gap-2 font-outfit uppercase tracking-tighter italic">
                          {driver.full_name}
                          {driver.is_verified && <Zap size={16} fill="currentColor" className="text-emerald-500" />}
                        </div>
                        <div className="text-gray-500 text-[10px] font-bold mt-2 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 uppercase tracking-[0.2em]">
                          <span className="flex items-center gap-1.5"><Phone size={12} className="text-emerald-500" /> {driver.phone || '00-000-000'}</span>
                          <span className="hidden sm:inline border-r border-white/10 h-3"></span>
                          <span className="truncate max-w-[200px] flex items-center gap-1.5"><Mail size={12} className="text-emerald-500" /> {driver.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 mt-6 sm:mt-0 relative z-10 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-6 sm:pt-0">
                      <div className="text-right hidden md:block px-6 border-r border-white/5">
                         <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1">Vehicle Class</div>
                         <div className="font-black text-xs text-white uppercase tracking-widest">{driver.vehicle_type || 'NONE'}</div>
                         <div className="font-black text-[10px] text-emerald-500 uppercase mt-1 italic">{driver.plate_number || '---'}</div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${statusColors[driver.driver_status || 'pending']}`}>
                          {driver.driver_status || 'pending'}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => handleDeleteDriver(e, driver.id)}
                            className="w-10 h-10 glass-dark text-charcoal-600 hover:text-red-500 hover:border-red-500/30 rounded-xl transition-all flex items-center justify-center border border-white/5 active:scale-95"
                            title="Delete Operative"
                          >
                            <Trash2 size={16} />
                          </button>
                          <div className="w-10 h-10 glass-dark text-charcoal-400 group-hover:text-white rounded-xl flex items-center justify-center border border-white/5 group-hover:translate-x-1 transition-all">
                             <ChevronRight size={18} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
