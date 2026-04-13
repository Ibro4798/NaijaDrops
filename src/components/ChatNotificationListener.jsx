"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MessageSquare, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// ─── Toast Notification Component ──────────────────────────────────────────
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
        {/* Icon */}
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-transform">
          <MessageSquare size={22} className="text-charcoal-950" />
        </div>

        {/* Content */}
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

        {/* Arrow */}
        <ChevronRight size={16} className="text-white/20 group-hover:text-emerald-500 shrink-0 transition-colors group-hover:translate-x-0.5 transition-transform" />

        {/* Close Button */}
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all"
        >
          <X size={12} />
        </button>
      </button>
    </motion.div>
  );
}

// ─── Global Listener Component ──────────────────────────────────────────────
export default function ChatNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [userId, setUserId] = useState(null);
  const subRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Find any active orders for this user (as customer or driver)
      const { data: customerOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user.id)
        .not('status', 'in', '("delivered","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: driverOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('driver_id', user.id)
        .not('status', 'in', '("delivered","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1);

      const orderId = customerOrders?.[0]?.id || driverOrders?.[0]?.id;
      if (!orderId) return;
      setActiveOrderId(orderId);

      // Listen for new messages in this order
      subRef.current = supabase
        .channel(`chat-notify-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${orderId}`
        }, async (payload) => {
          const msg = payload.new;

          // Don't notify for own messages or system messages
          if (msg.sender_id === user.id) return;
          if (msg.type === 'system') return;

          // Determine who the sender is
          let senderLabel = 'New Message';
          const { data: driverProfile } = await supabase
            .from('drivers')
            .select('full_name')
            .eq('id', msg.sender_id)
            .maybeSingle();

          if (driverProfile) {
            senderLabel = `Driver: ${driverProfile.full_name.split(' ')[0]}`;
          } else {
            const { data: customerProfile } = await supabase
              .from('customers')
              .select('full_name')
              .eq('id', msg.sender_id)
              .maybeSingle();
            if (customerProfile) {
              senderLabel = `Customer: ${customerProfile.full_name.split(' ')[0]}`;
            }
          }

          // Add toast
          const newNotif = {
            id: msg.id,
            text: msg.text,
            senderLabel,
            orderId,
            createdAt: msg.created_at,
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]); // Max 3 toasts

          // Also fire browser notification if permitted and tab is not focused
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(senderLabel, {
              body: msg.text,
              icon: '/favicon.png',
              badge: '/favicon.png',
              tag: `chat-${orderId}`,
            });
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
    // Navigate to tracking page with chat open
    router.push(`/tracking/${notification.orderId}?openChat=1`);
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
