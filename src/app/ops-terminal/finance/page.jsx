import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { DollarSign, ArrowUpRight, ArrowDownRight, Wallet, Activity, CreditCard } from "lucide-react";
import FinanceCharts from "./FinanceCharts";

export const dynamic = "force-dynamic";

export default async function OpsFinancePage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // 1. Fetch Aggregated Metrics
  const { data: totalEscrow } = await supabase
    .from("orders")
    .select("agreed_price")
    .eq("payment_status", "authorized");

  const { data: completedOrders } = await supabase
    .from("orders")
    .select("agreed_price, created_at")
    .eq("status", "delivered");

  const { data: pendingPayouts } = await supabase
    .from("wallet_transactions")
    .select("amount")
    .eq("type", "payout_request");

  const currentEscrow = totalEscrow?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const totalRevenue = completedOrders?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const platformCut = totalRevenue * 0.20; // 20% commission
  const totalPayoutPending = pendingPayouts?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

  // Formatting historical data for charts
  // Grouping last 7 days of completed orders
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const chartData = last7Days.map(date => {
    const dayOrders = completedOrders?.filter(o => o.created_at.startsWith(date)) || [];
    const gmv = dayOrders.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0);
    return {
      date: date.slice(5), // MM-DD
      gmv: gmv,
      revenue: gmv * 0.20
    };
  });

  const kpis = [
    { label: "Live Escrow Balance", value: `â‚¦${currentEscrow.toLocaleString()}`, icon: <Wallet className="text-purple-500" />, trend: "Locked Funds" },
    { label: "Platform Revenue", value: `â‚¦${platformCut.toLocaleString()}`, icon: <DollarSign className="text-emerald-500" />, trend: "20% Take Rate" },
    { label: "Gross Merchandise Value", value: `â‚¦${totalRevenue.toLocaleString()}`, icon: <Activity className="text-blue-500" />, trend: "Total Processed" },
    { label: "Pending Payouts", value: `â‚¦${totalPayoutPending.toLocaleString()}`, icon: <CreditCard className="text-amber-500" />, trend: "Rider Liabilities" }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Financial Telemetry Active
           </div>
           <h1 className="text-4xl font-black italic tracking-tighter uppercase">Treasury / Analytics</h1>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-all relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] rounded-bl-full pointer-events-none" />
             <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                   {kpi.icon}
                </div>
                <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">{kpi.trend}</div>
             </div>
             <div className="text-3xl font-black tracking-tight relative z-10">{kpi.value}</div>
             <div className="text-[10px] text-charcoal-500 font-bold uppercase mt-1 relative z-10">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Visualizations Layer */}
      <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">7-Day Revenue Trajectory</h2>
           <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
              Live Chart
           </div>
        </div>
        <div className="h-[400px] w-full">
           <FinanceCharts data={chartData} />
        </div>
      </div>
    </div>
  );
}
