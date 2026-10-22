"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  User, Star, Bike, Hash, Phone, Landmark, FileCheck2, FileX2, Save, Trash2,
  Loader2, Wallet, ChevronRight, CheckCircle2, Clock, ShieldAlert,
} from "lucide-react";
import Link from "next/link";

// Rider profile: rider-relevant facts only (standing, vehicle, verification, payout account).
// Vendor-only fields (business name, avatar URL, etc.) and any sign-out control are deliberately absent;
// sign-out lives in the rider menu.

const STATUS = {
  approved: { label: "Approved", Icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  pending:  { label: "Under review", Icon: Clock, cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  rejected: { label: "Not approved", Icon: ShieldAlert, cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  paused:   { label: "Paused", Icon: ShieldAlert, cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const field = "w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-ink font-bold outline-none focus:border-emerald-500/60 placeholder:text-charcoal-600";
const label = "text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 block";

export default function RiderProfilePage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [rider, setRider] = useState(null);
  const [delivered, setDelivered] = useState(0);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const [account, setAccount] = useState(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountMsg, setAccountMsg] = useState(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.replace("/auth/login"); return; }
      setUser(u);

      const [{ data: row }, { data: riderRow }, { data: acct }] = await Promise.all([
        supabase.from("users").select("name, full_name, phone, receipt_display_name").eq("id", u.id).maybeSingle(),
        supabase.from("riders").select("id, status, vehicle_type, plate_number, rating, acceptance_rate, orders_completed_today, profile_photo_url, id_card_url, license_url, vehicle_photo_url, phone, created_at").eq("user_id", u.id).maybeSingle(),
        supabase.from("rider_payout_accounts").select("bank_name, account_number, account_name").eq("user_id", u.id).maybeSingle(),
      ]);

      setRider(riderRow);
      setFullName(row?.name || row?.full_name || "");
      setPhone(row?.phone || riderRow?.phone || "");
      setReceiptName(row?.receipt_display_name || "");
      setAccount(acct || null);
      setEditingAccount(!acct);
      if (acct) { setBankName(acct.bank_name); setAccountNumber(acct.account_number); setAccountName(acct.account_name); }

      if (riderRow?.id) {
        const { count } = await supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("rider_id", riderRow.id).eq("status", "delivered");
        setDelivered(count || 0);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function saveDetails() {
    setSaving(true); setSaveMsg(null);
    try {
      const name = fullName.trim();
      if (name.length < 2) throw new Error("Enter your full name.");
      const { error } = await supabase.from("users")
        .update({ name, full_name: name, phone: phone.trim() || null, receipt_display_name: receiptName.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      // Keep the rider record's own copy in step; non-fatal if it fails.
      await supabase.from("riders").update({ full_name: name, phone: phone.trim() || null }).eq("user_id", user.id);
      setSaveMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (err) {
      setSaveMsg({ ok: false, text: err.message || "Could not save. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    setSavingAccount(true); setAccountMsg(null);
    const { error } = await supabase.rpc("save_payout_account", {
      p_bank_name: bankName, p_account_number: accountNumber, p_account_name: accountName,
    });
    setSavingAccount(false);
    if (error) { setAccountMsg({ ok: false, text: error.message }); return; }
    setAccount({ bank_name: bankName.trim(), account_number: accountNumber, account_name: accountName.trim() });
    setEditingAccount(false);
    setAccountMsg({ ok: true, text: "Payout account saved." });
  }

  async function deleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE" || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteError(data?.error || "We couldn't delete your account. Contact support."); setDeleting(false); return; }
      try { await supabase.auth.signOut(); } catch { /* already closed */ }
      router.replace("/");
    } catch {
      setDeleteError("Network problem. Check your connection and try again.");
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;
  }
  if (!rider) {
    return <p className="py-16 text-center text-sm text-charcoal-400">No rider profile found.</p>;
  }

  const st = STATUS[rider.status] || STATUS.pending;
  const docs = [
    { name: "ID card", ok: !!rider.id_card_url },
    { name: "Driver's licence", ok: !!rider.license_url },
    { name: "Vehicle photo", ok: !!rider.vehicle_photo_url },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Identity */}
      <section className="rounded-[2rem] border border-white/10 bg-charcoal-900 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-charcoal-800 border border-white/10 overflow-hidden flex items-center justify-center">
            {rider.profile_photo_url
              ? <img src={rider.profile_photo_url} alt="" className="w-full h-full object-cover" />
              : <User size={28} className="text-charcoal-500" />}
          </div>
          <div className="min-w-0">
            <div className="text-ink font-black text-xl tracking-tight truncate">{fullName || "Rider"}</div>
            <div className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${st.cls}`}>
              <st.Icon size={11} /> {st.label}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white/5 border border-white/5 py-3">
            <div className="flex items-center justify-center gap-1 text-ink font-black text-lg"><Star size={14} className="text-emerald-400" fill="currentColor" />{Number(rider.rating ?? 5).toFixed(1)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-500">Rating</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/5 py-3">
            <div className="text-ink font-black text-lg">{delivered}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-500">Deliveries</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/5 py-3">
            <div className="text-ink font-black text-lg">{rider.acceptance_rate != null ? `${Math.round(Number(rider.acceptance_rate))}%` : "-"}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-500">Accepted</div>
          </div>
        </div>
      </section>

      {/* Vehicle + verification */}
      <section className="rounded-[2rem] border border-white/10 bg-charcoal-900 p-6 space-y-4">
        <h2 className="text-ink font-black text-base tracking-tight">Vehicle &amp; verification</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-charcoal-500 mb-1"><Bike size={11} /> Vehicle</div>
            <div className="text-ink font-black capitalize">{String(rider.vehicle_type || "-").replace(/_/g, " ")}</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-charcoal-500 mb-1"><Hash size={11} /> Plate</div>
            <div className="text-ink font-black uppercase">{rider.plate_number || "-"}</div>
          </div>
        </div>
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.name} className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
              <span className="text-sm font-bold text-ink">{d.name}</span>
              <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${d.ok ? "text-emerald-400" : "text-red-400"}`}>
                {d.ok ? <FileCheck2 size={14} /> : <FileX2 size={14} />}{d.ok ? "Submitted" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-charcoal-500">To change your vehicle or documents, contact NaijaDrops support so we can re-verify you.</p>
      </section>

      {/* Contact details */}
      <section className="rounded-[2rem] border border-white/10 bg-charcoal-900 p-6 space-y-4">
        <h2 className="text-ink font-black text-base tracking-tight">Your details</h2>
        <div>
          <label className={label}>Full name</label>
          <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full legal name" />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`}><Phone size={11} /> Phone number</label>
          <input className={field} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0803xxxxxxx" />
          <p className="mt-2 px-1 text-[11px] text-charcoal-500">Used by NaijaDrops to reach you about deliveries. Customers never see it.</p>
        </div>
        <div>
          <label className={label}>Name shown to customers</label>
          <input className={field} value={receiptName} onChange={(e) => setReceiptName(e.target.value)} placeholder="Leave blank to use your full name" />
        </div>
        {saveMsg && <p className={`text-xs font-bold ${saveMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{saveMsg.text}</p>}
        <button onClick={saveDetails} disabled={saving} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-charcoal-950 font-black text-sm uppercase tracking-widest transition-all active:scale-95">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save details
        </button>
      </section>

      {/* Payout account */}
      <section className="rounded-[2rem] border border-white/10 bg-charcoal-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-ink font-black text-base tracking-tight"><Landmark size={16} className="text-emerald-400" /> Payout account</h2>
          {account && !editingAccount && (
            <button onClick={() => { setEditingAccount(true); setAccountMsg(null); }} className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Change</button>
          )}
        </div>
        {editingAccount ? (
          <div className="space-y-3">
            <input className={field} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank (e.g. GTBank, Opay)" />
            <input className={field} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit account number" />
            <input className={field} value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" />
            <button onClick={saveAccount} disabled={savingAccount} className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-ink font-black text-sm uppercase tracking-widest disabled:opacity-60">
              {savingAccount ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Save payout account"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 border border-white/5 px-5 py-4">
            <div className="text-ink font-black text-sm">{account.bank_name}</div>
            <div className="mt-0.5 font-mono text-xs text-charcoal-400">{account.account_number} · {account.account_name}</div>
          </div>
        )}
        {accountMsg && <p className={`text-xs font-bold ${accountMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{accountMsg.text}</p>}
        <p className="text-[11px] leading-relaxed text-charcoal-500">Only you and NaijaDrops finance can see this.</p>
        <Link href="/rider/earnings" className="flex items-center justify-between rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-5 py-4 text-emerald-400">
          <span className="flex items-center gap-2 text-sm font-black"><Wallet size={16} /> Earnings &amp; withdrawals</span>
          <ChevronRight size={16} />
        </Link>
      </section>

      {/* Delete */}
      <section className="rounded-[2rem] border border-red-500/20 bg-red-500/[0.04] p-6">
        <h2 className="flex items-center gap-2 text-ink font-black text-base tracking-tight mb-2"><Trash2 size={16} className="text-red-400" /> Delete account</h2>
        {!showDelete ? (
          <>
            <p className="mb-4 text-[12px] leading-relaxed text-charcoal-400">Removes your personal details, documents and payout account. Completed deliveries are kept for accounting without your details. You can&apos;t delete while a delivery is in progress or a withdrawal is pending.</p>
            <button onClick={() => setShowDelete(true)} className="w-full py-3.5 rounded-2xl border border-red-500/30 text-red-400 font-black text-xs uppercase tracking-widest">Delete my account</button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-charcoal-300">Type <span className="font-black text-red-400">DELETE</span> to confirm. This cannot be undone.</p>
            <input className={field} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" autoCapitalize="characters" autoComplete="off" />
            {deleteError && <p className="text-xs font-bold text-red-400">{deleteError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); setDeleteError(null); }} disabled={deleting} className="py-3.5 rounded-2xl bg-white/5 border border-white/10 text-charcoal-300 font-black text-xs uppercase tracking-widest">Cancel</button>
              <button onClick={deleteAccount} disabled={deleteConfirm.trim().toUpperCase() !== "DELETE" || deleting} className="py-3.5 rounded-2xl bg-red-500 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40">
                {deleting ? "Deleting..." : "Delete forever"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
