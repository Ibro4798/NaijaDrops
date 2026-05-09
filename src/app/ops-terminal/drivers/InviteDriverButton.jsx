"use client";

import { useState } from "react";
import { UserPlus, Loader2, X } from "lucide-react";
import { inviteRider } from "./actions";

export default function InviteDriverButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.target);
    const result = await inviteRider(formData);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 2000);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black px-6 py-2 rounded-xl text-xs uppercase tracking-widest transition-all"
      >
        <UserPlus size={16} />
        Invite Driver
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          <div className="relative w-full max-w-md bg-charcoal-900 border border-white/10 rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black italic tracking-tighter uppercase">Invite New Driver</h2>
               <button onClick={() => setIsOpen(false)} className="text-charcoal-500 hover:text-white"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Full Name</label>
                <input 
                  name="full_name"
                  type="text" 
                  required
                  placeholder="Driver's Legal Name"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Email Address</label>
                <input 
                  name="email"
                  type="email" 
                  required
                  placeholder="driver@example.com"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Vehicle Type</label>
                <select 
                  name="vehicle_type"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all appearance-none"
                >
                  <option value="bike">Motorcycle (Bike)</option>
                  <option value="car">Car (Sedan)</option>
                  <option value="van">Van / Small Truck</option>
                </select>
              </div>

              {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}
              {success && <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest text-center">Invitation Sent! Driver Pre-Approved.</p>}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Send Invitation"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
