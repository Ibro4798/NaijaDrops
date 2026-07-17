"use client";

import { useState } from "react";
import { approveRider, deactivateRider } from "./actions";
import { Loader2 } from "lucide-react";

export default function DriverActions({ riderId, isApproved }) {
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!confirm("Are you sure you want to approve this unit for active duty?")) return;
    setLoading(true);
    const res = await approveRider(riderId);
    if (res.error) alert(`Protocol Error: ${res.error}`);
    setLoading(false);
  };

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this unit? This will prevent them from seeing jobs.")) return;
    setLoading(true);
    const res = await deactivateRider(riderId);
    if (res.error) alert(`Protocol Error: ${res.error}`);
    setLoading(false);
  };

  return (
    <div className="flex gap-3 ml-auto">
      {loading ? (
        <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-black uppercase tracking-widest">
          <Loader2 size={14} className="animate-spin" /> Processing Command...
        </div>
      ) : (
        <>
          {isApproved && (
            <button 
              onClick={handleDeactivate}
              className="px-5 py-3 rounded-xl bg-charcoal-800 border border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all"
            >
               Deactivate
            </button>
          )}
          {!isApproved && (
            <button 
              onClick={handleApprove}
              className="px-5 py-3 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            >
               Approve Unit
            </button>
          )}
        </>
      )}
    </div>
  );
}
