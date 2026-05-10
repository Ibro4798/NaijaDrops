"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ShieldAlert, Loader2 } from "lucide-react";

export default function FraudActions({ riderId }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSuspend = async () => {
    if (!confirm("Are you sure you want to suspend this node? They will lose platform access immediately.")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('riders')
        .update({ status: 'paused', rejection_reason: 'Flagged by automated fraud detection algorithm.' })
        .eq('user_id', riderId);

      if (error) throw error;
      alert("Node access severed successfully.");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Failed to suspend node.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSuspend}
      disabled={loading}
      className="px-4 py-2 bg-charcoal-900 text-white hover:bg-red-500 hover:text-white border border-white/5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
      Suspend Node
    </button>
  );
}
