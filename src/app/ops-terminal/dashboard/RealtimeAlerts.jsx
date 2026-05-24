"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { AlertOctagon, Activity, Navigation, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function RealtimeAlerts() {
  const [alerts, setAlerts] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    // Listen to various channels for operations
    const channel = supabase
      .channel('ops-terminal-alerts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: "status=eq.cancelled" }, (payload) => {
         addAlert({
            id: payload.new.id,
            type: 'fraud',
            message: `Escrow Voided: â‚¦${payload.new.agreed_price}`,
            time: new Date().toLocaleTimeString()
         });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
         addAlert({
            id: payload.new.id,
            type: 'dispatch',
            message: `New Payload Detected: ${payload.new.item_category}`,
            time: new Date().toLocaleTimeString()
         });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const addAlert = (alert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 5)); // Keep last 5
  };

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-charcoal-600 space-y-4">
         <Activity size={24} className="animate-pulse" />
         <span className="text-[10px] font-black uppercase tracking-widest">Listening for Telemetry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {alerts.map((alert, idx) => (
          <motion.div
            key={`${alert.id}-${alert.time}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`p-4 rounded-2xl flex items-center gap-4 ${alert.type === 'fraud' ? 'bg-red-500/10 border border-red-500/20 text-red-500' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'}`}
          >
             {alert.type === 'fraud' ? <AlertOctagon size={16} /> : <Zap size={16} />}
             <div className="flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest">{alert.type === 'fraud' ? 'RISK ALERT' : 'SYSTEM PING'}</div>
                <div className="text-sm font-bold text-white">{alert.message}</div>
             </div>
             <div className="text-[9px] text-charcoal-400 font-mono font-black">{alert.time}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
