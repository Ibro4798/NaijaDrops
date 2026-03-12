"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { MapPin, Package, ShoppingCart, ChevronRight } from "lucide-react";

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setProfile(prof);

        const { data: orders } = await supabase.from('orders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['looking_for_driver', 'accepted', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });
        if (orders) setActiveOrders(orders);
      }
    }
    loadData();
  }, [supabase]);

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'User';

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 mb-16 relative">
      {/* Greeting & Map Context */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-charcoal-900 mb-2 tracking-tight">
          Morning, {firstName} 👋
        </h1>
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 w-fit px-3 py-1.5 rounded-full border border-emerald-100 font-medium text-sm">
          <MapPin size={16} />
          <span>Kano (Nassarawa GRA)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1"></span>
        </div>
      </div>

      {/* Service Selection Grid */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        {/* Send Package Service */}
        <Link
          href="/send"
          className="bg-gradient-to-br from-charcoal-900 to-charcoal-800 rounded-[2rem] p-6 text-left relative overflow-hidden group shadow-xl block"
        >
          <div className="absolute -right-4 -bottom-4 bg-white/10 w-32 h-32 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4 backdrop-blur-md">
              <span className="text-2xl">📦</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Send Package</h2>
            <p className="text-charcoal-300 text-sm font-medium">Quick deliveries anywhere in Kano.</p>
          </div>
        </Link>

        {/* Market Errand Service */}
        <button
          onClick={() => alert('Market Errands coming in Phase 2!')}
          className="bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-[2rem] p-6 text-left relative overflow-hidden group shadow-xl shadow-emerald-500/20"
        >
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-xl group-hover:bg-white/30 transition-all"></div>
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4 backdrop-blur-md">
              <span className="text-2xl">🛒</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Market Errand</h2>
            <p className="text-emerald-100 text-sm font-medium">We buy from Kwari, Sabon Gari.</p>
          </div>
        </button>
      </div>

      {/* Active Orders Widget */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-charcoal-900 tracking-tight">Active Deliveries</h3>
          <span className="text-sm font-bold text-emerald-600 cursor-pointer hover:text-emerald-700">View All</span>
        </div>

        {/* Orders State */}
        {activeOrders.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
              <Package size={24} className="text-gray-400" />
            </div>
            <p className="text-charcoal-600 font-medium text-sm">
              No active deliveries right now.<br />
              Tap 'Send Package' to start.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map(order => (
              <Link href={`/tracking/${order.id}`} key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between group cursor-pointer transition-shadow hover:shadow-md">
                <div>
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">{order.status.replace(/_/g, ' ')}</div>
                  <div className="font-bold text-charcoal-900 line-clamp-1">{order.dropoff_name}</div>
                </div>
                <ChevronRight className="text-gray-400 group-hover:text-emerald-500 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Re-order History */}
      <div>
        <h3 className="text-lg font-bold text-charcoal-900 tracking-tight mb-4">Jump Back In</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar">
          <div className="snap-start flex-shrink-0 w-64 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">📍</span>
              <div className="text-sm font-bold text-charcoal-800">To Sabon Gari</div>
            </div>
            <div className="text-xs text-charcoal-500 font-medium">From Hotoro GRA</div>
          </div>
          <div className="snap-start flex-shrink-0 w-64 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">📍</span>
              <div className="text-sm font-bold text-charcoal-800">To BUK New Campus</div>
            </div>
            <div className="text-xs text-charcoal-500 font-medium">From Zoo Road</div>
          </div>
        </div>
      </div>
    </main>
  );
}
