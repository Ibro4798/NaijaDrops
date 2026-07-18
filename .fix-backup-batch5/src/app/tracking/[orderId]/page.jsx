"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, Clock, MessageCircle, Star, Share2, Printer } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';

const STATUS_STEPS = ['pending', 'looking_for_driver', 'matched', 'picked_up', 'in_transit', 'delivered'];
const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first — covers vendors viewing their own order
      // history (vendor/history links here) via normal RLS.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(current_lat, current_lng, users(full_name)), vendors(business_name, logo_url)')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          channel = supabase
            .channel(`track-${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
              (payload) => setOrder(prev => ({ ...prev, ...payload.new })))
            .subscribe();
          return;
        }
      }

      // Anonymous / no access via RLS: use the scoped public tracking API instead.
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orderId, supabase]);

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'NaijaDrops delivery receipt', url });
        return;
      } catch {
        // user cancelled the share sheet - fall through to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      alert('Receipt link copied to clipboard.');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-charcoal-950"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-white font-black text-xl mb-2">Delivery not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again, or contact the sender.</p>
      </div>
    );
  }

  const riderName = order.riders?.users?.full_name || order.rider?.first_name || null;
  const riderLat = order.riders?.current_lat ?? order.rider?.current_lat;
  const riderLng = order.riders?.current_lng ?? order.rider?.current_lng;
  const vendorName = order.vendors?.business_name || null;
  const vendorLogo = order.vendors?.logo_url || null;

  // --- Delivered: show a branded receipt instead of a live tracker ---
  if (order.status === 'delivered') {
    const commission = isVendorView && order.agreed_price ? Math.round(order.agreed_price * 0.20) : null;
    return (
      <div className="min-h-screen bg-charcoal-950 px-6 py-12 flex justify-center print:bg-white print:py-4">
        <div className="w-full max-w-md bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 space-y-6 print:bg-white print:border-none print:shadow-none print:text-black">

          {/* Vendor branding header */}
          {(vendorName || vendorLogo) && (
            <div className="flex flex-col items-center text-center gap-3 pb-4 border-b border-white/10 print:border-charcoal-300">
              {vendorLogo ? (
                <img src={vendorLogo} alt={vendorName || 'Vendor'} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-xl">
                  {(vendorName || 'ND').slice(0, 2).toUpperCase()}
                </div>
              )}
              {vendorName && <p className="text-white font-black text-lg font-outfit print:text-black">{vendorName}</p>}
              <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest print:text-charcoal-500">Delivered via NaijaDrops</p>
            </div>
          )}

          <div className="flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={40} />
            <p className="text-white font-black text-xl font-outfit print:text-black">Delivered</p>
            <p className="text-charcoal-400 text-xs">{new Date(order.updated_at).toLocaleString()}</p>
          </div>
          <div className="space-y-3 border-t border-white/10 pt-6 print:border-charcoal-300">
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Item</span><span className="text-white font-bold print:text-black">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-white font-bold print:text-black">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-white font-bold print:text-black">{order.dropoff_name}</span></div>
            {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-white font-bold print:text-black">{riderName}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Total Paid</span><span className="text-emerald-400 font-black">₦{Number(order.agreed_price ?? order.total_price ?? 0).toLocaleString()}</span></div>
            {isVendorView && commission !== null && (
              <div className="flex justify-between text-sm opacity-70"><span className="text-charcoal-400">Platform Commission (20%)</span><span className="text-white print:text-black">₦{commission.toLocaleString()}</span></div>
            )}
          </div>

          {isVendorView && (
            <div className="flex flex-col gap-3 pt-2 print:hidden">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Share2 size={16} /> Share
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Printer size={16} /> Print
                </button>
              </div>
              {riderName && (
                <button
                  onClick={() => setShowReview(true)}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                >
                  <Star size={16} /> Rate this delivery
                </button>
              )}
            </div>
          )}
        </div>

        {isVendorView && riderName && (
          <ReviewModal
            order={order}
            driverProfile={{ full_name: riderName }}
            reviewerId={currentUserId}
            isOpen={showReview}
            onClose={() => setShowReview(false)}
          />
        )}
      </div>
    );
  }

  // --- In progress: live status timeline + map ---
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="h-64 relative">
        {(riderLat && riderLng) ? (
          <MapCanvas markers={[{ lat: riderLat, lng: riderLng, color: 'emerald', type: 'rider' }]} center={{ lat: riderLat, lng: riderLng }} />
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-white font-black text-2xl font-outfit">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          {isVendorView && (
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
              title="Message rider"
            >
              <MessageCircle size={20} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              {i <= currentStepIndex ? <CheckCircle2 className="text-emerald-500" size={18} /> : <Clock className="text-charcoal-600" size={18} />}
              <span className={i <= currentStepIndex ? 'text-white font-bold text-sm' : 'text-charcoal-600 text-sm'}>{STATUS_LABELS[step]}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-white font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-white">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-white">{order.dropoff_name}</span></div>
          {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-white font-bold">{riderName}</span></div>}
        </div>
      </div>

      {isVendorView && showChat && currentUserId && (
        <OrderChat
          orderId={order.id}
          currentUserId={currentUserId}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}