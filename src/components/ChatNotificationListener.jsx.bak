"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MessageSquare, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

// â”€â”€â”€ Toast Notification Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Global Listener Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ChatNotificationListener() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const subRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find any active orders for this user
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, vendor_id, rider_id')
        .or(`vendor_id.eq.${user.id},rider_id.eq.${user.id}`) // Note: vendor_id and rider_id are user IDs in this context or mapped
        .not('status', 'in', '("delivered")')
        .order('created_at', { ascending: false });

      if (!activeOrders || activeOrders.length === 0) return;

      const orderIds = activeOrders.map(o => o.id);

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

          // Fetch sender name
          const { data: sender } = await supabase
            .from('users')
            .select('name, role')
            .eq('id', msg.sender_id)
            .single();

          const senderLabel = sender ? `${sender.role.toUpperCase()}: ${sender.name.split(' ')[0]}` : 'New Message';

          const newNotif = {
            id: msg.id,
            text: msg.message, // Use 'message' field from schema
            senderLabel,
            orderId: msg.order_id,
            createdAt: msg.created_at,
          };

          setNotifications(prev => [...prev.slice(-2), newNotif]);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(senderLabel, { body: msg.message, icon: '/favicon.png' });
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
    // Use the generic tracking page which is role-agnostic for chat
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
