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

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Payments</h1>
      </div>

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
