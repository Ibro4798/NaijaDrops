"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Loader2, Wallet } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { loadPaystackScript, initializePaystack } from "@/utils/paystack";
import { MIN_TOPUP, MAX_TOPUP, QUICK_TOPUPS, naira, ledgerLabel } from "@/utils/wallet";
import Navbar from "@/components/layout/Navbar";

// Only ever send people back to a payment page for an order (never an arbitrary URL).
const SAFE_NEXT = /^\/payment\?orderId=[0-9a-f-]{36}$/i;

function WalletContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const need = Number(params.get("need")) || 0;
  const nextParam = params.get("next") || "";
  const next = SAFE_NEXT.test(nextParam) ? nextParam : null;

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [amount, setAmount] = useState(
    need > 0 ? String(Math.min(MAX_TOPUP, Math.max(MIN_TOPUP, Math.ceil(need / 100) * 100))) : "5000"
  );

  const load = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { router.replace("/login"); return; }
    setUser(u);
    const [{ data: w }, { data: rows }] = await Promise.all([
      supabase.from("user_wallets").select("balance, is_locked").eq("user_id", u.id).maybeSingle(),
      supabase.from("wallet_ledger")
        .select("id, amount, type, category, description, balance_after, created_at")
        .eq("user_id", u.id).order("created_at", { ascending: false }).limit(30),
    ]);
    setWallet(w || { balance: 0, is_locked: false });
    setLedger(rows || []);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    load();
    loadPaystackScript().then((ok) => setGatewayReady(!!ok));
  }, [load]);

  const value = Math.floor(Number(amount));
  const valid = Number.isFinite(value) && value >= MIN_TOPUP && value <= MAX_TOPUP;

  const verify = async (reference) => {
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/verify-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not confirm your top-up.");
      await load();
      setMessage({ ok: true, text: naira(value) + " added to your wallet." });
      if (next) setTimeout(() => router.replace(next), 1200);
    } catch (e) {
      setMessage({ ok: false, text: e.message + " If you were charged, your balance will update shortly, or contact support with reference " + reference + "." });
    } finally {
      setBusy(false);
    }
  };

  const topUp = () => {
    if (!valid || !gatewayReady || busy || !user) return;
    setMessage(null);
    const reference = "WT_" + Date.now() + "_" + user.id.slice(0, 8);
    initializePaystack({
      email: user.email || "user-" + user.id + "@naijadrops.tech",
      amount: value,
      reference,
      metadata: { purpose: "wallet_topup", userId: user.id },
      onSuccess: (r) => verify(r.reference),
      onClose: () => {},
      onError: (m) => setMessage({ ok: false, text: m }),
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950">
      <Navbar />
      <section className="pt-32 pb-20 max-w-lg mx-auto px-6 space-y-8">
        <div className="rounded-[2.5rem] border border-emerald-500/20 bg-emerald-500/[0.06] p-8">
          <div className="flex items-center gap-3 text-emerald-400 text-[10px] font-black uppercase tracking-[0.25em] mb-4">
            <Wallet size={18} /> NaijaDrops Wallet
          </div>
          <div className="text-5xl font-black text-ink tracking-tighter">{naira(wallet?.balance)}</div>
          <p className="text-charcoal-400 text-sm font-medium mt-3 leading-relaxed">
            Pay for deliveries in one tap. If a delivery you paid for is cancelled before pickup, the money comes straight back here.
          </p>
          {wallet?.is_locked && (
            <p className="mt-4 text-amber-400 text-xs font-bold">Your wallet is locked. Please contact support.</p>
          )}
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 space-y-5">
          <h2 className="text-ink font-black text-lg tracking-tight">Top up</h2>
          {need > 0 && (
            <p className="text-charcoal-400 text-xs font-bold leading-relaxed">
              You need {naira(need)} more to pay for your delivery.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {QUICK_TOPUPS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(String(q))}
                className={"py-3 rounded-2xl border text-sm font-black " + (value === q ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-ink")}
              >
                {naira(q)}
              </button>
            ))}
          </div>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Other amount"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-ink font-bold"
          />
          {!valid && amount !== "" && (
            <p className="text-amber-400 text-xs font-bold">Enter between {naira(MIN_TOPUP)} and {naira(MAX_TOPUP)}.</p>
          )}
          <button
            type="button"
            onClick={topUp}
            disabled={!valid || !gatewayReady || busy}
            className={"w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.15em] " + (!valid || !gatewayReady || busy ? "bg-white/10 text-white/30 cursor-not-allowed" : "bg-emerald-500 text-charcoal-950")}
          >
            {busy ? "Adding money..." : !gatewayReady ? "Loading secure gateway..." : "Top up " + (valid ? naira(value) : "wallet")}
          </button>
          {message && <p className={"text-xs font-bold leading-relaxed " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
          <p className="text-charcoal-500 text-xs leading-relaxed">
            Wallet money can only be spent on NaijaDrops deliveries. It can&apos;t be withdrawn as cash. Card, bank transfer and USSD are available through Paystack.
          </p>
        </div>

        <div>
          <h2 className="text-ink font-black text-sm uppercase tracking-widest mb-4">Recent activity</h2>
          {ledger.length === 0 && <p className="text-charcoal-500 text-sm">No activity yet.</p>}
          <div className="space-y-2">
            {ledger.map((row) => (
              <div key={row.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className={"w-10 h-10 rounded-xl flex items-center justify-center " + (row.type === "credit" ? "bg-emerald-500/10 text-emerald-400" : "bg-white/10 text-charcoal-300")}>
                  {row.type === "credit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-sm font-black">{ledgerLabel(row)}</p>
                  <p className="text-charcoal-500 text-xs">
                    {new Date(row.created_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={"text-sm font-black " + (row.type === "credit" ? "text-emerald-400" : "text-ink")}>
                    {row.type === "credit" ? "+" : "-"}{naira(row.amount)}
                  </p>
                  <p className="text-charcoal-500 text-[10px]">Balance {naira(row.balance_after)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950" />}>
      <WalletContent />
    </Suspense>
  );
}
