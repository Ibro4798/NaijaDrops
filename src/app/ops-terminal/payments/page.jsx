import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import PaymentPolicyPanel from "./PaymentPolicyPanel";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: settings, error: settingsErr } = await db
    .from("app_settings")
    .select("key, value")
    .eq("key", "unpaid_expiry_minutes");

  const expiryMinutes = Number(settings?.[0]?.value?.minutes ?? 30);

  // Customer wallets: total money we owe customers, and a self-check that every balance matches its ledger.
  const { data: reconRows } = await db.rpc("wallet_reconciliation");
  const recon = Array.isArray(reconRows) ? reconRows[0] : reconRows;

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Payments</h1>
      </div>

      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-1">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Customer wallets</h2>
        <p className="text-ink text-2xl font-black">{"\u20A6" + Number(recon?.total_balance || 0).toLocaleString("en-NG")}</p>
        <p className="text-charcoal-500 text-xs leading-relaxed">
          Held for {recon?.wallets || 0} wallet(s). This is money customers can still spend, so keep at least this much in your Paystack balance.
        </p>
        {Number(recon?.mismatched || 0) > 0 ? (
          <p className="text-red-400 text-xs font-black">{recon.mismatched} wallet(s) do not match their ledger. Investigate before anything else.</p>
        ) : (
          <p className="text-emerald-400 text-xs font-bold">All wallet balances match their ledger.</p>
        )}
      </section>

      {settingsErr ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
          Could not load settings. ({settingsErr.message})
        </div>
      ) : (
        <PaymentPolicyPanel expiryMinutes={expiryMinutes} />
      )}
    </div>
  );
}
