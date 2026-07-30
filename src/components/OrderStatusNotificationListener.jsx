"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Package, Truck, CheckCircle2, UserCheck, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// Milestones worth interrupting the vendor's day for. Keyed by the order's
// new status - anything not listed here doesn't toast.
const MILESTONES = {
  matched: { icon: UserCheck, label: 'Rider assigned', text: (o) => `A rider is on the way to pick up ${o.item_description || 'your package'}.` },
  picked_up: { icon: Package, label: 'Picked up', text: (o) => `${o.item_description || 'Your package'} has been picked up and is headed out.` },
  in_transit: { icon: Truck, label: 'On the way', text: (o) => `${o.item_description || 'Your package'} is on the way to ${o.dropoff_name || 'the drop-off'}.` },
  delivered: { icon: CheckCircle2, label: 'Delivered', text: (o) => `${o.item_description || 'Your package'} has been delivered.` },
};

function StatusToast({ notification, onClose, onTap }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const Icon = notification.icon;

  return (
    <motion.div
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="w-full max-w-sm"
    >
      <button
        onClick={onTap}
        className="w-full glass-dark border border-white/10 rounded-[2rem] p-4 flex items-center gap-4 shadow-premium text-left active:scale-95 transition-transform group relative"
      >
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-transform">
          <Icon size={22} className="text-charcoal-950" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-1">{notification.label}</p>
          <p className="text-sm text-white font-semibold leading-tight">{notification.text}</p>
          <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">Tap to view order</p>
        </div>

        <ChevronRight size={16} className="text-white/20 group-hover:text-emerald-500 shrink-0 transition-colors group-hover:translate-x-0.5" />

        <div
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all pointer-events-auto"
        >
          <X size={12} />
        </div>
      </button>
    </motion.div>
  );
}

export default function OrderStatusNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const subRef = useRef(null);
  const vendorIdRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // FIX: orders.vendor_id is a foreign key to vendors.id, not the
      // user's own id (the same mismatch that quietly made
      // ChatNotificationListener match zero orders) - has to be resolved
      // through the vendors table first.
      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!vendorRow) return; // not a vendor - riders/customers don't get this listener
      vendorIdRef.current = vendorRow.id;

      subRef.current = supabase
        .channel(`order-status-notify-${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `vendor_id=eq.${vendorRow.id}`,
        }, (payload) => {
          const order = payload.new;
          const prevStatus = payload.old?.status;
          if (order.status === prevStatus) return; // some other field changed, not a milestone

          const milestone = MILESTONES[order.status];
          if (!milestone) return;

          const newNotif = {
            id: `${order.id}-${order.status}-${Date.now()}`,
            orderId: order.id,
            status: order.status,
            icon: milestone.icon,
            label: milestone.label,
            text: milestone.text(order),
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(milestone.label, { body: newNotif.text, icon: '/favicon.png' });
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [supabase]);

  const dismiss = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  const handleTap = (notification) => {
    dismiss(notification.id);
    const dest = notification.status === 'delivered' ? `/receipt/${notification.orderId}` : `/tracking/${notification.orderId}`;
    router.push(dest);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map(notif => (
          <div key={notif.id} className="pointer-events-auto relative">
            <StatusToast
              notification={notif}
              onClose={() => dismiss(notif.id)}
              onTap={() => handleTap(notif)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}