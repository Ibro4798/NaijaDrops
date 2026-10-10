import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import PaymentPolicyPanel from "./PaymentPolicyPanel";

export const dynamic = "force-dynamic";

export default async function PaymentPolicyPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: settings, error: settingsErr } = await db
    .from("app_settings")
    .select("key, value, updated_at");

  const { data: vendors, error: vendorsErr } = await db
    .from("vendors")
    .select("id, business_name, payment_policy, scheduled_enabled")
    .order("business_name", { ascending: true });

  const setupError = settingsErr || vendorsErr;
  const byKey = Object.fromEntries((settings || []).map((s) => [s.key, s]));
  const mode = byKey.payment_policy?.value?.mode === "required" ? "required" : "optional";
  const expiryMinutes = Number(byKey.unpaid_expiry_minutes?.value?.minutes ?? 30);

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Payment policy</h1>
        <p className="text-charcoal-500 text-sm mt-1">
          Decide whether vendors pay before riders are notified. The choice is stamped on each order when it is created, so changing it never affects orders already in progress.
        </p>
      </div>

      {setupError ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
          The database is not set up for this yet. Run the SQL migration in Supabase first. ({setupError.message})
        </div>
      ) : (
        <PaymentPolicyPanel mode={mode} expiryMinutes={expiryMinutes} vendors={vendors || []} />
      )}
    </div>
  );
}
