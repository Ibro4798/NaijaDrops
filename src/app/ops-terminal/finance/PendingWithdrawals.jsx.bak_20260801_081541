"use client";

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Check, X, Loader2 } from 'lucide-react';

export default function PendingWithdrawals({ initialRequests }) {
  const supabase = createClient();
  const [requests, setRequests] = useState(initialRequests);
  const [processingId, setProcessingId] = useState(null);

  async function resolve(id, approve) {
    setProcessingId(id);
    const { error } = await supabase.rpc('resolve_withdrawal', {
      p_transaction_id: id,
      p_approve: approve,
      p_note: null
    });
    setProcessingId(null);
    if (error) { alert(error.message); return; }
    setRequests(requests.filter(r => r.id !== id));
  }

  if (requests.length === 0) {
    return <p className="text-charcoal-500 text-sm italic py-6 text-center">No pending withdrawal requests.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-white font-black">{r.rider_name || 'Rider'}</p>
            <p className="text-charcoal-500 text-xs">{new Date(r.created_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 font-black text-lg">₦{Number(r.amount).toLocaleString()}</span>
            <button
              onClick={() => resolve(r.id, true)}
              disabled={processingId === r.id}
              className="w-9 h-9 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 disabled:opacity-50"
            >
              {processingId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            </button>
            <button
              onClick={() => resolve(r.id, false)}
              disabled={processingId === r.id}
              className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-center text-red-500 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
