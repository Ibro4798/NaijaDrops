"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { MapPin, DollarSign, Package, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RiderDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [rider, setRider] = useState(null);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRiderData();
  }, []);

  const fetchRiderData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data: riderData } = await supabase
      .from("riders")
      .select("*")
      .eq("user_id", user.id)
      .single();

    setRider(riderData);
    setIsOnline(riderData?.operational_status === "online");

    const { data: jobs } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "looking_for_driver")
      .limit(10);

    setAvailableJobs(jobs || []);
    setLoading(false);
  };

  const toggleOnlineStatus = async () => {
    const newStatus = isOnline ? "offline" : "online";
    
    await supabase
      .from("riders")
      .update({ operational_status: newStatus })
      .eq("user_id", rider.user_id);

    setIsOnline(!isOnline);
  };

  const acceptJob = async (jobId) => {
    await supabase
      .from("orders")
      .update({ 
        status: "matched",
        rider_id: rider.id
      })
      .eq("id", jobId);

    fetchRiderData();
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-8">
          <h1 className="text-4xl font-black">Rider Dashboard</h1>
          <button
            onClick={() => router.push("/rider/earnings")}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-6 py-3 rounded-xl font-black"
          >
            <DollarSign size={20} /> Earnings
          </button>
        </div>

        <div className="bg-charcoal-900/50 border border-white/10 rounded-3xl p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black mb-2">Status: {rider?.full_name}</h2>
              <p className="text-charcoal-400">Rating: â­ {rider?.rating || "5.0"}</p>
            </div>
            <button
              onClick={toggleOnlineStatus}
              className={`px-8 py-4 rounded-2xl font-black text-lg uppercase ${
                isOnline
                  ? "bg-emerald-500 text-charcoal-950"
                  : "bg-charcoal-700 text-white border border-white/10"
              }`}
            >
              {isOnline ? "ðŸŸ¢ Go Offline" : "âš« Go Online"}
            </button>
          </div>
        </div>

        <h2 className="text-2xl font-black mb-6">Available Delivery Jobs</h2>
        <div className="space-y-4">
          {availableJobs.length > 0 ? (
            availableJobs.map((job) => (
              <div key={job.id} className="bg-charcoal-900/50 border border-white/10 rounded-2xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={18} className="text-emerald-500" />
                      <div>
                        <p className="text-sm text-charcoal-500">Pickup</p>
                        <p className="font-black">{job.pickup_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-blue-500" />
                      <div>
                        <p className="text-sm text-charcoal-500">Dropoff</p>
                        <p className="font-black">{job.dropoff_name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-emerald-400">â‚¦{job.agreed_price}</p>
                    <p className="text-charcoal-500 text-sm">{job.item_category}</p>
                  </div>
                </div>
                <button
                  onClick={() => acceptJob(job.id)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-3 rounded-xl"
                >
                  Accept Delivery
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-charcoal-900/50 border border-white/10 rounded-2xl">
              <Package size={40} className="mx-auto mb-4 text-charcoal-600" />
              <p className="text-charcoal-500 font-bold">No available jobs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
