"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MessageSquare, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// --- Toast Notification Component ---
function ChatToast({ notification, onClose, onTap }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

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
        className="w-full glass-dark border border-white/10 rounded-[2rem] p-4 flex items-center gap-4 shadow-premium text-left active:scale-95 transition-transform group"
      >
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-transform">
          <MessageSquare size={22} className="text-charcoal-950" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-1">
            {notification.senderLabel}
          </p>
          <p className="text-sm text-white font-semibold truncate leading-tight">
            {notification.text}
          </p>
          <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">
            Tap to open chat
          </p>
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

// --- Global Listener Component ---
export default function ChatNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const subRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // vendor_id/rider_id on orders are foreign keys to vendors.id and
      // riders.id - NOT the user's own id - so resolve the user's actual
      // vendor_id/rider_id row first.
      const [{ data: vendorRow }, { data: riderRow }] = await Promise.all([
        supabase.from('vendors').select('id').eq('user_id', user.id).single(),
        supabase.from('riders').select('id').eq('user_id', user.id).single(),
      ]);

      const myRole = vendorRow ? 'vendor' : (riderRow ? 'rider' : null);

      const orFilters = [];
      if (vendorRow) orFilters.push(`vendor_id.eq.${vendorRow.id}`);
      if (riderRow) orFilters.push(`rider_id.eq.${riderRow.id}`);
      if (orFilters.length === 0) return;

      // Find any active orders for this user
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, vendor_id, rider_id')
        .or(orFilters.join(','))
        .not('status', 'in', '("delivered")')
        .order('created_at', { ascending: false });

      if (!activeOrders || activeOrders.length === 0) return;

      const orderIds = activeOrders.map(o => o.id);

      // Only notify for channels this person is actually a party to - a
      // vendor doesn't need a toast for the rider<->customer thread, and
      // vice versa.
      const relevantChannels = myRole === 'vendor'
        ? ['vendor_rider', 'vendor_customer']
        : ['vendor_rider', 'rider_customer'];

      const CHANNEL_LABELS = {
        vendor_rider: myRole === 'vendor' ? 'Rider' : 'Vendor',
        vendor_customer: 'Customer',
        rider_customer: 'Customer',
      };

      // Listen for new messages in ANY active order
      subRef.current = supabase
        .channel(`chat-notify-unified-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, async (payload) => {
          const msg = payload.new;
          if (!orderIds.includes(msg.order_id)) return;
          if (msg.sender_id === user.id) return;
          const channel = msg.channel || 'vendor_rider';
          if (!relevantChannels.includes(channel)) return;

          // FIX: this read `msg.message`, but the messages table's text
          // column is actually called `text` - every toast body rendered
          // as "undefined". Also derive the sender label from sender_role
          // (present on every message now) with a DB lookup as a fallback
          // for older rows that predate that column, instead of always
          // hitting the users table.
          let senderLabel = CHANNEL_LABELS[channel] || 'New Message';
          if (!msg.sender_role && msg.sender_id) {
            const { data: sender } = await supabase
              .from('users')
              .select('name, role')
              .eq('id', msg.sender_id)
              .single();
            if (sender) senderLabel = `${sender.role?.toUpperCase() || ''}: ${(sender.name || '').split(' ')[0]}`.trim();
          } else if (msg.sender_role === 'customer') {
            senderLabel = 'Customer';
          }

          const newNotif = {
            id: msg.id,
            text: msg.text,
            senderLabel,
            orderId: msg.order_id,
            channel,
            createdAt: msg.created_at,
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(senderLabel, { body: msg.text, icon: '/favicon.png' });
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [supabase]);

  const dismiss = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleTap = (notification) => {
    dismiss(notification.id);
    // FIX: this linked to /tracking/[id]?openChat=1, but the tracking page
    // never actually read that query param - tapping a chat notification
    // just opened the order with chat still closed. It's now read on the
    // tracking page (see openChat/channel handling there), and the channel
    // is passed through too so it opens on the exact thread the message
    // came from rather than always defaulting to the first tab.
    router.push(`/tracking/${notification.orderId}?openChat=1&channel=${notification.channel}`);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map(notif => (
          <div key={notif.id} className="pointer-events-auto relative">
            <ChatToast
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
