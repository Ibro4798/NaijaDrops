"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { MapPin, DollarSign, TrendingUp, Clock, Power, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RiderDashboard() {
  const [rider, setRider] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchRiderData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/auth/login");
          return;
        }

        // Fetch rider profile
        const { data: riderData, error: riderError } = await supabase
          .from("riders")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (riderError) {
          console.error("Error fetching rider:", riderError);
          setError("Could not load rider profile");
          return;
        }

        // If rider doesn't exist at all, go to onboarding
        if (!riderData) {
          router.push("/driver/onboarding");
          return;
        }

        // IMPORTANT: Do NOT redirect if not approved - show a message instead
        // This prevents the redirect loop when approval-success page sends them here
        if (!riderData?.approved) {
          setError("Your profile is not yet approved. Check back soon!");
          setLoading(false);
          return;
        }

        setRider(riderData);
        setIsOnline(riderData?.status === "online");

        // Fetch available jobs (orders where rider_id is null/unassigned)
        const { data: jobsData, error: jobsError } = await supabase
          .from("orders")
          .select("*")
          .is("rider_id", null)
          .eq("status", "pending")
          .limit(10);

        if (!jobsError && jobsData) {
          setJobs(jobsData);
        }

        setLoading(false);
      } catch (err) {
        console.error("Dashboard error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchRiderData();
  }, [supabase, router]);

  const handleGoOnline = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const newStatus = isOnline ? "offline" : "online";
      const { error } = await supabase
        .from("riders")
        .update({ status: newStatus })
        .eq("user_id", user.id);

      if (error) throw error;
      setIsOnline(!isOnline);
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleAcceptJob = async (jobId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get rider ID
      const { data: riderData } = await supabase
        .from("riders")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!riderData) throw new Error("Rider profile not found");

      // Assign job to rider
      const { error } = await supabase
        .from("orders")
        .update({ 
          rider_id: riderData.id,
          status: "assigned"
        })
        .eq("id", jobId);

      if (error) throw error;

      setJobs(jobs.filter(j => j.id !== jobId));
      router.push(`/rider/active-job?orderId=${jobId}`);
    } catch (err) {
      console.error("Error accepting job:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4" />
          <p className="text-charcoal-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !rider) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-red-500 mb-4 text-lg font-bold">{error}</p>
          <p className="text-charcoal-400 mb-6">Please contact support or try again later.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-emerald-500 text-black px-8 py-3 rounded-lg font-bold uppercase"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono">
      {/* Header with Status Toggle */}
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">Rider Dashboard</h1>
          <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
            {rider?.full_name} • {rider?.phone}
          </p>
        </div>
        <button
          onClick={handleGoOnline}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold uppercase text-xs transition-all ${
            isOnline
              ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500"
              : "bg-charcoal-800 text-charcoal-400 border border-white/10"
          }`}
        >
          <Power size={16} />
          {isOnline ? "Online" : "Offline"}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-charcoal-500 text-[10px] uppercase font-bold tracking-widest mb-2">
                Total Earnings
              </p>
              <p className="text-2xl font-black">₦0</p>
            </div>
            <DollarSign className="text-emerald-500" size={32} />
          </div>
        </div>

        <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-charcoal-500 text-[10px] uppercase font-bold tracking-widest mb-2">
                Completed Jobs
              </p>
              <p className="text-2xl font-black">{rider?.total_deliveries || 0}</p>
            </div>
            <CheckCircle className="text-blue-500" size={32} />
          </div>
        </div>

        <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-charcoal-500 text-[10px] uppercase font-bold tracking-widest mb-2">
                Acceptance Rate
              </p>
              <p className="text-2xl font-black">{(rider?.acceptance_rate || 100).toFixed(1)}%</p>
            </div>
            <TrendingUp className="text-amber-500" size={32} />
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/rider/earnings"
          className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 hover:border-emerald-500/50 transition-all"
        >
          <h3 className="text-lg font-black mb-2 uppercase">View Earnings</h3>
          <p className="text-charcoal-500 text-sm">Detailed breakdown of your income</p>
        </Link>

        <Link
          href="/rider/jobs"
          className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 hover:border-emerald-500/50 transition-all"
        >
          <h3 className="text-lg font-black mb-2 uppercase">Job History</h3>
          <p className="text-charcoal-500 text-sm">View your completed deliveries</p>
        </Link>
      </div>

      {/* Available Jobs */}
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">
            Available Jobs
          </h2>
          <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} waiting
          </p>
        </div>

        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-emerald-500" />
                      <p className="font-bold">{job.dropoff_name || "TBD"}</p>
                    </div>
                    <p className="text-charcoal-500 text-sm mb-3">{job.item_description || "Package"}</p>
                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase text-charcoal-600">
                      <span>From: {job.pickup_name || "TBD"}</span>
                      <span>•</span>
                      <span>{new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptJob(job.id)}
                    className="bg-emerald-500 text-black px-8 py-3 rounded-lg font-black uppercase text-sm hover:bg-emerald-400 transition-all whitespace-nowrap"
                  >
                    Accept Job
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center">
            <Clock size={40} className="mx-auto mb-4 text-charcoal-700" />
            <p className="text-charcoal-500 font-bold uppercase tracking-widest">No jobs available</p>
            <p className="text-charcoal-600 text-sm mt-2">Go online to receive jobs from vendors</p>
          </div>
        )}
      </div>
    </div>
  );
}
