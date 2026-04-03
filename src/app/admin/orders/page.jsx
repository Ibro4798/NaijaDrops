"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Search, Filter, Package, ChevronRight, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

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

    // Realtime subscription
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

  return (
    <div>
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-black mb-2 text-white">All Orders</h1>
          <p className="text-gray-400 font-medium">Monitor every delivery on the platform.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Search Order ID or Destination..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 bg-charcoal-800 border border-charcoal-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm w-80 text-white"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500 font-bold animate-pulse">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-20 text-center text-gray-500 font-bold bg-charcoal-800/20 rounded-3xl border border-dashed border-charcoal-800">No matching orders found.</div>
        ) : (
          filteredOrders.map(order => (
            <Link 
              key={order.id} 
              href={`/admin/orders/${order.id}`}
              className="bg-charcoal-800/50 border border-charcoal-800 p-6 rounded-3xl hover:bg-charcoal-800 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                  order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500' : 
                  order.status === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                }`}>
                  {order.status === 'delivered' && order.delivery_photo_url ? (
                    <img src={order.delivery_photo_url} className="w-full h-full object-cover rounded-2xl" alt="Proof" />
                  ) : (
                    <Package size={28} />
                  )}
                </div>
                <div>
                  <div className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors">
                    {order.dropoff_name}
                  </div>
                  <div className="text-gray-400 text-sm flex items-center gap-2">
                    <span className="font-mono text-xs bg-charcoal-700 px-1.5 py-0.5 rounded text-gray-300">ID: ...{order.id.slice(-6).toUpperCase()}</span>
                    <span>•</span>
                    <span className="text-emerald-500 font-black">₦{order.agreed_price}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-10">
                <div className="text-right hidden md:block">
                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Status / PIN</div>
                   <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        {order.status.replace(/_/g, ' ')}
                      </div>
                      <div className="font-mono text-xs bg-white/5 px-2 py-1 rounded text-gray-400 border border-white/10">
                        {order.delivery_pin || '----'}
                      </div>
                   </div>
                </div>

                <ChevronRight className="text-gray-600 group-hover:text-white transition-colors" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
