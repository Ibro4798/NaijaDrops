"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Search, UserCheck, Trash2, ChevronRight, Plus, X, Copy, Check, Loader2, Mail, Phone, User } from 'lucide-react';
import Link from 'next/link';

// ─── Add Driver Modal ────────────────────────────────────────────────────────
function AddDriverModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { inviteLink, warning }
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
      setError('Network error. Check your connection.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f2e] border border-charcoal-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-charcoal-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Add New Driver</h2>
            <p className="text-gray-400 text-sm mt-0.5">They'll receive a link to set their password.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-charcoal-700 rounded-xl transition-colors text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="e.g. Abdullahi Musa"
                    className="w-full pl-9 pr-4 py-3 bg-charcoal-800 border border-charcoal-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="driver@email.com"
                    className="w-full pl-9 pr-4 py-3 bg-charcoal-800 border border-charcoal-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Phone Number</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000"
                    className="w-full pl-9 pr-4 py-3 bg-charcoal-800 border border-charcoal-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 font-medium">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-900 font-black rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {loading ? 'Creating Account...' : 'Create Driver & Generate Invite'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <p className="text-emerald-400 font-black text-sm mb-1">✅ Driver account created!</p>
                <p className="text-gray-400 text-xs">
                  <strong className="text-white">{form.fullName}</strong> has been added to the fleet with <strong className="text-white">Pending</strong> status.
                </p>
              </div>

              {result.inviteLink ? (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Password Setup Link</p>
                  <p className="text-gray-400 text-xs mb-3">Share this link with the driver. It will expire after one use.</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-charcoal-800 border border-charcoal-700 rounded-xl px-3 py-2.5 text-xs text-gray-300 truncate font-mono">
                      {result.inviteLink}
                    </div>
                    <button
                      onClick={copyLink}
                      className={`p-2.5 rounded-xl border transition-all flex-shrink-0 ${copied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-charcoal-800 border-charcoal-700 text-gray-400 hover:text-white'}`}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <p className="text-emerald-500 text-xs font-bold mt-2">
                    💡 Send this via WhatsApp or SMS. It takes them straight to the driver dashboard after they set a password.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-400 text-xs font-medium">
                  ⚠️ {result.warning}
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 bg-charcoal-800 hover:bg-charcoal-700 text-white font-bold rounded-xl transition-all mt-2"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
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
      const { data: profilesData } = await supabase
        .from('profiles')
        .select(`*, driver_documents (id)`)
        .or('role.eq.driver,driver_status.neq.null')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        setDrivers((profilesData || []).filter(d => d.driver_status === statusFilter));
      } else {
        setDrivers(profilesData || []);
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
    active: 'bg-emerald-500/10 text-emerald-500',
    pending: 'bg-amber-500/10 text-amber-500',
    paused: 'bg-blue-500/10 text-blue-500',
    rejected: 'bg-red-500/10 text-red-500'
  };

  return (
    <div>
      {showAddModal && (
        <AddDriverModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            // Drivers list will refresh via Realtime
            setTimeout(() => setShowAddModal(false), 3000);
          }}
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black mb-2 text-white">Driver Fleet</h1>
          <p className="text-gray-400 font-medium">Manage and verify your logistics partners.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex bg-charcoal-800 p-1 rounded-xl border border-charcoal-700 w-full sm:w-auto overflow-x-auto">
             {['all', 'pending', 'active', 'paused', 'rejected'].map(f => (
               <button 
                 key={f}
                 onClick={() => setStatusFilter(f)}
                 className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === f ? 'bg-emerald-500 text-charcoal-900' : 'text-gray-400 hover:text-white'}`}
               >
                 {f}
               </button>
             ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="Search fleet..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-charcoal-800 border border-charcoal-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm w-full text-white"
            />
          </div>
          {/* ⭐ Add Driver Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-charcoal-900 font-black text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 whitespace-nowrap"
          >
            <Plus size={18} />
            Add Driver
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500 font-bold animate-pulse">Loading fleet data...</div>
        ) : filteredDrivers.length === 0 ? (
          <div className="py-20 text-center text-gray-500 font-bold bg-charcoal-800/20 rounded-3xl border border-dashed border-charcoal-800">No matching drivers found.</div>
        ) : (
          filteredDrivers.map(driver => (
            <Link 
              key={driver.id} 
              href={`/admin/drivers/${driver.id}`}
              className="bg-charcoal-800/50 border border-charcoal-800 p-6 rounded-3xl hover:bg-charcoal-800 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-charcoal-800 rounded-2xl flex items-center justify-center text-2xl font-black text-emerald-500 border border-charcoal-700">
                  {driver.full_name?.[0]}
                </div>
                <div>
                  <div className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                    {driver.full_name}
                    {driver.is_verified && <UserCheck size={16} className="text-emerald-500" />}
                  </div>
                  <div className="text-gray-400 text-sm flex items-center gap-2">
                    <span>{driver.phone || 'No Phone'}</span>
                    <span>•</span>
                    <span className="hidden sm:inline">{driver.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-10">
                <div className="text-right hidden md:block">
                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Vehicle</div>
                   <div className="font-bold text-sm text-white uppercase">{driver.plate_number || 'No Plate'}</div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[driver.driver_status || 'pending']}`}>
                    {driver.driver_status || 'pending'}
                  </div>
                  {driver.driver_documents?.length > 0 && (
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">
                      📄 {driver.driver_documents.length} Docs Uploaded
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={(e) => handleDeleteDriver(e, driver.id)}
                    className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Delete Application"
                  >
                    <Trash2 size={18} />
                  </button>
                  <ChevronRight className="text-gray-600 group-hover:text-white transition-colors" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
