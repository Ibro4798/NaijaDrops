"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { MapPin, Clock, DollarSign, CheckCircle, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RiderJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/login");
          return;
        }

        // Get rider ID
        const { data: riderData } = await supabase
          .from("riders")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (!riderData) {
          setLoading(false);
          return;
        }

        let query = supabase
          .from("orders")
          .select("*")
          .eq("rider_id", riderData.id);

        if (filter !== "all") {
          query = query.eq("status", filter);
        }

        const { data, error } = await query.order("created_at", { ascending: false });

        if (error) throw error;
        setJobs(data || []);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching jobs:", err);
        setLoading(false);
      }
    };

    fetchJobs();
  }, [filter, supabase, router]);

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/10 text-emerald-500";
      case "assigned":
        return "bg-blue-500/10 text-blue-500";
      case "cancelled":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-amber-500/10 text-amber-500";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono">
      <div className="mb-8">
        <h1 className="text-3xl font-black italic tracking-tighter uppercase">Job History</h1>
        <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto">
        {["all", "assigned", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-bold uppercase text-xs whitespace-nowrap transition-all ${
              filter === f
                ? "bg-emerald-500 text-black"
                : "bg-charcoal-800 text-charcoal-400 hover:bg-charcoal-700"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      {jobs.length > 0 ? (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all cursor-pointer"
              onClick={() => router.push(`/rider/active-job?orderId=${job.id}`)}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                    <p className="text-sm text-charcoal-500">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-emerald-500" />
                    <p className="font-bold text-lg">{job.dropoff_name}</p>
                  </div>
                  <p className="text-charcoal-500 text-sm mb-3">{job.item_description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-500">?{job.agreed_price || 0}</p>
                  <p className="text-[10px] text-charcoal-600 uppercase">Amount</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-charcoal-700" />
          <p className="text-charcoal-500 font-bold uppercase">No jobs yet</p>
        </div>
      )}
    </div>
  );
}
