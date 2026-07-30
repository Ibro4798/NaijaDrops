"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { User, Camera, Shield, Save, ArrowLeft, Star, Clock, MapPin, Sun, Moon, Monitor } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import { useTheme } from "@/components/ThemeProvider";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [receiptDisplayName, setReceiptDisplayName] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  useEffect(() => {
    async function loadProfile() {
      const { user: u, role: r, profile: p } = await getUserRole(supabase);
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setRole(r);
      setProfile(p);
      setFullName(p?.name || "");
      setAvatarUrl(p?.avatar_url || "");
      setReceiptDisplayName(p?.receipt_display_name || "");
      setIsLoading(false);
    }
    loadProfile();
  }, [supabase, router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: fullName,
          avatar_url: avatarUrl,
          receipt_display_name: receiptDisplayName || null
        })
        .eq("id", user.id);

      if (error) throw error;
      alert("Settings updated successfully!");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 pt-32 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        
        <header className="mb-12 flex items-center justify-between">
           <div>
              <h1 className="text-4xl font-black text-ink tracking-tighter italic font-outfit">Account Settings</h1>
              <p className="text-charcoal-500 font-bold text-[10px] uppercase tracking-widest mt-1">Your Profile & Details</p>
           </div>
           {role === 'rider' && (
             <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                <Star size={16} className="text-emerald-500" fill="currentColor" />
                <span className="text-ink font-black text-sm italic">{profile?.rating || "5.0"}</span>
             </div>
           )}
        </header>

        <section className="glass rounded-[3rem] p-10 border-white/5 relative overflow-hidden mb-8">
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none"></div>
           
           <div className="flex flex-col md:flex-row items-center gap-10 mb-12">
              <div className="relative group">
                 <div className="w-32 h-32 rounded-[2.5rem] bg-charcoal-800 flex items-center justify-center overflow-hidden border-2 border-white/10 group-hover:border-emerald-500 transition-all">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={48} className="text-charcoal-600" />
                    )}
                 </div>
                 <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-ink rounded-xl flex items-center justify-center shadow-glow hover:bg-emerald-400 transition-all">
                    <Camera size={18} />
                 </button>
              </div>

              <div className="flex-1 space-y-2 text-center md:text-left">
                 <div className="text-ink font-black text-2xl tracking-tight">{profile?.name || "New Dispatcher"}</div>
                 <div className="text-charcoal-500 font-bold text-sm tracking-tight">{user?.email}</div>
                 <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{role} account active</span>
                 </div>
              </div>
           </div>

           <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aliyu Ibrahim"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Name Shown on Delivery Receipts</label>
                    <input 
                      type="text" 
                      value={receiptDisplayName}
                      onChange={(e) => setReceiptDisplayName(e.target.value)}
                      placeholder={role === 'vendor' ? 'e.g. your business name' : 'e.g. your preferred display name'}
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">
                      {role === 'vendor'
                        ? "Shown to customers on their delivery receipt instead of your account name. Leave blank to use your business name."
                        : "Shown on receipts as the rider who delivered the order. Leave blank to use your full name."}
                    </p>
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Registered Email Address (Locked)</label>
                    <input 
                      type="email" 
                      value={user?.email || ""}
                      readOnly
                      disabled
                      className="w-full bg-white/5 border-2 border-white/5 rounded-2xl px-6 py-4 text-charcoal-400 font-bold tracking-tight outline-none cursor-not-allowed opacity-60"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Avatar Source URL</label>
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://image-source.com/photo.jpg"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">Note: We currently support direct image URLs. Full upload system coming soon.</p>
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-4">
                 <button 
                   onClick={handleSave}
                   disabled={isSaving}
                   className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-charcoal-700 text-ink font-black py-4 rounded-2xl transition-all shadow-glow active:scale-95 flex items-center justify-center gap-3"
                 >
                    {isSaving ? "Updating System..." : <><Save size={18} /> Commit Changes</>}
                 </button>
                 <button 
                   onClick={() => router.back()}
                   className="bg-white/5 border border-white/10 text-ink font-black px-8 rounded-2xl hover:bg-white/10 transition-all"
                 >
                    Discard
                 </button>
              </div>
           </div>
        </section>

        {role === 'rider' && (
          <section className="bg-emerald-500/5 border border-emerald-500/10 rounded-[3rem] p-10">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-ink shadow-glow">
                   <Shield size={24} />
                </div>
                <div>
                   <h3 className="text-ink font-black text-xl italic tracking-tight">Rider Details</h3>
                   <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Your Rider Account</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Status</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">Operational</div>
                </div>
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Commission</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">20% Standard</div>
                </div>
             </div>
          </section>
        )}

        <section className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                 <Sun size={24} />
              </div>
              <div>
                 <h3 className="text-ink font-black text-xl italic tracking-tight">Appearance</h3>
                 <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Light, Dark, or Match Your Device</p>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', Icon: Sun },
                { value: 'dark', label: 'Dark', Icon: Moon },
                { value: 'system', label: 'System', Icon: Monitor },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemeMode(value)}
                  className={`flex flex-col items-center gap-2 py-5 rounded-2xl border transition-all ${
                    themeMode === value
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-charcoal-900 border-white/5 text-charcoal-500 hover:text-ink hover:border-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                </button>
              ))}
           </div>
        </section>

      </div>
    </main>
  );
}