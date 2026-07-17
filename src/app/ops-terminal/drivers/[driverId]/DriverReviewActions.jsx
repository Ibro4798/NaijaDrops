"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveRider, rejectRider, pauseRider } from "../actions";
import { Loader2, CheckCircle2, XCircle, PauseCircle } from "lucide-react";

export default function DriverReviewActions({ riderId, status }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null); // null | 'reject' | 'pause'
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  const runAction = async (fn, ...args) => {
    setLoading(true);
    setError(null);
    const res = await fn(...args);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMode(null);
    setReason("");
    router.refresh();
  };

  const handleApprove = () => {
    if (!confirm("Approve this rider? They'll be able to go online immediately.")) return;
    runAction(approveRider, riderId);
  };

  const handleReject = () => runAction(rejectRider, riderId, reason);
  const handlePause = () => runAction(pauseRider, riderId, reason);

  if (mode === 'reject' || mode === 'pause') {
    const isPause = mode === 'pause';
    return (
      <div className="bg-charcoal-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">
          {isPause ? "Pause this rider" : "Reject this application"}
        </h3>
        <p className="text-charcoal-400 text-xs leading-relaxed">
          {isPause
            ? "The rider will be taken offline and blocked from toggling online again. They'll see this reason on their dashboard and be told to contact support - this is not a full rejection, they stay on the platform."
            : "The rider will see this reason on their onboarding screen and can edit their submission and resubmit."}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={isPause ? "e.g. Customer complaint under review, vehicle documents expired..." : "e.g. License photo is blurry, plate number doesn't match upload..."}
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-4 min-h-[100px] text-white text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => { setMode(null); setError(null); }}
            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={isPause ? handlePause : handleReject}
            disabled={loading || !reason.trim()}
            className={`flex-1 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              loading || !reason.trim() ? 'bg-white/5 text-charcoal-600 cursor-not-allowed' :
              isPause ? 'bg-amber-500 text-charcoal-950 hover:bg-amber-400' : 'bg-red-500 text-white hover:bg-red-400'
            }`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : isPause ? <PauseCircle size={14} /> : <XCircle size={14} />}
            {isPause ? "Confirm Pause" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {status !== 'approved' && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500 text-charcoal-950 text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-[0_0_16px_rgba(16,185,129,0.3)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Approve Rider
          </button>
        )}
        {status !== 'rejected' && (
          <button
            onClick={() => setMode('reject')}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            <XCircle size={16} /> Reject
          </button>
        )}
        {status !== 'paused' && status !== 'rejected' && (
          <button
            onClick={() => setMode('pause')}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-50"
          >
            <PauseCircle size={16} /> Pause
          </button>
        )}
      </div>
    </div>
  );
}