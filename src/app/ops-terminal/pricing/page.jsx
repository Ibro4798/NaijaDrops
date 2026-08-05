import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { Fuel } from "lucide-react";
import PricingSettingsForm from "./PricingSettingsForm";
import { PRICING_RATES } from "@/utils/constants";
import { getFuelMultiplier, getEffectiveRates } from "@/utils/pricing";

export const dynamic = "force-dynamic";

export default async function OpsPricingPage() {
  await validateAdmin();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("id", 1)
    .single();

  const { data: history } = await supabase
    .from("fuel_price_history")
    .select("id, price, source, note, created_at, users:created_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);

  const multiplier = getFuelMultiplier(settings);
  const effectiveRates = getEffectiveRates(settings);

  return (
    <div className="p-6 lg:p-10 space-y-8 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Fuel size={18} />
          </div>
          <h1 className="text-2xl font-black text-white font-outfit">Fuel Pricing</h1>
        </div>
        <p className="text-charcoal-400 text-sm max-w-xl">
          Delivery per-km rates scale with the current petrol price relative to the baseline they were calibrated at.
          The flat base fee doesn&apos;t move with fuel - it covers rider time, not distance.
        </p>
      </div>

      <PricingSettingsForm
        settings={settings}
        history={history || []}
        multiplier={multiplier}
        effectiveRates={effectiveRates}
        baseRates={PRICING_RATES}
      />
    </div>
  );
}
