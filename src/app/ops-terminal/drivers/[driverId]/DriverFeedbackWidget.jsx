"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Send, CheckCircle2, XCircle, MessageCircle } from "lucide-react";

export default function DriverFeedbackWidget({ driverId, riderName, currentStatus }) {
  const supabase = createClient();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => { fetchMessages(); }, [driverId]);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("admin_action_logs")
      .select("*")
      .eq("user_id", driverId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  };

  const sendFeedback = async () => {
    if (!newMessage.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("admin_action_logs").insert({
      admin_id: user.id,
      user_id: driverId,
      table_name: "riders",
      action: "feedback",
      changes: { feedback: newMessage },
    });
    setNewMessage("");
    fetchMessages();
  };

  const approveDriver = async () => {
    setIsUpdatingStatus(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("riders").update({ status: "approved", approved: true }).eq("user_id", driverId);
    await supabase.from("admin_action_logs").insert({
      admin_id: user.id,
      user_id: driverId,
      table_name: "riders",
      action: "approve",
      changes: { status: "approved", approved: true },
    });
    setIsUpdatingStatus(false);
    window.location.reload();
  };

  const rejectDriver = async () => {
    if (!rejectReason.trim()) return;
    setIsUpdatingStatus(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("riders").update({ status: "rejected" }).eq("user_id", driverId);
    await supabase.from("admin_action_logs").insert({
      admin_id: user.id,
      user_id: driverId,
      table_name: "riders",
      action: "reject",
      changes: { status: "rejected", reason: rejectReason },
    });
    setIsUpdatingStatus(false);
    window.location.reload();
  };

  return (
    <div className="bg-charcoal-900/50 border border-white/10 rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle size={24} className="text-emerald-500" />
        <h2 className="text-2xl font-black">Feedback & Decision</h2>
      </div>

      <div className="bg-charcoal-950 rounded-2xl p-6 mb-6 max-h-64 overflow-y-auto space-y-4 border border-white/5">
        {messages.length === 0 ? (
          <p className="text-charcoal-600 text-center py-8">No feedback yet</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="bg-white/5 rounded-lg p-4 border-l-2 border-emerald-500">
              <p className="text-[10px] text-charcoal-500 font-bold uppercase mb-2">{msg.action}</p>
              <p className="text-white text-sm">{msg.changes?.feedback || msg.changes?.reason || JSON.stringify(msg.changes)}</p>
              <p className="text-[10px] text-charcoal-600 mt-2">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {currentStatus === "pending" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input type="text" placeholder="Add feedback..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 bg-charcoal-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button onClick={sendFeedback} disabled={!newMessage.trim()} className="bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 p-3 rounded-xl font-black">
              <Send size={20} />
            </button>
          </div>
          <div className="flex gap-4">
            <button onClick={approveDriver} disabled={isUpdatingStatus} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-3 rounded-xl flex items-center justify-center gap-2">
              <CheckCircle2 size={20} /> Approve
            </button>
            <button onClick={() => setShowRejectForm(!showRejectForm)} className="flex-1 bg-red-500/20 border border-red-500/40 text-red-400 font-black py-3 rounded-xl flex items-center justify-center gap-2">
              <XCircle size={20} /> Reject
            </button>
          </div>
          {showRejectForm && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <textarea placeholder="Why reject?" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-charcoal-900 border border-red-500/30 rounded-lg px-3 py-2 text-white text-sm" rows="3" />
              <div className="flex gap-2 mt-3">
                <button onClick={rejectDriver} disabled={!rejectReason.trim()} className="flex-1 bg-red-500 text-white font-black py-2 rounded-lg">Confirm</button>
                <button onClick={() => setShowRejectForm(false)} className="flex-1 bg-white/10 text-white font-black py-2 rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentStatus !== "pending" && (
        <div className="text-center py-8 text-charcoal-600">Application is {currentStatus}</div>
      )}
    </div>
  );
}