"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getUserRole } from '@/utils/auth';
import { 
  ArrowLeft, Bell, Shield, Smartphone, 
  MapPin, HelpCircle, LogOut, ChevronRight,
  Verified, Info
} from 'lucide-react';
import DriverBottomNav from '@/components/driver/DriverBottomNav';

export default function DriverSettings() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        const { user, role, profile: prof } = await getUserRole(supabase);
        if (!user || role !== 'driver') {
            router.push('/login?role=driver');
            return;
        }
        setProfile(prof);
        setLoading(false);
    }
    fetchData();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const settingsGroups = [
    {
      title: "System",
      items: [
        { icon: <Bell size={20} />, label: "Notifications", color: "text-emerald-500" },
        { icon: <MapPin size={20} />, label: "Service Radius", color: "text-blue-500" },
        { icon: <Smartphone size={20} />, label: "App Preferences", color: "text-amber-500" },
      ]
    },
    {
      title: "Account",
      items: [
        { icon: <Verified size={20} />, label: "Verification Status", color: "text-emerald-500" },
        { icon: <Shield size={20} />, label: "Privacy & Security", color: "text-emerald-500" },
        { icon: <Info size={20} />, label: "Legal & About", color: "text-emerald-500" },
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-charcoal-950 pb-32">
      {/* Header */}
      <div className="pt-10 px-6 pb-12 bg-gradient-to-b from-emerald-950/20 to-transparent">
         <div className="flex items-center gap-6 mb-10">
            <button onClick={() => router.back()} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white">
                <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-black text-white tracking-tighter">System Console</h1>
         </div>

         {/* Driver Profile Summary */}
         <div className="bg-charcoal-900 rounded-[3rem] p-8 border border-white/5 flex items-center gap-5">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center text-emerald-500">
               <div className="text-4xl font-black">{profile?.full_name?.charAt(0) || 'D'}</div>
            </div>
            <div>
               <div className="text-xl font-black text-white tracking-tight">{profile?.full_name || 'Verified Driver'}</div>
               <div className="text-xs font-bold text-charcoal-500 uppercase tracking-widest">{profile?.phone || '+234 --- --- ----'}</div>
            </div>
         </div>
      </div>

      {/* Settings Grid */}
      <div className="px-6 space-y-10">
         {settingsGroups.map((group, i) => (
           <div key={i}>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-charcoal-600 mb-6 px-4">{group.title}</h2>
              <div className="space-y-4">
                 {group.items.map((item, j) => (
                   <button key={j} className="w-full bg-charcoal-900 p-6 rounded-[2.5rem] border border-white/5 flex items-center justify-between group active:scale-98 transition-all">
                      <div className="flex items-center gap-5">
                         <div className={`w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                            {item.icon}
                         </div>
                         <span className="text-lg font-black text-white tracking-tight">{item.label}</span>
                      </div>
                      <ChevronRight size={20} className="text-charcoal-700" />
                   </button>
                 ))}
              </div>
           </div>
         ))}

         {/* Sign Out */}
         <form action="/api/auth/signout" method="POST" className="pt-6">
            <button 
               type="submit"
               className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 p-6 rounded-[2.5rem] border border-red-500/10 flex items-center justify-between group transition-all"
            >
               <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center">
                     <LogOut size={20} />
                  </div>
                  <span className="text-lg font-black tracking-tight">Signal Terminated</span>
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Log Out</span>
            </button>
         </form>
      </div>

      <DriverBottomNav />
    </main>
  );
}
