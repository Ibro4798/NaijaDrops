"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

export default function ApprovalSuccessPage() {
  const router = useRouter();

  const handleOpenDashboard = () => {
    router.push("/rider/dashboard");
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-emerald-400" />
          </div>
        </div>

        <h1 className="text-4xl font-black mb-4">You're Verified! ðŸŽ‰</h1>
        <p className="text-gray-400 text-lg mb-8">
          Your driver profile has been approved. You can now access the Rider Dashboard and start accepting deliveries.
        </p>

        <div className="space-y-4">
          <button
            onClick={handleOpenDashboard}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-2xl uppercase tracking-wider transition-all"
          >
            Open Rider Dashboard
          </button>
          <button
            onClick={() => router.push("/ops-terminal/drivers")}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-2xl uppercase tracking-wider transition-all"
          >
            â† Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
