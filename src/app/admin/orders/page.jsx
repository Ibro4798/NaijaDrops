"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Search, Filter, Package, ChevronRight, Clock, AlertCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminOrdersPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchOrders() {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setOrders(data);
      setLoading(false);
    }
    fetchOrders();

    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase]);

  const filteredOrders = orders.filter(o => 
    o.dropoff_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.id.includes(search)
  );

  const statusColors = {
    delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glow shadow-emerald-500/10',
    cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    accepted: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    picked_up: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    arriving: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    looking_for_driver: 'bg-white/5 text-gray-400 border-white/10'
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-16 gap-8 px-4">
        <div>
           <motion.h1 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="text-5xl font-black mb-4 text-white font-outfit uppercase tracking-tighter italic"
          >
            Dispatch <span className="text-emerald-500">Grid</span>
          </motion.h1>
          <p className="text-gray-500 font-black text-[10px] uppercase tracking-[0.3em]">Monitoring the flow of active payloads across the logistics network.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full sm:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search Payload ID or Destination..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-6 py-4 bg-charcoal-950/60 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-bold placeholder:text-charcoal-800 w-full"
            />
          </div>
          
          <div className="glass-dark px-6 py-4 rounded-2xl border border-white/5 flex items-center gap-3">
             <Filter size={16} className="text-emerald-500" />
             <span className="text-[10px] font-black text-white/40 uppercase tracking-widest font-outfit">Filter Active</span>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 px-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <div className="col-span-full py-32 text-center text-emerald-500/20 font-black text-2xl uppercase tracking-[0.5em] animate-pulse italic">
                Synchronizing Global Order Stream...
            </div>
          ) : filteredOrders.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-32 text-center text-charcoal-700 font-black text-xl bg-white/2 rounded-[3rem] border border-dashed border-white/5 uppercase tracking-widest italic"
            >
                No Matching Payloads Detected.
            </motion.div>
          ) : (
            filteredOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                  <Link 
                    href={`/admin/orders/${order.id}`}
                    className="glass-dark border border-white/5 p-8 rounded-[3rem] hover:bg-black/40 hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row items-center justify-between group relative overflow-hidden shadow-premium"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all"></div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10 w-full">
                      <div className={`w-20 h-20 rounded-[2.2rem] flex items-center justify-center shrink-0 border border-white/5 shadow-inner transition-transform duration-700 group-hover:scale-110 ${
                        order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500' : 
                        order.status === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-charcoal-900 text-white/20'
                      }`}>
                        {order.status === 'delivered' && order.delivery_photo_url ? (
                          <img src={order.delivery_photo_url} className="w-full h-full object-cover rounded-[2.2rem] opacity-60 group-hover:opacity-100 transition-opacity" alt="Proof" />
                        ) : (
                          <Package size={32} className="group-hover:text-emerald-500 transition-colors" />
                        )}
                      </div>
                      <div className="text-center sm:text-left flex-1 min-w-0">
                        <div className="font-black text-xl text-white group-hover:text-emerald-400 transition-colors font-outfit uppercase tracking-tighter italic leading-tight mb-2">
                          {order.dropoff_name.split(',')[0]}
                        </div>
                        <div className="flex flex-wrap justify-center sm:justify-start items-center gap-3">
                           <span className="font-mono text-[9px] bg-white/5 px-2 py-1 rounded-md text-emerald-500/60 font-black uppercase tracking-[0.2em] border border-white/5">ID: {order.id.slice(-8).toUpperCase()}</span>
                           <span className="h-1 w-1 bg-white/20 rounded-full"></span>
                           <span className="text-white font-black text-sm font-outfit italic tracking-tight">₦{order.agreed_price?.toLocaleString()}</span>
                        </div>
                        <div className="text-gray-600 text-[9px] font-black uppercase tracking-[0.3em] mt-3 flex items-center justify-center sm:justify-start gap-2">
                           <Clock size={12} className="text-emerald-500/40" />
                           {new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 mt-6 sm:mt-0 relative z-10 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-6 sm:pt-0">
                      <div className="text-right hidden md:block px-6 border-r border-white/5">
                         <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1">Pass-Key</div>
                         <div className="font-mono text-xs text-white font-black tracking-[0.3em] group-hover:text-emerald-500 transition-colors">
                            {order.delivery_pin || '----'}
                         </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border transition-all ${statusColors[order.status] || 'bg-white/5 text-gray-500 border-white/10'}`}>
                          {order.status.replace(/_/g, ' ')}
                        </div>
                        <div className="w-10 h-10 glass-dark text-charcoal-400 group-hover:text-white rounded-xl flex items-center justify-center border border-white/5 group-hover:translate-x-1 transition-all">
                            <ChevronRight size={18} />
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
